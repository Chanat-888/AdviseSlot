import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-08 View own bookings, test TEST-F08-01 (API part) from
// docs/sprints/sprint-1/F-08-view-own-bookings.md (v0.1, section 8). The unit part
// (bookingStatus) is in domain.rules.test.ts.
// Times are Asia/Bangkok, now = Mon 9 Nov 2026 10:00. Rows are inserted with Prisma.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let advisor: Fixture;
let advisorB: Fixture;
let s1: Fixture;
let s2: Fixture;

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: { advisorId, startAt, endAt: new Date(startAt.getTime() + HALF_HOUR), createdAt: bkk("2026-11-01T09:00:00"), isLate: false },
  });
}

async function insertBooking(slotId: number, studentId: number, status: "ACTIVE" | "CANCELLED" = "ACTIVE") {
  return prisma.booking.create({ data: { slotId, studentId, status, createdAt: bkk("2026-11-02T09:00:00") } });
}

const mine = (cookie: string) => request(app).get("/api/bookings/mine").set("Cookie", cookie);

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

describe("TEST-F08-01 (AC-F08-01): a student sees only their own bookings, Upcoming first", () => {
  it("step 1: S1 gets the Tue booking as Upcoming, then the ended Fri booking as Passed", async () => {
    const tue = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const fri = await insertSlot(advisorB.id, "2026-11-06T10:00:00"); // ended
    const other = await insertSlot(advisor.id, "2026-11-10T10:00:00");
    const past = await insertBooking(fri.id, s1.id); // inserted first, to check the order
    const upcoming = await insertBooking(tue.id, s1.id);
    await insertBooking(other.id, s2.id);

    const res = await mine(await loginCookie(s1.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: upcoming.id,
        status: "Upcoming",
        createdAt: iso("2026-11-02T09:00:00"),
        slot: { id: tue.id, startAt: iso("2026-11-10T09:00:00"), endAt: iso("2026-11-10T09:30:00") },
        advisor: { id: advisor.id, name: advisor.name },
      },
      {
        id: past.id,
        status: "Passed",
        createdAt: iso("2026-11-02T09:00:00"),
        slot: { id: fri.id, startAt: iso("2026-11-06T10:00:00"), endAt: iso("2026-11-06T10:30:00") },
        advisor: { id: advisorB.id, name: advisorB.name },
      },
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/@|email/i);
  });

  it("step 2: S2 gets only their own booking", async () => {
    const tue = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const other = await insertSlot(advisor.id, "2026-11-10T10:00:00");
    await insertBooking(tue.id, s1.id);
    const own = await insertBooking(other.id, s2.id);

    const res = await mine(await loginCookie(s2.email));
    expect(res.status).toBe(200);
    expect(res.body.map((b: { id: number }) => b.id)).toEqual([own.id]);
  });

  it("step 3: an advisor gets 403 FORBIDDEN_ROLE", async () => {
    const res = await mine(await loginCookie(advisor.email));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN_ROLE", message: "Only students have a booking list." } });
  });
});

describe("F-08 sections 2 and 3.3: order, boundaries and empty list", () => {
  it("Upcoming by startAt ascending, then Passed and Cancelled by startAt descending", async () => {
    const slots = await Promise.all([
      insertSlot(advisor.id, "2026-11-11T09:00:00"), // upcoming, later
      insertSlot(advisor.id, "2026-11-10T09:00:00"), // upcoming, sooner
      insertSlot(advisor.id, "2026-11-05T09:00:00"), // passed, older
      insertSlot(advisor.id, "2026-11-06T09:00:00"), // passed, newer
      insertSlot(advisor.id, "2026-11-12T09:00:00"), // cancelled, future
    ]);
    const ids: number[] = [];
    for (const slot of slots.slice(0, 4)) ids.push((await insertBooking(slot.id, s1.id)).id);
    const cancelled = await insertBooking(slots[4]!.id, s1.id, "CANCELLED");

    const res = await mine(await loginCookie(s1.email));
    expect(res.body.map((b: { id: number; status: string }) => [b.id, b.status])).toEqual([
      [ids[1], "Upcoming"],
      [ids[0], "Upcoming"],
      [cancelled.id, "Cancelled"],
      [ids[3], "Passed"],
      [ids[2], "Passed"],
    ]);
  });

  it("a booking whose slot ends at 10:30 is Upcoming at 10:29:59 and Passed at 10:30:00", async () => {
    const slot = await insertSlot(advisor.id, "2026-11-09T10:00:00");
    await insertBooking(slot.id, s1.id);

    at("2026-11-09T10:29:59");
    expect((await mine(await loginCookie(s1.email))).body[0].status).toBe("Upcoming");
    at("2026-11-09T10:30:00");
    expect((await mine(await loginCookie(s1.email))).body[0].status).toBe("Passed");
  });

  it("returns [] for a student with no bookings", async () => {
    const res = await mine(await loginCookie(s2.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/bookings/mine");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
