// Browse cards at phone and desktop widths with the app's real CSS (LOCAL
// ONLY, fixture listings from server.mjs). Records page and card scroll
// widths; a card or page wider than the viewport fails.
import { expect, test } from "@playwright/test";

const SHOTS = process.env.CARD_SHOTS_DIR;

for (const width of [320, 390, 1280]) {
  test(`listing cards fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const res = await page.goto("/services/fencing-contractor");
    expect(res?.status()).toBe(200);
    const cards = page.locator('a[href^="/services/listing/fixture-"]');
    await expect(cards).toHaveCount(5);
    const m = await page.evaluate(() => {
      const doc = document.documentElement;
      const cards = [...document.querySelectorAll<HTMLElement>('a[href^="/services/listing/fixture-"]')].map((a) => {
        const r = a.getBoundingClientRect();
        const kids = [...a.querySelectorAll<HTMLElement>("*")].map((k) => k.getBoundingClientRect().right);
        return { scroll: a.scrollWidth, client: a.clientWidth, right: Math.round(r.right), maxChildRight: Math.round(Math.max(...kids)) };
      });
      return { viewport: window.innerWidth, pageScroll: doc.scrollWidth, pageClient: doc.clientWidth, cards };
    });
    console.log(`[cards] ${width}px ${JSON.stringify(m)}`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cards-${width}.png`, fullPage: true });
    expect(m.pageScroll, "page scrolls sideways").toBeLessThanOrEqual(m.pageClient);
    for (const c of m.cards) {
      expect(c.scroll, "card content wider than the card").toBeLessThanOrEqual(c.client);
      expect(c.maxChildRight, "card content past the viewport").toBeLessThanOrEqual(m.viewport);
    }
  });
}
