import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-15 Batch create slots, tests TEST-F15-01 to TEST-F15-06 (API part) from
// docs/sprints/sprint-2/F-15-batch-create-slots.md (v0.2, section 8). The unit part of
// TEST-F15-05 (expandRange) is in domain.rules.test.ts; TEST-F15-07 is the E2E step.
// Times are Asia/Bangkok. Unless a test says otherwise, now = Mon 9 Nov 2026 10:00.
// Pre-existing slots are inserted with Prisma so their times can be set freely.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;
const NOW = "2026-11-09T10:00:00";

// F-04 section 4.3 messages; F-15 section 3.2 adds " (slot at HH:MM)" for rule failures.
const M = {
  SLOT_NOT_WEEKDAY: "Slots can only be on Monday to Friday.",
  SLOT_INVALID_START_MINUTE: "A slot must start on the hour or half hour.",
  SLOT_OUTSIDE_HOURS: "Slots must be between 08:00 and 18:00.",
  SLOT_IN_PAST: "This start time is in the past.",
  SLOT_UNBOOKABLE: "This slot starts too soon to be booked.",
  SLOT_OVERLAP: "This slot overlaps one of your slots.",
} as const;
const atSlot = (code: keyof typeof M, hhmm: string) => `${M[code]} (slot at ${hhmm})`;
const VALIDATION = {
  error: { code: "VALIDATION_ERROR", message: "Choose a start and end time on one day, in 30-minute steps." },
};

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string, opts: { deletedAt?: Date } = {}) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: {
      advisorId,
      startAt,
      endAt: new Date(startAt.getTime() + HALF_HOUR),
      createdAt: bkk("2026-11-01T09:00:00"),
      isLate: false,
      deletedAt: opts.deletedAt ?? null,
    },
  });
}

function batch(cookie: string, body: unknown) {
  return request(app).post("/api/slots/batch").set("Cookie", cookie).send(body as object);
}

/** POST /api/slots/batch for a local range. */
const batchRange = (cookie: string, from: string, to: string) => batch(cookie, { startAt: iso(from), endAt: iso(to) });

const slotCount = (advisorId?: number) => prisma.slot.count({ where: advisorId ? { advisorId } : {} });

type SlotItem = { id: number; startAt: string; endAt: string; isLate: boolean };

/** The response items' starts, in order. */
const startsOf = (body: { slots: SlotItem[] }) => body.slots.map((s) => s.startAt);

/** Local starts of one date in 30-minute steps: day "2026-11-10", from "09:00", n slots. */
function localStarts(day: string, from: string, n: number): string[] {
  const first = bkk(`${day}T${from}:00`).getTime();
  return Array.from({ length: n }, (_, i) => new Date(first + i * HALF_HOUR).toISOString());
}

/**
 * Checks that every slot of a 201 response is stored as F-15 section 2 step 6 says: one row
 * per item with the session advisor, endAt = startAt + 30 min, createdAt = now, the item's isLate.
 */
async function expectStored(items: SlotItem[], advisorId: number, now: Date) {
  for (const item of items) {
    const row = await prisma.slot.findUniqueOrThrow({ where: { id: item.id } });
    expect(row).toMatchObject({
      advisorId,
      startAt: new Date(item.startAt),
      endAt: new Date(new Date(item.startAt).getTime() + HALF_HOUR),
      createdAt: now,
      isLate: item.isLate,
      deletedAt: null,
    });
    expect(item.endAt).toBe(new Date(new Date(item.startAt).getTime() + HALF_HOUR).toISOString());
  }
}

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // also empties Booking
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F15-01 (AC-F15-01): create consecutive 30-minute slots in one action", () => {
  it("creates 4, 20 and 1 slots for the advisor, sorted, and all 25 appear in GET /api/slots/mine", async () => {
    const a = await loginCookie(advisor.email);

    const tue = await batchRange(a, "2026-11-10T09:00:00", "2026-11-10T11:00:00");
    expect(tue.status).toBe(201);
    // F-04 section 4.2 item shape; morning slots have the previous day 18:00 deadline (BR-06).
    expect(tue.body).toEqual({
      slots: ["09:00", "09:30", "10:00", "10:30"].map((hhmm) => ({
        id: expect.any(Number),
        startAt: iso(`2026-11-10T${hhmm}:00`),
        endAt: new Date(bkk(`2026-11-10T${hhmm}:00`).getTime() + HALF_HOUR).toISOString(),
        isLate: false,
        bookingDeadline: iso("2026-11-09T18:00:00"),
        status: "Open",
        student: null,
        bookingId: null,
      })),
    });
    await expectStored(tue.body.slots, advisor.id, bkk(NOW));

    const wed = await batchRange(a, "2026-11-11T08:00:00", "2026-11-11T18:00:00");
    expect(wed.status).toBe(201);
    expect(startsOf(wed.body)).toEqual(localStarts("2026-11-11", "08:00", 20));
    expect(wed.body.slots.every((s: SlotItem) => s.isLate === false)).toBe(true);
    await expectStored(wed.body.slots, advisor.id, bkk(NOW));

    const thu = await batchRange(a, "2026-11-12T09:00:00", "2026-11-12T09:30:00");
    expect(thu.status).toBe(201);
    expect(startsOf(thu.body)).toEqual([iso("2026-11-12T09:00:00")]);
    await expectStored(thu.body.slots, advisor.id, bkk(NOW));

    expect(await slotCount(advisor.id)).toBe(25);
    expect(await slotCount()).toBe(25);

    const mine = await request(app).get("/api/slots/mine").set("Cookie", a);
    expect(mine.status).toBe(200);
    expect(mine.body.map((s: SlotItem) => s.startAt)).toEqual([
      ...localStarts("2026-11-10", "09:00", 4),
      ...localStarts("2026-11-11", "08:00", 20),
      iso("2026-11-12T09:00:00"),
    ]);
  });
});

describe("TEST-F15-02 (AC-F15-02): a range with a slot that breaks BR-02 or BR-03 is rejected whole", () => {
  it.each([
    ["Tue 17:00-18:30", "2026-11-10T17:00:00", "2026-11-10T18:30:00", "SLOT_OUTSIDE_HOURS", atSlot("SLOT_OUTSIDE_HOURS", "18:00")],
    ["Tue 07:30-09:00", "2026-11-10T07:30:00", "2026-11-10T09:00:00", "SLOT_OUTSIDE_HOURS", atSlot("SLOT_OUTSIDE_HOURS", "07:30")],
    ["Tue 07:00-18:00 (22 slots)", "2026-11-10T07:00:00", "2026-11-10T18:00:00", "SLOT_OUTSIDE_HOURS", atSlot("SLOT_OUTSIDE_HOURS", "07:00")],
    ["Sat 14 Nov 09:00-10:00", "2026-11-14T09:00:00", "2026-11-14T10:00:00", "SLOT_NOT_WEEKDAY", atSlot("SLOT_NOT_WEEKDAY", "09:00")],
    ["Tue 09:15-10:15", "2026-11-10T09:15:00", "2026-11-10T10:15:00", "SLOT_INVALID_START_MINUTE", atSlot("SLOT_INVALID_START_MINUTE", "09:15")],
    ["Mon 9 Nov 09:00-11:00 (three slots past)", "2026-11-09T09:00:00", "2026-11-09T11:00:00", "SLOT_IN_PAST", atSlot("SLOT_IN_PAST", "09:00")],
  ])("%s gives 422 and creates no rows", async (_name, from, to, code, message) => {
    const res = await batchRange(await loginCookie(advisor.email), from, to);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code, message } });
    expect(await slotCount()).toBe(0);
  });
});

describe("TEST-F15-03 (AC-F15-03): a range overlapping a live slot of the advisor is rejected whole", () => {
  it("returns 409 naming the first overlapping slot and creates no rows", async () => {
    const existing = await insertSlot(advisor.id, "2026-11-10T10:00:00");

    const res = await batchRange(await loginCookie(advisor.email), "2026-11-10T09:00:00", "2026-11-10T11:00:00");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: "SLOT_OVERLAP", message: atSlot("SLOT_OVERLAP", "10:00") } });
    const rows = await prisma.slot.findMany({ where: { advisorId: advisor.id } });
    expect(rows.map((r) => r.id)).toEqual([existing.id]);
    expect(await slotCount()).toBe(1);
  });

  it("back-to-back slots, another advisor's slot and an own deleted slot do not block", async () => {
    await insertSlot(advisor.id, "2026-11-10T08:30:00");
    await insertSlot(advisor.id, "2026-11-10T11:00:00");
    await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    await insertSlot(advisor.id, "2026-11-11T09:00:00", { deletedAt: bkk("2026-11-08T09:00:00") });
    const a = await loginCookie(advisor.email);

    const tue = await batchRange(a, "2026-11-10T09:00:00", "2026-11-10T11:00:00");
    expect(tue.status).toBe(201);
    expect(startsOf(tue.body)).toEqual(localStarts("2026-11-10", "09:00", 4));
    await expectStored(tue.body.slots, advisor.id, bkk(NOW));

    const wed = await batchRange(a, "2026-11-11T09:00:00", "2026-11-11T10:00:00");
    expect(wed.status).toBe(201);
    expect(startsOf(wed.body)).toEqual(localStarts("2026-11-11", "09:00", 2));
    await expectStored(wed.body.slots, advisor.id, bkk(NOW));

    expect(await slotCount(advisor.id)).toBe(3 + 4 + 2); // 08:30, 11:00, deleted Wed 09:00, 6 new
    expect(await slotCount(advisorB.id)).toBe(1);
  });
});

describe("TEST-F15-04 (AC-F15-04): each slot gets its own isLate; a late slot 2 h or less away rejects the batch", () => {
  it("mixed isLate at Mon 19:00, 422 SLOT_UNBOOKABLE at Tue 07:00, 201 at Tue 06:59", async () => {
    // Now Mon 19:00: the morning deadlines (Mon 18:00) passed, the afternoon ones (Tue 10:00, 10:30) not.
    at("2026-11-09T19:00:00");
    const mixed = await batchRange(await loginCookie(advisor.email), "2026-11-10T11:00:00", "2026-11-10T13:00:00");
    expect(mixed.status).toBe(201);
    expect(startsOf(mixed.body)).toEqual(localStarts("2026-11-10", "11:00", 4));
    expect(mixed.body.slots.map((s: SlotItem) => s.isLate)).toEqual([true, true, false, false]);
    await expectStored(mixed.body.slots, advisor.id, bkk("2026-11-09T19:00:00"));

    // Now Tue 07:00: the 09:00 slot is late and exactly 2 h away (D-23).
    at("2026-11-10T07:00:00");
    const tooSoon = await batchRange(await loginCookie(advisorB.email), "2026-11-10T09:00:00", "2026-11-10T10:00:00");
    expect(tooSoon.status).toBe(422);
    expect(tooSoon.body).toEqual({ error: { code: "SLOT_UNBOOKABLE", message: atSlot("SLOT_UNBOOKABLE", "09:00") } });
    expect(await slotCount(advisorB.id)).toBe(0);

    // Now Tue 06:59: 2 h 01 min away, both late but bookable.
    at("2026-11-10T06:59:00");
    const ok = await batchRange(await loginCookie(advisorB.email), "2026-11-10T09:00:00", "2026-11-10T10:00:00");
    expect(ok.status).toBe(201);
    expect(startsOf(ok.body)).toEqual(localStarts("2026-11-10", "09:00", 2));
    expect(ok.body.slots.map((s: SlotItem) => s.isLate)).toEqual([true, true]);
    await expectStored(ok.body.slots, advisorB.id, bkk("2026-11-10T06:59:00"));
  });
});

describe("TEST-F15-05 (AC-F15-05, API part): an invalid range is rejected before any rule check", () => {
  it.each([
    ["09:00 to 09:00 (empty)", { startAt: iso("2026-11-10T09:00:00"), endAt: iso("2026-11-10T09:00:00") }],
    ["11:00 to 09:00 (end before start)", { startAt: iso("2026-11-10T11:00:00"), endAt: iso("2026-11-10T09:00:00") }],
    ["09:00 to 09:45 (not a multiple of 30 minutes)", { startAt: iso("2026-11-10T09:00:00"), endAt: iso("2026-11-10T09:45:00") }],
    ["Tue 23:30 to Wed 00:00 (two dates)", { startAt: iso("2026-11-10T23:30:00"), endAt: iso("2026-11-11T00:00:00") }],
    ["a body without endAt", { startAt: iso("2026-11-10T09:00:00") }],
    // Section 3.1 field rule, added after review: missing startAt, and a time without a zone.
    ["a body without startAt", { endAt: iso("2026-11-10T10:00:00") }],
    ["an endAt without a time zone", { startAt: iso("2026-11-10T09:00:00"), endAt: "2026-11-10T10:00:00" }],
  ])("%s gives 400 VALIDATION_ERROR and creates no rows", async (_name, body) => {
    const res = await batch(await loginCookie(advisor.email), body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(VALIDATION);
    expect(await slotCount()).toBe(0);
  });
});

describe("TEST-F15-06 (AC-F15-06): a student cannot batch-create slots", () => {
  it("returns 403 FORBIDDEN_ROLE and creates no rows", async () => {
    const res = await batchRange(await loginCookie(student.email), "2026-11-10T09:00:00", "2026-11-10T10:00:00");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only advisors can create slots." } });
    expect(await slotCount()).toBe(0);
  });
});
