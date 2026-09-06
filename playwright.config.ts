import { defineConfig, devices } from "@playwright/test";

// Read-only smoke tests against a deployed URL. No local server: set
// SMOKE_BASE_URL to a preview/production URL (defaults to production).
// Nothing in these tests submits a form or signs in.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.SMOKE_BASE_URL || "https://www.outbackconnections.com.au",
    userAgent: "OutbackConnectionsSmoke/1.0 (+https://www.outbackconnections.com.au) HeadlessChrome",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
