// Marketplace links and sign-in return paths on a built app (LOCAL ONLY).
// The fake Supabase has no active jobs, freight or for-sale listings, so
// those sections are hidden and must not be offered.
import { expect, test } from "@playwright/test";

test("logged-out service request keeps the fencing category through sign-in", async ({ request }) => {
  const res = await request.get("/post/service/request?category=fencing-contractor", { maxRedirects: 0 });
  expect([303, 307, 308]).toContain(res.status());
  const loc = res.headers()["location"] ?? "";
  const next = new URL(loc, "http://localhost").searchParams.get("next");
  expect(next).toBe("/post/service/request?category=fencing-contractor");
});

test("sign-in refuses an off-site next", async ({ page }) => {
  await page.goto("/signin?next=//evil.example");
  const signup = page.locator('a[href^="/signup?next="]').first();
  await expect(signup).toHaveAttribute("href", "/signup?next=%2Fdashboard");
});

test("404 offers only sections that have listings", async ({ page }) => {
  const res = await page.goto("/no-such-page-here");
  expect(res?.status()).toBe(404);
  const main = page.locator("main");
  await expect(main.getByRole("link", { name: "Services" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Jobs" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Freight" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "For sale" })).toHaveCount(0);
});

test("home sends empty sections to posting, not an empty browse page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href="/jobs"]')).toHaveCount(0);
  await expect(page.locator('a[href="/freight"]')).toHaveCount(0);
  await expect(page.locator('a[href="/post/job"]').first()).toBeVisible();
  await expect(page.getByText("Free with an account, takes 3 minutes.")).toBeVisible();
});

test("post hub says posting needs an account and quotes don't", async ({ page }) => {
  await page.goto("/post");
  await expect(page.getByText("Posting needs a free account. Asking a listed business for a quote doesn't.")).toBeVisible();
  await expect(page.getByText("Sign in to post")).toBeVisible();
});
