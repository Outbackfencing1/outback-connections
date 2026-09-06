import { describe, expect, it } from "vitest";
import { csvToObjects, parseCsv } from "@/lib/csv";
import { isBotUserAgent } from "@/lib/bot-detect";
import { buildClaimInviteEmail } from "@/lib/claim-invite-email";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes, CRLF and a BOM", () => {
    const text = '﻿name,town\r\n"Kings Fencing & Gates","Appin, NSW"\n"Little""s Fencing",Bathurst\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ["name", "town"],
      ["Kings Fencing & Gates", "Appin, NSW"],
      ['Little"s Fencing', "Bathurst"],
    ]);
  });

  it("normalises headers to snake_case keys", () => {
    const rows = csvToObjects("Business Name,Post Code,Found On\nStorco,2800,Website\n");
    expect(rows).toEqual([{ business_name: "Storco", post_code: "2800", found_on: "Website" }]);
  });
});

describe("isBotUserAgent", () => {
  it("flags crawlers and missing agents, passes real browsers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("GPTBot/1.0")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);
  });
});

describe("buildClaimInviteEmail", () => {
  it("includes the claim link, the opt-out, disclosure and the reference", () => {
    const e = buildClaimInviteEmail({
      businessName: "Abatis Fencing",
      claimUrl: "https://www.outbackconnections.com.au/claim/abc",
      reference: "INV-ABC12345",
    });
    expect(e.subject).toContain("Abatis Fencing");
    expect(e.text).toContain("https://www.outbackconnections.com.au/claim/abc");
    expect(e.text).toContain('Reply "remove"');
    expect(e.text).toContain("Outback Fencing & Steel Supplies");
    expect(e.text).toContain("INV-ABC12345");
    expect(e.html).toContain('href="https://www.outbackconnections.com.au/claim/abc"');
    expect(e.html).not.toContain("<script");
  });
});
