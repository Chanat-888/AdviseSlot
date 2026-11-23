import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-10 Student cancels booking, tests TEST-F10-01 to TEST-F10-05 from
// docs/sprints/sprint-2/F-10-student-cancel.md (v0.2, section 8), plus check 4 of section 3.2
// (parallel cancel) and the section 6 CHECK constraints. F-11 adds its tests to this file.
// Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 2026 10:00. Slots and bookings are
// inserted with Prisma so their times can be set freely.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;
const NOW = "2026-11-09T10:00:00";

let a: Fixture; // advisor A
let b: Fixture; // advisor B
let s1: Fixture;
let s2: Fixture;
let s3: Fixture;
let s4: Fixture;

const at = (local: string) => vi.setSystemTime(bkk(local));

async function insertSlot(advisorId: number, local: string) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: { advisorId, startAt, endAt: new Date(startAt.getTime() + HALF_HOUR), createdAt: bkk("2026-11-01T09:00:00"), isLate: false },
  });
}

async function insertBooking(slotId: number, studentId: number, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  const cancel = status === "CANCELLED" ? { cancelledAt: bkk("2026-11-03T09:00:00"), cancelledById: studentId } : {};
  return prisma.booking.create({ data: { slotId, studentId, status, createdAt: bkk("2026-11-02T09:00:00"), ...cancel } });
}

/** Logs in at the current fake time, so the 2-hour session is valid at that time. */
const as = (u: Fixture) => loginCookie(u.email);
const cancel = (cookie: string, id: number | string, body: object = {}) =>
  request(app).post(`/api/bookings/${id}/cancel`).set("Cookie", cookie).send(body);
const row = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id } });

beforeAll(async () => {
  const base = await createUsers();
  a = base.advisor;
  b = base.advisorB;
  s1 = base.student;
  [s2, s3, s4] = await createStudents(3, "s");
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

describe("TEST-F10-01 (AC-F10-01): a student cancels their own Upcoming booking", () => {
  it("returns 200 with the cancellation, stores it, and F-08 / F-09 return the same object", async () => {
    const slot1 = await insertSlot(a.id, "2026-11-12T10:00:00"); // Thu 12 Nov 10:00
    const slot2 = await insertSlot(a.id, "2026-11-13T10:00:00"); // Fri 13 Nov 10:00
    const booking = await insertBooking(slot1.id, s1.id);
    const other = await insertBooking(slot2.id, s2.id);
    const c1 = await as(s1);
    const c2 = await as(s2);

    const res = await cancel(c1, booking.id);
    const cancellation = {
      cancelledAt: iso(NOW),
      cancelledBy: { id: s1.id, name: s1.name, role: "STUDENT" },
      reason: null,
    };
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: booking.id,
      status: "Cancelled",
      createdAt: iso("2026-11-02T09:00:00"),
      slot: { id: slot1.id, startAt: iso("2026-11-12T10:00:00"), endAt: iso("2026-11-12T10:30:00") },
      advisor: { id: a.id, name: a.name },
      student: { id: s1.id, name: s1.name },
      cancellation,
    });

    const stored = await row(booking.id);
    expect(stored.status).toBe("CANCELLED");
    expect(stored.cancelledAt).toEqual(bkk(NOW));
    expect(stored.cancelledById).toBe(s1.id);
    expect(stored.cancelReason).toBeNull();

    const detail = await request(app).get(`/api/bookings/${booking.id}`).set("Cookie", c1);
    expect(detail.status).toBe(200);
    expect(detail.body).toEqual(res.body);

    const mine = await request(app).get("/api/bookings/mine").set("Cookie", c1);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].status).toBe("Cancelled");
    expect(mine.body[0].cancellation).toEqual(cancellation);

    const mine2 = await request(app).get("/api/bookings/mine").set("Cookie", c2);
    expect(mine2.body).toHaveLength(1);
    expect(mine2.body[0]).toMatchObject({ id: other.id, status: "Upcoming" });
    expect(mine2.body[0]).not.toHaveProperty("cancellation");
  });

  it("does not store a reason sent by a student (section 3.1)", async () => {
    const slot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const booking = await insertBooking(slot.id, s1.id);

    const res = await cancel(await as(s1), booking.id, { reason: "Not needed any more" });
    expect(res.status).toBe(200);
    expect(res.body.cancellation.reason).toBeNull();
    expect((await row(booking.id)).cancelReason).toBeNull();
  });
});

describe("TEST-F10-02 (AC-F10-02): BR-11 boundary in Asia/Bangkok time", () => {
  it("allows a cancel at Tue 22:00 (exactly 12 h) and refuses one at Tue 22:01", async () => {
    const slotA = await insertSlot(a.id, "2026-11-11T10:00:00"); // Wed 11 Nov 10:00
    const slotB = await insertSlot(b.id, "2026-11-11T10:00:00");
    const bk1 = await insertBooking(slotA.id, s1.id);
    const bk2 = await insertBooking(slotB.id, s2.id);

    at("2026-11-10T22:00:00");
    const ok = await cancel(await as(s1), bk1.id);
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("Cancelled");

    at("2026-11-10T22:01:00");
    const late = await cancel(await as(s2), bk2.id);
    expect(late.status).toBe(422);
    expect(late.body).toEqual({
      error: {
        code: "CANCEL_WINDOW_PASSED",
        message: "You can cancel only until 12 hours before the start (22:00 on 10 Nov).",
      },
    });
    const stored = await row(bk2.id);
    expect(stored.status).toBe("ACTIVE");
    expect(stored.cancelledAt).toBeNull();
  });
});

describe("TEST-F10-03 (AC-F10-03): a booking that is not active cannot be cancelled", () => {
  it("returns 409 BOOKING_NOT_ACTIVE for a CANCELLED booking and for one on an ended slot", async () => {
    const future = await insertSlot(a.id, "2026-11-12T10:00:00");
    const ended = await insertSlot(b.id, "2026-11-06T10:00:00"); // Fri 6 Nov 10:00
    const cancelled = await insertBooking(future.id, s1.id, "CANCELLED");
    const passed = await insertBooking(ended.id, s1.id);
    const before = [await row(cancelled.id), await row(passed.id)];
    const c1 = await as(s1);

    for (const id of [cancelled.id, passed.id]) {
      const res = await cancel(c1, id);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: { code: "BOOKING_NOT_ACTIVE", message: "This booking is no longer upcoming." } });
    }
    expect([await row(cancelled.id), await row(passed.id)]).toEqual(before);
  });
});

describe("TEST-F10-04 (AC-F10-04): BR-13, the freed slot is bookable again only before its deadline", () => {
  it("frees an afternoon slot before its deadline, and leaves a morning slot Closed after it", async () => {
    const afternoon = await insertSlot(a.id, "2026-11-11T14:00:00"); // Wed 14:00, deadline Wed 12:00
    const morning = await insertSlot(b.id, "2026-11-11T09:00:00"); // Wed 09:00, deadline Tue 18:00
    const bk1 = await insertBooking(afternoon.id, s1.id);
    const bk3 = await insertBooking(morning.id, s3.id);

    // Mon 10:00: S1 cancels; S2 sees the slot again and books it.
    expect((await cancel(await as(s1), bk1.id)).status).toBe(200);
    const c2 = await as(s2);
    const list = await request(app).get("/api/slots/bookable").set("Cookie", c2);
    expect(list.body.map((s: { id: number }) => s.id)).toContain(afternoon.id);
    const booked = await request(app).post("/api/bookings").set("Cookie", c2).send({ slotId: afternoon.id });
    expect(booked.status).toBe(201);

    // Tue 20:00: S3 cancels 13 h before the start, but after the Tue 18:00 deadline.
    at("2026-11-10T20:00:00");
    expect((await cancel(await as(s3), bk3.id)).status).toBe(200);
    const c4 = await as(s4);
    const list2 = await request(app).get("/api/slots/bookable").set("Cookie", c4);
    expect(list2.body.map((s: { id: number }) => s.id)).not.toContain(morning.id);
    const refused = await request(app).post("/api/bookings").set("Cookie", c4).send({ slotId: morning.id });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("BOOKING_DEADLINE_PASSED");
    const advisorView = await request(app).get("/api/slots/mine").set("Cookie", await as(b));
    expect(advisorView.body.find((s: { id: number }) => s.id === morning.id).status).toBe("Closed");
  });
});

describe("TEST-F10-05 (AC-F10-05): a student cannot cancel another student's booking", () => {
  it("returns the same 404 as an unknown id and leaves the row ACTIVE", async () => {
    const slot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const booking = await insertBooking(slot.id, s1.id);
    const c2 = await as(s2);

    const other = await cancel(c2, booking.id);
    const unknown = await cancel(c2, 999999);
    expect(other.status).toBe(404);
    expect(other.body).toEqual({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(other.body);
    expect((await row(booking.id)).status).toBe("ACTIVE");
  });
});

describe("F-10 section 3.1: the booking id must be a positive whole number", () => {
  it.each(["abc", "0", "-1", "1.5"])("returns 400 VALIDATION_ERROR for %s", async (id) => {
    const res = await cancel(await as(s1), id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "The booking id must be a positive whole number." },
    });
  });
});

describe("F-10 section 3.2 check 4: parallel cancel", () => {
  it("two parallel cancels of one booking give one 200 and one 409 (10 rounds)", async () => {
    const c1 = await as(s1);
    for (let i = 0; i < 10; i++) {
      const slot = await insertSlot(a.id, `2026-11-${String(12 + (i % 2)).padStart(2, "0")}T${String(8 + Math.floor(i / 2)).padStart(2, "0")}:00:00`);
      const booking = await insertBooking(slot.id, s1.id);
      const results = await Promise.all([cancel(c1, booking.id), cancel(c1, booking.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("BOOKING_NOT_ACTIVE");
      const stored = await row(booking.id);
      expect(stored.status).toBe("CANCELLED");
      expect(stored.cancelledById).toBe(s1.id);
      await prisma.booking.delete({ where: { id: booking.id } }); // s1 starts the next round free
    }
  });

  // Forces check 4: the request reads the booking while it is still ACTIVE, then waits for the
  // student lock held by a transaction that cancels it; its conditional update then changes 0 rows.
  it("a cancel that read the booking as ACTIVE but lost the race gets 409, and the first cancel stays", async () => {
    const slot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const booking = await insertBooking(slot.id, s1.id);
    const c1 = await as(s1);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let pending: Promise<request.Response> | undefined;
    let settledEarly = false;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${s1.id} FOR UPDATE`; // like a cancel in flight
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED", cancelledAt: bkk("2026-11-09T09:59:00"), cancelledById: s1.id },
      });
      pending = cancel(c1, booking.id).then((r) => r);
      pending.then(() => (settledEarly = true));
      await sleep(400);
    });
    expect(settledEarly).toBe(false); // the cancel waited for the student lock

    const res = await pending!;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("BOOKING_NOT_ACTIVE");
    expect((await row(booking.id)).cancelledAt).toEqual(bkk("2026-11-09T09:59:00")); // not overwritten
  });
});

describe("F-10 section 6: the database CHECK constraints", () => {
  it("rejects cancel fields that do not match the status, and a reason outside 1 to 500 characters", async () => {
    const slot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const base = { slotId: slot.id, studentId: s1.id, createdAt: bkk("2026-11-02T09:00:00") };
    const cancelled = { status: "CANCELLED" as const, cancelledAt: bkk(NOW), cancelledById: s1.id };

    await expect(prisma.booking.create({ data: { ...base, status: "CANCELLED" } })).rejects.toThrow(/Booking_cancel_fields_match_status/);
    await expect(prisma.booking.create({ data: { ...base, status: "CANCELLED", cancelledAt: bkk(NOW) } })).rejects.toThrow(/Booking_cancel_fields_match_status/);
    await expect(prisma.booking.create({ data: { ...base, status: "ACTIVE", cancelledAt: bkk(NOW) } })).rejects.toThrow(/Booking_cancel_fields_match_status/);
    await expect(prisma.booking.create({ data: { ...base, ...cancelled, cancelReason: "" } })).rejects.toThrow(/Booking_cancelReason_length/);
    await expect(prisma.booking.create({ data: { ...base, ...cancelled, cancelReason: "x".repeat(501) } })).rejects.toThrow(/Booking_cancelReason_length/);
    await expect(prisma.booking.create({ data: { ...base, ...cancelled, cancelReason: "x".repeat(500) } })).resolves.toMatchObject({ status: "CANCELLED" });
  });
});
