import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-04 Create slot, tests TEST-F04-01 to TEST-F04-07 (API part) from
// docs/sprints/sprint-1/F-04-create-slot.md (v0.2, section 8).
// Unit parts of TEST-F04-02 and -06 are in domain.rules.test.ts.
// Unless a test says otherwise, now = Mon 9 Nov 2026 10:00 Asia/Bangkok.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HOUR = 60 * 60 * 1000;

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

function create(cookie: string, body: unknown) {
  return request(app).post("/api/slots").set("Cookie", cookie).send(body as object);
}

const slotCount = (advisorId?: number) => prisma.slot.count({ where: advisorId ? { advisorId } : {} });

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE');
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-09T10:00:00");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F04-01 (AC-F04-01): create a slot from its start time", () => {
  it("sets endAt = startAt + 30 min, ignores the client endAt and uses the session advisor", async () => {
    const cookie = await loginCookie(advisor.email);
    const res = await create(cookie, {
      startAt: iso("2026-11-10T09:00:00"),
      endAt: iso("2026-11-10T12:00:00"),
      advisorId: advisorB.id,
      isLate: true,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      startAt: iso("2026-11-10T09:00:00"),
      endAt: iso("2026-11-10T09:30:00"),
      isLate: false,
      bookingDeadline: iso("2026-11-09T18:00:00"),
      status: "Open",
      student: null,
      bookingId: null,
    });

    const rows = await prisma.slot.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      advisorId: advisor.id,
      isLate: false,
      endAt: bkk("2026-11-10T09:30:00"),
      createdAt: bkk("2026-11-09T10:00:00"),
      deletedAt: null,
    });
  });
});

describe("TEST-F04-02 (AC-F04-02): BR-02 weekday, minute and hours", () => {
  it.each([
    ["Sat 14 Nov 10:00", "2026-11-14T10:00:00", "SLOT_NOT_WEEKDAY"],
    ["Sun 15 Nov 10:00", "2026-11-15T10:00:00", "SLOT_NOT_WEEKDAY"],
    ["Tue 10:15", "2026-11-10T10:15:00", "SLOT_INVALID_START_MINUTE"],
    ["Tue 10:00:30", "2026-11-10T10:00:30", "SLOT_INVALID_START_MINUTE"],
    ["Tue 07:30", "2026-11-10T07:30:00", "SLOT_OUTSIDE_HOURS"],
    ["Tue 18:00", "2026-11-10T18:00:00", "SLOT_OUTSIDE_HOURS"],
  ])("rejects %s (%s) with 422 %s and creates no row", async (_name, local, code) => {
    const cookie = await loginCookie(advisor.email);
    const res = await create(cookie, { startAt: iso(local) });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
    expect(await slotCount()).toBe(0);
  });

  it("accepts 08:00 and 17:30 on a weekday", async () => {
    const cookie = await loginCookie(advisor.email);
    expect((await create(cookie, { startAt: iso("2026-11-10T08:00:00") })).status).toBe(201);
    expect((await create(cookie, { startAt: iso("2026-11-10T17:30:00") })).status).toBe(201);
    expect(await slotCount()).toBe(2);
  });
});

describe("TEST-F04-03 (AC-F04-03): BR-03 no start in the past", () => {
  it("rejects earlier today and a previous day with 422 SLOT_IN_PAST", async () => {
    const cookie = await loginCookie(advisor.email);
    for (const local of ["2026-11-09T09:30:00", "2026-11-06T10:00:00"]) {
      const res = await create(cookie, { startAt: iso(local) });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("SLOT_IN_PAST");
    }
    expect(await slotCount()).toBe(0);
  });
});

describe("TEST-F04-04 (AC-F04-04): BR-04 no overlap with own slots", () => {
  it("rejects the same time for the same advisor, accepts back-to-back and another advisor", async () => {
    const a = await loginCookie(advisor.email);
    const b = await loginCookie(advisorB.email);
    expect((await create(a, { startAt: iso("2026-11-10T09:00:00") })).status).toBe(201);

    const dup = await create(a, { startAt: iso("2026-11-10T09:00:00") });
    expect(dup.status).toBe(409);
    expect(dup.body).toEqual({
      error: { code: "SLOT_OVERLAP", message: "This slot overlaps one of your slots." },
    });
    expect(await slotCount(advisor.id)).toBe(1);

    expect((await create(a, { startAt: iso("2026-11-10T09:30:00") })).status).toBe(201);
    expect((await create(b, { startAt: iso("2026-11-10T09:00:00") })).status).toBe(201);
  });

  // F-04 section 6: a parallel insert is stopped by the Slot_no_overlap exclusion constraint.
  // This checks that the database error is mapped to 409 SLOT_OVERLAP and never becomes a 500.
  it("parallel requests for the same start give one 201 and the rest 409, never 500", async () => {
    const a = await loginCookie(advisor.email);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => create(a, { startAt: iso("2026-11-11T09:00:00") })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe("SLOT_OVERLAP");
    expect(await slotCount(advisor.id)).toBe(1);
  });

  it("the database itself rejects an overlapping insert (Slot_no_overlap)", async () => {
    const base = { advisorId: advisor.id, createdAt: new Date(), isLate: false };
    await prisma.slot.create({
      data: { ...base, startAt: bkk("2026-11-12T09:00:00"), endAt: bkk("2026-11-12T09:30:00") },
    });
    const err = await prisma.slot
      .create({ data: { ...base, startAt: bkk("2026-11-12T09:15:00"), endAt: bkk("2026-11-12T09:45:00") } })
      .catch((e: unknown) => e);
    expect(String((err as Error).message)).toMatch(/23P01|Slot_no_overlap/);
  });
});

describe("TEST-F04-05 (AC-F04-05): only advisors create slots", () => {
  it("returns 403 FORBIDDEN_ROLE to a student and creates no row", async () => {
    const cookie = await loginCookie(student.email);
    const res = await create(cookie, { startAt: iso("2026-11-10T09:00:00") });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "FORBIDDEN_ROLE", message: "Only advisors can create slots." },
    });
    expect(await slotCount()).toBe(0);
  });

  it("returns 401 without a session and 400 for a missing or invalid startAt", async () => {
    const none = await request(app).post("/api/slots").send({ startAt: iso("2026-11-10T09:00:00") });
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");

    const cookie = await loginCookie(advisor.email);
    for (const body of [{}, { startAt: "" }, { startAt: 123 }, { startAt: "2026-11-10T09:00:00" }, { startAt: "not a date" }]) {
      const res = await create(cookie, body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: "VALIDATION_ERROR", message: "A valid start time is required." },
      });
    }
    expect(await slotCount()).toBe(0);
  });
});

describe("TEST-F04-06 (AC-F04-06): late slot accepted when more than 2 h away", () => {
  it("at Mon 19:00, a Tue 09:00 slot is created with isLate true and deadline Tue 07:00", async () => {
    at("2026-11-09T19:00:00");
    const cookie = await loginCookie(advisor.email);
    const res = await create(cookie, { startAt: iso("2026-11-10T09:00:00") });
    expect(res.status).toBe(201);
    expect(res.body.isLate).toBe(true);
    expect(res.body.bookingDeadline).toBe(iso("2026-11-10T07:00:00"));
    expect(res.body.status).toBe("Open");
    expect((await prisma.slot.findFirstOrThrow()).isLate).toBe(true);
  });
});

describe("TEST-F04-07 (AC-F04-07): late slot 2 h or less away is unbookable", () => {
  it("rejects at exactly 2 h with SLOT_UNBOOKABLE and accepts at 2 h 01 min", async () => {
    at("2026-11-10T07:30:00");
    const cookie = await loginCookie(advisor.email);
    const tooSoon = await create(cookie, { startAt: iso("2026-11-10T09:30:00") });
    expect(tooSoon.status).toBe(422);
    expect(tooSoon.body).toEqual({
      error: { code: "SLOT_UNBOOKABLE", message: "This slot starts too soon to be booked." },
    });
    expect(await slotCount()).toBe(0);

    at("2026-11-10T07:29:00");
    const ok = await create(cookie, { startAt: iso("2026-11-10T09:30:00") });
    expect(ok.status).toBe(201);
    expect(ok.body.isLate).toBe(true);
    expect(new Date(ok.body.bookingDeadline).getTime()).toBe(bkk("2026-11-10T09:30:00").getTime() - 2 * HOUR);
  });
});
