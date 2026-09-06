import { defineConfig, devices } from "@playwright/test";

// Read-only smoke tests against a deployed URL. No local server: set
// SMOKE_BASE_URL to a preview/production URL (defaults to production).
// Nothing in these tests submits a form or signs in.
//
// Preview deployments sit behind Vercel Authentication. Two ways through:
// - VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment
//   Protection → Protection Bypass for Automation), used by the GitHub
//   smoke workflow via the secret of the same name.
// - SMOKE_COOKIE (e.g. "_vercel_jwt=…" from a share link) for a one-off
//   local run. It goes into the browser's cookie jar, not a header, so it
//   survives the app's own redirects (a header is dropped on redirect follow).
const baseURL = process.env.SMOKE_BASE_URL || "https://www.outbackconnections.com.au";
const extraHTTPHeaders: Record<string, string> = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
  extraHTTPHeaders["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  extraHTTPHeaders["x-vercel-set-bypass-cookie"] = "true";
}
const cookies = (process.env.SMOKE_COOKIE ?? "")
  .split(";")
  .map((c) => c.trim())
  .filter((c) => c.includes("="))
  .map((c) => {
    const i = c.indexOf("=");
    return {
      name: c.slice(0, i),
      value: c.slice(i + 1),
      domain: new URL(baseURL).hostname,
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    };
  });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    userAgent: "OutbackConnectionsSmoke/1.0 (+https://www.outbackconnections.com.au) HeadlessChrome",
    trace: "retain-on-failure",
    extraHTTPHeaders,
    storageState: { cookies, origins: [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
