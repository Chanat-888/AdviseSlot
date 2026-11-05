import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import { BCRYPT_COST, DEMO_PASSWORD, SEED_USERS } from "./seed-data.js";

// Idempotent: users are matched by email. An existing user keeps its password hash,
// so running the seed again gives the same rows.
export async function seed(prisma: PrismaClient) {
  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) {
      await prisma.user.update({
        where: { email: user.email },
        data: { name: user.name, role: user.role },
      });
    } else {
      await prisma.user.create({
        data: { ...user, passwordHash: await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST) },
      });
    }
  }
  // Demo slots and bookings are added here once the Slot (#10) and Booking (#11) models exist.
}

// Run only when executed directly (`npx prisma db seed`), not when imported by tests.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  seed(prisma)
    .then(() => console.log(`Seeded ${SEED_USERS.length} users.`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
