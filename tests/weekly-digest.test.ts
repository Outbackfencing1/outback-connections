import { describe, expect, it } from "vitest";
import { formatWeeklyDigest, type DigestData } from "@/lib/weekly-digest";

const week = (over: Partial<DigestData["thisWeek"] & object> = {}) => ({
  week_start: "2026-09-07",
  human_searches: 30,
  human_sessions: 40,
  listing_views: 120,
  contact_reveals: 9,
  source_clicks: 12,
  enquiries: 4,
  claims: 1,
  first_party_posts: 0,
  signups: 3,
  directory_adds: 5,
  ...over,
});

const base: DigestData = {
  generatedAt: "2026-09-07T21:00:00.000Z",
  gate: {
    target_searches_per_week: 25,
    target_claims_30d: 5,
    target_first_party_posts_30d: 10,
    human_searches_7d: 30,
    claims_30d: 1,
    first_party_posts_30d: 0,
    enquiries_30d: 6,
    bot_share_30d_pct: 40,
  },
  thisWeek: week(),
  lastWeek: week({ human_sessions: 25, enquiries: 1 }),
  enquiries: { last7d: 4, open: 2, waitingOver48h: 1, answered30d: 3, responded30d: 2 },
  directory: { active: 53, unclaimed: 57, claimed: 1, expiring14d: 0, pendingClaims: 2 },
  gaps: [{ region_name: "Dubbo", state: "NSW", category: "fencing-contractor", demand: 3 }],
  baseUrl: "https://www.outbackconnections.com.au",
};

describe("formatWeeklyDigest", () => {
  it("leads with the gate, marks what's met, and calls out waiting enquiries", () => {
    const { subject, text } = formatWeeklyDigest(base);
    expect(subject).toBe("Connections week: 4 quote requests, 40 people, 2 claims waiting");
    expect(text).toContain("TRACTION GATE (not yet)");
    expect(text).toContain("OK Human searches, last 7 days: 30 (target 25)");
    expect(text).toContain("-- Claims, last 30 days: 1 (target 5)");
    expect(text).toContain("People (distinct daily visitors): 40, up 15 on last week");
    expect(text).toContain("Quote requests: 4, up 3 on last week");
    expect(text).toContain("1 waiting more than 48 hours: forward these today");
    expect(text).toContain("of whom 2 were called back");
    expect(text).toContain("fencing-contractor near Dubbo, NSW: 3");
    expect(text).toContain("Claims waiting for approval: 2");
  });

  it("copes with no history and no gaps", () => {
    const { text } = formatWeeklyDigest({ ...base, thisWeek: null, lastWeek: null, gaps: [], enquiries: { ...base.enquiries, answered30d: 0 } });
    expect(text).not.toContain("LAST 7 DAYS");
    expect(text).not.toContain("ASKED FOR");
    expect(text).not.toContain("answered the follow-up");
  });
});
