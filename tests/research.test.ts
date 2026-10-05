// Model-produced research is validated and reconciled, never imported.
import { describe, expect, it } from "vitest";
import { canonicalDomain, normName, phoneDigits, reviewResearchBatch, validAbn, validateCandidate } from "@/lib/digital-services/research";

const TODAY = "2026-10-05";
const ok = (over: Record<string, unknown> = {}) => ({
  business_name: "Fixture Cleaning Pty Ltd",
  category: "cleaning",
  website: "https://www.fixture-clean.example/",
  locality: "Orange",
  state: "NSW",
  phone: "+61 2 6300 0000",
  public_email: "office@fixture-clean.example",
  evidence: [
    { claim: "Commercial cleaning in Orange", url: "https://fixture-clean.example/services", observed_on: "2026-10-04" },
    { claim: "Publishes office@fixture-clean.example on its contact page", url: "https://fixture-clean.example/contact", observed_on: "2026-10-04" },
  ],
  ...over,
});

describe("identity keys", () => {
  it("normalises domains, names and phones", () => {
    expect(canonicalDomain("https://WWW.Fixture.example/path")).toBe("fixture.example");
    expect(canonicalDomain("fixture.example")).toBe("fixture.example");
    expect(normName("The Fixture Cleaning Services Pty Ltd")).toBe(normName("fixture cleaning"));
    expect(phoneDigits("+61 2 6300 0000")).toBe("0263000000");
    expect(phoneDigits("123")).toBeNull();
  });
  it("checks ABNs with the ATO checksum", () => {
    expect(validAbn("76 674 671 820")).toBe(true);
    expect(validAbn("76 674 671 821")).toBe(false);
  });
});

describe("validateCandidate", () => {
  it("accepts a well-evidenced candidate", () => {
    expect(validateCandidate(ok(), TODAY).errors).toEqual([]);
  });
  it("needs evidence from the business's own site, and for any email it lists", () => {
    expect(validateCandidate(ok({ evidence: [{ claim: "x", url: "https://directory.example/fixture", observed_on: "2026-10-04" }] }), TODAY).errors).toEqual(
      expect.arrayContaining(["no evidence from the business's own website", "public_email has no evidence entry showing where the business publishes it"])
    );
    expect(validateCandidate(ok({ evidence: [] }), TODAY).errors).toContain("evidence: at least one public source is required");
  });
  it("refuses future observations, bad ABNs, non-https sites and unknown categories", () => {
    const e = validateCandidate(
      ok({ abn: "11 111 111 111", website: "http://fixture.example", category: "plumbing", evidence: [{ claim: "c", url: "https://x.example", observed_on: "2026-12-01" }] }),
      TODAY
    ).errors;
    expect(e).toEqual(expect.arrayContaining(["abn fails the checksum", "website must be an https URL", "category must be cleaning or detailing", "evidence[0]: observed_on must be a past date"]));
  });
});

describe("reviewResearchBatch", () => {
  it("reconciles against known companies and within the batch, keeps lanes separate, and imports nothing", () => {
    const batch = {
      candidates: [
        ok(),
        ok({ business_name: "Another Name", website: "https://fixture-clean.example", public_email: null }),
        ok({ business_name: "Known By Phone", website: "https://other.example", public_email: null, phone: "02 6300 1111", evidence: [{ claim: "c", url: "https://other.example", observed_on: "2026-10-01" }] }),
        ok({ business_name: "Fixture Detailing", category: "detailing" }),
        ok({ business_name: "Twin", website: "https://twin.example", public_email: null, phone: null, evidence: [{ claim: "c", url: "https://twin.example", observed_on: "2026-10-01" }] }),
        ok({ business_name: "Twin Again", website: "https://www.twin.example/", public_email: null, phone: null, evidence: [{ claim: "c", url: "https://twin.example", observed_on: "2026-10-01" }] }),
        { business_name: "Broken" },
      ],
    };
    const known = [{ id: "OC-777", business_name: "Something Else", phone: "(02) 6300 1111" }];
    const { verdicts, summary } = reviewResearchBatch(batch, "cleaning", known, TODAY);
    expect(verdicts.map((v) => v.status)).toEqual([
      "new_for_review",
      "duplicate_in_batch",
      "matches_existing",
      "wrong_lane",
      "new_for_review",
      "duplicate_in_batch",
      "invalid",
    ]);
    expect(verdicts[2]).toMatchObject({ existing_id: "OC-777", by: "phone" });
    expect(verdicts[1]).toMatchObject({ same_as: 0, by: "domain" });
    expect(summary).toEqual({ invalid: 1, wrong_lane: 1, matches_existing: 1, duplicate_in_batch: 2, new_for_review: 2 });
  });
  it("rejects a file that isn't a list of candidates", () => {
    expect(reviewResearchBatch({ foo: 1 }, "cleaning", [], TODAY).summary.invalid).toBe(1);
  });
});
