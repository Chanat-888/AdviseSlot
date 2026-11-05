// Pure business rules (SDS section 2). They take `now` as a parameter and never read the clock,
// so tests can check every boundary. All rule times are Asia/Bangkok: UTC+7, no daylight
// saving (NFR-05), so local time is a fixed offset.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BANGKOK_OFFSET = 7 * HOUR;

export const SLOT_MS = 30 * MINUTE; // BR-01
const FIRST_START = 8 * 60; // 08:00, in local minutes since midnight (BR-02)
const LAST_START = 17 * 60 + 30; // 17:30, so the last slot ends at 18:00 (BR-02)
const NOON = 12 * 60;

type LocalParts = { weekday: number; minutes: number; seconds: number; ms: number; midnightUtc: number };

// The local Asia/Bangkok clock reading of an instant.
function local(t: Date): LocalParts {
  const shifted = new Date(t.getTime() + BANGKOK_OFFSET);
  return {
    weekday: shifted.getUTCDay(), // 0 = Sunday
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
    midnightUtc: Math.floor(shifted.getTime() / DAY) * DAY - BANGKOK_OFFSET, // local 00:00 of that day, as UTC
  };
}

export type SlotRuleCode =
  | "SLOT_NOT_WEEKDAY"
  | "SLOT_INVALID_START_MINUTE"
  | "SLOT_OUTSIDE_HOURS"
  | "SLOT_IN_PAST"
  | "SLOT_UNBOOKABLE";

/** BR-06: before 12:00 local, 18:00 on the previous calendar day; otherwise 2 h before start. */
export function normalDeadline(startAt: Date): Date {
  const l = local(startAt);
  if (l.minutes < NOON) return new Date(l.midnightUtc - 6 * HOUR); // previous day 18:00
  return new Date(startAt.getTime() - 2 * HOUR);
}

/** BR-16: a slot created at or after its normal deadline is a late slot. */
export function isLateSlot(startAt: Date, now: Date): boolean {
  return now.getTime() >= normalDeadline(startAt).getTime();
}

/** F-04 section 3.3: a late slot is bookable until 2 h before start. */
export function bookingDeadline(slot: { startAt: Date; isLate: boolean }): Date {
  return slot.isLate ? new Date(slot.startAt.getTime() - 2 * HOUR) : normalDeadline(slot.startAt);
}

/**
 * F-04 section 3.2, rules 1 to 5 in order. Returns the first failing rule's code, or null.
 * Rule 6 (overlap) needs the database and is checked by the slot service.
 */
export function checkSlotStart(startAt: Date, now: Date): SlotRuleCode | null {
  const l = local(startAt);
  if (l.weekday === 0 || l.weekday === 6) return "SLOT_NOT_WEEKDAY"; // D-14
  if (l.minutes % 30 !== 0 || l.seconds !== 0 || l.ms !== 0) return "SLOT_INVALID_START_MINUTE"; // D-15
  if (l.minutes < FIRST_START || l.minutes > LAST_START) return "SLOT_OUTSIDE_HOURS";
  if (startAt.getTime() <= now.getTime()) return "SLOT_IN_PAST"; // BR-03
  if (isLateSlot(startAt, now) && startAt.getTime() - now.getTime() <= 2 * HOUR) return "SLOT_UNBOOKABLE"; // D-23
  return null;
}

export type SlotStatus = "Open" | "Booked" | "Closed" | "Passed";

/** F-05 section 3.2 (D-24): Passed, then Booked, then Closed, then Open. */
export function slotStatus(
  slot: { startAt: Date; endAt: Date; isLate: boolean },
  hasActiveBooking: boolean,
  now: Date,
): SlotStatus {
  if (slot.endAt.getTime() <= now.getTime()) return "Passed";
  if (hasActiveBooking) return "Booked";
  if (now.getTime() >= bookingDeadline(slot).getTime()) return "Closed";
  return "Open";
}

export type BookingDisplayStatus = "Upcoming" | "Passed" | "Cancelled";

/** F-08 section 3.2 (D-24): Cancelled, else Passed once the slot has ended, else Upcoming. */
export function bookingStatus(
  booking: { status: "ACTIVE" | "CANCELLED" },
  slot: { endAt: Date },
  now: Date,
): BookingDisplayStatus {
  if (booking.status === "CANCELLED") return "Cancelled";
  return slot.endAt.getTime() <= now.getTime() ? "Passed" : "Upcoming";
}
