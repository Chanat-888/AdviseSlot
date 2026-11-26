import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-18 Cancellation history, tests TEST-F18-01 to TEST-F18-05 from
// docs/sprints/sprint-3/F-18-cancellation-history.md (v0.2, section 8). TEST-F18-06 is the E2E
// step in e2e/tests/journey.spec.ts. Times are Asia/Bangkok, now = Mon 9 Nov 2026 10:00 unless
// stated. Rows are inserted with Prisma, so no Sprint 2 endpoint is needed in the setup.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let advisor: Fixture; // A
let advisorB: Fixture; // B
let s1: Fixture;
let s2: Fixture;
let s3: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: { advisorId, startAt, endAt: new Date(startAt.getTime() + HALF_HOUR), createdAt: bkk("2026-11-01T09:00:00"), isLate: false },
  });
}

type Cancel = { by: number; reason?: string | null };

async function insertBooking(slotId: number, studentId: number, cancel?: Cancel) {
  // A CANCELLED row needs its cancel fields (F-10 migration CHECK).
  const fields = cancel
    ? { status: "CANCELLED" as const, cancelledAt: bkk("2026-11-03T09:00:00"), cancelledById: cancel.by, cancelReason: cancel.reason ?? null }
    : { status: "ACTIVE" as const };
  return prisma.booking.create({ data: { slotId, studentId, createdAt: bkk("2026-11-02T09:00:00"), ...fields } });
}

const history = (cookie: string, query = "") => request(app).get(`/api/bookings/history${query}`).set("Cookie", cookie);
const mine = (cookie: string) => request(app).get("/api/bookings/mine").set("Cookie", cookie);

const slotOf = (s: { id: number; startAt: Date; endAt: Date }) => ({
  id: s.id,
  startAt: s.startAt.toISOString(),
  endAt: s.endAt.toISOString(),
});
const cancellation = (by: Fixture, reason: string | null) => ({
  cancelledAt: iso("2026-11-03T09:00:00"),
  cancelledBy: { id: by.id, name: by.name, role: by.role },
  reason,
});

beforeAll(async () => {
  const base = await createUsers();
  advisor = base.advisor;
  advisorB = base.advisorB;
  s1 = base.student;
  [s2, s3] = await createStudents(2, "s");
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // cascades to Booking
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

describe("TEST-F18-01 (AC-F18-01): a student sees who cancelled and why in /mine (Sprint 2 path)", () => {
  it("returns 4 items; only the two Cancelled ones carry `cancellation`", async () => {
    const thu = await insertSlot(advisor.id, "2026-11-12T10:00:00");
    const wed = await insertSlot(advisor.id, "2026-11-11T10:00:00");
    const fri6 = await insertSlot(advisor.id, "2026-11-06T10:00:00"); // ended
    const fri13 = await insertSlot(advisorB.id, "2026-11-13T10:00:00");
    const bySelf = await insertBooking(thu.id, s1.id, { by: s1.id });
    const byAdvisor = await insertBooking(wed.id, s1.id, { by: advisor.id, reason: "Sick leave" });
    const passed = await insertBooking(fri6.id, s1.id);
    const upcoming = await insertBooking(fri13.id, s1.id);

    const res = await mine(await loginCookie(s1.email));
    expect(res.status).toBe(200);
    const common = { createdAt: iso("2026-11-02T09:00:00") };
    const a = { id: advisor.id, name: advisor.name };
    expect(res.body).toEqual([
      { id: upcoming.id, status: "Upcoming", ...common, slot: slotOf(fri13), advisor: { id: advisorB.id, name: advisorB.name } },
      { id: bySelf.id, status: "Cancelled", ...common, slot: slotOf(thu), advisor: a, cancellation: cancellation(s1, null) },
      { id: byAdvisor.id, status: "Cancelled", ...common, slot: slotOf(wed), advisor: a, cancellation: cancellation(advisor, "Sick leave") },
      { id: passed.id, status: "Passed", ...common, slot: slotOf(fri6), advisor: a },
    ]);
    expect(res.body[0]).not.toHaveProperty("cancellation");
    expect(res.body[3]).not.toHaveProperty("cancellation");
  });
});

/** The TEST-F18-02 state: four bookings on A's slots, one on B's slot. */
async function seedHistory() {
  const thu = await insertSlot(advisor.id, "2026-11-12T10:00:00");
  const wed = await insertSlot(advisor.id, "2026-11-11T10:00:00");
  const fri6 = await insertSlot(advisor.id, "2026-11-06T10:00:00"); // ended
  const fri13 = await insertSlot(advisor.id, "2026-11-13T10:00:00");
  const bThu = await insertSlot(advisorB.id, "2026-11-12T11:00:00");
  return {
    thu,
    wed,
    fri6,
    bThu,
    s1Cancelled: await insertBooking(thu.id, s1.id, { by: s1.id }),
    s2CancelledByA: await insertBooking(wed.id, s2.id, { by: advisor.id, reason: "Sick leave" }),
    s2Passed: await insertBooking(fri6.id, s2.id),
    s3Upcoming: await insertBooking(fri13.id, s3.id),
    s3OnB: await insertBooking(bThu.id, s3.id, { by: s3.id }),
  };
}

describe("TEST-F18-02 (AC-F18-02): an advisor's history lists cancelled and passed bookings on own slots", () => {
  it("gives A three items, newest first, with `student` and `cancellation`; no Upcoming, nothing of B's", async () => {
    const h = await seedHistory();

    const res = await history(await loginCookie(advisor.email));
    expect(res.status).toBe(200);
    const common = { createdAt: iso("2026-11-02T09:00:00"), advisor: { id: advisor.id, name: advisor.name } };
    expect(res.body).toEqual([
      {
        id: h.s1Cancelled.id,
        status: "Cancelled",
        ...common,
        slot: slotOf(h.thu),
        student: { id: s1.id, name: s1.name },
        cancellation: cancellation(s1, null),
      },
      {
        id: h.s2CancelledByA.id,
        status: "Cancelled",
        ...common,
        slot: slotOf(h.wed),
        student: { id: s2.id, name: s2.name },
        cancellation: cancellation(advisor, "Sick leave"),
      },
      { id: h.s2Passed.id, status: "Passed", ...common, slot: slotOf(h.fri6), student: { id: s2.id, name: s2.name } },
    ]);
    expect(res.body[2]).not.toHaveProperty("cancellation");
    // Section 4.2: no email or other user data.
    expect(JSON.stringify(res.body)).not.toMatch(/@|email|password/i);
  });
});

describe("TEST-F18-03 (AC-F18-03): BR-09 and NFR-03, no one sees another user's history", () => {
  it("gives B only the booking on B's slot, and a student 403 FORBIDDEN_ROLE", async () => {
    const h = await seedHistory();

    const b = await history(await loginCookie(advisorB.email));
    expect(b.status).toBe(200);
    expect(b.body.map((x: { id: number }) => x.id)).toEqual([h.s3OnB.id]);
    expect(b.body[0]).toMatchObject({ status: "Cancelled", student: { id: s3.id, name: s3.name }, cancellation: cancellation(s3, null) });

    const s = await history(await loginCookie(s1.email));
    expect(s.status).toBe(403);
    expect(s.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only advisors have a booking history." } });
  });
});

describe("TEST-F18-04 (AC-F18-04): deleted slots and reschedules keep their history", () => {
  it("lists the cancelled booking on a deleted slot and the old booking of a reschedule, not the new one", async () => {
    const thu = await insertSlot(advisor.id, "2026-11-12T10:00:00");
    const deleted = await insertBooking(thu.id, s1.id, { by: s1.id });
    await prisma.slot.update({ where: { id: thu.id }, data: { deletedAt: bkk("2026-11-04T09:00:00") } }); // F-13 soft delete
    // A reschedule pair (F-14): the old booking cancelled by S2 with no reason, the new one ACTIVE.
    const wed = await insertSlot(advisor.id, "2026-11-11T10:00:00");
    const fri13 = await insertSlot(advisor.id, "2026-11-13T10:00:00");
    const old = await insertBooking(wed.id, s2.id, { by: s2.id });
    await insertBooking(fri13.id, s2.id);

    const res = await history(await loginCookie(advisor.email));
    expect(res.status).toBe(200);
    expect(res.body.map((x: { id: number }) => x.id)).toEqual([deleted.id, old.id]);
    // The deleted slot shows its time as it was (section 2, step 5).
    expect(res.body[0]).toMatchObject({ status: "Cancelled", slot: slotOf(thu), cancellation: cancellation(s1, null) });
    expect(res.body[1]).toMatchObject({ status: "Cancelled", student: { id: s2.id, name: s2.name }, cancellation: cancellation(s2, null) });
  });
});

describe("TEST-F18-05 (AC-F18-05): Passed boundary and empty list", () => {
  it("leaves out a slot ending 10:30 at 10:29:59, lists it as Passed at 10:30:00, and gives B []", async () => {
    const mon = await insertSlot(advisor.id, "2026-11-09T10:00:00"); // 10:00 to 10:30
    const booking = await insertBooking(mon.id, s1.id);
    const cookieA = await loginCookie(advisor.email);

    at("2026-11-09T10:29:59");
    const before = await history(cookieA);
    expect(before.status).toBe(200);
    expect(before.body).toEqual([]);

    at("2026-11-09T10:30:00");
    const after = await history(cookieA);
    expect(after.status).toBe(200);
    expect(after.body).toEqual([
      {
        id: booking.id,
        status: "Passed",
        createdAt: iso("2026-11-02T09:00:00"),
        slot: slotOf(mon),
        advisor: { id: advisor.id, name: advisor.name },
        student: { id: s1.id, name: s1.name },
      },
    ]);

    const b = await history(await loginCookie(advisorB.email));
    expect(b.status).toBe(200);
    expect(b.body).toEqual([]);
  });
});

describe("F-18 section 2 step 6 and section 3.1: ties and query parameters", () => {
  it("orders bookings on the same slot by id descending and ignores unknown query parameters", async () => {
    const thu = await insertSlot(advisor.id, "2026-11-12T10:00:00");
    const first = await insertBooking(thu.id, s1.id, { by: s1.id });
    const second = await insertBooking(thu.id, s2.id, { by: s2.id });

    const res = await history(await loginCookie(advisor.email), `?advisorId=${advisorB.id}&studentId=${s1.id}`);
    expect(res.status).toBe(200);
    expect(res.body.map((x: { id: number }) => x.id)).toEqual([second.id, first.id]);
  });
});
