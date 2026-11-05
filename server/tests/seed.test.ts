import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PASSWORD, SEED_USERS } from "../prisma/seed-data.js";
import { demoSlotDays, seed } from "../prisma/seed.js";
import { prisma } from "../src/db.js";
import { checkSlotStart } from "../src/domain/rules.js";

const seedEmails = SEED_USERS.map((u) => u.email);
const bkk = (local: string) => new Date(`${local}+07:00`);

async function clearSeed() {
  await prisma.slot.deleteMany({ where: { advisor: { email: { in: seedEmails } } } });
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });
}

beforeAll(clearSeed);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("creates 2 advisors and 3 students, and running it twice gives the same rows", async () => {
    await seed(prisma);
    const first = await prisma.user.findMany({ where: { email: { in: seedEmails } }, orderBy: { email: "asc" } });

    await seed(prisma);
    const second = await prisma.user.findMany({ where: { email: { in: seedEmails } }, orderBy: { email: "asc" } });

    expect(first).toHaveLength(5);
    expect(first.filter((u) => u.role === "ADVISOR")).toHaveLength(2);
    expect(first.filter((u) => u.role === "STUDENT")).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it("stores lowercase emails and bcrypt cost 12 hashes, never the plaintext", async () => {
    const users = await prisma.user.findMany({ where: { email: { in: seedEmails } } });

    for (const user of users) {
      expect(user.email).toBe(user.email.toLowerCase());
      expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(user.passwordHash).not.toBe(DEMO_PASSWORD);
      expect(await bcrypt.compare(DEMO_PASSWORD, user.passwordHash)).toBe(true);
    }
  });
});

describe("seed demo slots (F-04 section 6)", () => {
  const now = bkk("2026-11-09T10:00:00"); // Mon 9 Nov

  it("uses the next 3 weekdays from 2 days ahead, skipping the weekend", () => {
    expect(demoSlotDays(now)).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(demoSlotDays(bkk("2026-11-12T23:30:00"))).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("creates future slots that F-04 would accept, and a second run adds none", async () => {
    await prisma.slot.deleteMany({ where: { advisor: { email: { in: seedEmails } } } });
    await seed(prisma, now);
    const first = await prisma.slot.findMany({ orderBy: [{ advisorId: "asc" }, { startAt: "asc" }] });

    await seed(prisma, now);
    const second = await prisma.slot.findMany({ orderBy: [{ advisorId: "asc" }, { startAt: "asc" }] });

    expect(first).toHaveLength(15); // 3 days x (3 + 2) times
    expect(second).toEqual(first);
    for (const slot of first) {
      expect(checkSlotStart(slot.startAt, now)).toBeNull();
      expect(slot.isLate).toBe(false);
      expect(slot.endAt.getTime() - slot.startAt.getTime()).toBe(30 * 60 * 1000);
    }
  });

  it("a run on a later day keeps the old slots and adds only the new days", async () => {
    const before = await prisma.slot.count();
    await seed(prisma, bkk("2026-11-10T10:00:00")); // Tue: days 12, 13, 16
    expect(await prisma.slot.count()).toBe(before + 5); // only Mon 16 is new
  });
});
