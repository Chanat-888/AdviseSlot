import { execSync } from "node:child_process";
import { join } from "node:path";
import { loadTestEnv } from "./test-env";

// Runs once before the browser tests: migrates the test database and seeds the demo accounts.
// The seed is idempotent. Sessions from earlier runs are harmless: each test logs in itself.
export default function globalSetup() {
  const env = { ...process.env, ...loadTestEnv() };
  const cwd = join(__dirname, "..", "server");
  execSync("npx prisma migrate deploy", { cwd, env, stdio: "inherit" });
  // Reset bookings and slots first (test database only, the name is checked by loadTestEnv),
  // then seed, so the test database ends up like dev: the demo slots and the demo bookings of
  // Student Two and Three stay, Student One has none (BR-07) and no slot of an earlier run is left.
  execSync("npx prisma db execute --stdin", {
    cwd,
    env,
    input: 'DELETE FROM "Booking"; DELETE FROM "Slot";',
    stdio: ["pipe", "inherit", "inherit"],
  });
  execSync("npx prisma db seed", { cwd, env, stdio: "inherit" });
}
