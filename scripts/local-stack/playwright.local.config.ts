// LOCAL STACK ONLY: runs flow.spec.ts (and lifecycle.spec.ts under lifecycle.sh) against `next start` built with
// /var/tmp/oc-local-stack/app.env. Recordings are off: no traces, video or
// screenshots are captured by the runner (the spec saves one deliberate
// fixture-only screenshot of the owner queue).
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["flow.spec.ts", "lifecycle.spec.ts"],
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.LOCAL_APP_URL ?? "http://localhost:3200",
    trace: "off",
    video: "off",
    screenshot: "off",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : undefined,
  },
});
