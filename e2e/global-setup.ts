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
}
