import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-07 Book slot, tests TEST-F07-01 to TEST-F07-07 (API part) from
// docs/sprints/sprint-1/F-07-book-slot.md (v0.2, section 8). The unit part of
// TEST-F07-04 and -05 is in domain.rules.test.ts.
// Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 2026 10:00. Slots and other rows are
// inserted with Prisma. Bookings are emptied before each test, so the shared students start free
// (BR-07), and cookies are created before the clock moves.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let advisor: Fixture;
let advisorB: Fixture;
let students: Fixture[]; // S1 is students[0], and so on

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string, isLate = false) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: {
      advisorId,
      startAt,
      endAt: new Date(startAt.getTime() + HALF_HOUR),
      createdAt: bkk("2026-11-01T09:00:00"),
      isLate,
    },
  });
}

async function insertBooking(slotId: number, studentId: number) {
  return prisma.booking.create({ data: { slotId, studentId, status: "ACTIVE", createdAt: bkk("2026-11-02T09:00:00") } });
}

const book = (cookie: string, body: unknown) =>
  request(app).post("/api/bookings").set("Cookie", cookie).send(body as object);

const activeCount = (slotId: number) => prisma.booking.count({ where: { slotId, status: "ACTIVE" } });

beforeAll(async () => {
  const base = await createUsers();
  advisor = base.advisor;
  advisorB = base.advisorB;
  students = [base.student, ...(await createStudents(11, "s"))];
}, 60_000);

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

describe("TEST-F07-01 (AC-F07-01): student books an open slot", () => {
  it("returns 201 with the booking as Upcoming and stores one ACTIVE row", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const [s1] = students;

    const res = await book(await loginCookie(s1.email), { slotId: slot.id });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      status: "Upcoming",
      createdAt: iso("2026-11-09T10:00:00"),
      slot: { id: slot.id, startAt: iso("2026-11-10T09:30:00"), endAt: iso("2026-11-10T10:00:00") },
      advisor: { id: advisor.id, name: advisor.name },
      student: { id: s1.id, name: s1.name },
    });
    expect(res.text).not.toMatch(/@|passwordHash/);

    const rows = await prisma.booking.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: res.body.id, slotId: slot.id, studentId: s1.id, status: "ACTIVE" });
  });

  it("makes the slot Booked for its advisor in F-05, with the student's id and name", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const [s1] = students;
    const created = await book(await loginCookie(s1.email), { slotId: slot.id });

    const mine = await request(app).get("/api/slots/mine").set("Cookie", await loginCookie(advisor.email));
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({
      status: "Booked",
      student: { id: s1.id, name: s1.name },
      bookingId: created.body.id,
    });
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).post("/api/bookings").send({ slotId: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("TEST-F07-02 (AC-F07-02): an already booked slot returns 409 SLOT_TAKEN", () => {
  it("keeps the first student's booking", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const [s1, s2] = students;
    await insertBooking(slot.id, s1.id);

    const res = await book(await loginCookie(s2.email), { slotId: slot.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: "SLOT_TAKEN", message: "This slot has just been booked by someone else." },
    });
    const rows = await prisma.booking.findMany({ where: { slotId: slot.id, status: "ACTIVE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe(s1.id);
  });
});

describe("TEST-F07-03 (AC-F07-03, NFR-04): 10 parallel requests for one slot", () => {
  it("gives exactly one 201 and nine 409 SLOT_TAKEN, no 500, and one ACTIVE row", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const ten = students.slice(0, 10);
    const cookies = await Promise.all(ten.map((s) => loginCookie(s.email)));

    const results = await Promise.all(cookies.map((c) => book(c, { slotId: slot.id })));
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe("SLOT_TAKEN");
    expect(await activeCount(slot.id)).toBe(1);
  }, 30_000);

  it("the partial unique index rejects a second ACTIVE row with Prisma code P2002 (the code the service maps)", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    await insertBooking(slot.id, students[0].id);
    await expect(insertBooking(slot.id, students[1].id)).rejects.toMatchObject({ code: "P2002" });
    // A CANCELLED row does not count against the index.
    await expect(
      prisma.booking.create({
        data: { slotId: slot.id, studentId: students[2].id, status: "CANCELLED", createdAt: bkk("2026-11-02T09:00:00") },
      }),
    ).resolves.toBeTruthy();
  });

  it("BR-07: two parallel requests by one student for two slots create exactly one booking", async () => {
    const a = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const b = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const cookie = await loginCookie(students[0].email);

    const results = await Promise.all([book(cookie, { slotId: a.id }), book(cookie, { slotId: b.id })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("ACTIVE_BOOKING_LIMIT");
    expect(await prisma.booking.count({ where: { studentId: students[0].id, status: "ACTIVE" } })).toBe(1);
  });
});

describe("TEST-F07-04 (AC-F07-04): deadline boundaries for morning and afternoon slots", () => {
  it("accepts Mon 17:59 and rejects Mon 18:00 (morning); accepts Tue 11:59 and rejects Tue 12:00 (afternoon)", async () => {
    const aMorning = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const bMorning = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    const aAfternoon = await insertSlot(advisor.id, "2026-11-10T14:00:00");
    const bAfternoon = await insertSlot(advisorB.id, "2026-11-10T14:00:00");
    const [s1, s2, s3, s4] = students;
    const [c1, c2, c3, c4] = await Promise.all([s1, s2, s3, s4].map((s) => loginCookie(s.email)));

    at("2026-11-09T17:59:00");
    expect((await book(c1, { slotId: aMorning.id })).status).toBe(201);

    at("2026-11-09T18:00:00");
    const late = await book(c2, { slotId: bMorning.id });
    expect(late.status).toBe(422);
    expect(late.body).toEqual({
      error: { code: "BOOKING_DEADLINE_PASSED", message: "Booking for this slot closed at 18:00 on 9 Nov." },
    });

    at("2026-11-10T11:59:00");
    expect((await book(c3, { slotId: aAfternoon.id })).status).toBe(201);

    at("2026-11-10T12:00:00");
    const late2 = await book(c4, { slotId: bAfternoon.id });
    expect(late2.status).toBe(422);
    expect(late2.body.error).toEqual({
      code: "BOOKING_DEADLINE_PASSED",
      message: "Booking for this slot closed at 12:00 on 10 Nov.",
    });

    expect(await activeCount(bMorning.id)).toBe(0);
    expect(await activeCount(bAfternoon.id)).toBe(0);
  });

  it("rejects a slot that has already started with BOOKING_DEADLINE_PASSED", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-09T09:00:00"); // started an hour ago
    const res = await book(await loginCookie(students[0].email), { slotId: slot.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BOOKING_DEADLINE_PASSED");
  });
});

describe("TEST-F07-05 (AC-F07-05): a late slot is bookable until 2 h before start", () => {
  it("accepts Wed 06:59 and rejects Wed 07:00", async () => {
    const a = await insertSlot(advisor.id, "2026-11-11T09:00:00", true);
    const b = await insertSlot(advisorB.id, "2026-11-11T09:00:00", true);
    const [c1, c2] = await Promise.all([students[0], students[1]].map((s) => loginCookie(s.email)));

    at("2026-11-11T06:59:00");
    expect((await book(c1, { slotId: a.id })).status).toBe(201);

    at("2026-11-11T07:00:00");
    const res = await book(c2, { slotId: b.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BOOKING_DEADLINE_PASSED");
    expect(res.body.error.message).toBe("Booking for this slot closed at 07:00 on 11 Nov.");
  });
});

describe("TEST-F07-06 (AC-F07-06, BR-07): one active booking per student", () => {
  it("rejects S1 (active booking on a future slot) and accepts S2 (only booking has ended)", async () => {
    const [s1, s2] = students;
    const future = await insertSlot(advisor.id, "2026-11-10T10:00:00");
    const ended = await insertSlot(advisor.id, "2026-11-06T10:00:00");
    await insertBooking(future.id, s1.id);
    await insertBooking(ended.id, s2.id);
    const open1 = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    const open2 = await insertSlot(advisorB.id, "2026-11-10T09:30:00");

    const r1 = await book(await loginCookie(s1.email), { slotId: open1.id });
    expect(r1.status).toBe(409);
    expect(r1.body).toEqual({
      error: { code: "ACTIVE_BOOKING_LIMIT", message: "You already have an upcoming booking." },
    });
    expect(await prisma.booking.count({ where: { studentId: s1.id } })).toBe(1);

    const r2 = await book(await loginCookie(s2.email), { slotId: open2.id });
    expect(r2.status).toBe(201);
    expect(await prisma.booking.count({ where: { studentId: s2.id, status: "ACTIVE" } })).toBe(2);
  });

  it("a CANCELLED booking on a future slot does not count", async () => {
    const [s1] = students;
    const future = await insertSlot(advisor.id, "2026-11-10T10:00:00");
    await prisma.booking.create({
      data: { slotId: future.id, studentId: s1.id, status: "CANCELLED", createdAt: bkk("2026-11-02T09:00:00") },
    });
    const open = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    const res = await book(await loginCookie(s1.email), { slotId: open.id });
    expect(res.status).toBe(201);
  });
});

describe("TEST-F07-07 (AC-F07-07): role and identity come from the session", () => {
  it("gives an advisor 403 FORBIDDEN_ROLE and creates no row", async () => {
    const slot = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    const res = await book(await loginCookie(advisor.email), { slotId: slot.id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only students can book slots." } });
    expect(await prisma.booking.count()).toBe(0);
  });

  it("ignores a studentId in the body: S1 sending S2's id books for S1", async () => {
    const [s1, s2] = students;
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const res = await book(await loginCookie(s1.email), { slotId: slot.id, studentId: s2.id });
    expect(res.status).toBe(201);
    expect(res.body.student.id).toBe(s1.id);
    const rows = await prisma.booking.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe(s1.id);
  });
});

describe("F-07 section 3.1 and 3.2: validation and check order", () => {
  it.each([
    ["no slotId", {}],
    ["a string slotId", { slotId: "8" }],
    ["a fractional slotId", { slotId: 1.5 }],
    ["zero", { slotId: 0 }],
    ["a negative slotId", { slotId: -3 }],
    ["an array body", [1]],
    ["null", null],
  ])("returns 400 VALIDATION_ERROR for %s", async (_name, body) => {
    const res = await book(await loginCookie(students[0].email), body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: "A slot is required." } });
    expect(await prisma.booking.count()).toBe(0);
  });

  it("returns 404 NOT_FOUND for an unknown slot and for a deleted slot", async () => {
    const gone = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    await prisma.slot.update({ where: { id: gone.id }, data: { deletedAt: bkk("2026-11-09T09:00:00") } });
    const cookie = await loginCookie(students[0].email);

    for (const slotId of [99999, gone.id]) {
      const res = await book(cookie, { slotId });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "This slot does not exist." } });
    }
  });

  it("check 2 before check 3: a booked slot past its deadline answers SLOT_TAKEN", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    await insertBooking(slot.id, students[0].id);
    const cookie = await loginCookie(students[1].email);
    at("2026-11-09T19:00:00");
    const res = await book(cookie, { slotId: slot.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLOT_TAKEN");
  });

  it("check 3 before check 4: a student at the limit booking a closed slot gets the deadline error", async () => {
    const [s1] = students;
    const held = await insertSlot(advisor.id, "2026-11-12T10:00:00");
    await insertBooking(held.id, s1.id);
    const closed = await insertSlot(advisorB.id, "2026-11-10T09:00:00");
    const cookie = await loginCookie(s1.email);
    at("2026-11-09T19:00:00");
    const res = await book(cookie, { slotId: closed.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BOOKING_DEADLINE_PASSED");
  });
});
