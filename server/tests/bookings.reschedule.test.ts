import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, PASSWORD, resetUsers, type Fixture } from "./helpers.js";

// F-14 Reschedule booking, tests TEST-F14-01 to TEST-F14-08 from
// docs/sprints/sprint-2/F-14-reschedule.md (v0.3, section 8), plus the section 3.1 input checks.
// Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 2026 10:00. Slots and bookings are
// inserted with Prisma so their times can be set freely. Every rejected case also asserts that
// nothing changed: the Booking table is the same before and after (BR-15, all-or-nothing).

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;
const NOW = "2026-11-09T10:00:00";

let a: Fixture; // advisor A
let b: Fixture; // advisor B
let c: Fixture; // advisor C (TEST-F14-02)
let s1: Fixture;
let s2: Fixture;
let s3: Fixture;
let s4: Fixture;

const at = (local: string) => vi.setSystemTime(bkk(local));

async function insertSlot(advisorId: number, local: string, isLate = false) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: { advisorId, startAt, endAt: new Date(startAt.getTime() + HALF_HOUR), createdAt: bkk("2026-11-01T09:00:00"), isLate },
  });
}

async function insertBooking(slotId: number, studentId: number, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  const cancel = status === "CANCELLED" ? { cancelledAt: bkk("2026-11-03T09:00:00"), cancelledById: studentId } : {};
  return prisma.booking.create({ data: { slotId, studentId, status, createdAt: bkk("2026-11-02T09:00:00"), ...cancel } });
}

/** Logs in at the current fake time, so the 2-hour session is valid at that time. */
const as = (u: Fixture) => loginCookie(u.email);
const reschedule = (cookie: string, id: number | string, body: unknown) =>
  request(app).post(`/api/bookings/${id}/reschedule`).set("Cookie", cookie).send(body as object);
const row = (id: number) => prisma.booking.findUniqueOrThrow({ where: { id } });
const allBookings = () => prisma.booking.findMany({ orderBy: { id: "asc" } });
const activeOn = (slotId: number) => prisma.booking.findMany({ where: { slotId, status: "ACTIVE" } });
const bookableIds = async (cookie: string) =>
  (await request(app).get("/api/slots/bookable").set("Cookie", cookie)).body.map((s: { id: number }) => s.id);

const err = (code: string, message: string) => ({ error: { code, message } });

beforeAll(async () => {
  const base = await createUsers();
  a = base.advisor;
  b = base.advisorB;
  s1 = base.student;
  [s2, s3, s4] = await createStudents(3, "s");
  const u = await prisma.user.create({
    data: { name: "Dr. Advisor Three", email: "advisor3@example.test", passwordHash: await bcrypt.hash(PASSWORD, 12), role: "ADVISOR" },
  });
  c = { id: u.id, name: u.name, email: u.email, role: "ADVISOR" };
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

describe("TEST-F14-01 (AC-F14-01): a student moves an Upcoming booking to another bookable slot", () => {
  it("returns 201 with the new booking and previousBookingId, cancels the old one, and frees the old slot", async () => {
    const oldSlot = await insertSlot(a.id, "2026-11-12T10:00:00"); // A Thu 12 Nov 10:00
    const newSlot = await insertSlot(b.id, "2026-11-12T14:00:00"); // B Thu 12 Nov 14:00
    const old = await insertBooking(oldSlot.id, s1.id);
    const c1 = await as(s1);

    const res = await reschedule(c1, old.id, { newSlotId: newSlot.id });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      status: "Upcoming",
      createdAt: iso(NOW),
      slot: { id: newSlot.id, startAt: iso("2026-11-12T14:00:00"), endAt: iso("2026-11-12T14:30:00") },
      advisor: { id: b.id, name: b.name },
      student: { id: s1.id, name: s1.name },
      previousBookingId: old.id,
    });
    expect(res.body.id).not.toBe(old.id);

    const stored = await row(old.id);
    expect(stored.status).toBe("CANCELLED");
    expect(stored.cancelledAt).toEqual(bkk(NOW));
    expect(stored.cancelledById).toBe(s1.id);
    expect(stored.cancelReason).toBeNull();

    const created = await row(res.body.id);
    expect(created).toMatchObject({ slotId: newSlot.id, studentId: s1.id, status: "ACTIVE", createdAt: bkk(NOW) });

    // F-09 shows the old booking as cancelled by the student (F-18 relies on this).
    const detail = await request(app).get(`/api/bookings/${old.id}`).set("Cookie", c1);
    expect(detail.body.status).toBe("Cancelled");
    expect(detail.body.cancellation).toEqual({
      cancelledAt: iso(NOW),
      cancelledBy: { id: s1.id, name: s1.name, role: "STUDENT" },
      reason: null,
    });

    // BR-13: the old slot is bookable again (before its deadline); the new one is not.
    const list = await bookableIds(await as(s2));
    expect(list).toContain(oldSlot.id);
    expect(list).not.toContain(newSlot.id);
  });
});

describe("TEST-F14-02 (AC-F14-02): BR-11 on the old booking, 12 h boundary in Asia/Bangkok time", () => {
  it("allows a reschedule at Tue 22:00 (exactly 12 h) and refuses one at Tue 22:01 with nothing changed", async () => {
    const oldA = await insertSlot(a.id, "2026-11-11T10:00:00"); // A Wed 11 Nov 10:00
    const oldB = await insertSlot(b.id, "2026-11-11T10:00:00"); // B Wed 11 Nov 10:00
    const c1st = await insertSlot(c.id, "2026-11-12T10:00:00"); // C Thu 10:00
    const c2nd = await insertSlot(c.id, "2026-11-12T11:00:00"); // C Thu 11:00
    const bk1 = await insertBooking(oldA.id, s1.id);
    const bk2 = await insertBooking(oldB.id, s2.id);

    at("2026-11-10T22:00:00");
    const ok = await reschedule(await as(s1), bk1.id, { newSlotId: c1st.id });
    expect(ok.status).toBe(201);
    expect(ok.body.previousBookingId).toBe(bk1.id);
    expect((await row(bk1.id)).status).toBe("CANCELLED");

    at("2026-11-10T22:01:00");
    const c2 = await as(s2);
    const before = await allBookings();
    const late = await reschedule(c2, bk2.id, { newSlotId: c2nd.id });
    expect(late.status).toBe(422);
    expect(late.body).toEqual(err("CANCEL_WINDOW_PASSED", "You can cancel only until 12 hours before the start (22:00 on 10 Nov)."));
    expect(await allBookings()).toEqual(before);
    expect((await row(bk2.id)).status).toBe("ACTIVE");
    expect(await activeOn(c2nd.id)).toHaveLength(0); // C's second slot still Open
    expect(await bookableIds(c2)).toContain(c2nd.id);
  });
});

describe("TEST-F14-03 (AC-F14-03): BR-06 / BR-16 deadline of the new slot", () => {
  it("gives 201, 422, 201, 422 at the normal and late boundaries and leaves rejected bookings ACTIVE", async () => {
    const olds = [
      await insertSlot(a.id, "2026-11-12T10:00:00"),
      await insertSlot(b.id, "2026-11-12T10:00:00"),
      await insertSlot(a.id, "2026-11-12T11:00:00"),
      await insertSlot(b.id, "2026-11-12T11:00:00"),
    ];
    const students = [s1, s2, s3, s4];
    const bks = await Promise.all(olds.map((s, i) => insertBooking(s.id, students[i]!.id)));
    const aTue = await insertSlot(a.id, "2026-11-10T09:00:00"); // deadline Mon 18:00
    const bTue = await insertSlot(b.id, "2026-11-10T09:00:00");
    const aLate = await insertSlot(a.id, "2026-11-11T09:00:00", true); // late, deadline Wed 07:00
    const bLate = await insertSlot(b.id, "2026-11-11T09:00:00", true);

    at("2026-11-09T17:59:00");
    expect((await reschedule(await as(s1), bks[0]!.id, { newSlotId: aTue.id })).status).toBe(201);

    at("2026-11-09T18:00:00");
    let cookie = await as(s2);
    let before = await allBookings();
    let res = await reschedule(cookie, bks[1]!.id, { newSlotId: bTue.id });
    expect(res.status).toBe(422);
    expect(res.body).toEqual(err("BOOKING_DEADLINE_PASSED", "Booking for this slot closed at 18:00 on 9 Nov."));
    expect(await allBookings()).toEqual(before);

    at("2026-11-11T06:59:00");
    expect((await reschedule(await as(s3), bks[2]!.id, { newSlotId: aLate.id })).status).toBe(201);

    at("2026-11-11T07:00:00");
    cookie = await as(s4);
    before = await allBookings();
    res = await reschedule(cookie, bks[3]!.id, { newSlotId: bLate.id });
    expect(res.status).toBe(422);
    expect(res.body).toEqual(err("BOOKING_DEADLINE_PASSED", "Booking for this slot closed at 07:00 on 11 Nov."));
    expect(await allBookings()).toEqual(before);

    expect((await row(bks[0]!.id)).status).toBe("CANCELLED");
    expect((await row(bks[1]!.id)).status).toBe("ACTIVE");
    expect((await row(bks[2]!.id)).status).toBe("CANCELLED");
    expect((await row(bks[3]!.id)).status).toBe("ACTIVE");
  });
});

describe("TEST-F14-04 (AC-F14-04): a taken new slot is refused and the old booking stays", () => {
  it("returns 409 SLOT_TAKEN, S1's old booking ACTIVE, and the slot still S2's", async () => {
    const oldSlot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const taken = await insertSlot(b.id, "2026-11-12T14:00:00");
    const old = await insertBooking(oldSlot.id, s1.id);
    const theirs = await insertBooking(taken.id, s2.id);
    const c1 = await as(s1);
    const before = await allBookings();

    const res = await reschedule(c1, old.id, { newSlotId: taken.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(err("SLOT_TAKEN", "This slot has just been booked by someone else."));
    expect(await allBookings()).toEqual(before);
    expect((await activeOn(taken.id)).map((x) => x.id)).toEqual([theirs.id]);
  });
});

describe("TEST-F14-05 (AC-F14-05): BR-07 is checked with the old booking released (BR-15)", () => {
  it("lets S1 move to another slot of the same advisor, and refuses S2 whose other booking is with the new slot's advisor", async () => {
    const s1Old = await insertSlot(a.id, "2026-11-12T10:00:00"); // A Thu 10:00
    const s2Old = await insertSlot(a.id, "2026-11-12T11:00:00"); // A Thu 11:00
    const s2Other = await insertSlot(b.id, "2026-11-12T14:00:00"); // B Thu 14:00
    const aFri = await insertSlot(a.id, "2026-11-13T10:00:00");
    const bFri = await insertSlot(b.id, "2026-11-13T14:00:00");
    const bk1 = await insertBooking(s1Old.id, s1.id);
    const bk2 = await insertBooking(s2Old.id, s2.id);
    await insertBooking(s2Other.id, s2.id);

    const ok = await reschedule(await as(s1), bk1.id, { newSlotId: aFri.id });
    expect(ok.status).toBe(201);
    const s1Active = await prisma.booking.findMany({ where: { studentId: s1.id, status: "ACTIVE" } });
    expect(s1Active.map((x) => x.slotId)).toEqual([aFri.id]);

    const c2 = await as(s2);
    const before = await allBookings();
    const res = await reschedule(c2, bk2.id, { newSlotId: bFri.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(err("SAME_ADVISOR_BOOKING", "You already have an upcoming booking with this advisor."));
    expect(await allBookings()).toEqual(before);
    expect((await row(bk2.id)).status).toBe("ACTIVE");
    const mine = await request(app).get("/api/slots/mine").set("Cookie", await as(b));
    expect(mine.body.find((s: { id: number }) => s.id === bFri.id).status).toBe("Open");
  });
});

describe("TEST-F14-06 (AC-F14-06): all-or-nothing when a reschedule and a booking race for one slot", () => {
  it("gives exactly one 201 and one 409 SLOT_TAKEN in each of 20 rounds, and a losing S1 keeps the old booking", async () => {
    const c1 = await as(s1);
    const c2 = await as(s2);
    for (let i = 0; i < 20; i++) {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // fresh data each round
      const oldSlot = await insertSlot(a.id, "2026-11-12T10:00:00");
      const x = await insertSlot(b.id, "2026-11-12T14:00:00");
      const old = await insertBooking(oldSlot.id, s1.id);

      const [r1, r2] = await Promise.all([
        reschedule(c1, old.id, { newSlotId: x.id }),
        request(app).post("/api/bookings").set("Cookie", c2).send({ slotId: x.id }),
      ]);
      expect([r1.status, r2.status].sort(), `round ${i}`).toEqual([201, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(loser.body.error.code, `round ${i}`).toBe("SLOT_TAKEN");
      expect(await activeOn(x.id), `round ${i}`).toHaveLength(1);
      if (r1.status === 409) {
        expect((await row(old.id)).status, `round ${i}`).toBe("ACTIVE");
        expect(await prisma.booking.count({ where: { studentId: s1.id } }), `round ${i}`).toBe(1);
      } else {
        expect((await row(old.id)).status, `round ${i}`).toBe("CANCELLED");
      }
    }
  }, 60_000);
});

describe("TEST-F14-07 (AC-F14-07): ownership, role, state and input", () => {
  it("gives 404, 403, 409, 409 and 400 and changes no row", async () => {
    const activeSlot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const cancelledSlot = await insertSlot(a.id, "2026-11-12T11:00:00");
    const endedSlot = await insertSlot(b.id, "2026-11-06T10:00:00"); // Fri 6 Nov, ended
    const target = await insertSlot(c.id, "2026-11-13T10:00:00");
    const active = await insertBooking(activeSlot.id, s1.id);
    const cancelled = await insertBooking(cancelledSlot.id, s1.id, "CANCELLED");
    const passed = await insertBooking(endedSlot.id, s1.id);
    const before = await allBookings();

    const c2 = await as(s2);
    const other = await reschedule(c2, active.id, { newSlotId: target.id });
    const unknown = await reschedule(c2, 999999, { newSlotId: target.id });
    expect(other.status).toBe(404);
    expect(other.body).toEqual(err("NOT_FOUND", "Booking not found."));
    expect(unknown.body).toEqual(other.body);

    const advisor = await reschedule(await as(a), active.id, { newSlotId: target.id });
    expect(advisor.status).toBe(403);
    expect(advisor.body).toEqual(err("FORBIDDEN_ROLE", "Only students can reschedule bookings."));

    const c1 = await as(s1);
    for (const id of [cancelled.id, passed.id]) {
      const res = await reschedule(c1, id, { newSlotId: target.id });
      expect(res.status).toBe(409);
      expect(res.body).toEqual(err("BOOKING_NOT_ACTIVE", "This booking is no longer upcoming."));
    }

    const same = await reschedule(c1, active.id, { newSlotId: activeSlot.id });
    expect(same.status).toBe(400);
    expect(same.body).toEqual(err("VALIDATION_ERROR", "Choose a different slot."));

    expect(await allBookings()).toEqual(before);
  });

  it("returns 404 'This slot does not exist.' for an unknown or deleted new slot, with nothing changed", async () => {
    const oldSlot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const deleted = await insertSlot(b.id, "2026-11-12T14:00:00");
    await prisma.slot.update({ where: { id: deleted.id }, data: { deletedAt: bkk("2026-11-08T09:00:00") } });
    const old = await insertBooking(oldSlot.id, s1.id);
    const c1 = await as(s1);
    const before = await allBookings();

    for (const newSlotId of [999999, deleted.id]) {
      const res = await reschedule(c1, old.id, { newSlotId });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(err("NOT_FOUND", "This slot does not exist."));
    }
    expect(await allBookings()).toEqual(before);
  });
});

describe("F-14 section 3.1: input validation, before any database read", () => {
  it.each(["abc", "0", "-1", "1.5"])("returns 400 for booking id %s", async (id) => {
    const res = await reschedule(await as(s1), id, { newSlotId: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(err("VALIDATION_ERROR", "The booking id must be a positive whole number."));
  });

  it.each([
    ["missing", {}],
    ["a string", { newSlotId: "5" }],
    ["zero", { newSlotId: 0 }],
    ["negative", { newSlotId: -3 }],
    ["a fraction", { newSlotId: 1.5 }],
    ["null", { newSlotId: null }],
  ])("returns 400 'A new slot is required.' when newSlotId is %s", async (_label, body) => {
    const slot = await insertSlot(a.id, "2026-11-12T10:00:00");
    const old = await insertBooking(slot.id, s1.id);
    const res = await reschedule(await as(s1), old.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(err("VALIDATION_ERROR", "A new slot is required."));
    expect((await row(old.id)).status).toBe("ACTIVE");
  });
});

describe("TEST-F14-08 (AC-F14-06, BR-14): a reschedule into a slot races its advisor's delete", () => {
  it("gives (201, 409 SLOT_HAS_ACTIVE_BOOKING) or (404, 204) in each of 10 rounds, never a deleted slot with a booking", async () => {
    const c1 = await as(s1);
    const cb = await as(b);
    for (let i = 0; i < 10; i++) {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE');
      const oldSlot = await insertSlot(a.id, "2026-11-12T10:00:00");
      const x = await insertSlot(b.id, "2026-11-12T14:00:00");
      const old = await insertBooking(oldSlot.id, s1.id);

      const [r, d] = await Promise.all([
        reschedule(c1, old.id, { newSlotId: x.id }),
        request(app).delete(`/api/slots/${x.id}`).set("Cookie", cb),
      ]);
      const pair = `${r.status}/${d.status}`;
      expect(["201/409", "404/204"], `round ${i}`).toContain(pair);
      const slot = await prisma.slot.findUniqueOrThrow({ where: { id: x.id } });
      if (pair === "201/409") {
        expect(d.body.error.code, `round ${i}`).toBe("SLOT_HAS_ACTIVE_BOOKING");
        expect(slot.deletedAt, `round ${i}`).toBeNull();
        expect(await activeOn(x.id), `round ${i}`).toHaveLength(1);
      } else {
        expect(r.body, `round ${i}`).toEqual(err("NOT_FOUND", "This slot does not exist."));
        expect(slot.deletedAt, `round ${i}`).not.toBeNull();
        expect(await activeOn(x.id), `round ${i}`).toHaveLength(0);
        expect((await row(old.id)).status, `round ${i}`).toBe("ACTIVE");
      }
    }
  }, 60_000);
});
