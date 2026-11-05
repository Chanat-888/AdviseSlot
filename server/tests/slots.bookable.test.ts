import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-06 View bookable slots, tests TEST-F06-01 to TEST-F06-04 from
// docs/sprints/sprint-1/F-06-view-bookable-slots.md (v0.1, section 8).
// Times are Asia/Bangkok. Rows are inserted with Prisma; the clock is a fake Date.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let student: Fixture;
let advisor: Fixture;
let advisorB: Fixture;
let student2: Fixture;

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

const bookable = (cookie: string) => request(app).get("/api/slots/bookable").set("Cookie", cookie);

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
  [student2] = await createStudents(1, "other");
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

describe("TEST-F06-01 (AC-F06-01): student sees open slots of all advisors", () => {
  it("lists both advisors' slots sorted by startAt with advisor name and deadline", async () => {
    const a = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    const b = await insertSlot(advisorB.id, "2026-11-10T09:00:00");

    const res = await bookable(await loginCookie(student.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: b.id,
        startAt: iso("2026-11-10T09:00:00"),
        endAt: iso("2026-11-10T09:30:00"),
        isLate: false,
        bookingDeadline: iso("2026-11-09T18:00:00"),
        advisor: { id: advisorB.id, name: advisorB.name },
      },
      {
        id: a.id,
        startAt: iso("2026-11-10T09:30:00"),
        endAt: iso("2026-11-10T10:00:00"),
        isLate: false,
        bookingDeadline: iso("2026-11-09T18:00:00"),
        advisor: { id: advisor.id, name: advisor.name },
      },
    ]);
  });

  it("returns 200 with [] when nothing is bookable", async () => {
    const res = await bookable(await loginCookie(student.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("does not list a deleted slot", async () => {
    const s = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    await prisma.slot.update({ where: { id: s.id }, data: { deletedAt: bkk("2026-11-09T09:00:00") } });
    const res = await bookable(await loginCookie(student.email));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get("/api/slots/bookable");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("TEST-F06-02 (AC-F06-02): booked, ended and past-deadline slots are excluded", () => {
  async function setup() {
    const morning = await insertSlot(advisor.id, "2026-11-10T09:00:00"); // Open
    const booked = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    await insertBooking(booked.id, student2.id);
    const ended = await insertSlot(advisor.id, "2026-11-06T10:00:00"); // Fri 6 Nov
    const afternoon = await insertSlot(advisor.id, "2026-11-10T14:00:00");
    const late = await insertSlot(advisor.id, "2026-11-11T09:00:00", true); // created Tue 19:00
    return { morning, booked, ended, afternoon, late };
  }

  // Sessions last 2 hours (D-21), so log in at the test time.
  async function listedAt(local: string): Promise<number[]> {
    at(local);
    const res = await bookable(await loginCookie(student.email));
    expect(res.status).toBe(200);
    return res.body.map((s: { id: number }) => s.id);
  }

  it("applies the deadline boundaries to the morning, afternoon and late slots", async () => {
    const { morning, booked, ended, afternoon, late } = await setup();
    const checks: [string, number[], number[]][] = [
      ["2026-11-09T17:59:59", [morning.id], []],
      ["2026-11-09T18:00:00", [], [morning.id]],
      ["2026-11-10T11:59:59", [afternoon.id], []],
      ["2026-11-10T12:00:00", [], [afternoon.id]],
      ["2026-11-11T06:59:59", [late.id], []],
      ["2026-11-11T07:00:00", [], [late.id]],
    ];
    for (const [when, listed, notListed] of checks) {
      const ids = await listedAt(when);
      for (const id of listed) expect(ids, `${when} lists ${id}`).toContain(id);
      for (const id of notListed) expect(ids, `${when} hides ${id}`).not.toContain(id);
      // The booked and the ended slot are never listed.
      expect(ids).not.toContain(booked.id);
      expect(ids).not.toContain(ended.id);
    }
  });

  it("lists a slot again when its only booking is CANCELLED", async () => {
    const s = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    await prisma.booking.create({
      data: { slotId: s.id, studentId: student2.id, status: "CANCELLED", createdAt: bkk("2026-11-02T09:00:00") },
    });
    const res = await bookable(await loginCookie(student.email));
    expect(res.body.map((x: { id: number }) => x.id)).toEqual([s.id]);
  });
});

describe("TEST-F06-03 (AC-F06-03): no booker identity in the response", () => {
  it("lists only the Open slot and leaks neither student fields nor the booker's name or email", async () => {
    const open = await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const taken = await insertSlot(advisor.id, "2026-11-10T09:30:00");
    await insertBooking(taken.id, student2.id);

    const res = await bookable(await loginCookie(student.email));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(open.id);
    for (const item of res.body) {
      for (const key of ["student", "studentId", "bookingId", "status"]) expect(item).not.toHaveProperty(key);
    }
    expect(res.text).not.toContain(student2.name);
    expect(res.text).not.toContain(student2.email);
    expect(res.text).not.toContain(advisor.email);
  });
});

describe("TEST-F06-04 (AC-F06-04): advisors cannot list bookable slots", () => {
  it("returns 403 FORBIDDEN_ROLE with the error shape only", async () => {
    await insertSlot(advisor.id, "2026-11-10T09:00:00");
    const res = await bookable(await loginCookie(advisor.email));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "FORBIDDEN_ROLE", message: "Only students can view bookable slots." },
    });
  });
});
