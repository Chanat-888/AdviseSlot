import { Prisma, type Booking, type Slot } from "@prisma/client";
import { prisma } from "../db.js";
import { bookingDeadline } from "../domain/rules.js";

// The booking as F-07 section 4.2 returns it; F-09 returns the same shape (section 4.2).
export type BookingDto = {
  id: number;
  status: "Upcoming" | "Passed" | "Cancelled";
  createdAt: string;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
  student: { id: number; name: string };
};

type BookingWithParts = Booking & {
  slot: Slot & { advisor: { id: number; name: string } };
  student: { id: number; name: string };
};

/** D-24: Cancelled, else Passed once the slot has ended, else Upcoming. */
export function toBookingDto(b: BookingWithParts, now: Date): BookingDto {
  const status = b.status === "CANCELLED" ? "Cancelled" : b.slot.endAt.getTime() <= now.getTime() ? "Passed" : "Upcoming";
  return {
    id: b.id,
    status,
    createdAt: b.createdAt.toISOString(),
    slot: { id: b.slot.id, startAt: b.slot.startAt.toISOString(), endAt: b.slot.endAt.toISOString() },
    advisor: { id: b.slot.advisor.id, name: b.slot.advisor.name },
    student: { id: b.student.id, name: b.student.name },
  };
}

export type BookingFailure = "NOT_FOUND" | "SLOT_TAKEN" | "BOOKING_DEADLINE_PASSED" | "ACTIVE_BOOKING_LIMIT";

export type CreateBookingResult =
  | { ok: true; booking: BookingDto }
  | { ok: false; code: BookingFailure; deadline?: Date };

const INCLUDE = {
  slot: { include: { advisor: { select: { id: true, name: true } } } },
  student: { select: { id: true, name: true } },
} as const;

// A race on the partial unique index arrives as P2002 (F-07 section 3.2, check 5).
const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

/** F-07 section 2, steps 4 and 5. `now` is the server clock, passed in. */
export async function createBooking(studentId: number, slotId: number, now: Date): Promise<CreateBookingResult> {
  try {
    return await prisma.$transaction(async (tx): Promise<CreateBookingResult> => {
      // Check 1: the slot exists.
      const slot = await tx.slot.findFirst({ where: { id: slotId, deletedAt: null } });
      if (!slot) return { ok: false, code: "NOT_FOUND" };

      // Check 2: not taken.
      const taken = await tx.booking.findFirst({ where: { slotId, status: "ACTIVE" }, select: { id: true } });
      if (taken) return { ok: false, code: "SLOT_TAKEN" };

      // Check 3: BR-06 / BR-16 deadline. At or after is rejected.
      const deadline = bookingDeadline(slot);
      if (now.getTime() >= deadline.getTime()) return { ok: false, code: "BOOKING_DEADLINE_PASSED", deadline };

      // Check 4: BR-07. The row lock makes two parallel requests by one student run one after the other.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${studentId} FOR UPDATE`;
      const active = await tx.booking.count({
        where: { studentId, status: "ACTIVE", slot: { endAt: { gt: now } } },
      });
      if (active > 0) return { ok: false, code: "ACTIVE_BOOKING_LIMIT" };

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
