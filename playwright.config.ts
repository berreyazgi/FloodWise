import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1, // tests share one SQLite database
  use: { baseURL: `http://localhost:${PORT}`, locale: "tr-TR", channel: process.env.PW_CHANNEL ?? "chrome" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile/ },
  ],
  webServer: { command: `npx next dev -p ${PORT}`, url: `http://localhost:${PORT}/api/meta`, reuseExistingServer: true, timeout: 120_000 },
});
