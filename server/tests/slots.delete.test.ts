import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-13 Delete slot, tests TEST-F13-01 to TEST-F13-07 from
// docs/sprints/sprint-2/F-13-delete-slot.md (v0.2, section 8). TEST-F13-08 is the E2E step.
// Times are Asia/Bangkok. Unless stated, now = Mon 9 Nov 2026 10:00. Slots and bookings are
// inserted with Prisma so their times can be set freely.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;
const NOW = "2026-11-09T10:00:00";

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;

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

const del = (cookie: string, id: number | string) => request(app).delete(`/api/slots/${id}`).set("Cookie", cookie);
const deletedAt = async (id: number) => (await prisma.slot.findUniqueOrThrow({ where: { id } })).deletedAt;

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // also empties Booking
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(bkk(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F13-01 (AC-F13-01): delete own unbooked future slot", () => {
  it("soft-deletes an Open and a Closed slot, and both leave F-05 and F-06", async () => {
    const open = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const closed = await insertSlot(advisor.id, "2026-11-09T11:00:00"); // deadline Sun 18:00 passed
    const a = await loginCookie(advisor.email);

    const mineBefore = await request(app).get("/api/slots/mine").set("Cookie", a);
    expect(mineBefore.body.map((s: { status: string }) => s.status)).toEqual(["Closed", "Open"]);

    for (const slot of [open, closed]) {
      const res = await del(a, slot.id);
      expect(res.status).toBe(204);
      expect(res.text).toBe("");
      expect(await deletedAt(slot.id)).toEqual(bkk(NOW));
    }
    expect(await prisma.slot.count()).toBe(2); // rows kept (soft delete)

    const mine = await request(app).get("/api/slots/mine").set("Cookie", a);
    expect(mine.status).toBe(200);
    expect(mine.body).toEqual([]);
    const bookable = await request(app).get("/api/slots/bookable").set("Cookie", await loginCookie(student.email));
    expect(bookable.status).toBe(200);
    expect(bookable.body).toEqual([]);
  });
});

describe("TEST-F13-02 (AC-F13-02): a slot with an ACTIVE booking cannot be deleted", () => {
  it("returns 409 SLOT_HAS_ACTIVE_BOOKING and changes nothing", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const booking = await insertBooking(slot.id, student.id);

    const res = await del(await loginCookie(advisor.email), slot.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: "SLOT_HAS_ACTIVE_BOOKING", message: "This slot has a booking. Cancel the booking first." },
    });
    expect(await deletedAt(slot.id)).toBeNull();
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("ACTIVE");
  });
});

describe("TEST-F13-03 (AC-F13-03): a cancelled booking does not block", () => {
  it("deletes a slot whose only booking is CANCELLED and leaves the booking row as it was", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const booking = await insertBooking(slot.id, student.id, "CANCELLED");
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

    const res = await del(await loginCookie(advisor.email), slot.id);
    expect(res.status).toBe(204);
    expect(await deletedAt(slot.id)).toEqual(bkk(NOW));
    expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toEqual(before);
  });
});

describe("TEST-F13-04 (AC-F13-04): a slot that has started cannot be deleted", () => {
  it("rejects a slot in progress and one starting now; accepts the next half hour", async () => {
    const inProgress = await insertSlot(advisor.id, "2026-11-09T09:30:00");
    const startsNow = await insertSlot(advisor.id, "2026-11-09T10:00:00");
    const next = await insertSlot(advisor.id, "2026-11-09T10:30:00");
    const a = await loginCookie(advisor.email);

    for (const slot of [inProgress, startsNow]) {
      const res = await del(a, slot.id);
      expect(res.status).toBe(422);
      expect(res.body).toEqual({ error: { code: "SLOT_ALREADY_STARTED", message: "This slot has already started." } });
      expect(await deletedAt(slot.id)).toBeNull();
    }
    expect((await del(a, next.id)).status).toBe(204);
  });
});

describe("TEST-F13-05 (AC-F13-05): only the slot's advisor can delete it", () => {
  it("gives 404 to another advisor, 403 to a student, 404 for deleted or unknown, 400 for a bad id", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const gone = await insertSlot(advisor.id, "2026-11-10T10:00:00", { deletedAt: bkk("2026-11-08T09:00:00") });
    const a = await loginCookie(advisor.email);
    const notFound = { error: { code: "NOT_FOUND", message: "Slot not found." } };

    const other = await del(await loginCookie(advisorB.email), slot.id);
    expect(other.status).toBe(404);
    expect(other.body).toEqual(notFound);

    const asStudent = await del(await loginCookie(student.email), slot.id);
    expect(asStudent.status).toBe(403);
    expect(asStudent.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only advisors can delete slots." } });

    for (const id of [gone.id, 999999]) {
      const res = await del(a, id);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(notFound);
    }
    expect(await deletedAt(gone.id)).toEqual(bkk("2026-11-08T09:00:00")); // not overwritten

    for (const id of ["abc", "0", "-1", "1.5"]) {
      const res = await del(a, id);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: "VALIDATION_ERROR", message: "The slot id must be a positive integer." },
      });
    }
    expect(await deletedAt(slot.id)).toBeNull();
  });
});

describe("TEST-F13-06 (AC-F13-06): a deleted slot cannot be booked and its time is free", () => {
  it("returns 404 to a booking and 201 to a new slot at the same time", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const a = await loginCookie(advisor.email);
    expect((await del(a, slot.id)).status).toBe(204);

    const book = await request(app)
      .post("/api/bookings")
      .set("Cookie", await loginCookie(student.email))
      .send({ slotId: slot.id });
    expect(book.status).toBe(404);
    expect(book.body.error.code).toBe("NOT_FOUND");
    expect(await prisma.booking.count()).toBe(0);

    const again = await request(app).post("/api/slots").set("Cookie", a).send({ startAt: iso("2026-11-10T09:00:00") });
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(slot.id);
  });
});

describe("TEST-F13-07 (AC-F13-07): delete and book of the same slot in parallel", () => {
  it("never leaves a deleted slot with an ACTIVE booking (10 rounds)", async () => {
    const a = await loginCookie(advisor.email);
    const s = await loginCookie(student.email);
    const outcomes: string[] = [];

    for (let i = 0; i < 10; i++) {
      await prisma.booking.deleteMany({ where: { studentId: student.id } }); // student starts free (BR-07)
      const start = new Date(bkk("2026-11-11T08:00:00").getTime() + i * HALF_HOUR);
      const slot = await prisma.slot.create({
        data: { advisorId: advisor.id, startAt: start, endAt: new Date(start.getTime() + HALF_HOUR), createdAt: bkk(NOW), isLate: false },
      });

      const [d, b] = await Promise.all([
        del(a, slot.id),
        request(app).post("/api/bookings").set("Cookie", s).send({ slotId: slot.id }),
      ]);
      const pair = `${d.status}/${b.status}`;
      outcomes.push(pair);
      expect(["204/404", "409/201"]).toContain(pair);

      const deleted = (await deletedAt(slot.id)) !== null;
      const active = await prisma.booking.count({ where: { slotId: slot.id, status: "ACTIVE" } });
      expect(active).toBe(deleted ? 0 : 1); // never deleted AND booked
    }
    console.log("TEST-F13-07 outcomes (delete/book):", outcomes.join(" "));
  });
});
