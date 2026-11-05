import { expect, test, type Page } from "@playwright/test";
// The demo password is read from the seed so it is not repeated here.
import { DEMO_PASSWORD, SEED_USERS } from "../../server/prisma/seed-data";

const student = SEED_USERS.find((u) => u.email === "student1@example.test")!;
const advisor = SEED_USERS.find((u) => u.email === "advisor1@example.test")!;

test.describe("E2E journey (Sprint 1, issue #13)", () => {
  test("student logs in, sees identity, reloads, logs out and is locked out", async ({ page }) => {
    // F-01 log in
    await page.goto("/login");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    // F-03 current user: a student lands on /slots and the top bar shows name and role
    await expect(page).toHaveURL(/\/slots$/);
    await expect(page.getByRole("navigation").getByText(`${student.name} (STUDENT)`)).toBeVisible();

    // F-03: after a reload the client restores the user from /me and stays on the home screen
    await page.reload();
    await expect(page).toHaveURL(/\/slots$/);
    await expect(page.getByRole("navigation").getByText(`${student.name} (STUDENT)`)).toBeVisible();

    // F-02 log out
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Logout" })).toHaveCount(0);

    // A protected page now redirects to /login, and /api/auth/me answers 401 (AC-F02-01)
    await page.goto("/slots");
    await expect(page).toHaveURL(/\/login$/);
    const me = await page.request.get("http://localhost:3100/api/auth/me");
    expect(me.status()).toBe(401);
    expect((await me.json()).error.code).toBe("UNAUTHENTICATED");
  });

  test("wrong password shows the server message and stays logged out (AC-F01-02)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Email")).toHaveValue(student.email);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });

  // The slot the journey creates: 14 days from today (Bangkok), moved to the next weekday, at
  // 16:00. That is far past every deadline rule, and the seed only adds slots in the first
  // days at 09:00 to 14:00, so it never collides (BR-04). global-setup clears old slots.
  function journeySlot() {
    const day = new Date(Date.now() + 14 * 86_400_000);
    while ([0, 6].includes(new Date(day.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }) + "T12:00:00Z").getUTCDay())) {
      day.setTime(day.getTime() + 86_400_000);
    }
    return {
      date: day.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }), // 2026-11-19
      label: day.toLocaleDateString("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", ""),
      time: "16:00",
    };
  }

  async function logIn(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
  }

  async function logOut(page: Page) {
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/login$/);
  }

  // F-04 to F-07 across both roles, then the BR-07 rejection (TEST-R02-02 / AC-R02-02).
  test("advisor creates a slot, student books it, advisor sees it booked", async ({ page }) => {
    const slot = journeySlot();

    // F-04: the advisor creates the slot on /schedule and logs out
    await logIn(page, advisor.email);
    await expect(page).toHaveURL(/\/schedule$/);
    await page.getByLabel("Date (Monday to Friday)").fill(slot.date);
    await page.getByLabel("Start time").selectOption(slot.time);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Slot created" })).toBeVisible();
    const mine = page.getByRole("listitem").filter({ hasText: `${slot.time}-16:30` });
    await expect(mine).toContainText("Open");
    await logOut(page);

    // F-06: the student sees the slot with the advisor's name; F-07: books it
    await logIn(page, student.email);
    await expect(page).toHaveURL(/\/slots$/);
    const rows = page.getByRole("listitem");
    await expect(rows.first()).toContainText("Advisor");
    const before = await rows.count();
    await page.getByRole("button", { name: `Book ${advisor.name} ${slot.label} ${slot.time}` }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+$/);
    await expect(page.getByText("Booking confirmed.")).toBeVisible();

    // The booked slot is gone from the list
    await page.goto("/slots");
    await expect(rows).toHaveCount(before - 1);

    // BR-07: a second booking is refused and the server's message is shown
    await page.getByRole("button", { name: "Book" }).first().click();
    await expect(page.getByRole("alert")).toHaveText("You already have an upcoming booking.");
    await expect(page).toHaveURL(/\/slots$/);
    await logOut(page);

    // F-05: the advisor sees the slot as Booked with the student's name
    await logIn(page, advisor.email);
    await expect(page).toHaveURL(/\/schedule$/);
    await expect(mine).toContainText("Booked");
    await expect(mine).toContainText(student.name);
  });

  // TODO(#13, F-09 / Issue #12, Snooker): not merged yet. When it lands, both the student (from the
  // confirmation) and the advisor (the student's name on /schedule) open /bookings/:id and see
  // the booking detail. Until then that route is only the placeholder with "Booking <id>".
  test.fixme("both open the booking detail (needs F-09)", async () => {});

  // R-01: the server refuses a role the user does not have, whatever the client shows.
  test("a student is refused advisor operations (R-01)", async ({ page }) => {
    await logIn(page, student.email);
    await expect(page).toHaveURL(/\/slots$/);
    const api = "http://localhost:3100";

    const create = await page.request.post(`${api}/api/slots`, { data: { startAt: new Date(Date.now() + 10 * 86_400_000).toISOString() } });
    expect(create.status()).toBe(403);
    expect((await create.json()).error.code).toBe("FORBIDDEN_ROLE");

    const mine = await page.request.get(`${api}/api/slots/mine`);
    expect(mine.status()).toBe(403);
    expect((await mine.json()).error.code).toBe("FORBIDDEN_ROLE");

    // No slot was created: the student's own view of /schedule shows the server's refusal.
    // (The client does not hide /schedule from a student; the server is what enforces R-01.)
    await page.goto("/schedule");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });
});
