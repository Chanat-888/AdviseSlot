import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";

// F-01 Log in, tests TEST-F01-01 to TEST-F01-06 from
// docs/sprints/sprint-1/F-01-login.md (v0.3, section 8).
//
// The seed script (PR #20) is not on sprint-1 yet, so these tests create their own users.
// Hashes use bcrypt cost 12, the same as the seed.

const PASSWORD = "test-password-F01";
const HOUR = 60 * 60 * 1000;

type Fixture = { id: number; name: string; email: string; role: "STUDENT" | "ADVISOR" };
let student: Fixture;
let advisor: Fixture;

async function resetUsers() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User" RESTART IDENTITY CASCADE');
}

function sidCookie(res: request.Response): string {
  const header = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  const sid = header.find((c) => c.startsWith("sid="));
  if (!sid) throw new Error(`No sid cookie in response (status ${res.status})`);
  return sid;
}

function sidValue(res: request.Response): string {
  return sidCookie(res).split(";")[0]!.slice("sid=".length);
}

function login(email: unknown, password: unknown = PASSWORD) {
  return request(app).post("/api/auth/login").send({ email, password });
}

beforeAll(async () => {
  await resetUsers();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const s = await prisma.user.create({
    data: { name: "Student One", email: "student1@example.test", passwordHash, role: "STUDENT" },
  });
  const a = await prisma.user.create({
    data: { name: "Dr. Advisor One", email: "advisor1@example.test", passwordHash, role: "ADVISOR" },
  });
  student = { id: s.id, name: s.name, email: s.email, role: "STUDENT" };
  advisor = { id: a.id, name: a.name, email: a.email, role: "ADVISOR" };
}, 30_000);

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F01-01 (AC-F01-01): valid login creates a session", () => {
  it("step 1: logs in each user and sets the sid cookie", async () => {
    for (const user of [student, advisor]) {
      const before = Date.now();
      const sessionsBefore = await prisma.session.count({ where: { userId: user.id } });

      const res = await login(user.email);

      expect(res.status).toBe(200);
      const cookie = sidCookie(res);
      expect(cookie).toMatch(/^sid=[^;]+/);
      expect(cookie).toMatch(/;\s*HttpOnly/i);
      expect(cookie).toMatch(/;\s*SameSite=Lax/i);
      expect(cookie).toMatch(/;\s*Max-Age=7200/i);
      expect(cookie).toMatch(/;\s*Path=\//i);
      expect(cookie).not.toMatch(/;\s*Secure/i); // Secure is for production only
      expect(res.body).toEqual({ id: user.id, name: user.name, email: user.email, role: user.role });

      const sessions = await prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(sessionsBefore + 1);
      const row = sessions.find((s) => s.tokenHash === createHash("sha256").update(sidValue(res)).digest("hex"));
      expect(row).toBeDefined();
      expect(row!.tokenHash).not.toBe(sidValue(res));
      expect(Math.abs(row!.expiresAt.getTime() - (before + 2 * HOUR))).toBeLessThan(5_000);
    }
  });

  it("step 2: accepts an email with spaces and capitals (D-26)", async () => {
    const res = await login("  Student1@Example.test ");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: student.id, name: student.name, email: student.email, role: student.role });
  });

  it("step 3: a second login gives a new cookie and the first cookie still works", async () => {
    const first = await login(student.email);
    const second = await login(student.email);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sidValue(second)).not.toBe(sidValue(first));

    const me = await request(app).get("/api/auth/me").set("Cookie", `sid=${sidValue(first)}`);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ id: student.id, name: student.name, email: student.email, role: student.role });
  });
});

describe("TEST-F01-02 (AC-F01-02): bad credentials", () => {
  it("returns the same 401 for a wrong password and an unknown email, with no session", async () => {
    const before = await prisma.session.count();

    const wrongPassword = await login(student.email, "not-the-password");
    const unknownEmail = await login("nobody@example.test", "whatever");

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
      expect(typeof res.body.error.message).toBe("string");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(await prisma.session.count()).toBe(before);
  });
});

describe("TEST-F01-03 (AC-F01-03): stored password is a bcrypt hash", () => {
  it("stores a cost-12 bcrypt hash, not the plaintext", async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(true);
  });
});

describe("TEST-F01-04 (AC-F01-04): 2-hour session expiry", () => {
  it("accepts the session at 1 h 59 min 59 s and rejects it at 2 h", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = new Date("2026-11-04T03:00:00.000Z").getTime();
    vi.setSystemTime(t);

    const loginRes = await login(student.email);
    expect(loginRes.status).toBe(200);
    const cookie = `sid=${sidValue(loginRes)}`;
    const sessionsAfterLogin = await prisma.session.count();

    vi.setSystemTime(t + 2 * HOUR - 1000);
    const ok = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe(student.email);

    vi.setSystemTime(t + 2 * HOUR);
    const expired = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expect(expired.status).toBe(401);
    expect(expired.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: expect.any(String) },
    });
    // The 401 clears the cookie but does not delete the row (known limitation).
    const setCookie = (expired.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    expect(setCookie.some((c) => /^sid=;/.test(c))).toBe(true);
    expect(await prisma.session.count()).toBe(sessionsAfterLogin);
  });

  it("rejects a request with no cookie or an unknown token", async () => {
    const none = await request(app).get("/api/auth/me");
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");

    const bogus = await request(app).get("/api/auth/me").set("Cookie", "sid=not-a-real-token");
    expect(bogus.status).toBe(401);
    expect(bogus.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("TEST-F01-05 (AC-F01-05): invalid login bodies", () => {
  const bodies: Array<[string, unknown]> = [
    ["empty body", {}],
    ["missing password", { email: "student1@example.test" }],
    ["missing email", { password: PASSWORD }],
    ["email is a number", { email: 123, password: PASSWORD }],
    ["empty password", { email: "student1@example.test", password: "" }],
  ];

  it.each(bodies)("returns 400 VALIDATION_ERROR for: %s", async (_name, body) => {
    const before = await prisma.session.count();

    const res = await request(app).post("/api/auth/login").send(body as object);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.message.length).toBeGreaterThan(0);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(before);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|prisma|select |insert |\bat .*\(/i);
  });
});

describe("TEST-F01-06 (AC-F01-06): lowercase email CHECK constraint", () => {
  const emails = ["student1@example.test", "Student1@Example.test", "STUDENT1@example.test"];
  const countRows = () =>
    prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "User" WHERE lower("email") = 'student1@example.test'`.then(
      (r) => Number(r[0]!.n),
    );

  const makeUser = (email: string) =>
    prisma.user.create({ data: { name: "Check Test", email, passwordHash: "x", role: "STUDENT" } });

  it("rejects mixed-case emails and accepts lowercase", async () => {
    // Empty the User table (this is the last test in the file) so the emails below are free.
    await resetUsers();
    expect(await countRows()).toBe(0);

    await expect(makeUser(emails[1]!)).rejects.toThrow(/User_email_lowercase_check/);
    expect(await countRows()).toBe(0);

    await expect(makeUser(emails[0]!)).resolves.toMatchObject({ email: emails[0] });
    expect(await countRows()).toBe(1);

    await expect(makeUser(emails[2]!)).rejects.toThrow(/User_email_lowercase_check/);
    expect(await countRows()).toBe(1);
  });
});
