import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-02 Log out, tests TEST-F02-01 and TEST-F02-02 from
// docs/sprints/sprint-1/F-02-logout.md (v0.2, section 8).

let student: Fixture;

const rowFor = (cookie: string) =>
  prisma.session.findUnique({
    where: { tokenHash: createHash("sha256").update(cookie.slice("sid=".length)).digest("hex") },
  });

const logout = (cookie?: string) => {
  const req = request(app).post("/api/auth/logout");
  return cookie ? req.set("Cookie", cookie) : req;
};
const me = (cookie: string) => request(app).get("/api/auth/me").set("Cookie", cookie);

const UNAUTHENTICATED = { error: { code: "UNAUTHENTICATED", message: "You are not logged in." } };

beforeAll(async () => {
  ({ student } = await createUsers());
}, 30_000);

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F02-01 (AC-F02-01): old cookie is rejected after logout", () => {
  it("logs out with 204, clears sid, deletes the row, then rejects the old cookie", async () => {
    const cookie = await loginCookie(student.email);
    expect(await rowFor(cookie)).not.toBeNull();

    // Step 1: logout
    const out = await logout(cookie);
    expect(out.status).toBe(204);
    expect(out.text).toBe("");
    const setCookie = ((out.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((c) =>
      c.startsWith("sid="),
    );
    expect(setCookie, "logout must send a Set-Cookie for sid").toBeDefined();
    expect(setCookie).toMatch(/^sid=;/); // empty value
    expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i); // already expired
    expect(setCookie).toMatch(/;\s*Path=\//i); // same Path as login, so the browser removes it
    expect(setCookie).toMatch(/;\s*HttpOnly/i);
    expect(setCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(await rowFor(cookie)).toBeNull();

    // Step 2: the old cookie no longer works, and no user data comes back
    const after = await me(cookie);
    expect(after.status).toBe(401);
    expect(after.body).toEqual(UNAUTHENTICATED);

    // Step 3: a second logout with the old cookie is also 401
    const again = await logout(cookie);
    expect(again.status).toBe(401);
    expect(again.body).toEqual(UNAUTHENTICATED);
  });

  it("returns 401 with the SDS error shape when there is no cookie or the token is unknown", async () => {
    for (const res of [await logout(), await logout("sid=not-a-real-token")]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(UNAUTHENTICATED);
    }
  });
});

describe("TEST-F02-02 (AC-F02-02): logout ends only the current session", () => {
  it("keeps the other session of the same user valid", async () => {
    const a = await loginCookie(student.email);
    const b = await loginCookie(student.email);
    expect(a).not.toBe(b);
    const sessionsBefore = await prisma.session.count({ where: { userId: student.id } });

    const out = await logout(a);
    expect(out.status).toBe(204);

    expect(await rowFor(a)).toBeNull();
    expect(await rowFor(b)).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: student.id } })).toBe(sessionsBefore - 1);

    const res = await me(b);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: student.id, name: student.name, email: student.email, role: student.role });
  });
});
