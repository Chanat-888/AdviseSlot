import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-05 View own slots, tests TEST-F05-01 to TEST-F05-03 (API part) from
// docs/sprints/sprint-1/F-05-view-own-slots.md (v0.1, section 8).
// The unit part of TEST-F05-03 is in domain.rules.test.ts.
//
// The Booked item of TEST-F05-01 was a todo until the Booking model arrived with F-07 (Issue #11).

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;

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

const mine = (cookie: string) => request(app).get("/api/slots/mine").set("Cookie", cookie);

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

describe("TEST-F05-01 (AC-F05-01): advisor sees only their own slots with status", () => {
  it("lists A's slots sorted by startAt with Passed, Closed and Open, and never B's slot", async () => {
    // Inserted out of order to check the sort.
    await insertSlot(advisor.id, "2026-11-10T09:30:00"); // Open
    await insertSlot(advisor.id, "2026-11-06T10:00:00"); // Passed (Fri 6 Nov)
    await insertSlot(advisor.id, "2026-11-09T11:00:00"); // Closed (deadline was Sun 18:00)
    const other = await insertSlot(advisorB.id, "2026-11-10T09:00:00");

    const res = await mine(await loginCookie(advisor.email));
    expect(res.status).toBe(200);
    expect(res.body.map((s: { startAt: string }) => s.startAt)).toEqual([
      iso("2026-11-06T10:00:00"),
      iso("2026-11-09T11:00:00"),
      iso("2026-11-10T09:30:00"),
    ]);
    expect(res.body.map((s: { status: string }) => s.status)).toEqual(["Passed", "Closed", "Open"]);
    expect(res.body[2]).toEqual({
      id: expect.any(Number),
      startAt: iso("2026-11-10T09:30:00"),
      endAt: iso("2026-11-10T10:00:00"),
      isLate: false,
      bookingDeadline: iso("2026-11-09T18:00:00"),
      status: "Open",
      student: null,
      bookingId: null,
    });
    for (const s of res.body) {
      expect(s.student).toBeNull();
      expect(s.bookingId).toBeNull();
    }
    expect(res.body.some((s: { id: number }) => s.id === other.id)).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/@|email/i);
  });

  it("returns [] for an advisor with no slots", async () => {
    const res = await mine(await loginCookie(advisorB.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("shows a Booked slot with student { id, name } and bookingId, and ignores a CANCELLED booking", async () => {
    const booked = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const cancelled = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const booking = await prisma.booking.create({
      data: { slotId: booked.id, studentId: student.id, status: "ACTIVE", createdAt: bkk("2026-11-02T09:00:00") },
    });
    await prisma.booking.create({
      data: { slotId: cancelled.id, studentId: student.id, status: "CANCELLED", createdAt: bkk("2026-11-02T09:00:00") },
    });

    const res = await mine(await loginCookie(advisor.email));
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      id: booked.id,
      status: "Booked",
      student: { id: student.id, name: student.name },
      bookingId: booking.id,
    });
    expect(res.body[1]).toMatchObject({ id: cancelled.id, status: "Open", student: null, bookingId: null });
    expect(JSON.stringify(res.body)).not.toMatch(/@|email/i);
  });
});

describe("TEST-F05-02 (AC-F05-02): students cannot list advisor slots", () => {
  it("returns 403 FORBIDDEN_ROLE with the error shape only", async () => {
    await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const res = await mine(await loginCookie(student.email));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "FORBIDDEN_ROLE", message: "Only advisors can view their schedule." },
    });
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/slots/mine");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("TEST-F05-03 (AC-F05-03): Closed once the booking deadline has passed", () => {
  it("an unbooked Tue 09:00 slot is Open at Mon 17:59:59 and Closed at Mon 18:00:00", async () => {
    await insertSlot(advisor.id, "2026-11-10T09:00:00");
    at("2026-11-09T17:59:59");
    const cookie = await loginCookie(advisor.email);
    expect((await mine(cookie)).body[0].status).toBe("Open");

    at("2026-11-09T18:00:00");
    expect((await mine(cookie)).body[0].status).toBe("Closed");
  });
});
