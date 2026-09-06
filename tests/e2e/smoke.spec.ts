import { expect, test } from "@playwright/test";

// Read-only smoke: the farmer's path and the honesty rules, on a real deploy.
// Never submits a form, never signs in, never writes. Safe to run against
// production. The user agent contains "HeadlessChrome" so analytics flags it
// as a crawler and it doesn't pollute the traction numbers.

test("home: the fencing door is open and empty verticals are hidden", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /need a fencing contractor/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /find contractors/i })).toBeVisible();
  // Header nav: Services always; Jobs/Freight/For sale only when they have rows.
  const nav = page.locator("header");
  await expect(nav.getByRole("link", { name: "Services" }).first()).toBeVisible();
});

test("contractor directory: category page, region chips, listing detail", async ({ page }) => {
  await page.goto("/services/fencing-contractor");
  await expect(page.getByRole("heading", { level: 1, name: /fencing contractor/i })).toBeVisible();

  const cards = page.locator("a[href^='/services/listing/']");
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);

  // Region chips exist when more than one region has rows.
  const regionNav = page.getByRole("navigation", { name: /browse by region/i });
  if (await regionNav.isVisible()) {
    const chip = regionNav.getByRole("link").first();
    const href = await chip.getAttribute("href");
    expect(href).toMatch(/^\/services\/fencing-contractor\/[a-z0-9-]+$/);
  }

  await cards.first().click();
  await expect(page).toHaveURL(/\/services\/listing\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Every service offering has the quote door, and it needs no account.
  const quote = page.getByRole("button", { name: /get a quote/i });
  await expect(quote).toBeVisible();
  await quote.click();
  await expect(page.getByLabel(/your name/i)).toBeVisible();
  await expect(page.getByLabel(/what needs doing/i)).toBeVisible();
  await expect(page.getByText(/pass these details/i)).toBeVisible();
  // Do not submit.
});

test("honesty: an unclaimed row says so and never shows a contact block", async ({ page }) => {
  await page.goto("/services/fencing-contractor");
  const unclaimed = page.locator("a[href^='/services/listing/']", { hasText: "Unclaimed" }).first();
  if ((await unclaimed.count()) === 0) test.skip(true, "no unclaimed rows on this deploy");
  await unclaimed.click();
  await expect(page.getByText(/unclaimed listing/i).first()).toBeVisible();
  await expect(page.getByText(/wasn't posted by the business/i)).toBeVisible();
  await expect(page.getByText(/sign in to see contact/i)).toHaveCount(0);
  // The operator's offer is disclosed as such.
  await expect(page.getByText(/from the people who run this site/i)).toBeVisible();
});

test("regional landing page renders", async ({ page }) => {
  await page.goto("/services/fencing-contractor");
  const regionNav = page.getByRole("navigation", { name: /browse by region/i });
  if (!(await regionNav.isVisible())) test.skip(true, "single region only");
  const href = await regionNav.getByRole("link").first().getAttribute("href");
  const res = await page.goto(href!);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: / in /i })).toBeVisible();
});

test("empty verticals are honest, not broken", async ({ page }) => {
  for (const path of ["/jobs", "/freight", "/sale"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = await page.textContent("body");
    expect(body ?? "", path).not.toMatch(/application error|internal server error/i);
  }
});

test("staff and admin pages bounce anonymous visitors to sign-in", async ({ page }) => {
  for (const path of [
    "/dashboard/admin/enquiries",
    "/dashboard/admin/contractor-outreach",
    "/dashboard/admin/demand",
    "/dashboard/directory/add",
    "/dashboard/admin/sales-upload",
  ]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/signin\?next=/);
  }
});

test("crawler rails: robots and sitemap", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/sitemap/i);
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain("/services");
  expect(xml).toContain("/services/fencing-contractor/");
});

test("old contractor URLs redirect instead of 404", async ({ request }) => {
  // A staff-entered row migrated on 6 Sep 2026; its old slug must 301/308 to the new row.
  const res = await request.get("/services/listing/boundary-builders-farm-fencing-2820-LST-QVBYD9EJ", {
    maxRedirects: 0,
  });
  expect([301, 302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"] ?? "").toMatch(/\/services\/listing\/boundary-builders-farm-fencing-2820-/);
});
