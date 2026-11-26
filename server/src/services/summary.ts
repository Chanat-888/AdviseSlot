import { prisma } from "../db.js";
import { bookingStatus, slotStatus } from "../domain/rules.js";

export type SummaryDto = {
  from: string;
  to: string;
  counts: { slots: number; booked: number; cancelled: number; open: number };
  upcoming: {
    id: number;
    slot: { id: number; startAt: string; endAt: string };
    student: { id: number; name: string };
  }[];
};

/**
 * F-17 section 2, steps 5 to 7, with the counts of section 0 (D-33), over the advisor's own slots
 * that start in [start, end). `now` is the server clock, passed in. The counts use the same rule
 * functions as F-05 (slotStatus) and F-08 (bookingStatus), so they cannot drift from the schedule.
 */
export async function getSummary(
  advisorId: number,
  range: { from: string; to: string; start: Date; end: Date },
  now: Date,
): Promise<SummaryDto> {
  const inRange = { advisorId, startAt: { gte: range.start, lt: range.end } };
  const [slots, cancelled] = await Promise.all([
    prisma.slot.findMany({
      where: { ...inRange, deletedAt: null },
      include: { bookings: { where: { status: "ACTIVE" }, include: { student: { select: { id: true, name: true } } } } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    }),
    // D-29: a slot deleted later keeps its cancelled bookings, so deletedAt is not filtered here.
    prisma.booking.count({ where: { status: "CANCELLED", slot: inRange } }),
  ]);

  let booked = 0;
  let open = 0;
  const upcoming: SummaryDto["upcoming"] = [];
  for (const slot of slots) {
    // The partial unique index allows at most one ACTIVE booking per slot.
    const booking = slot.bookings[0];
    if (booking) booked++;
    if (slotStatus(slot, booking !== undefined, now) === "Open") open++;
    if (booking && bookingStatus(booking, slot, now) === "Upcoming") {
      upcoming.push({
        id: booking.id,
        slot: { id: slot.id, startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() },
        student: { id: booking.student.id, name: booking.student.name },
      });
    }
  }

  return { from: range.from, to: range.to, counts: { slots: slots.length, booked, cancelled, open }, upcoming };
}
