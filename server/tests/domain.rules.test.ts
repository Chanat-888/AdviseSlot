import { describe, expect, it } from "vitest";
import {
  bookingDeadline,
  bookingStatus,
  checkSlotStart,
  isLateSlot,
  normalDeadline,
  slotStatus,
} from "../src/domain/rules.js";

// Unit tests of the pure rule functions (SDS section 2, server/src/domain/rules.ts):
// - TEST-F04-02 and TEST-F04-06 (unit part), docs/sprints/sprint-1/F-04-create-slot.md section 8
// - TEST-F05-03 (unit part), docs/sprints/sprint-1/F-05-view-own-slots.md section 8
// - TEST-F07-04 and TEST-F07-05 (unit part), docs/sprints/sprint-1/F-07-book-slot.md section 8
// - TEST-F08-01 (unit part), docs/sprints/sprint-1/F-08-view-own-bookings.md section 8
// All times are Asia/Bangkok (UTC+7, NFR-05).

const bkk = (local: string) => new Date(`${local}+07:00`);
const NOW = bkk("2026-11-09T10:00:00"); // Mon 9 Nov 2026 10:00

describe("TEST-F04-02 (AC-F04-02): BR-02 slot start rules", () => {
  it.each([
    ["Sat 14 Nov 10:00", "2026-11-14T10:00:00", "SLOT_NOT_WEEKDAY"],
    ["Sun 15 Nov 10:00", "2026-11-15T10:00:00", "SLOT_NOT_WEEKDAY"],
    ["Tue 10:15", "2026-11-10T10:15:00", "SLOT_INVALID_START_MINUTE"],
    ["Tue 10:00:30", "2026-11-10T10:00:30", "SLOT_INVALID_START_MINUTE"],
    ["Tue 07:30", "2026-11-10T07:30:00", "SLOT_OUTSIDE_HOURS"],
    ["Tue 18:00", "2026-11-10T18:00:00", "SLOT_OUTSIDE_HOURS"],
  ])("rejects %s (%s) with %s", (_name, local, code) => {
    expect(checkSlotStart(bkk(local), NOW)).toBe(code);
  });

  it.each([
    ["Tue 08:00 (first allowed)", "2026-11-10T08:00:00"],
    ["Tue 17:30 (last allowed)", "2026-11-10T17:30:00"],
  ])("accepts %s", (_name, local) => {
    expect(checkSlotStart(bkk(local), NOW)).toBeNull();
  });

  it("rejects a start in the past (BR-03) and a late slot 2 h or less away (BR-16, D-23)", () => {
    expect(checkSlotStart(bkk("2026-11-09T09:30:00"), NOW)).toBe("SLOT_IN_PAST");
    expect(checkSlotStart(bkk("2026-11-09T10:00:00"), NOW)).toBe("SLOT_IN_PAST"); // startAt == now
    expect(checkSlotStart(bkk("2026-11-10T09:30:00"), bkk("2026-11-10T07:30:00"))).toBe("SLOT_UNBOOKABLE");
    expect(checkSlotStart(bkk("2026-11-10T09:30:00"), bkk("2026-11-10T07:29:00"))).toBeNull();
  });
});

describe("TEST-F04-06 (AC-F04-06): normal deadline and late slot (BR-06, BR-16)", () => {
  it("a Tue 09:00 slot has a Mon 18:00 deadline and is late when created Mon 19:00", () => {
    const start = bkk("2026-11-10T09:00:00");
    expect(normalDeadline(start)).toEqual(bkk("2026-11-09T18:00:00"));
    expect(isLateSlot(start, bkk("2026-11-09T19:00:00"))).toBe(true);
    expect(isLateSlot(start, bkk("2026-11-09T17:59:59"))).toBe(false);
    expect(isLateSlot(start, bkk("2026-11-09T18:00:00"))).toBe(true); // at the deadline counts as late
  });

  it("an afternoon slot's normal deadline is 2 h before start; 12:00 counts as afternoon", () => {
    expect(normalDeadline(bkk("2026-11-10T14:00:00"))).toEqual(bkk("2026-11-10T12:00:00"));
    expect(normalDeadline(bkk("2026-11-10T12:00:00"))).toEqual(bkk("2026-11-10T10:00:00"));
    expect(normalDeadline(bkk("2026-11-10T11:30:00"))).toEqual(bkk("2026-11-09T18:00:00"));
  });

  it("a Monday morning slot's deadline is Sunday 18:00 (previous calendar day)", () => {
    expect(normalDeadline(bkk("2026-11-16T08:00:00"))).toEqual(bkk("2026-11-15T18:00:00"));
  });

  it("bookingDeadline uses startAt - 2 h for a late slot and the normal deadline otherwise", () => {
    const startAt = bkk("2026-11-10T09:00:00");
    expect(bookingDeadline({ startAt, isLate: true })).toEqual(bkk("2026-11-10T07:00:00"));
    expect(bookingDeadline({ startAt, isLate: false })).toEqual(bkk("2026-11-09T18:00:00"));
  });
});

describe("TEST-F05-03 (AC-F05-03): slot status (D-24)", () => {
  const slot = {
    startAt: bkk("2026-11-10T09:00:00"),
    endAt: bkk("2026-11-10T09:30:00"),
    isLate: false,
  };

  it("an unbooked Tue 09:00 slot is Open at Mon 17:59:59 and Closed at Mon 18:00:00", () => {
    expect(slotStatus(slot, false, bkk("2026-11-09T17:59:59"))).toBe("Open");
    expect(slotStatus(slot, false, bkk("2026-11-09T18:00:00"))).toBe("Closed");
  });

  it("checks Passed, then Booked, then Closed, then Open", () => {
    expect(slotStatus(slot, true, bkk("2026-11-10T09:30:00"))).toBe("Passed"); // endAt <= now
    expect(slotStatus(slot, false, bkk("2026-11-10T09:30:00"))).toBe("Passed");
    expect(slotStatus(slot, true, bkk("2026-11-10T09:15:00"))).toBe("Booked"); // started, not ended
    expect(slotStatus(slot, true, bkk("2026-11-09T10:00:00"))).toBe("Booked");
    expect(slotStatus(slot, false, bkk("2026-11-10T09:15:00"))).toBe("Closed"); // started, unbooked
  });
});

describe("TEST-F07-04 / TEST-F07-05 (unit part): bookingDeadline at the contract's slots", () => {
  it("Tue 10 Nov 09:00 closes Mon 18:00 and Tue 14:00 closes Tue 12:00 (AC-F07-04)", () => {
    expect(bookingDeadline({ startAt: bkk("2026-11-10T09:00:00"), isLate: false })).toEqual(bkk("2026-11-09T18:00:00"));
    expect(bookingDeadline({ startAt: bkk("2026-11-10T14:00:00"), isLate: false })).toEqual(bkk("2026-11-10T12:00:00"));
  });

  it("a late Wed 11 Nov 09:00 slot closes Wed 07:00 (AC-F07-05)", () => {
    expect(bookingDeadline({ startAt: bkk("2026-11-11T09:00:00"), isLate: true })).toEqual(bkk("2026-11-11T07:00:00"));
  });
});

describe("TEST-F08-01 (unit part): booking display status (D-24, F-08 section 3.2)", () => {
  const slot = { endAt: bkk("2026-11-10T10:30:00") };

  it("an ACTIVE booking is Upcoming at 10:29:59 and Passed at 10:30:00 when its slot ends at 10:30", () => {
    expect(bookingStatus({ status: "ACTIVE" }, slot, bkk("2026-11-10T10:29:59"))).toBe("Upcoming");
    expect(bookingStatus({ status: "ACTIVE" }, slot, bkk("2026-11-10T10:30:00"))).toBe("Passed");
  });

  it("a started but not ended slot is still Upcoming (BR-07)", () => {
    expect(bookingStatus({ status: "ACTIVE" }, slot, bkk("2026-11-10T10:15:00"))).toBe("Upcoming");
  });

  it("a CANCELLED booking is Cancelled, before and after the slot ends", () => {
    expect(bookingStatus({ status: "CANCELLED" }, slot, bkk("2026-11-10T09:00:00"))).toBe("Cancelled");
    expect(bookingStatus({ status: "CANCELLED" }, slot, bkk("2026-11-10T11:00:00"))).toBe("Cancelled");
  });
});
