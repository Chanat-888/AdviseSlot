import { execSync } from "node:child_process";

// Runs once before all tests: brings the test database up to the latest migration.
export default function setup() {
  const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/").pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${dbName}": the test database name must end in _test.`);
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
