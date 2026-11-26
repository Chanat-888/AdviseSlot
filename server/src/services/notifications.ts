import type { Prisma, Slot } from "@prisma/client";
import { prisma } from "../db.js";
import { bookingDeadline } from "../domain/rules.js";

// F-19 Late-slot notification (docs/sprints/sprint-3/F-19-late-slot-notification.md).

const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });

/** Section 2.1 step 3: "<advisor> added a late slot on Tue 10 Nov at 09:00." (Asia/Bangkok). */
function lateSlotMessage(advisorName: string, startAt: Date): string {
  return `${advisorName} added a late slot on ${dayFmt.format(startAt).replace(",", "")} at ${timeFmt.format(startAt)}.`;
}

/**
 * Section 2.1 step 2: one notification per student for each late slot, written with the caller's
 * transaction `tx`, so a rolled-back slot leaves no notification (D-30). Normal slots are skipped.
 */
export async function notifyLateSlots(tx: Prisma.TransactionClient, slots: Slot[], now: Date): Promise<void> {
  const late = slots.filter((s) => s.isLate);
  if (late.length === 0) return;
  const students = await tx.user.findMany({ where: { role: "STUDENT" }, select: { id: true } });
  if (students.length === 0) return;
  const advisors = await tx.user.findMany({
    where: { id: { in: [...new Set(late.map((s) => s.advisorId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(advisors.map((a) => [a.id, a.name]));
  await tx.notification.createMany({
    data: late.flatMap((slot) => {
      const message = lateSlotMessage(nameOf.get(slot.advisorId)!, slot.startAt);
      return students.map((s) => ({ studentId: s.id, slotId: slot.id, message, createdAt: now }));
    }),
  });
}

// Section 4.2 item.
export type NotificationDto = {
  id: number;
  message: string;
  createdAt: string;
  readAt: string | null;
  slot: { id: number; startAt: string; endAt: string };
  advisor: { id: number; name: string };
  slotAvailable: boolean;
};

const include = {
  slot: {
    include: {
      advisor: { select: { id: true, name: true } },
      bookings: { where: { status: "ACTIVE" }, take: 1, select: { id: true } },
    },
  },
} as const;

type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

function toDto(n: Row, now: Date): NotificationDto {
  const { slot } = n;
  return {
    id: n.id,
    message: n.message,
    createdAt: n.createdAt.toISOString(),
    readAt: n.readAt ? n.readAt.toISOString() : null,
    slot: { id: slot.id, startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() },
    advisor: slot.advisor,
    // Section 2.2: the F-06 bookable test on the slot's current state (D-32).
    slotAvailable: slot.deletedAt === null && slot.bookings.length === 0 && now < bookingDeadline(slot),
  };
}

/** Section 2.2: the student's own notifications, newest first, and the unread count. */
export async function listNotifications(studentId: number, now: Date) {
  const rows = await prisma.notification.findMany({
    where: { studentId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include,
  });
  return { unreadCount: rows.filter((n) => n.readAt === null).length, items: rows.map((n) => toDto(n, now)) };
}

/** Section 2.3: sets readAt once (idempotent). Null if missing or another student's (404). */
export async function markNotificationRead(studentId: number, id: number, now: Date): Promise<NotificationDto | null> {
  // Only an unread own row is updated, so a second call keeps the first readAt.
  await prisma.notification.updateMany({ where: { id, studentId, readAt: null }, data: { readAt: now } });
  const row = await prisma.notification.findFirst({ where: { id, studentId }, include });
  return row ? toDto(row, now) : null;
}
