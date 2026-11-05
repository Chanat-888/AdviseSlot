import { expect, test } from "@playwright/test";
// The demo password is read from the seed so it is not repeated here.
import { DEMO_PASSWORD, SEED_USERS } from "../../server/prisma/seed-data";

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

  // TODO(#13): the booking steps need F-04 to F-09 (#10, #11, #12), which are not merged yet.
  // Planned order: advisor logs in and creates a slot; student books it and opens the booking;
  // advisor sees the student's name (F-09); a rule rejection shows the server message
  // (AC-R02-02 / TEST-R02-02); a forbidden operation is refused (403/404); logout.
  test.fixme("advisor creates a slot, student books it, both open the booking", async () => {});
  // F-06 and F-07 in the browser: the student books from /slots, then a second booking is
  // rejected by BR-07 and the UI shows the server's message (TEST-R02-02 / AC-R02-02).
  test("student books a slot, then a second booking shows the server's message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/slots$/);

    // F-06: the list shows slots with an advisor name and a Book button, and no booker data
    const rows = page.getByRole("listitem");
    await expect(rows.first()).toContainText("Advisor");
    const before = await rows.count();

    // F-07: book the first slot, land on the booking and see the confirmation
    await page.getByRole("button", { name: "Book" }).first().click();
    await expect(page).toHaveURL(/\/bookings\/\d+$/);
    await expect(page.getByText("Booking confirmed.")).toBeVisible();

    // The booked slot is gone from the list
    await page.goto("/slots");
    await expect(rows).toHaveCount(before - 1);

    // BR-07: a second booking is refused and the server's message is shown
    await page.getByRole("button", { name: "Book" }).first().click();
    await expect(page.getByRole("alert")).toHaveText("You already have an upcoming booking.");
    await expect(page).toHaveURL(/\/slots$/);
  });
  test.fixme("a forbidden operation is refused (R-01)", async () => {});
});
