import { Prisma, type Booking, type Slot } from "@prisma/client";
import { prisma } from "../db.js";
import { advisorCanCancel, bookingDeadline, bookingStatus, studentCanCancel, type BookingDisplayStatus } from "../domain/rules.js";

// F-10 section 4.2: present only when the booking is cancelled.
export type CancellationDto = {
  cancelledAt: string;
  cancelledBy: { id: number; name: string; role: "STUDENT" | "ADVISOR" };
  reason: string | null;
};

// The booking as F-07 section 4.2 returns it; F-09 returns the same shape (section 4.2), with
// `cancellation` for a cancelled booking (F-10 section 4.2).
export type BookingDto = {
  id: number;
  status: BookingDisplayStatus;
  createdAt: string;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
  student: { id: number; name: string };
  cancellation?: CancellationDto;
};

type BookingWithParts = Booking & {
  slot: Slot & { advisor: { id: number; name: string } };
  student: { id: number; name: string };
  cancelledBy: { id: number; name: string; role: "STUDENT" | "ADVISOR" } | null;
};

/** The detail shape. The display status is bookingStatus (F-08 section 3.2, D-24). */
export function toBookingDto(b: BookingWithParts, now: Date): BookingDto {
  const dto: BookingDto = {
    id: b.id,
    status: bookingStatus(b, b.slot, now),
    createdAt: b.createdAt.toISOString(),
    slot: { id: b.slot.id, startAt: b.slot.startAt.toISOString(), endAt: b.slot.endAt.toISOString() },
    advisor: { id: b.slot.advisor.id, name: b.slot.advisor.name },
    student: { id: b.student.id, name: b.student.name },
  };
  // The key is absent for Upcoming and Passed, so the Sprint 1 bodies are unchanged. The
  // add_booking_cancel CHECK guarantees cancelledAt and cancelledBy on a CANCELLED row.
  if (b.status === "CANCELLED" && b.cancelledAt && b.cancelledBy) {
    dto.cancellation = {
      cancelledAt: b.cancelledAt.toISOString(),
      cancelledBy: { id: b.cancelledBy.id, name: b.cancelledBy.name, role: b.cancelledBy.role },
      reason: b.cancelReason,
    };
  }
  return dto;
}

export type BookingFailure =
  | "NOT_FOUND"
  | "SLOT_TAKEN"
  | "BOOKING_DEADLINE_PASSED"
  | "SAME_ADVISOR_BOOKING"
  | "ACTIVE_BOOKING_LIMIT";

export type CreateBookingResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; code: BookingFailure; deadline?: Date };

const INCLUDE = {
  slot: { include: { advisor: { select: { id: true, name: true } } } },
  student: { select: { id: true, name: true } },
  cancelledBy: { select: { id: true, name: true, role: true } },
} as const;

// A race on the partial unique index arrives as P2002 (F-07 section 3.2, check 5).
const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** F-07 section 2, steps 4 and 5. `now` is the server clock, passed in. */
export async function createBooking(studentId: number, slotId: number, now: Date): Promise<CreateBookingResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<CreateBookingResult> => {
      // Locks first, always student then slot (SDS 3.1, F-13 section 2.1). The student lock makes two
      // parallel requests by one student run one after the other (BR-07). The slot lock makes a booking
      // and a parallel edit or delete of the slot (F-12, F-13) run one after the other (BR-14), so the
      // checks below see the slot as it is when the booking is written. F-14 locks in the same order.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${studentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${slotId} FOR UPDATE`;

      // Check 1: the slot exists.
      const slot = await tx.slot.findFirst({ where: { id: slotId, deletedAt: null } });
      if (!slot) return { ok: false, code: "NOT_FOUND" };

      // Check 2: not taken.
      const taken = await tx.booking.findFirst({ where: { slotId, status: "ACTIVE" }, select: { id: true } });
      if (taken) return { ok: false, code: "SLOT_TAKEN" };

      // Check 3: BR-06 / BR-16 deadline. At or after is rejected.
      const deadline = bookingDeadline(slot);
      if (now.getTime() >= deadline.getTime()) return { ok: false, code: "BOOKING_DEADLINE_PASSED", deadline };

      // Check 4: BR-07 (#67, D-31), checked under the student lock taken at the top.
      const active = await tx.booking.findMany({
        where: { studentId, status: "ACTIVE", slot: { endAt: { gt: now } } },
        select: { slot: { select: { advisorId: true } } },
      });
      // 4a: at most one active booking with the same advisor; 4b: at most two in total.
      if (active.some((b) => b.slot.advisorId === slot.advisorId)) return { ok: false, code: "SAME_ADVISOR_BOOKING" };
      if (active.length >= 2) return { ok: false, code: "ACTIVE_BOOKING_LIMIT" };

      const booking = await tx.booking.create({
        data: { slotId, studentId, status: "ACTIVE", createdAt: now },
        include: INCLUDE,
      });
      return { ok: true, booking: toBookingDto(booking, now) };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, code: "SLOT_TAKEN" }; // check 5: a parallel insert won
    throw err;
  }
}

// F-08 section 4.2: the F-09 detail without `student` (the caller is the student).
export type OwnBookingDto = Omit<BookingDto, "student">;

/** F-08 section 2, steps 4 to 6: Upcoming by start ascending, then the rest by start descending. */
export async function listOwnBookings(studentId: number, now: Date): Promise<OwnBookingDto[]> {
  const bookings = await prisma.booking.findMany({ where: { studentId }, include: INCLUDE });
  const items = bookings.map((b) => toBookingDto(b, now));
  const start = (b: BookingDto) => Date.parse(b.slot.startAt);
  const upcoming = items.filter((b) => b.status === "Upcoming").sort((x, y) => start(x) - start(y));
  const rest = items.filter((b) => b.status !== "Upcoming").sort((x, y) => start(y) - start(x));
  return [...upcoming, ...rest].map(({ student: _student, ...item }) => item);
}

/**
 * F-09 section 2, steps 4 to 6. Returns null when there is no such booking or the caller is
 * neither its student nor its slot's advisor, so both cases give the same 404 (section 3.3).
 */
export async function getBookingFor(userId: number, bookingId: number, now: Date): Promise<BookingDto | null> {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: INCLUDE });
  if (!b || (b.studentId !== userId && b.slot.advisorId !== userId)) return null;
  return toBookingDto(b, now);
}

export type CancelResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; code: "NOT_FOUND" | "BOOKING_NOT_ACTIVE" }
  | { ok: false; code: "CANCEL_WINDOW_PASSED"; limit: Date };

export type AdvisorCancelResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; code: "NOT_FOUND" | "BOOKING_NOT_ACTIVE" | "CANCEL_WINDOW_PASSED" };

/**
 * F-10 section 2, steps 5 to 7, and section 3.2 checks 1 to 4: a student cancels their own booking.
 * `now` is the server clock, passed in. The F-11 advisor path is cancelBookingAsAdvisor below.
 */
export async function cancelBookingAsStudent(studentId: number, bookingId: number, now: Date): Promise<CancelResult> {
  return prisma.$transaction(async (tx): Promise<CancelResult> => {
    // Check 1: a missing booking and another student's booking give the same 404 (BR-09).
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
    if (!b || b.studentId !== studentId) return { ok: false, code: "NOT_FOUND" };

    // Locks in the SDS 3.1 order, student then slot, the same as F-07 and F-14, so no deadlock cycle
    // with a booking, reschedule, edit or delete. The checks below use the booking as read above;
    // the conditional update (check 4) catches a cancel that committed in between.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${b.studentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${b.slotId} FOR UPDATE`;

    // Check 2: still active. A cancelled booking or an ended slot ("Passed") is refused first.
    if (b.status !== "ACTIVE" || b.slot.endAt.getTime() <= now.getTime()) return { ok: false, code: "BOOKING_NOT_ACTIVE" };

    // Check 3: BR-11, at least 12 hours before the start.
    if (!studentCanCancel(b.slot.startAt, now)) {
      return { ok: false, code: "CANCEL_WINDOW_PASSED", limit: new Date(b.slot.startAt.getTime() - 12 * 60 * 60 * 1000) };
    }

    // Check 4: conditional update. 0 rows means a parallel cancel won.
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: studentId },
    });
    if (count === 0) return { ok: false, code: "BOOKING_NOT_ACTIVE" };

    const updated = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: INCLUDE });
    return { ok: true, booking: toBookingDto(updated, now) };
  });
}

/**
 * F-11 section 2, steps 5 to 7, and section 3.2 checks 1 to 4: the slot's advisor cancels a booking
 * with a reason that the route has already trimmed and checked (section 3.1). `now` is the server clock.
 */
export async function cancelBookingAsAdvisor(
  advisorId: number,
  bookingId: number,
  reason: string,
  now: Date,
): Promise<AdvisorCancelResult> {
  return prisma.$transaction(async (tx): Promise<AdvisorCancelResult> => {
    // Check 1: a missing booking and a booking on another advisor's slot give the same 404 (BR-08, BR-09).
    const b = await tx.booking.findUnique({ where: { id: bookingId }, include: { slot: true } });
    if (!b || b.slot.advisorId !== advisorId) return { ok: false, code: "NOT_FOUND" };

    // Same locks and order as the student path (SDS 3.1): the booking's student, then the slot.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${b.studentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Slot" WHERE id = ${b.slotId} FOR UPDATE`;

    // Check 2: still active. A cancelled booking or an ended slot is refused before the window check.
    if (b.status !== "ACTIVE" || b.slot.endAt.getTime() <= now.getTime()) return { ok: false, code: "BOOKING_NOT_ACTIVE" };

    // Check 3: BR-12, until the slot starts.
    if (!advisorCanCancel(b.slot.startAt, now)) return { ok: false, code: "CANCEL_WINDOW_PASSED" };

    // Check 4: conditional update, as in F-10. 0 rows means a parallel cancel won.
    const { count } = await tx.booking.updateMany({
      where: { id: bookingId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: advisorId, cancelReason: reason },
    });
    if (count === 0) return { ok: false, code: "BOOKING_NOT_ACTIVE" };

    const updated = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: INCLUDE });
    return { ok: true, booking: toBookingDto(updated, now) };
  });
}
