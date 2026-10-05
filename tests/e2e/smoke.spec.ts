import { expect, test } from "@playwright/test";

// Read-only smoke: the farmer's path and the honesty rules, on a real deploy.
// Never submits a form, never signs in, never writes. Safe to run against
// production. The user agent contains "HeadlessChrome" so analytics flags it
// as a crawler and it doesn't pollute the traction numbers.
//
// Data-dependent checks skip rather than fail when the directory is empty on
// the target (previews may point at an empty branch database).

test("home: the fencing door is open", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const nav = page.locator("header");
  await expect(nav.getByRole("link", { name: "Services" }).first()).toBeVisible();
  const finder = page.getByRole("heading", { name: /need a fencing contractor/i });
  if (await finder.isVisible()) {
    await expect(page.getByRole("button", { name: /find contractors/i })).toBeVisible();
  }
});

test("contractor directory: category page, region chips, listing detail with the quote door", async ({ page }) => {
  await page.goto("/services/fencing-contractor");
  await expect(page.getByRole("heading", { level: 1, name: /fencing contractor/i })).toBeVisible();

  const cards = page.locator("a[href^='/services/listing/']");
  if ((await cards.count()) === 0) test.skip(true, "no contractors on this deploy");

  const regionNav = page.getByRole("navigation", { name: /browse by region/i });
  if (await regionNav.isVisible()) {
    const href = await regionNav.getByRole("link").first().getAttribute("href");
    expect(href).toMatch(/^\/services\/fencing-contractor\/[a-z0-9-]+$/);
  }

  await cards.first().click();
  await expect(page).toHaveURL(/\/services\/listing\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const quote = page.locator("summary", { hasText: /get a quote/i });
  await expect(quote).toBeVisible();
  // Without JavaScript the form must POST, so nothing typed lands in a URL.
  const form = page.locator("form:has(input[name='listing_id'])");
  await expect(form).toHaveAttribute("method", /post/i);
  await expect(form).toHaveAttribute("action", "/api/enquiries");
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

test("public pages are honest when empty, and unknown slugs 404", async ({ page }) => {
  for (const path of ["/jobs", "/freight", "/sale", "/services", "/enquiries/thanks?o=invalid"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const body = await page.textContent("body");
    expect(body ?? "", path).not.toMatch(/application error|internal server error/i);
  }
  for (const path of ["/sale/no-such-listing-0000", "/services/listing/no-such-listing-0000", "/services/fencing-contractor/nowhere-xx"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("guarded pages bounce anonymous visitors to sign-in", async ({ page }) => {
  for (const path of [
    "/dashboard/admin/enquiries",
    "/dashboard/admin/contractor-outreach",
    "/dashboard/admin/demand",
    "/dashboard/admin/sales-upload",
    "/dashboard/directory/add",
    "/post/sale",
    "/post/service/request",
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
  expect(await sitemap.text()).toContain("/services");
});

test("a migrated contractor URL redirects instead of 404", async ({ request }) => {
  // Set SMOKE_LEGACY_SLUG to an old slug that carries canonical_listing_id;
  // production's is the Boundary Builders row migrated on 6 Sep 2026.
  const slug = process.env.SMOKE_LEGACY_SLUG ?? (process.env.SMOKE_BASE_URL ? "" : "boundary-builders-farm-fencing-2820-LST-QVBYD9EJ");
  if (!slug) test.skip(true, "no legacy slug for this target");
  const res = await request.get(`/services/listing/${slug}`, { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"] ?? "").toMatch(/\/services\/listing\//);
});
