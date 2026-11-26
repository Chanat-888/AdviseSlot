import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createStudents, createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-19 Late-slot notification, tests TEST-F19-01 to TEST-F19-07 from
// docs/sprints/sprint-3/F-19-late-slot-notification.md (section 8). The E2E step is in
// e2e/tests/journey.spec.ts. Times are Asia/Bangkok, now = Mon 9 Nov 2026 19:00 unless stated, so
// morning slots on Tue 10 Nov are late. Slots are created through POST /api/slots and
// /api/slots/batch, so the notifications come from the real F-04 / F-15 path. Notifications are
// read through GET /api/notifications for each student (N = 3, every student in the test database).

const bkk = (local: string) => new Date(`${local}+07:00`);
const iso = (local: string) => bkk(local).toISOString();

let advisor: Fixture; // A
let students: Fixture[]; // S1, S2, S3: every student in the test database
let cookies: Record<number, string>; // user id -> session cookie

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

const as = (u: Fixture) => cookies[u.id]!;
const list = (u: Fixture) => request(app).get("/api/notifications").set("Cookie", as(u));
const markRead = (u: Fixture, id: number | string) => request(app).post(`/api/notifications/${id}/read`).set("Cookie", as(u));

async function createSlot(local: string) {
  const res = await request(app).post("/api/slots").set("Cookie", as(advisor)).send({ startAt: iso(local) });
  return res;
}

/** Creates a late slot through F-04 and returns its id. */
async function lateSlot(local: string): Promise<number> {
  const res = await createSlot(local);
  expect(res.status).toBe(201);
  expect(res.body.isLate).toBe(true);
  return res.body.id;
}

/** Each student's notifications, from the API. */
async function itemsByStudent() {
  const out: { student: Fixture; status: number; body: { unreadCount: number; items: Item[] } }[] = [];
  for (const s of students) {
    const res = await list(s);
    out.push({ student: s, status: res.status, body: res.body });
  }
  return out;
}

type Item = {
  id: number;
  message: string;
  createdAt: string;
  readAt: string | null;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
  slotAvailable: boolean;
};

beforeAll(async () => {
  const base = await createUsers();
  advisor = base.advisor;
  students = [base.student, ...(await createStudents(2, "s"))];
  cookies = {};
  for (const u of [advisor, ...students]) cookies[u.id] = await loginCookie(u.email);
}, 30_000);

beforeEach(async () => {
  // Cascades to Booking and Notification.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE');
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-09T19:00:00");
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F19-01 (AC-F19-01): a late slot notifies every student once; a normal slot notifies no one", () => {
  it("gives each of the N students one unread notification for the late slot, and none for the normal one", async () => {
    expect(await prisma.user.count({ where: { role: "STUDENT" } })).toBe(students.length);
    const late = await lateSlot("2026-11-10T09:00:00");
    const normal = await createSlot("2026-11-12T10:00:00");
    expect(normal.status).toBe(201);
    expect(normal.body.isLate).toBe(false);

    for (const { status, body } of await itemsByStudent()) {
      expect(status).toBe(200);
      expect(body).toEqual({
        unreadCount: 1,
        items: [
          {
            id: expect.any(Number),
            message: "Dr. Advisor One added a late slot on Tue 10 Nov at 09:00.",
            createdAt: iso("2026-11-09T19:00:00"),
            readAt: null,
            slot: { id: late, startAt: iso("2026-11-10T09:00:00"), endAt: iso("2026-11-10T09:30:00") },
            advisor: { id: advisor.id, name: advisor.name },
            slotAvailable: true,
          },
        ],
      });
    }
  });
});

describe("TEST-F19-02 (AC-F19-02): a rejected late slot notifies no one (D-23)", () => {
  it("answers 422 SLOT_UNBOOKABLE for a late slot exactly 2 h away and adds no slot and no notification", async () => {
    at("2026-11-10T07:00:00");
    const res = await createSlot("2026-11-10T09:00:00");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SLOT_UNBOOKABLE");
    expect(await prisma.slot.count()).toBe(0);
    for (const { status, body } of await itemsByStudent()) {
      expect(status).toBe(200);
      expect(body).toEqual({ unreadCount: 0, items: [] });
    }
  });
});

describe("TEST-F19-03 (AC-F19-03): a batch notifies once per late slot per student; a rejected batch notifies no one", () => {
  const batch = (from: string, to: string) =>
    request(app).post("/api/slots/batch").set("Cookie", as(advisor)).send({ startAt: iso(from), endAt: iso(to) });

  it("notifies for the 11:00 and 11:30 slots of Tue 11:00 to 13:00, then nothing for a rejected batch", async () => {
    const ok = await batch("2026-11-10T11:00:00", "2026-11-10T13:00:00");
    expect(ok.status).toBe(201);
    const lateIds = ok.body.slots.filter((s: { isLate: boolean }) => s.isLate).map((s: { id: number }) => s.id);
    expect(lateIds).toHaveLength(2);

    const rejected = await batch("2026-11-12T17:00:00", "2026-11-12T18:30:00"); // 18:00 is outside hours
    expect(rejected.status).toBe(422);

    for (const { status, body } of await itemsByStudent()) {
      expect(status).toBe(200);
      expect(body.unreadCount).toBe(2);
      expect(body.items.map((i) => i.slot.id).sort()).toEqual([...lateIds].sort());
      expect(body.items.map((i) => i.message).sort()).toEqual([
        "Dr. Advisor One added a late slot on Tue 10 Nov at 11:00.",
        "Dr. Advisor One added a late slot on Tue 10 Nov at 11:30.",
      ]);
    }
  });

  it("writes no slot and no notification when a batch of late slots is rejected inside the transaction (overlap, D-30)", async () => {
    await lateSlot("2026-11-10T10:00:00");
    const rejected = await batch("2026-11-10T08:30:00", "2026-11-10T10:30:00"); // 08:30 to 09:30 are late
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("SLOT_OVERLAP");
    expect(await prisma.slot.count()).toBe(1);
    for (const { status, body } of await itemsByStudent()) {
      expect(status).toBe(200);
      expect(body.items).toHaveLength(1); // only the 10:00 slot
    }
  });
});

describe("TEST-F19-04 (AC-F19-04): editing never notifies; a moved slot's notification shows the new time (D-28, D-32)", () => {
  it("adds no row for a normal-to-late edit and shows the new start of a moved notified slot", async () => {
    const normal = await createSlot("2026-11-11T09:00:00");
    expect(normal.body.isLate).toBe(false);
    const late = await lateSlot("2026-11-10T09:00:00");

    const toLate = await request(app)
      .patch(`/api/slots/${normal.body.id}`)
      .set("Cookie", as(advisor))
      .send({ startAt: iso("2026-11-10T10:00:00") });
    expect(toLate.status).toBe(200);
    expect(toLate.body.isLate).toBe(true);
    const moved = await request(app)
      .patch(`/api/slots/${late}`)
      .set("Cookie", as(advisor))
      .send({ startAt: iso("2026-11-10T11:00:00") });
    expect(moved.status).toBe(200);

    for (const { status, body } of await itemsByStudent()) {
      expect(status).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.slot).toEqual({ id: late, startAt: iso("2026-11-10T11:00:00"), endAt: iso("2026-11-10T11:30:00") });
      expect(body.items[0]!.message).toBe("Dr. Advisor One added a late slot on Tue 10 Nov at 09:00."); // text at creation
    }
  });
});

describe("TEST-F19-05 (AC-F19-05): slotAvailable follows the slot's state", () => {
  it("is false for a booked or deleted slot, true for an open one, and false once its deadline passes", async () => {
    const z = await lateSlot("2026-11-10T09:00:00"); // deadline Tue 07:00
    const x = await lateSlot("2026-11-10T09:30:00");
    const y = await lateSlot("2026-11-10T10:00:00");
    const [s1] = students;

    const booked = await request(app).post("/api/bookings").set("Cookie", as(s1!)).send({ slotId: x });
    expect(booked.status).toBe(201);
    const deleted = await request(app).delete(`/api/slots/${y}`).set("Cookie", as(advisor));
    expect(deleted.status).toBe(204);

    const available = async () => {
      const res = await list(s1!);
      expect(res.status).toBe(200);
      return Object.fromEntries(res.body.items.map((i: Item) => [i.slot.id, i.slotAvailable]));
    };
    at("2026-11-09T19:30:00");
    expect(await available()).toEqual({ [x]: false, [y]: false, [z]: true });
    at("2026-11-10T07:00:00");
    expect(await available()).toEqual({ [x]: false, [y]: false, [z]: false });
  });
});

describe("TEST-F19-06 (AC-F19-06): own list newest first with an unread count; mark as read is idempotent", () => {
  it("lists n2 before n1, then keeps the first readAt on a second mark and drops unreadCount by 1", async () => {
    const [s1] = students;
    await lateSlot("2026-11-10T09:00:00"); // n1
    at("2026-11-09T19:05:00");
    await lateSlot("2026-11-10T09:30:00"); // n2

    const before = await list(s1!);
    expect(before.status).toBe(200);
    expect(before.body.unreadCount).toBe(2);
    const [n2, n1] = before.body.items as Item[];
    expect(n2!.createdAt).toBe(iso("2026-11-09T19:05:00"));
    expect(n1!.createdAt).toBe(iso("2026-11-09T19:00:00"));

    at("2026-11-09T19:10:00");
    const first = await markRead(s1!, n1!.id);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ ...n1, readAt: iso("2026-11-09T19:10:00") });
    at("2026-11-09T19:20:00");
    const second = await markRead(s1!, n1!.id);
    expect(second.status).toBe(200);
    expect(second.body.readAt).toBe(iso("2026-11-09T19:10:00"));

    const after = await list(s1!);
    expect(after.body.unreadCount).toBe(1);
    expect(after.body.items.map((i: Item) => [i.id, i.readAt])).toEqual([
      [n2!.id, null],
      [n1!.id, iso("2026-11-09T19:10:00")],
    ]);
  });
});

describe("TEST-F19-07 (AC-F19-07): ownership and role", () => {
  it("gives another student and an unknown id the same 404, and an advisor 403 on both endpoints", async () => {
    const [s1, s2] = students;
    await lateSlot("2026-11-10T09:00:00");
    const own = await list(s1!);
    expect(own.status).toBe(200);
    const n1 = own.body.items[0] as Item;

    const other = await markRead(s2!, n1.id);
    const unknown = await markRead(s2!, 999999);
    const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Notification not found." } };
    expect([other.status, other.body]).toEqual([404, NOT_FOUND]);
    expect([unknown.status, unknown.body]).toEqual([404, NOT_FOUND]);
    expect((await list(s1!)).body.items[0].readAt).toBeNull();

    const FORBIDDEN = { error: { code: "FORBIDDEN_ROLE", message: "Only students have notifications." } };
    const advList = await list(advisor);
    const advMark = await markRead(advisor, n1.id);
    expect([advList.status, advList.body]).toEqual([403, FORBIDDEN]);
    expect([advMark.status, advMark.body]).toEqual([403, FORBIDDEN]);
  });
});

describe("F-19 section 3.1: the notification id must be a positive whole number", () => {
  it("answers 400 VALIDATION_ERROR for a bad id", async () => {
    const [s1] = students;
    for (const bad of ["abc", "0", "-1", "1.5"]) {
      const res = await markRead(s1!, bad);
      expect([res.status, res.body]).toEqual([
        400,
        { error: { code: "VALIDATION_ERROR", message: "The notification id must be a positive whole number." } },
      ]);
    }
  });
});
