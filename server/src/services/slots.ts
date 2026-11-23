import type { Prisma, Slot } from "@prisma/client";
import { prisma } from "../db.js";
import { bookingDeadline, checkSlotStart, expandRange, isLateSlot, SLOT_MS, slotStatus, type SlotRuleCode } from "../domain/rules.js";

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

export type CreateSlotBatchResult =
  | { ok: true; slots: SlotDto[] }
  | { ok: false; code: "VALIDATION_ERROR" } // F-15 section 3.1, no database access
  // `slotStart` names the failing slot; it is absent when a parallel insert won (23P01).
  | { ok: false; code: SlotRuleCode | "SLOT_OVERLAP"; slotStart?: Date };

/**
 * F-15 section 2, steps 4 to 8. All or nothing (D-30): the first failing slot rejects the
 * batch and no row is created. `now` is the server clock, passed in.
 */
export async function createSlotBatch(
  advisorId: number,
  startAt: Date,
  endAt: Date,
  now: Date,
): Promise<CreateSlotBatchResult> {
  const starts = expandRange(startAt, endAt); // F-15 section 3.1, in time order
  if (!starts) return { ok: false, code: "VALIDATION_ERROR" };

  for (const start of starts) {
    const code = checkSlotStart(start, now);
    if (code) return { ok: false, code, slotStart: start };
  }

  try {
    return await prisma.$transaction(async (tx): Promise<CreateSlotBatchResult> => {
      const overlap = await tx.slot.findFirst({
        where: { advisorId, deletedAt: null, startAt: { lt: endAt }, endAt: { gt: startAt } },
        orderBy: { startAt: "asc" },
        select: { startAt: true, endAt: true },
      });
      if (overlap) {
        // The first new slot that overlaps the earliest clashing live slot.
        const first = starts.find(
          (s) => s.getTime() < overlap.endAt.getTime() && s.getTime() + SLOT_MS > overlap.startAt.getTime(),
        );
        return { ok: false, code: "SLOT_OVERLAP", slotStart: first };
      }
      const rows = await tx.slot.createManyAndReturn({
        data: starts.map((s) => ({
          advisorId,
          startAt: s,
          endAt: new Date(s.getTime() + SLOT_MS),
          createdAt: now,
          isLate: isLateSlot(s, now),
        })),
      });
      rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
      return { ok: true, slots: rows.map((slot) => toSlotDto(slot, null, now)) };
    });
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

type Tx = Prisma.TransactionClient;
type MaintainCode = "NOT_FOUND" | "SLOT_ALREADY_STARTED" | "SLOT_HAS_ACTIVE_BOOKING";

/**
 * Checks 4 to 6 shared by F-12 edit and F-13 delete (F-12 section 3.2, F-13 section 3.2).
 * Locks the slot row first, so a parallel booking (F-07 and F-14 lock it too) runs before or
 * after this transaction, never in between (SDS 3.1, BR-14). Returns a failure code or null.
 */
async function lockOwnUnbookedFutureSlot(tx: Tx, advisorId: number, slotId: number, now: Date): Promise<MaintainCode | null> {
  const rows = await tx.$queryRaw<{ advisorId: number; startAt: Date; deletedAt: Date | null }[]>`
    SELECT "advisorId", "startAt", "deletedAt" FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;
  const slot = rows[0];
  // Check 4: missing, deleted or another advisor's slot all look the same (SDS 6).
  if (!slot || slot.deletedAt !== null || slot.advisorId !== advisorId) return "NOT_FOUND";
  // Check 5 (D-29): only before the slot starts (its current start, for an edit).
  if (slot.startAt.getTime() <= now.getTime()) return "SLOT_ALREADY_STARTED";
  // Check 6 (BR-14): only an ACTIVE booking blocks; a cancelled one does not (BR-13).
  const active = await tx.booking.findFirst({ where: { slotId, status: "ACTIVE" }, select: { id: true } });
  return active ? "SLOT_HAS_ACTIVE_BOOKING" : null;
}

export type DeleteSlotResult = { ok: true } | { ok: false; code: MaintainCode };

/** F-13 section 2, step 5: soft delete of the advisor's own unbooked future slot. */
export async function deleteSlot(advisorId: number, slotId: number, now: Date): Promise<DeleteSlotResult> {
  return prisma.$transaction(async (tx): Promise<DeleteSlotResult> => {
    const code = await lockOwnUnbookedFutureSlot(tx, advisorId, slotId, now);
    if (code) return { ok: false, code };
    await tx.slot.update({ where: { id: slotId }, data: { deletedAt: now } });
    return { ok: true };
  });
}

export type EditSlotResult = { ok: true; slot: SlotDto } | { ok: false; code: MaintainCode | SlotRuleCode | "SLOT_OVERLAP" };

/** F-12 section 2, step 5: move an own unbooked future slot to a new start (D-28). */
export async function editSlot(advisorId: number, slotId: number, newStart: Date, now: Date): Promise<EditSlotResult> {
  const endAt = new Date(newStart.getTime() + SLOT_MS);
  try {
    return await prisma.$transaction(async (tx): Promise<EditSlotResult> => {
      const code = await lockOwnUnbookedFutureSlot(tx, advisorId, slotId, now); // checks 4 to 6
      if (code) return { ok: false, code };
      const rule = checkSlotStart(newStart, now); // checks 7 to 11: F-04 rules 1 to 5 on the new start
      if (rule) return { ok: false, code: rule };
      // Check 12 (BR-04): another own live slot overlapping the new range; the slot itself does not count.
      const overlap = await tx.slot.findFirst({
        where: { advisorId, deletedAt: null, id: { not: slotId }, startAt: { lt: endAt }, endAt: { gt: newStart } },
        select: { id: true },
      });
      if (overlap) return { ok: false, code: "SLOT_OVERLAP" };
      // D-28: isLate is recomputed as if the slot were created now; createdAt stays.
      const slot = await tx.slot.update({
        where: { id: slotId },
        data: { startAt: newStart, endAt, isLate: isLateSlot(newStart, now) },
      });
      return { ok: true, slot: toSlotDto(slot, null, now) }; // no ACTIVE booking (check 6)
    });
  } catch (err) {
    if (isOverlapViolation(err)) return { ok: false, code: "SLOT_OVERLAP" }; // a parallel create won (23P01)
    throw err;
  }
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
