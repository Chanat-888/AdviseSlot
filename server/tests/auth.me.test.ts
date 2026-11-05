import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-03 Current user, test TEST-F03-01 from
// docs/sprints/sprint-1/F-03-current-user.md (v0.2, section 8).

let student: Fixture;
let advisor: Fixture;

beforeAll(async () => {
  ({ student, advisor } = await createUsers());
}, 30_000);

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F03-01 (AC-F03-01): own identity", () => {
  it("returns exactly { id, name, email, role } for each logged-in user", async () => {
    const s = await loginCookie(student.email);
    const a = await loginCookie(advisor.email);

    for (const [cookie, user] of [
      [s, student],
      [a, advisor],
    ] as const) {
      const res = await request(app).get("/api/auth/me").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: user.id, name: user.name, email: user.email, role: user.role });
      expect(Object.keys(res.body).sort()).toEqual(["email", "id", "name", "role"]);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|token|createdAt/i);
    }
  });

  it("returns the SDS 401 error shape with no user data when there is no valid session", async () => {
    const expected = { error: { code: "UNAUTHENTICATED", message: "You are not logged in." } };

    const none = await request(app).get("/api/auth/me");
    expect(none.status).toBe(401);
    expect(none.body).toEqual(expected);

    const bogus = await request(app).get("/api/auth/me").set("Cookie", "sid=not-a-real-token");
    expect(bogus.status).toBe(401);
    expect(bogus.body).toEqual(expected);
    const cleared = ((bogus.headers["set-cookie"] as unknown as string[] | undefined) ?? []).some((c) =>
      /^sid=;/.test(c),
    );
    expect(cleared).toBe(true); // F-03 section 4.3: the 401 clears the cookie
  });
});
