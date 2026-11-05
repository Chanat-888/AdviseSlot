import { execSync } from "node:child_process";
import { join } from "node:path";
import { loadTestEnv } from "./test-env";

// Runs once before the browser tests: migrates the test database and seeds the demo accounts.
// The seed is idempotent. Sessions from earlier runs are harmless: each test logs in itself.
export default function globalSetup() {
  const env = { ...process.env, ...loadTestEnv() };
  const cwd = join(__dirname, "..", "server");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "inherit" });
  execSync("npx prisma db seed", { cwd, env, stdio: "inherit" });
  // The journey books a slot as Student One. Clear the bookings (test database only, the name
  // is checked by loadTestEnv) so a second run starts free of BR-07; the seed above re-adds
  // its demo bookings on the next run only for students without one.
  execSync("npx prisma db execute --stdin", { cwd, env, input: 'DELETE FROM "Booking";', stdio: ["pipe", "inherit", "inherit"] });
}
