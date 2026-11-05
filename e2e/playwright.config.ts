import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./test-env";

// Ports differ from the dev servers (3000, 5173) so a running `npm run dev` is never reused.
const API_PORT = 3100;
const WEB_PORT = 5273;
const API_URL = `http://localhost:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

const testEnv = loadTestEnv();

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      cwd: "../server",
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...testEnv, PORT: String(API_PORT), CLIENT_ORIGIN: WEB_URL } as Record<string, string>,
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: "../client",
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
