import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-17 Appointment summary, tests TEST-F17-01 to TEST-F17-06 from
// docs/sprints/sprint-3/F-17-appointment-summary.md (v0.2, section 8). The E2E step is in
// e2e/tests/journey.spec.ts. Times are Asia/Bangkok, now = Mon 9 Nov 2026 10:00 unless stated.
// Rows are inserted with Prisma (the clock is a fake Date), so no booking endpoint is needed.

const bkk = (local: string) => new Date(`${local}+07:00`);
const HALF_HOUR = 30 * 60 * 1000;

const DATES_MESSAGE = "from and to must be real dates written as YYYY-MM-DD.";
const ORDER_MESSAGE = "to must be on or after from.";
const RANGE_MESSAGE = "The range can be at most 90 days.";

let advisor: Fixture; // A
let advisorB: Fixture; // B
let s1: Fixture;
let s2: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string, deletedAt?: string) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: {
      advisorId,
      startAt,
      endAt: new Date(startAt.getTime() + HALF_HOUR),
      createdAt: bkk("2026-11-01T09:00:00"),
      isLate: false,
      deletedAt: deletedAt ? bkk(deletedAt) : null,
    },
  });
}

async function active(slotId: number, studentId: number) {
  return prisma.booking.create({ data: { slotId, studentId, createdAt: bkk("2026-11-02T09:00:00"), status: "ACTIVE" } });
}

async function cancelled(slotId: number, studentId: number, by: number, reason: string | null = null) {
  // A CANCELLED row needs its cancel fields (F-10 migration CHECK).
  return prisma.booking.create({
    data: {
      slotId,
      studentId,
      createdAt: bkk("2026-11-02T09:00:00"),
      status: "CANCELLED",
      cancelledAt: bkk("2026-11-03T09:00:00"),
      cancelledById: by,
      cancelReason: reason,
    },
  });
}

type Slot = { id: number; startAt: Date; endAt: Date };
const slotOf = (s: Slot) => ({ id: s.id, startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() });
const item = (bookingId: number, s: Slot, student: Fixture) => ({
  id: bookingId,
  slot: slotOf(s),
  student: { id: student.id, name: student.name },
});

/** Section 8, "A's week". */
async function seedWeek() {
  const mon0800 = await insertSlot(advisor.id, "2026-11-09T08:00:00");
  const monBooking = await active(mon0800.id, s1.id); // ended
  await insertSlot(advisor.id, "2026-11-09T09:30:00"); // ends at 10:00 = now: Passed
  await insertSlot(advisor.id, "2026-11-09T11:30:00"); // deadline Sun 8 Nov 18:00: Closed
  const tue0900 = await insertSlot(advisor.id, "2026-11-10T09:00:00");
  const tueBooking = await active(tue0900.id, s2.id);
  await insertSlot(advisor.id, "2026-11-10T10:00:00"); // Open
  const tue1100 = await insertSlot(advisor.id, "2026-11-10T11:00:00"); // Open, one cancelled booking
  await cancelled(tue1100.id, s1.id, s1.id);
  const wed1400 = await insertSlot(advisor.id, "2026-11-11T14:00:00");
  await cancelled(wed1400.id, s1.id, advisor.id, "Sick leave");
  const wedBooking = await active(wed1400.id, s1.id);
  const thu0900 = await insertSlot(advisor.id, "2026-11-12T09:00:00", "2026-11-04T09:00:00"); // deleted
  await cancelled(thu0900.id, s2.id, s2.id);
  await insertSlot(advisor.id, "2026-11-13T17:30:00"); // Open, last start of the day
  const fri6 = await insertSlot(advisor.id, "2026-11-06T10:00:00"); // before the range
  await active(fri6.id, s2.id);
  await insertSlot(advisor.id, "2026-11-16T08:00:00"); // after the range
  const bTue = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
  const bBooking = await active(bTue.id, s1.id);
  return { mon0800, monBooking, tue0900, tueBooking, wed1400, wedBooking, bTue, bBooking };
}

const summary = (cookie: string, query: string) => request(app).get(`/api/summary${query}`).set("Cookie", cookie);

beforeAll(async () => {
  const base = await createUsers();
  advisor = base.advisor;
  advisorB = base.advisorB;
  s1 = base.student;
  [s2] = await createStudents(1, "s");
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

describe("TEST-F17-01 (AC-F17-01): counts and upcoming list for the advisor's week", () => {
  it("gives slots 8, booked 3, cancelled 3, open 3 and the two upcoming appointments in order", async () => {
    const w = await seedWeek();

    const res = await summary(await loginCookie(advisor.email), "?from=2026-11-09&to=2026-11-13");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      from: "2026-11-09",
      to: "2026-11-13",
      counts: { slots: 8, booked: 3, cancelled: 3, open: 3 },
      upcoming: [item(w.tueBooking.id, w.tue0900, s2), item(w.wedBooking.id, w.wed1400, s1)],
    });
    // Section 4.2: the student's id and name only, no email.
    expect(JSON.stringify(res.body)).not.toMatch(/@|email|password/i);
  });
});

describe("TEST-F17-02 (AC-F17-02): Bangkok days, both ends included; deleted slots keep their cancels", () => {
  it("counts a one-day range, a day with only a deleted slot, and a day before the week", async () => {
    const w = await seedWeek();
    const cookie = await loginCookie(advisor.email);

    const tue = await summary(cookie, "?from=2026-11-10&to=2026-11-10");
    expect(tue.status).toBe(200);
    expect(tue.body).toEqual({
      from: "2026-11-10",
      to: "2026-11-10",
      counts: { slots: 3, booked: 1, cancelled: 1, open: 2 },
      upcoming: [item(w.tueBooking.id, w.tue0900, s2)],
    });

    const thu = await summary(cookie, "?from=2026-11-12&to=2026-11-12");
    expect(thu.status).toBe(200);
    expect(thu.body).toEqual({
      from: "2026-11-12",
      to: "2026-11-12",
      counts: { slots: 0, booked: 0, cancelled: 1, open: 0 },
      upcoming: [],
    });

    const fri6 = await summary(cookie, "?from=2026-11-06&to=2026-11-06");
    expect(fri6.status).toBe(200);
    expect(fri6.body).toEqual({
      from: "2026-11-06",
      to: "2026-11-06",
      counts: { slots: 1, booked: 1, cancelled: 0, open: 0 },
      upcoming: [],
    });
  });
});

describe("TEST-F17-03 (AC-F17-03): an appointment is upcoming until its slot ends (D-24)", () => {
  it("lists Tue 09:00 at 09:10, not at 09:30, and counts it as booked both times", async () => {
    const w = await seedWeek();

    at("2026-11-10T09:10:00");
    const during = await summary(await loginCookie(advisor.email), "?from=2026-11-10&to=2026-11-10");
    expect(during.status).toBe(200);
    expect(during.body.upcoming).toEqual([item(w.tueBooking.id, w.tue0900, s2)]);
    expect(during.body.counts.booked).toBe(1);

    at("2026-11-10T09:30:00");
    const after = await summary(await loginCookie(advisor.email), "?from=2026-11-10&to=2026-11-10");
    expect(after.status).toBe(200);
    expect(after.body.upcoming).toEqual([]);
    expect(after.body.counts.booked).toBe(1);
  });
});

describe("TEST-F17-04 (AC-F17-04): own slots only; an empty range gives zeros", () => {
  it("gives B only B's slot, and A all zeros for a week with no slots", async () => {
    const w = await seedWeek();

    const b = await summary(await loginCookie(advisorB.email), "?from=2026-11-09&to=2026-11-13");
    expect(b.status).toBe(200);
    expect(b.body).toEqual({
      from: "2026-11-09",
      to: "2026-11-13",
      counts: { slots: 1, booked: 1, cancelled: 0, open: 0 },
      upcoming: [item(w.bBooking.id, w.bTue, s1)],
    });

    const a = await summary(await loginCookie(advisor.email), "?from=2026-11-23&to=2026-11-27");
    expect(a.status).toBe(200);
    expect(a.body).toEqual({
      from: "2026-11-23",
      to: "2026-11-27",
      counts: { slots: 0, booked: 0, cancelled: 0, open: 0 },
      upcoming: [],
    });
  });
});

describe("TEST-F17-05 (AC-F17-05): a bad range is rejected before any read", () => {
  const bad: [string, string][] = [
    ["?to=2026-11-13", DATES_MESSAGE],
    ["?from=2026-11-09", DATES_MESSAGE],
    ["?from=&to=", DATES_MESSAGE],
    ["?from=2026-02-30&to=2026-03-01", DATES_MESSAGE],
    ["?from=10/11/2026&to=2026-11-13", DATES_MESSAGE],
    ["?from=2026-11-09&from=2026-11-10&to=2026-11-13", DATES_MESSAGE],
    ["?from[]=2026-11-09&to=2026-11-13", DATES_MESSAGE],
    ["?from[a]=2026-11-09&to=2026-11-13", DATES_MESSAGE],
    ["?from=2026-11-20&to=2026-11-10", ORDER_MESSAGE],
    ["?from=2026-11-01&to=2027-01-30", RANGE_MESSAGE],
  ];

  it.each(bad)("%s gives 400 VALIDATION_ERROR", async (query, message) => {
    const res = await summary(await loginCookie(advisor.email), query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message } });
  });

  it("accepts exactly 90 days, both ends included", async () => {
    const res = await summary(await loginCookie(advisor.email), "?from=2026-11-01&to=2027-01-29");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      from: "2026-11-01",
      to: "2027-01-29",
      counts: { slots: 0, booked: 0, cancelled: 0, open: 0 },
      upcoming: [],
    });
  });
});

describe("TEST-F17-06 (AC-F17-06): a student cannot see a summary", () => {
  it("gives 403 FORBIDDEN_ROLE with no data", async () => {
    await seedWeek();
    const res = await summary(await loginCookie(s1.email), "?from=2026-11-09&to=2026-11-13");
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only advisors have an appointment summary." } });
  });
});
