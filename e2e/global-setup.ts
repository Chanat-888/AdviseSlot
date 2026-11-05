import { execSync } from "node:child_process";
import { join } from "node:path";
import { loadTestEnv } from "./test-env";

// Runs once before the browser tests: migrates the test database and seeds the demo accounts.
// The seed is idempotent. Sessions from earlier runs are harmless: each test logs in itself.
export default function globalSetup() {
  const env = { ...process.env, ...loadTestEnv() };
  const cwd = join(__dirname, "..", "server");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "inherit" });
  // Test database only (the name is checked by loadTestEnv). Every run starts from the same
  // slots: the journey's own slot from an earlier run would overlap (BR-04). Cascades to Booking.
  const sql = (input: string) => execSync("npx prisma db execute --stdin", { cwd, env, input, stdio: ["pipe", "inherit", "inherit"] });
  sql('TRUNCATE TABLE "Slot" RESTART IDENTITY CASCADE;');
  execSync("npx prisma db seed", { cwd, env, stdio: "inherit" });
  // The journey books as Student One and Student Two, so no student may already hold one
  // (BR-07). Clear the seed's demo bookings.
  sql('DELETE FROM "Booking";');
}
