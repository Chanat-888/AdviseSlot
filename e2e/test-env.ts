import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The E2E run always uses the test database from server/.env.test, never the one in
// server/.env. Same rule as server/vitest.config.ts: the database name must end in _test.
export function loadTestEnv(): NodeJS.ProcessEnv {
  const file = join(__dirname, "..", "server", ".env.test");
  if (!existsSync(file)) {
    throw new Error("Missing server/.env.test. Copy it from .env.test.example (see README).");
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  const dbName = new URL(env.DATABASE_URL ?? "postgresql://x/").pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run E2E against "${dbName}": the test database name must end in _test.`);
  }
  return env;
}

/** The demo account password from server/.env.test (SEED_DEMO_PASSWORD), the one the seed used. */
export function demoPassword(): string {
  const password = loadTestEnv().SEED_DEMO_PASSWORD;
  if (!password) throw new Error("SEED_DEMO_PASSWORD is missing in server/.env.test (see .env.test.example).");
  return password;
}
