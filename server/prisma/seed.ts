import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { checkSlotStart, isLateSlot, SLOT_MS, slotStatus } from "../src/domain/rules.js";
import {
  BCRYPT_COST,
  DEMO_BOOKINGS,
  DEMO_SLOT_DAYS,
  DEMO_SLOT_LEAD_DAYS,
  DEMO_SLOT_TIMES,
  SEED_USERS,
} from "./seed-data.js";

export const MIN_DEMO_PASSWORD_LENGTH = 12;

/** The demo account password comes only from the environment, so no password lives in the code. */
export function demoPasswordFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const password = env.SEED_DEMO_PASSWORD;
  if (!password || password.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(`SEED_DEMO_PASSWORD must be set to at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

// Idempotent: users are matched by email. An existing user keeps its password hash,
// so running the seed again gives the same rows.
export async function seed(prisma: PrismaClient, now: Date = new Date(), demoPassword: string = demoPasswordFromEnv()) {
  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: user.email },
        data: { name: user.name, role: user.role },
      });
    } else {
      await prisma.user.create({
        data: { ...user, passwordHash: await bcrypt.hash(demoPassword, BCRYPT_COST) },
      });
    }
  }
  await seedDemoSlots(prisma, now);
  await seedDemoBookings(prisma, now);
}

// "2026-11-10" for the Asia/Bangkok calendar day of an instant (UTC+7, no DST).
function bangkokDay(t: Date): string {
  return new Date(t.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The Asia/Bangkok dates of the next `count` weekdays, starting `lead` calendar days after `now`. */
export function demoSlotDays(now: Date, count = DEMO_SLOT_DAYS, lead = DEMO_SLOT_LEAD_DAYS): string[] {
  const days: string[] = [];
  const cursor = new Date(`${bangkokDay(now)}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + lead);
  while (days.length < count) {
    const wd = cursor.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// Idempotent (F-04 section 6): a slot with the same advisor and start is skipped, so a second
// run adds nothing. Times are on a fixed grid, so a run on a later day cannot partly overlap.
async function seedDemoSlots(prisma: PrismaClient, now: Date) {
  for (const [email, times] of Object.entries(DEMO_SLOT_TIMES)) {
    const advisor = await prisma.user.findUniqueOrThrow({ where: { email } });
    for (const day of demoSlotDays(now)) {
      for (const time of times) {
        const startAt = new Date(`${day}T${time}:00+07:00`);
        if (checkSlotStart(startAt, now) !== null) continue; // only slots F-04 itself would accept
        const exists = await prisma.slot.findFirst({ where: { advisorId: advisor.id, startAt, deletedAt: null } });
        if (exists) continue;
        await prisma.slot.create({
          data: {
            advisorId: advisor.id,
            startAt,
            endAt: new Date(startAt.getTime() + SLOT_MS),
            createdAt: now,
            isLate: isLateSlot(startAt, now),
          },
        });
      }
    }
  }
}

// F-07 section 6: book some demo slots for seeded students. Idempotent: a student who already
// has an upcoming ACTIVE booking, or a slot that is taken, is skipped. Student One is left
// without a booking so the E2E journey and a first manual try can book. Each booking takes the
// advisor's first bookable slot (the same rule as F-06), so it never needs a deadline override.
async function seedDemoBookings(prisma: PrismaClient, now: Date) {
  for (const [studentEmail, advisorEmail] of Object.entries(DEMO_BOOKINGS)) {
    const student = await prisma.user.findUniqueOrThrow({ where: { email: studentEmail } });
    const advisor = await prisma.user.findUniqueOrThrow({ where: { email: advisorEmail } });
    const holds = await prisma.booking.count({
      where: { studentId: student.id, status: "ACTIVE", slot: { endAt: { gt: now } } },
    });
    if (holds > 0) continue;
    const slots = await prisma.slot.findMany({
      where: { advisorId: advisor.id, deletedAt: null, endAt: { gt: now }, bookings: { none: { status: "ACTIVE" } } },
      orderBy: { startAt: "asc" },
    });
    const slot = slots.find((sl) => slotStatus(sl, false, now) === "Open");
    if (!slot) continue;
    await prisma.booking.create({ data: { slotId: slot.id, studentId: student.id, status: "ACTIVE", createdAt: now } });
  }
}

// Run only when executed directly (`npx prisma db seed`), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(async () => console.log(`Seeded ${SEED_USERS.length} users; ${await prisma.slot.count()} slots in the database.`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
