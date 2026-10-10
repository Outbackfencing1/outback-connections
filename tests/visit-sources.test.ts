import { describe, expect, it } from "vitest";
import {
  buildVisitPayload,
  cleanTag,
  landingSection,
  parseVisitPayload,
  referrerHost,
} from "@/lib/visit-sources";

const SITE = "https://www.outbackconnections.com.au";
const HOST = "www.outbackconnections.com.au";

describe("buildVisitPayload (browser side)", () => {
  it("records the referring site's host and the utm tags on a landing page", () => {
    expect(
      buildVisitPayload({
        href: `${SITE}/services/fencing-contractor/dubbo?utm_source=Facebook&utm_medium=jess_organic&utm_campaign=Spring%20push&fbclid=abc123`,
        referrer: "https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.outbackconnections.com.au%2F&h=AT0secret",
        privacySignal: false,
      })
    ).toEqual({
      entry: true,
      landing: "/services",
      referrer: "l.facebook.com",
      utm_source: "facebook",
      utm_medium: "jess_organic",
      utm_campaign: "spring push",
    });
  });

  it("keeps only the host of a search engine referrer, never the path or query", () => {
    const p = buildVisitPayload({
      href: `${SITE}/services`,
      referrer: "https://www.google.com.au/search?q=fencing+contractor+orange+0412+345+678",
      privacySignal: false,
    });
    expect(p).toEqual({ entry: true, landing: "/services", referrer: "google.com.au" });
    expect(JSON.stringify(p)).not.toContain("q=");
  });

  it("marks a typed-in or bookmarked visit as an entry with no referrer", () => {
    expect(buildVisitPayload({ href: `${SITE}/`, referrer: "", privacySignal: false })).toEqual({
      entry: true,
      landing: "/",
    });
  });

  it("sends nothing about sources for a page reached from our own pages", () => {
    expect(
      buildVisitPayload({ href: `${SITE}/services/listing/abc`, referrer: `${SITE}/services`, privacySignal: false })
    ).toEqual({});
    // www and bare host are the same site
    expect(
      buildVisitPayload({ href: `${SITE}/services`, referrer: "https://outbackconnections.com.au/", privacySignal: false })
    ).toEqual({});
  });

  it("sends nothing about sources when the browser asks not to be tracked", () => {
    expect(
      buildVisitPayload({ href: `${SITE}/?utm_source=facebook`, referrer: "https://www.google.com/", privacySignal: true })
    ).toEqual({});
  });

  it("never puts a token-bearing path into the payload", () => {
    const p = buildVisitPayload({ href: `${SITE}/claim/9f3c2a7e-secret-token`, referrer: "", privacySignal: false });
    expect(p).toEqual({ entry: true, landing: "/claim" });
  });
});

describe("parseVisitPayload (server side)", () => {
  it("accepts a clean entry payload", () => {
    const raw = JSON.stringify({ entry: true, landing: "/services", referrer: "google.com", utm_source: "google" });
    expect(parseVisitPayload(raw, HOST)).toEqual({
      entry: true,
      landing: "/services",
      referrer: "google.com",
      utm_source: "google",
    });
  });

  it("drops unknown keys and re-cleans every value", () => {
    const raw = JSON.stringify({
      entry: true,
      landing: "/services/listing/some-slug?x=1",
      referrer: "Evil.Example.com/path?email=a@b.com",
      utm_source: "<script>alert(1)</script>",
      utm_medium: "farmer@example.com",
      utm_campaign: "call 0412 345 678",
      email: "a@b.com",
      ip: "1.2.3.4",
    });
    expect(parseVisitPayload(raw, HOST)).toEqual({
      entry: true,
      landing: "/services",
      referrer: "evil.example.com",
      utm_source: "scriptalert1script",
    });
  });

  it("ignores our own host as a referrer", () => {
    const raw = JSON.stringify({ entry: true, landing: "/", referrer: "outbackconnections.com.au" });
    expect(parseVisitPayload(raw, HOST)).toEqual({ entry: true, landing: "/" });
  });

  it("returns {} for a plain ping, junk, or anything oversized", () => {
    expect(parseVisitPayload("{}", HOST)).toEqual({});
    expect(parseVisitPayload("", HOST)).toEqual({});
    expect(parseVisitPayload("not json", HOST)).toEqual({});
    expect(parseVisitPayload(JSON.stringify({ entry: "yes", referrer: "google.com" }), HOST)).toEqual({});
    expect(parseVisitPayload(JSON.stringify({ entry: true, pad: "x".repeat(3000) }), HOST)).toEqual({});
  });
});

describe("helpers", () => {
  it("referrerHost handles app referrers and junk", () => {
    expect(referrerHost("android-app://com.google.android.gm/", HOST)).toBe("com.google.android.gm");
    expect(referrerHost("not a url", HOST)).toBeNull();
    expect(referrerHost("https://localhost/", HOST)).toBeNull();
    expect(referrerHost(null, HOST)).toBeNull();
  });

  it("cleanTag lower-cases, strips odd characters and caps length", () => {
    expect(cleanTag("  Jess_Organic  ")).toBe("jess_organic");
    expect(cleanTag("a".repeat(100))).toBe("a".repeat(64));
    expect(cleanTag(42)).toBeNull();
    expect(cleanTag("!!!")).toBeNull();
  });

  it("landingSection keeps the first path segment only", () => {
    expect(landingSection("/services/fencing-contractor/dubbo")).toBe("/services");
    expect(landingSection("/")).toBe("/");
    expect(landingSection("/Weird Path")).toBe("/");
  });
});
