// The built contractor outreach page with fake people (LOCAL ONLY, fixture
// data). Exercises the real React server/client boundary: before the status
// list moved to lib/outreach-statuses.ts, a signed-in staff member got a 500.
// Run: see README.md in this folder.
import { expect, test } from "@playwright/test";
// @ts-expect-error plain .mjs helper
import { sessionCookie } from "./server.mjs";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54421";
const PATH = "/dashboard/admin/contractor-outreach";

test("logged out goes to sign-in, keeping the return path", async ({ page }) => {
  await page.goto(PATH);
  await expect(page).toHaveURL(/\/signin\?next=(%2F|\/)dashboard(%2F|\/)admin(%2F|\/)contractor-outreach/);
});

test("an ordinary member sees the admins-only notice, no prospect data", async ({ page }) => {
  await page.context().addCookies([{ ...sessionCookie("member", SUPABASE), domain: "localhost", path: "/" }]);
  const res = await page.goto(PATH);
  expect(res?.status()).toBe(200);
  await expect(page.getByText("Admins only")).toBeVisible();
  await expect(page.getByText("Fixture Fencing Co")).toHaveCount(0);
});

for (const persona of ["staff", "admin"] as const) {
  test(`${persona} gets the page with statuses rendered`, async ({ page }) => {
    await page.context().addCookies([{ ...sessionCookie(persona, SUPABASE), domain: "localhost", path: "/" }]);
    const res = await page.goto(`${PATH}?status=follow_up`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Contractor outreach" }).first()).toBeVisible();
    await expect(page.getByText("Fixture Fencing Co").first()).toBeVisible();
    // Labels come from the shared list on both sides of the boundary.
    await expect(page.locator(`text="Follow up" >> visible=true`).first()).toBeVisible();
    await expect(page.locator("option", { hasText: "Follow up" }).first()).toBeAttached();
    await expect(page.locator("option", { hasText: "Do not contact" }).first()).toBeAttached();
  });
}
