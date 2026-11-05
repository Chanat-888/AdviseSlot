import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// R-02 Error handling, TEST-R02-01 (AC-R02-01, NFR-07): rejected requests return 4xx with the
// SDS section 5 shape { error: { code, message } } and nothing else: no stack trace, no SQL or
// Prisma text. A 500 has only the generic message. Issue #17. TEST-R02-02 (the UI shows the
// message) is in the Playwright journey, e2e/tests/journey.spec.ts.

let student: Fixture;
let advisor: Fixture;
let studentCookie: string;
let advisorCookie: string;

// Text that must never reach a client (stack frames, SQL, Prisma and Node internals, file paths).
const LEAKS = /\bat \S+ \(|node_modules|\.ts:\d+|SELECT |INSERT |SQLSTATE|23P01|23505|Prisma|Invalid `|ECONNREFUSED|stack/i;

function expectErrorShape(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toMatch(/application\/json/);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(Object.keys(res.body.error).sort()).toEqual(["code", "message"]);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe("string");
  expect(res.body.error.message.length).toBeGreaterThan(0);
  expect(res.text).not.toMatch(LEAKS);
}

beforeAll(async () => {
  ({ student, advisor } = await createUsers());
  studentCookie = await loginCookie(student.email);
  advisorCookie = await loginCookie(advisor.email);
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

// A future weekday slot that passes every F-04 rule whatever the real date is.
function futureStart(): string {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  while ([0, 6].includes(new Date(d.getTime() + 7 * 3600_000).getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const day = new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return new Date(`${day}T10:00:00+07:00`).toISOString();
}

describe("TEST-R02-01 (AC-R02-01): every rejection uses the SDS error shape", () => {
  it("400 VALIDATION_ERROR for a body that is not valid JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "student1@example.test", "password": ');
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  it("400 VALIDATION_ERROR for invalid fields (login and create slot)", async () => {
    expectErrorShape(await request(app).post("/api/auth/login").send({ email: 1 }), 400, "VALIDATION_ERROR");
    expectErrorShape(
      await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt: "tomorrow" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("401 INVALID_CREDENTIALS and 401 UNAUTHENTICATED", async () => {
    expectErrorShape(
      await request(app).post("/api/auth/login").send({ email: student.email, password: "wrong" }),
      401,
      "INVALID_CREDENTIALS",
    );
    expectErrorShape(await request(app).get("/api/auth/me"), 401, "UNAUTHENTICATED");
  });

  it("403 FORBIDDEN_ROLE", async () => {
    expectErrorShape(await request(app).get("/api/slots/mine").set("Cookie", studentCookie), 403, "FORBIDDEN_ROLE");
    expectErrorShape(
      await request(app).post("/api/bookings").set("Cookie", advisorCookie).send({ slotId: 1 }),
      403,
      "FORBIDDEN_ROLE",
    );
  });

  it("400 and 404 on booking routes (bad id, missing slot, missing booking)", async () => {
    expectErrorShape(await request(app).get("/api/bookings/abc").set("Cookie", studentCookie), 400, "VALIDATION_ERROR");
    expectErrorShape(
      await request(app).post("/api/bookings").set("Cookie", studentCookie).send({ slotId: 999999 }),
      404,
      "NOT_FOUND",
    );
    expectErrorShape(await request(app).get("/api/bookings/999999").set("Cookie", studentCookie), 404, "NOT_FOUND");
  });

  it("404 NOT_FOUND for an unknown API path, in the same shape (not Express's HTML page)", async () => {
    expectErrorShape(await request(app).get("/api/does-not-exist").set("Cookie", studentCookie), 404, "NOT_FOUND");
    expectErrorShape(await request(app).post("/api/slots/mine"), 404, "NOT_FOUND");
  });

  it("409 SLOT_OVERLAP, including when the database constraint is what stops it", async () => {
    const startAt = futureStart();
    expect((await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt })).status).toBe(201);
    expectErrorShape(
      await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt }),
      409,
      "SLOT_OVERLAP",
    );
    // Skip the service's own overlap check so the Slot_no_overlap exclusion constraint fires.
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(((fn: (tx: unknown) => unknown) =>
      fn({ slot: { findFirst: async () => null, create: prisma.slot.create } })) as never);
    expectErrorShape(
      await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt }),
      409,
      "SLOT_OVERLAP",
    );
  });

  it("422 for a business rule", async () => {
    expectErrorShape(
      await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt: "2026-11-14T03:00:00.000Z" }),
      422,
      "SLOT_NOT_WEEKDAY",
    );
  });

  it("500 INTERNAL_ERROR hides the cause: no stack, SQL or Prisma text", async () => {
    const leaky = new Error(
      'Invalid `prisma.slot.findMany()` invocation: SELECT "Slot"."id" FROM "public"."Slot" failed, SQLSTATE 08006',
    );
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(leaky);
    vi.spyOn(console, "error").mockImplementation(() => {}); // the cause goes to the server log only
    const res = await request(app).post("/api/slots").set("Cookie", advisorCookie).send({ startAt: futureStart() });
    expectErrorShape(res, 500, "INTERNAL_ERROR");
    expect(res.body.error.message).toBe("Something went wrong.");
    expect(console.error).toHaveBeenCalledWith(leaky);
  });
});
