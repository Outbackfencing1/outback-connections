// The delivery checklists quote prices and GST totals in prose. Keep them in
// step with the decided offer and the database's GST rule (exclusive: +10%).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OFFERS } from "@/lib/digital-services/offer";

const doc = readFileSync("docs/digital-services/DELIVERY-CHECKLISTS.md", "utf8");
const money = (cents: number) => `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const priceCents = (key: string) => Math.round(Number(OFFERS.find((o) => o.key === key)!.price.replace(/[^0-9.]/g, "")) * 100);

describe("delivery checklists", () => {
  it("state the decided prices with GST added (exclusive) and the website deposit at half", () => {
    const website = priceCents("website");
    const form = priceCents("quote_form");
    const care = priceCents("care");
    expect([website, form, care]).toEqual([199000, 49000, 14900]);
    const gst = (c: number) => Math.round(c * 0.1);
    for (const c of [website, form, care]) {
      expect(doc).toContain(money(c));
      expect(doc).toContain(money(gst(c)));
      expect(doc).toContain(money(c + gst(c)));
    }
    const deposit = website / 2;
    expect(doc).toContain(`Deposit ${money(deposit + gst(deposit))} (${money(deposit)} + GST)`);
    expect(doc).toContain(`balance ${money(website + gst(website) - (deposit + gst(deposit)))}`);
  });
  it("names no prospect and promises nothing untested", () => {
    expect(doc).not.toMatch(/\bOC-\d{3}\b/);
    expect(doc).toMatch(/Don't say the customer will price jobs from the first message/);
    expect(doc).toMatch(/Nothing is imported/);
  });
});
