import type { Slot } from "@prisma/client";
import { prisma } from "../db.js";
import { bookingDeadline, checkSlotStart, isLateSlot, SLOT_MS, slotStatus, type SlotRuleCode } from "../domain/rules.js";

// One slot as F-04 section 4.2 and F-05 section 4.2 return it.
export type SlotDto = {
  id: number;
  startAt: string;
  endAt: string;
  isLate: boolean;
  bookingDeadline: string;
  status: ReturnType<typeof slotStatus>;
  student: { id: number; name: string } | null;
  bookingId: number | null;
};

// The ACTIVE booking of a slot, if any (F-07).
export type ActiveBooking = { id: number; student: { id: number; name: string } } | null;

export function toSlotDto(slot: Slot, booking: ActiveBooking, now: Date): SlotDto {
  return {
    id: slot.id,
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    isLate: slot.isLate,
    bookingDeadline: bookingDeadline(slot).toISOString(),
    status: slotStatus(slot, booking !== null, now),
    student: booking ? { id: booking.student.id, name: booking.student.name } : null,
    bookingId: booking ? booking.id : null,
  };
}

export type CreateSlotResult =
  | { ok: true; slot: SlotDto }
  | { ok: false; code: SlotRuleCode | "SLOT_OVERLAP" };

// The Slot_no_overlap exclusion constraint has no Prisma error code: it arrives as an error
// whose message carries SQLSTATE 23P01 and the constraint name (F-04 section 6).
function isOverlapViolation(err: unknown): boolean {
  return err instanceof Error && /23P01|Slot_no_overlap/.test(err.message);
}

/** F-04 section 2, steps 4 to 6. `now` is the server clock, passed in. */
export async function createSlot(advisorId: number, startAt: Date, now: Date): Promise<CreateSlotResult> {
  const code = checkSlotStart(startAt, now);
  if (code) return { ok: false, code };

  const endAt = new Date(startAt.getTime() + SLOT_MS);
  try {
    const slot = await prisma.$transaction(async (tx) => {
      const overlap = await tx.slot.findFirst({
        where: { advisorId, deletedAt: null, startAt: { lt: endAt }, endAt: { gt: startAt } },
        select: { id: true },
      });
      if (overlap) return null;
      return tx.slot.create({
        data: { advisorId, startAt, endAt, createdAt: now, isLate: isLateSlot(startAt, now) },
      });
    });
    if (!slot) return { ok: false, code: "SLOT_OVERLAP" };
    return { ok: true, slot: toSlotDto(slot, null, now) };
  } catch (err) {
    if (isOverlapViolation(err)) return { ok: false, code: "SLOT_OVERLAP" }; // a parallel insert won
    throw err;
  }
}

/** F-05 section 2, steps 4 to 6: the advisor's live slots, sorted by start. */
export async function listOwnSlots(advisorId: number, now: Date): Promise<SlotDto[]> {
  const slots = await prisma.slot.findMany({
    where: { advisorId, deletedAt: null },
    orderBy: { startAt: "asc" },
    // The ACTIVE booking and its student's id and name, in the same query (no N+1).
    include: {
      bookings: { where: { status: "ACTIVE" }, take: 1, select: { id: true, student: { select: { id: true, name: true } } } },
    },
  });
  return slots.map((slot) => toSlotDto(slot, slot.bookings[0] ?? null, now));
}

// F-06 response item: no status, student or booking field (BR-09).
export type BookableSlotDto = {
  id: number;
  startAt: string;
  endAt: string;
  isLate: boolean;
  bookingDeadline: string;
  advisor: { id: number; name: string };
};

/** F-06 section 3.2: slots of all advisors with status Open, sorted by start. */
export async function listBookableSlots(now: Date): Promise<BookableSlotDto[]> {
  const slots = await prisma.slot.findMany({
    where: { deletedAt: null, endAt: { gt: now }, bookings: { none: { status: "ACTIVE" } } },
    orderBy: { startAt: "asc" },
    include: { advisor: { select: { id: true, name: true } } },
  });
  // The same rule as F-07: bookable exactly while now < bookingDeadline.
  return slots
    .filter((slot) => slotStatus(slot, false, now) === "Open")
    .map((slot) => ({
      id: slot.id,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      isLate: slot.isLate,
      bookingDeadline: bookingDeadline(slot).toISOString(),
      advisor: slot.advisor,
    }));
}
