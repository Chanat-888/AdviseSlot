import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-12 Edit slot, tests TEST-F12-01 to TEST-F12-07 from
// docs/sprints/sprint-2/F-12-edit-slot.md (v0.2, section 8).
// Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 2026 10:00. Slot X = advisor A's
// Tue 10 Nov 09:00. Other slots and bookings are inserted with Prisma. Sessions last 2 hours
// (D-21), so a test that moves the clock logs in again after moving it.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;
const NOW = "2026-11-09T10:00:00";

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string, opts: { isLate?: boolean; deletedAt?: Date } = {}) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: {
      advisorId,
      startAt,
      endAt: new Date(startAt.getTime() + HALF_HOUR),
      createdAt: bkk("2026-11-01T09:00:00"),
      isLate: opts.isLate ?? false,
      deletedAt: opts.deletedAt ?? null,
    },
  });
}

async function insertBooking(slotId: number, studentId: number, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  return prisma.booking.create({ data: { slotId, studentId, status, createdAt: bkk("2026-11-02T09:00:00") } });
}

const edit = (cookie: string, id: number | string, body: unknown) =>
  request(app).patch(`/api/slots/${id}`).set("Cookie", cookie).send(body as object);
const moveTo = (cookie: string, id: number, local: string) => edit(cookie, id, { startAt: iso(local) });
const row = (id: number) => prisma.slot.findUniqueOrThrow({ where: { id } });

/** Asserts the stored slot still has the times it had before a rejected edit. */
async function expectUnchanged(id: number, startLocal: string) {
  const r = await row(id);
  expect(r.startAt).toEqual(bkk(startLocal));
  expect(r.endAt).toEqual(new Date(bkk(startLocal).getTime() + HALF_HOUR));
}

let X: { id: number };

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // also empties Booking
  vi.useFakeTimers({ toFake: ["Date"] });
  at(NOW);
  X = await insertSlot(advisor.id, "2026-11-10T09:00:00");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F12-01 (AC-F12-01): change the start time of an own unbooked future slot", () => {
  it("returns 200 with the F-05 item shape, keeps the id and ignores a client endAt", async () => {
    const res = await edit(await loginCookie(advisor.email), X.id, {
      startAt: iso("2026-11-10T14:00:00"),
      endAt: iso("2026-11-10T18:00:00"),
      advisorId: advisorB.id,
      isLate: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: X.id,
      startAt: iso("2026-11-10T14:00:00"),
      endAt: iso("2026-11-10T14:30:00"),
      isLate: false,
      bookingDeadline: iso("2026-11-10T12:00:00"),
      status: "Open",
      student: null,
      bookingId: null,
    });
    const r = await row(X.id);
    expect(r).toMatchObject({
      advisorId: advisor.id,
      startAt: bkk("2026-11-10T14:00:00"),
      endAt: bkk("2026-11-10T14:30:00"),
      isLate: false,
      createdAt: bkk("2026-11-01T09:00:00"), // createdAt stays (D-28)
      deletedAt: null,
    });
    expect(await prisma.slot.count()).toBe(1);
  });
});

describe("TEST-F12-02 (AC-F12-02): the F-04 rules apply to the new start", () => {
  it.each([
    ["Sat 14 Nov 10:00", "2026-11-14T10:00:00", "SLOT_NOT_WEEKDAY", "Slots can only be on Monday to Friday."],
    ["Tue 10:15", "2026-11-10T10:15:00", "SLOT_INVALID_START_MINUTE", "A slot must start on the hour or half hour."],
    ["Tue 07:30", "2026-11-10T07:30:00", "SLOT_OUTSIDE_HOURS", "Slots must be between 08:00 and 18:00."],
    ["Tue 18:00", "2026-11-10T18:00:00", "SLOT_OUTSIDE_HOURS", "Slots must be between 08:00 and 18:00."],
    ["Mon 9 Nov 09:30 (past)", "2026-11-09T09:30:00", "SLOT_IN_PAST", "This start time is in the past."],
  ])("rejects %s with 422 and leaves X unchanged", async (_name, local, code, message) => {
    const res = await moveTo(await loginCookie(advisor.email), X.id, local);
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { code, message } });
    await expectUnchanged(X.id, "2026-11-10T09:00:00");
  });

  it("accepts the first (08:00) and last (17:30) allowed starts", async () => {
    const a = await loginCookie(advisor.email);
    const first = await moveTo(a, X.id, "2026-11-10T08:00:00");
    expect(first.status).toBe(200);
    expect(first.body.startAt).toBe(iso("2026-11-10T08:00:00"));
    const last = await moveTo(a, X.id, "2026-11-10T17:30:00");
    expect(last.status).toBe(200);
    expect(last.body.endAt).toBe(iso("2026-11-10T18:00:00"));
  });
});

describe("TEST-F12-03 (AC-F12-03): no overlap with another own live slot; the slot itself does not count", () => {
  it("rejects an own overlap, accepts the unchanged start, another advisor's time and an own deleted slot's time", async () => {
    await insertSlot(advisor.id, "2026-11-10T10:00:00");
    await insertSlot(advisorB.id, "2026-11-10T14:00:00");
    await insertSlot(advisor.id, "2026-11-10T15:00:00", { deletedAt: bkk("2026-11-08T09:00:00") });
    const a = await loginCookie(advisor.email);

    const overlap = await moveTo(a, X.id, "2026-11-10T10:00:00");
    expect(overlap.status).toBe(409);
    expect(overlap.body).toEqual({ error: { code: "SLOT_OVERLAP", message: "This slot overlaps one of your slots." } });
    await expectUnchanged(X.id, "2026-11-10T09:00:00");

    // Fails if the slot counts against itself: 09:00 is the only start that overlaps its old range.
    const same = await moveTo(a, X.id, "2026-11-10T09:00:00");
    expect(same.status).toBe(200);
    expect(same.body.startAt).toBe(iso("2026-11-10T09:00:00"));

    expect((await moveTo(a, X.id, "2026-11-10T14:00:00")).status).toBe(200);
    expect((await moveTo(a, X.id, "2026-11-10T15:00:00")).status).toBe(200);
    await expectUnchanged(X.id, "2026-11-10T15:00:00");
  });

  it("accepts a start back-to-back with the old range (09:30)", async () => {
    const res = await moveTo(await loginCookie(advisor.email), X.id, "2026-11-10T09:30:00");
    expect(res.status).toBe(200);
    expect(res.body.endAt).toBe(iso("2026-11-10T10:00:00"));
  });
});

describe("TEST-F12-04 (AC-F12-04): an ACTIVE booking blocks the edit, a CANCELLED one does not", () => {
  it("returns 409 SLOT_HAS_ACTIVE_BOOKING for X and 200 for the slot with only a cancelled booking", async () => {
    const booking = await insertBooking(X.id, student.id);
    const Y = await insertSlot(advisor.id, "2026-11-10T11:00:00");
    await insertBooking(Y.id, student.id, "CANCELLED");
    const a = await loginCookie(advisor.email);

    const blocked = await moveTo(a, X.id, "2026-11-10T14:00:00");
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual({
      error: { code: "SLOT_HAS_ACTIVE_BOOKING", message: "This slot has a booking. Cancel the booking first." },
    });
    await expectUnchanged(X.id, "2026-11-10T09:00:00");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("ACTIVE");

    const ok = await moveTo(a, Y.id, "2026-11-10T16:00:00");
    expect(ok.status).toBe(200);
    await expectUnchanged(Y.id, "2026-11-10T16:00:00");
  });
});

describe("TEST-F12-05 (AC-F12-05): isLate is recomputed for the new start as if created now (D-28)", () => {
  it("becomes late, goes back to normal, then follows the exactly-2-hours boundary", async () => {
    at("2026-11-09T19:00:00");
    const W = await insertSlot(advisor.id, "2026-11-11T09:00:00");
    let a = await loginCookie(advisor.email);

    const late = await moveTo(a, W.id, "2026-11-10T09:00:00");
    expect(late.status).toBe(200);
    expect(late.body.isLate).toBe(true);
    expect(late.body.bookingDeadline).toBe(iso("2026-11-10T07:00:00"));
    expect((await row(W.id)).isLate).toBe(true);

    const back = await moveTo(a, W.id, "2026-11-11T09:00:00");
    expect(back.status).toBe(200);
    expect(back.body.isLate).toBe(false);
    expect(back.body.bookingDeadline).toBe(iso("2026-11-10T18:00:00"));

    at("2026-11-10T07:30:00");
    a = await loginCookie(advisor.email);
    const tooSoon = await moveTo(a, W.id, "2026-11-10T09:30:00"); // late and exactly 2 h away
    expect(tooSoon.status).toBe(422);
    expect(tooSoon.body).toEqual({ error: { code: "SLOT_UNBOOKABLE", message: "This slot starts too soon to be booked." } });
    await expectUnchanged(W.id, "2026-11-11T09:00:00");

    at("2026-11-10T07:29:00");
    a = await loginCookie(advisor.email);
    const justOk = await moveTo(a, W.id, "2026-11-10T09:30:00"); // 2 h 01 min away
    expect(justOk.status).toBe(200);
    expect(justOk.body.isLate).toBe(true);
  });
});

describe("TEST-F12-06 (AC-F12-06): a slot that has started cannot be edited (D-29)", () => {
  it("rejects a slot in progress and one starting now", async () => {
    const inProgress = await insertSlot(advisor.id, "2026-11-09T09:30:00");
    const startsNow = await insertSlot(advisor.id, "2026-11-09T10:00:00");
    const a = await loginCookie(advisor.email);

    for (const [slot, start] of [[inProgress, "2026-11-09T09:30:00"], [startsNow, "2026-11-09T10:00:00"]] as const) {
      const res = await moveTo(a, slot.id, "2026-11-10T15:00:00");
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: { code: "SLOT_ALREADY_STARTED", message: "This slot has already started." } });
      await expectUnchanged(slot.id, start);
    }
  });
});

describe("TEST-F12-07 (AC-F12-07): only the slot's advisor can edit it; input is validated", () => {
  it("gives 403 to a student, 404 to another advisor and for deleted or unknown slots, 400 for bad input", async () => {
    const gone = await insertSlot(advisor.id, "2026-11-10T12:00:00", { deletedAt: bkk("2026-11-08T09:00:00") });
    const a = await loginCookie(advisor.email);
    const notFound = { error: { code: "NOT_FOUND", message: "Slot not found." } };
    const valid = { startAt: iso("2026-11-10T15:00:00") };

    const asStudent = await edit(await loginCookie(student.email), X.id, valid);
    expect(asStudent.status).toBe(403);
    expect(asStudent.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only advisors can edit slots." } });

    const other = await edit(await loginCookie(advisorB.email), X.id, valid);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(notFound);

    for (const id of [gone.id, 999999]) {
      const res = await edit(a, id, valid);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(notFound);
    }

    const badId = await edit(a, "abc", valid);
    expect(badId.status).toBe(400);
    expect(badId.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "The slot id must be a positive integer." } });

    for (const body of [{}, { startAt: "tomorrow" }]) {
      const res = await edit(a, X.id, body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "A valid start time is required." } });
    }

    await expectUnchanged(X.id, "2026-11-10T09:00:00");
    expect((await row(gone.id)).startAt).toEqual(bkk("2026-11-10T12:00:00"));
  });
});
