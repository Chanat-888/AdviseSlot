import { expect, test, type Page } from "@playwright/test";
import { SEED_USERS } from "../../server/prisma/seed-data";
import { demoPassword } from "../test-env";
// The client's own Bangkok formatting, so the test matches what the screens show.
import { formatDate } from "../../client/src/time";

// The demo password comes from server/.env.test (SEED_DEMO_PASSWORD), the same one the seed used.
const DEMO_PASSWORD = demoPassword();

const student = SEED_USERS.find((u) => u.email === "student1@example.test")!;

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

  // Lab 6 defect #58: after a logout, a second user who logs in in the same tab (no page reload)
  // must still be able to log out (FR-02; F-02 section 2 steps 1 and 6). logIn() is not used for
  // the second login because its page.goto reloads the page and would hide the bug.
  test("a second user who logs in in the same tab can log out (F-02)", async ({ page }) => {
    const first = SEED_USERS.find((u) => u.email === "student3@example.test")!;
    await logIn(page, first.email, /\/slots$/);
    await logOut(page);

    // Same tab, no reload: log in as Student One from the login page Logout left us on
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("navigation").getByText(`${student.name} (STUDENT)`)).toBeVisible();

    await expect(page.getByRole("button", { name: "Logout" })).toBeEnabled();
    await logOut(page);
    const me = await page.request.get("http://localhost:3100/api/auth/me");
    expect(me.status()).toBe(401);
  });

  // F-04 to F-09 in the browser: the advisor creates a slot, Student Two books it and opens the
  // booking from /bookings, the advisor opens it from /schedule and sees the student's name,
  // and another advisor gets "Booking not found." (F-09, NFR-03).
  test("advisor creates a slot, student books it, both open the booking", async ({ page }) => {
    const advisor = SEED_USERS.find((u) => u.email === "advisor1@example.test")!;
    const other = SEED_USERS.find((u) => u.email === "advisor2@example.test")!;
    const booker = SEED_USERS.find((u) => u.email === "student2@example.test")!;
    const day = weekdayAhead(3);
    const startAt = new Date(`${day}T16:00:00+07:00`).toISOString(); // no demo slot at 16:00
    const when = `${formatDate(startAt)}, 16:00-16:30`;

    // F-04: the advisor creates the slot and F-05 lists it as Open
    await logIn(page, advisor.email, /\/schedule$/);
    await page.getByLabel("Date (Monday to Friday)").fill(day);
    await page.getByLabel("Start time").selectOption("16:00");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("status")).toHaveText(`Slot created: ${when}.`);
    const row = page.getByRole("listitem").filter({ hasText: "16:00-16:30" }).filter({ has: page.getByText("Open") });
    await expect(row).toHaveCount(1);
    await logOut(page);

    // F-06 and F-07: the student books exactly that slot and sees the confirmation
    await logIn(page, booker.email, /\/slots$/);
    await page.getByRole("button", { name: `Book ${advisor.name} ${formatDate(startAt)} 16:00` }).click();
    await expect(page).toHaveURL(/\/bookings\/\d+$/);
    await expect(page.getByText("Booking confirmed.")).toBeVisible();
    const detailUrl = page.url();

    // F-08: the booking is in "My bookings" under Upcoming, and F-09 opens it from there
    await page.getByRole("navigation").getByRole("link", { name: "My bookings" }).click();
    await expect(page).toHaveURL(/\/bookings$/);
    const mine = page.getByRole("link", { name: new RegExp(`${advisor.name}.*Upcoming`) });
    await expect(mine).toHaveCount(1);
    await mine.click();
    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByRole("main").getByText(booker.name)).toBeVisible();
    await expect(page.getByText("Booking confirmed.")).toHaveCount(0); // only right after booking
    await logOut(page);

    // F-05 and F-09: the advisor sees the slot as Booked with the student's name and opens it
    await logIn(page, advisor.email, /\/schedule$/);
    const booked = page.getByRole("listitem").filter({ hasText: "16:00-16:30" }).filter({ has: page.getByText("Booked") });
    await booked.getByRole("link", { name: booker.name }).click();
    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByRole("main").getByText(booker.name)).toBeVisible();
    await expect(page.getByRole("main").getByText("Upcoming")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to my schedule" })).toBeVisible();
    await logOut(page);

    // NFR-03: another advisor gets the same "not found" as a missing booking, and no booking data
    await logIn(page, other.email, /\/schedule$/);
    await page.goto(detailUrl);
    await expect(page.getByRole("alert")).toHaveText("Booking not found.");
    await expect(page.getByRole("main").getByText(booker.name)).toHaveCount(0);
    await logOut(page);

    // F-10 section 8 (UI step): the student cancels the booking from the detail page, more than
    // 12 hours ahead, and sees "Cancelled". The Cancel button is gone afterwards.
    await logIn(page, booker.email, /\/slots$/);
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Cancel booking" }).click();
    const confirm = page.getByRole("dialog", { name: "Cancel this booking?" });
    await confirm.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("Booking cancelled.")).toBeVisible();
    await expect(page.getByRole("main").getByText("Cancelled", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  });
  // F-06 and F-07 in the browser: the student books a slot of Advisor One from /slots, then a
  // second slot of the same advisor is rejected by BR-07 (#67) and the UI shows the server's
  // message (TEST-R02-02 / AC-R02-02).
  test("student books a slot, then a second booking shows the server's message", async ({ page }) => {
    const advisor = SEED_USERS.find((u) => u.email === "advisor1@example.test")!;
    const bookAdvisor = page.getByRole("button", { name: new RegExp(`^Book ${advisor.name} `) });
    await page.goto("/login");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/slots$/);

    // F-06: the list shows slots with an advisor name and a Book button, and no booker data
    const rows = page.getByRole("listitem");
    await expect(rows.first()).toContainText("Advisor");
    const before = await rows.count();

    // F-07: book Advisor One's first slot, land on the booking and see the confirmation
    await bookAdvisor.first().click();
    await expect(page).toHaveURL(/\/bookings\/\d+$/);
    await expect(page.getByText("Booking confirmed.")).toBeVisible();

    // The booked slot is gone from the list
    await page.goto("/slots");
    await expect(rows).toHaveCount(before - 1);

    // BR-07 (#67): a second slot of the same advisor is refused and the server's message is shown
    await bookAdvisor.first().click();
    await expect(page.getByRole("alert")).toHaveText("You already have an upcoming booking with this advisor.");
    await expect(page).toHaveURL(/\/slots$/);
  });
  // F-15 in the browser: the advisor creates a range of slots in one action and they are all in
  // the list, also after a reload (TEST-F15-07, AC-F15-01). 15:00 to 16:00 because advisor1's demo
  // slots are at 09:00, 09:30 and 14:00.
  test("advisor creates several slots at once (F-15, TEST-F15-07)", async ({ page }) => {
    const advisor = SEED_USERS.find((u) => u.email === "advisor1@example.test")!;
    const day = weekdayAhead(5);

    await logIn(page, advisor.email, /\/schedule$/);
    await page.getByText("Several slots", { exact: true }).click(); // the Bootstrap toggle label
    await expect(page.getByRole("radio", { name: "Several slots" })).toBeChecked();
    await page.getByLabel("Date (Monday to Friday)").fill(day);
    await page.getByLabel("From", { exact: true }).selectOption("15:00");
    await page.getByLabel("To", { exact: true }).selectOption("16:00");
    await expect(page.getByText("This creates 2 slots.")).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("status")).toHaveText("2 slots created.");

    const daySection = page.locator("section").filter({ has: page.getByRole("heading", { name: formatDate(`${day}T12:00:00+07:00`) }) });
    await expect(daySection.getByRole("listitem").filter({ hasText: "15:00-15:30" })).toHaveCount(1);
    await expect(daySection.getByRole("listitem").filter({ hasText: "15:30-16:00" })).toHaveCount(1);

    // The slots are stored, not only shown: they are still listed after a reload
    await page.reload();
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await expect(daySection.getByRole("listitem").filter({ hasText: "15:00-15:30" })).toHaveCount(1);
    await expect(daySection.getByRole("listitem").filter({ hasText: "15:30-16:00" })).toHaveCount(1);
  });
  // F-13 (TEST-F13-08, AC-F13-01): the advisor deletes an Open slot from /schedule, confirms,
  // and the row is gone, also after a reload (so the delete was stored, not just hidden).
  test("advisor deletes an Open slot and it stays gone after a reload", async ({ page }) => {
    const advisor = SEED_USERS.find((u) => u.email === "advisor1@example.test")!;
    const day = weekdayAhead(4);
    const startAt = new Date(`${day}T17:00:00+07:00`).toISOString(); // no demo slot at 17:00

    await logIn(page, advisor.email, /\/schedule$/);
    await page.getByLabel("Date (Monday to Friday)").fill(day);
    await page.getByLabel("Start time").selectOption("17:00");
    await page.getByRole("button", { name: "Create" }).click();
    const sameRow = () => page.getByRole("listitem").filter({ hasText: "17:00-17:30" });
    await expect(sameRow()).toHaveCount(1);

    // Delete, then the inline confirm names the slot; Cancel keeps it, Delete removes it
    await sameRow().getByRole("button", { name: "Delete" }).click();
    await expect(sameRow()).toContainText(`Delete the slot on ${formatDate(startAt)}, 17:00-17:30?`);
    await sameRow().getByRole("button", { name: "Cancel" }).click();
    await expect(sameRow()).toHaveCount(1);
    await sameRow().getByRole("button", { name: "Delete" }).click();
    await sameRow().getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Slot deleted.")).toBeVisible();
    await expect(sameRow()).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("listitem").first()).toBeVisible(); // the list (demo slots) has loaded
    await expect(sameRow()).toHaveCount(0);
  });

  // R-01 / NFR-03: a student who opens the advisor screen gets the server's 403 message.
  test("a forbidden operation is refused (R-01)", async ({ page }) => {
    await logIn(page, student.email, /\/slots$/);
    await page.goto("/schedule");
    await expect(page.getByRole("alert").first()).toHaveText("Only advisors can view their schedule.");
  });
});

// page.goto reloads the app, which resets all client state. A test that checks state carried over
// from an earlier user in the same tab must not log in with this helper (see defect #58).
async function logIn(page: Page, email: string, home: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(home);
}

async function logOut(page: Page) {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** The Bangkok date ("2026-11-10") at least `days` days ahead, moved forward to a weekday. */
function weekdayAhead(days: number): string {
  const d = new Date(Date.now() + 7 * 3600_000 + days * 86_400_000); // shifted to Bangkok wall time
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
