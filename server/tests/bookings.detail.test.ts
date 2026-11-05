import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-09 Booking detail, tests TEST-F09-01 to TEST-F09-03 from
// docs/sprints/sprint-1/F-09-booking-detail.md (v0.1, section 8).
// Setup (section 8): now = Mon 9 Nov 2026 10:00 Asia/Bangkok. Advisor A owns slot X
// (Tue 10 Nov 09:00); student S1 has ACTIVE booking B on X. Advisor A2 and student S2 also exist.

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();
const HALF_HOUR = 30 * 60 * 1000;

let a: Fixture;
let a2: Fixture;
let s1: Fixture;
let s2: Fixture;
let slotId: number;
let bookingId: number;
const cookies: Record<string, string> = {};

const detail = (cookie: string, id: number | string) => request(app).get(`/api/bookings/${id}`).set("Cookie", cookie);

beforeAll(async () => {
  const base = await createUsers();
  a = base.advisor;
  a2 = base.advisorB;
  s1 = base.student;
  [s2] = await createStudents(1, "s");
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE'); // cascades to Booking
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(bkk("2026-11-09T10:00:00"));
  const startAt = bkk("2026-11-10T09:00:00");
  const slot = await prisma.slot.create({
    data: { advisorId: a.id, startAt, endAt: new Date(startAt.getTime() + HALF_HOUR), createdAt: bkk("2026-11-01T09:00:00"), isLate: false },
  });
  const booking = await prisma.booking.create({
    data: { slotId: slot.id, studentId: s1.id, status: "ACTIVE", createdAt: bkk("2026-11-02T09:00:00") },
  });
  slotId = slot.id;
  bookingId = booking.id;
  for (const u of [a, a2, s1, s2]) cookies[u.email] = await loginCookie(u.email);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

const expected = () => ({
  id: bookingId,
  status: "Upcoming",
  createdAt: iso("2026-11-02T09:00:00"),
  slot: { id: slotId, startAt: iso("2026-11-10T09:00:00"), endAt: iso("2026-11-10T09:30:00") },
  advisor: { id: a.id, name: a.name },
  student: { id: s1.id, name: s1.name },
});

describe("TEST-F09-01 (AC-F09-01): the booking's student opens the detail", () => {
  it("returns 200 with exactly the section 4.2 body", async () => {
    const res = await detail(cookies[s1.email]!, bookingId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expected());
    expect(JSON.stringify(res.body)).not.toMatch(/@|email/i);
  });
});

describe("TEST-F09-02 (AC-F09-02): the slot's advisor opens the detail", () => {
  it("returns 200 and the same body as the student gets", async () => {
    const asStudent = await detail(cookies[s1.email]!, bookingId);
    const res = await detail(cookies[a.email]!, bookingId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(asStudent.body);
  });
});

describe("TEST-F09-03 (AC-F09-03): anyone else gets the same 404 as a missing booking", () => {
  it("another student, another advisor and a non-existent id get identical 404 bodies", async () => {
    const other = await detail(cookies[s2.email]!, bookingId);
    const otherAdvisor = await detail(cookies[a2.email]!, bookingId);
    const missing = await detail(cookies[s1.email]!, bookingId + 1000);
    for (const res of [other, otherAdvisor, missing]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Booking not found." } });
    }
    expect(other.body).toEqual(missing.body);
    expect(otherAdvisor.body).toEqual(missing.body);
  });
});

describe("F-09 section 3: validation, status and session", () => {
  it.each(["abc", "0", "-1", "1.5", "1e3"])("returns 400 VALIDATION_ERROR for id %s", async (id) => {
    const res = await detail(cookies[s1.email]!, id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "The booking id must be a positive whole number." },
    });
  });

  it("shows Passed once the slot has ended", async () => {
    vi.setSystemTime(bkk("2026-11-10T09:30:00"));
    const res = await detail(await loginCookie(s1.email), bookingId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("Passed");
  });

  it("returns 401 without a session", async () => {
    const res = await request(app).get(`/api/bookings/${bookingId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
