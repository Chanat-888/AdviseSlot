import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PASSWORD, SEED_USERS } from "../prisma/seed-data.js";
import { seed } from "../prisma/seed.js";
import { prisma } from "../src/db.js";

const seedEmails = SEED_USERS.map((u) => u.email);

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: seedEmails } } });
});

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
