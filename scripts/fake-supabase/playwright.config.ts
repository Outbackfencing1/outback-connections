// LOCAL ONLY: checks built pages against scripts/fake-supabase/server.mjs.
// Recordings are off.
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.LOCAL_APP_URL ?? "http://localhost:3300",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
});
