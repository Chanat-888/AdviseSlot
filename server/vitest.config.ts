import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Tests always run against the test database from .env.test, never the one in .env.
if (!existsSync(".env.test")) {
  throw new Error("Missing server/.env.test. Copy it from .env.test.example (see README).");
}
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  test: {
    globalSetup: ["tests/global-setup.ts"],
  },
});
