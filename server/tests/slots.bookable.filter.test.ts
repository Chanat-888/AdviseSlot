import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createUsers, loginCookie, resetUsers, type Fixture } from "./helpers.js";

// F-16 Filter bookable slots, tests TEST-F16-01 to TEST-F16-05 from
// docs/sprints/sprint-3/F-16-filter-bookable-slots.md (v0.2, section 8). The unit parts of
// TEST-F16-02 and -04 (bangkokDay) are in domain.rules.test.ts, TEST-F16-06 in advisors.list.test.ts.
// Times are Asia/Bangkok. Rows are inserted with Prisma; the clock is a fake Date.

const bkk = (local: string) => new Date(`${local}+07:00`);
const HALF_HOUR = 30 * 60 * 1000;

const ADVISOR_MESSAGE = "The advisor filter must be a positive whole number.";
const DATE_MESSAGE = "The date filter must be a real date written as YYYY-MM-DD.";

let student: Fixture;
let advisor: Fixture; // A
let advisorB: Fixture; // B
let booker: { id: number };

function at(local: string) {
  vi.setSystemTime(bkk(local));
}

async function insertSlot(advisorId: number, local: string, extra: { isLate?: boolean; createdAt?: string; deletedAt?: string } = {}) {
  const startAt = bkk(local);
  return prisma.slot.create({
    data: {
      advisorId,
      startAt,
      endAt: new Date(startAt.getTime() + HALF_HOUR),
      createdAt: bkk(extra.createdAt ?? "2026-11-01T09:00:00"),
      isLate: extra.isLate ?? false,
      deletedAt: extra.deletedAt ? bkk(extra.deletedAt) : null,
    },
  });
}

async function insertBooking(slotId: number, studentId: number) {
  return prisma.booking.create({ data: { slotId, studentId, status: "ACTIVE", createdAt: bkk("2026-11-02T09:00:00") } });
}

/** `query` is the raw query string, so `advisorId[]=1` and repeated keys reach Express as written. */
const bookable = (cookie: string, query = "") =>
  request(app).get(`/api/slots/bookable${query ? `?${query}` : ""}`).set("Cookie", cookie);

/** The local start of each item, "Tue 09:00" style, so the expected lists read like the contract. */
function starts(body: { startAt: string; advisor: { id: number } }[]) {
  return body.map((s) => {
    const local = new Date(new Date(s.startAt).getTime() + 7 * 60 * 60 * 1000).toISOString();
    return `${local.slice(5, 10)} ${local.slice(11, 16)} ${s.advisor.id === advisor.id ? "A" : s.advisor.id === advisorB.id ? "B" : "?"}`;
  });
}

// Shared setup (section 8): open slots A Tue 10 Nov 09:00, A Tue 14:00, A Wed 11 Nov 09:00,
// B Tue 09:30, B Wed 14:00.
async function sharedSetup() {
  await insertSlot(advisor.id, "2026-11-10T09:00:00");
  await insertSlot(advisor.id, "2026-11-10T14:00:00");
  await insertSlot(advisor.id, "2026-11-11T09:00:00");
  await insertSlot(advisorB.id, "2026-11-10T09:30:00");
  await insertSlot(advisorB.id, "2026-11-11T14:00:00");
}

const ALL_FIVE = ["11-10 09:00 A", "11-10 09:30 B", "11-10 14:00 A", "11-11 09:00 A", "11-11 14:00 B"];

beforeAll(async () => {
  ({ student, advisor, advisorB } = await createUsers());
  // The booker of TEST-F16-05, with a name and email the bookable body must never contain.
  booker = await prisma.user.create({
    data: { name: "Booker Two", email: "booker2@example.test", passwordHash: "not-used", role: "STUDENT" },
  });
}, 30_000);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE');
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-11-09T10:00:00"); // Mon 9 Nov 2026 10:00
  await sharedSetup();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await resetUsers();
  await prisma.$disconnect();
});

describe("TEST-F16-01 (AC-F16-01): filter by advisor; no filter is the F-06 list", () => {
  it("returns all five with no filter, and only the chosen advisor's slots in start order", async () => {
    const s1 = await loginCookie(student.email);

    const all = await bookable(s1);
    expect(all.status).toBe(200);
    expect(starts(all.body)).toEqual(ALL_FIVE);

    const a = await bookable(s1, `advisorId=${advisor.id}`);
    expect(a.status).toBe(200);
    expect(starts(a.body)).toEqual(["11-10 09:00 A", "11-10 14:00 A", "11-11 09:00 A"]);
    for (const item of a.body) {
      // The F-06 item shape (F-06 section 4.2), nothing more.
      expect(Object.keys(item).sort()).toEqual(["advisor", "bookingDeadline", "endAt", "id", "isLate", "startAt"]);
      expect(item.advisor).toEqual({ id: advisor.id, name: advisor.name });
    }

    const b = await bookable(s1, `advisorId=${advisorB.id}`);
    expect(b.status).toBe(200);
    expect(starts(b.body)).toEqual(["11-10 09:30 B", "11-11 14:00 B"]);
  });
});

describe("TEST-F16-02 (AC-F16-02): filter by a Bangkok day, alone and with the advisor", () => {
  it("returns only the slots starting on that day, and those matching both filters", async () => {
    const s1 = await loginCookie(student.email);

    const tue = await bookable(s1, "date=2026-11-10");
    expect(tue.status).toBe(200);
    expect(starts(tue.body)).toEqual(["11-10 09:00 A", "11-10 09:30 B", "11-10 14:00 A"]);

    const wed = await bookable(s1, "date=2026-11-11");
    expect(wed.status).toBe(200);
    expect(starts(wed.body)).toEqual(["11-11 09:00 A", "11-11 14:00 B"]);

    const both = await bookable(s1, `advisorId=${advisor.id}&date=2026-11-10`);
    expect(both.status).toBe(200);
    expect(starts(both.body)).toEqual(["11-10 09:00 A", "11-10 14:00 A"]);
  });
});

describe("TEST-F16-03 (AC-F16-03): filters only narrow; the F-06 bookable rules still apply", () => {
  it("never lists a booked, deleted, ended or past-deadline slot, and keeps a late slot until its deadline", async () => {
    const booked = await insertSlot(advisor.id, "2026-11-10T10:00:00");
    await insertBooking(booked.id, booker.id);
    await insertSlot(advisor.id, "2026-11-10T10:30:00", { deletedAt: "2026-11-05T09:00:00" });
    await insertSlot(advisor.id, "2026-11-10T11:00:00");
    await insertSlot(advisor.id, "2026-11-06T10:00:00"); // Fri 6 Nov, ended
    // Late slot Wed 11 Nov 10:00 created Tue 10 Nov 19:00 (after its Tue 18:00 normal deadline).
    await insertSlot(advisor.id, "2026-11-11T10:00:00", { isLate: true, createdAt: "2026-11-10T19:00:00" });

    const s1 = await loginCookie(student.email);
    const tue = await bookable(s1, `advisorId=${advisor.id}&date=2026-11-10`);
    expect(tue.status).toBe(200);
    expect(starts(tue.body)).toEqual(["11-10 09:00 A", "11-10 11:00 A", "11-10 14:00 A"]);

    const fri = await bookable(s1, `advisorId=${advisor.id}&date=2026-11-06`);
    expect(fri.status).toBe(200);
    expect(fri.body).toEqual([]);

    // Sessions last 2 hours (D-21), so log in again at each new time.
    at("2026-11-11T07:59:59.999");
    const before = await bookable(await loginCookie(student.email), `advisorId=${advisor.id}&date=2026-11-11`);
    expect(before.status).toBe(200);
    expect(starts(before.body)).toEqual(["11-11 10:00 A"]); // the normal Wed 09:00 closed at Tue 18:00 (BR-06)
    expect(before.body[0].isLate).toBe(true);

    at("2026-11-11T08:00:00"); // 10:00 - 2 h (BR-16)
    const atDeadline = await bookable(await loginCookie(student.email), `advisorId=${advisor.id}&date=2026-11-11`);
    expect(atDeadline.status).toBe(200);
    expect(atDeadline.body).toEqual([]);
  });
});

describe("TEST-F16-04 (AC-F16-04): bad filter values give 400; empty values mean no filter", () => {
  it.each([
    ["abc", "advisorId=abc"],
    ["0", "advisorId=0"],
    ["-1", "advisorId=-1"],
    ["1.5", "advisorId=1.5"],
    ["007", "advisorId=007"],
    ["99999999999 (over INT)", "advisorId=99999999999"],
    ["given twice", "advisorId=1&advisorId=2"],
    ["with brackets", "advisorId[]=1"],
    ["both bad (advisor message wins)", "advisorId=abc&date=bad"],
  ])("advisorId %s: 400 with the advisor message", async (_name, query) => {
    const res = await bookable(await loginCookie(student.email), query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: ADVISOR_MESSAGE } });
  });

  it("advisorId[] carrying a real advisor id is still refused (not read as that advisor)", async () => {
    const res = await bookable(await loginCookie(student.email), `advisorId[]=${advisor.id}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: ADVISOR_MESSAGE } });
  });

  it.each([
    ["month 13", "date=2026-13-01"],
    ["30 February", "date=2026-02-30"],
    ["day first", "date=10/11/2026"],
    ["one-digit day", "date=2026-11-1"],
    ["given twice", "date=2026-11-10&date=2026-11-11"],
    ["as an object", "date[a]=2026-11-10"],
  ])("date %s: 400 with the date message", async (_name, query) => {
    const res = await bookable(await loginCookie(student.email), query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: "VALIDATION_ERROR", message: DATE_MESSAGE } });
  });

  it("treats empty values as no filter", async () => {
    const res = await bookable(await loginCookie(student.email), "advisorId=&date=");
    expect(res.status).toBe(200);
    expect(starts(res.body)).toEqual(ALL_FIVE);
  });
});

describe("TEST-F16-05 (AC-F16-05): a valid filter that matches nothing is []; no booker identity", () => {
  it("returns [] for an unknown advisor, a student's id, a Saturday and a past date, and hides the booker", async () => {
    const booked = await insertSlot(advisor.id, "2026-11-10T15:00:00");
    await insertBooking(booked.id, booker.id);
    const s1 = await loginCookie(student.email);

    for (const query of ["advisorId=999999", `advisorId=${student.id}`, "date=2026-11-14", "date=2026-11-06"]) {
      const res = await bookable(s1, query);
      expect(res.status, query).toBe(200);
      expect(res.body, query).toEqual([]);
    }

    const res = await bookable(s1, `advisorId=${advisor.id}&date=2026-11-10`);
    expect(res.status).toBe(200);
    expect(starts(res.body)).toEqual(["11-10 09:00 A", "11-10 14:00 A"]);
    for (const item of res.body) {
      for (const key of ["student", "studentId", "bookingId", "status"]) expect(item).not.toHaveProperty(key);
    }
    expect(res.text).not.toContain("Booker Two");
    expect(res.text).not.toContain("booker2@example.test");
  });
});
