// Model-produced research is validated and reconciled, never imported.
import { describe, expect, it } from "vitest";
import { canonicalDomain, loadIdentityList, normName, phoneDigits, reviewResearchBatch, validAbn, validateCandidate } from "@/lib/digital-services/research";

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
  it("parses URLs: a bare scheme or a hostless value is not a website or a source", () => {
    expect(validateCandidate(ok({ website: "https://", public_email: null }), TODAY).errors).toContain("website must be an https URL with a hostname");
    const e = validateCandidate(ok({ website: null, public_email: null, evidence: [{ claim: "c", url: "https://", observed_on: "2026-10-01" }] }), TODAY).errors;
    expect(e).toContain("evidence[0]: claim and an https url with a hostname are required");
    expect(validateCandidate(ok({ website: "https://localhost", public_email: null }), TODAY).errors).toContain("website must be an https URL with a hostname");
  });
  it("refuses impossible calendar dates", () => {
    const e = validateCandidate(ok({ evidence: [{ claim: "c", url: "https://fixture-clean.example/x", observed_on: "2026-02-31" }] }), TODAY).errors;
    expect(e).toContain("evidence[0]: observed_on must be a real past date");
  });
  it("refuses future observations, bad ABNs, non-https sites and unknown categories", () => {
    const e = validateCandidate(
      ok({ abn: "11 111 111 111", website: "http://fixture.example", category: "plumbing", evidence: [{ claim: "c", url: "https://x.example", observed_on: "2026-12-01" }] }),
      TODAY
    ).errors;
    expect(e).toEqual(expect.arrayContaining(["abn fails the checksum", "website must be an https URL with a hostname", "category must be cleaning or detailing", "evidence[0]: observed_on must be a real past date"]));
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
    expect(summary).toMatchObject({ invalid: 1, wrong_lane: 1, matches_existing: 1, duplicate_in_batch: 2, new_for_review: 2 });
  });
  it("a file that isn't a list of candidates is an adapter gap, not a business rejection", () => {
    const r = reviewResearchBatch({ request: {}, results: [] }, "cleaning", [], TODAY);
    expect(r.adapter_gap).toEqual({ reason: "expected an array of candidates or { candidates: [...] }", keys_seen: ["request", "results"], rows: 0 });
    expect(r.verdicts).toEqual([]);
  });
  it("rows of a different contract (every row fails on shape) are an adapter gap, judging no business", () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ company: `Row ${i}`, status: "proposed_qualified", sources: [] }));
    const r = reviewResearchBatch(rows, "cleaning", [], TODAY);
    expect(r.adapter_gap).toMatchObject({ reason: "no row matches the expected candidate shape", keys_seen: ["company", "status", "sources"], rows: 23 });
    expect(r.summary.invalid).toBe(0);
    expect(r.verdicts).toEqual([]);
  });
  it("keeps the researcher's holds and exclusions as they came, never promoting them", () => {
    const r = reviewResearchBatch(
      [
        ok({ business_name: "Held Co", website: "https://held.example", public_email: null, phone: null, disposition: "hold", holds: ["service area not confirmed"], evidence: [{ claim: "c", url: "https://held.example", observed_on: "2026-10-01" }] }),
        ok({ business_name: "Out Co", website: "https://out.example", public_email: null, phone: null, disposition: "excluded", holds: ["franchise"], evidence: [{ claim: "c", url: "https://out.example", observed_on: "2026-10-01" }] }),
        ok({ business_name: "No Reason", website: "https://nr.example", public_email: null, phone: null, disposition: "hold", evidence: [{ claim: "c", url: "https://nr.example", observed_on: "2026-10-01" }] }),
      ],
      "cleaning",
      [],
      TODAY
    );
    expect(r.verdicts.map((v) => v.status)).toEqual(["research_hold", "research_excluded", "invalid"]);
    expect(r.verdicts[0]).toMatchObject({ holds: ["service area not confirmed"] });
  });
  it("an exclusions list removes matching rows before they're judged new", () => {
    const exclusions = loadIdentityList({ exclusions: [{ name: "Gone", domain: "fixture-clean.example" }] }, "exclusions");
    const r = reviewResearchBatch([ok()], "cleaning", [], TODAY, exclusions);
    expect(r.verdicts[0]).toMatchObject({ status: "excluded_by_list", by: "domain", exclusion_id: "exclusions#0" });
  });
});

describe("loadIdentityList", () => {
  it("accepts an array or an object holding one, and names what it found otherwise (never a crash)", () => {
    expect(loadIdentityList([{ id: "OC-002", business_name: "A", suburb: "Orange" }], "known")).toEqual([
      { id: "OC-002", business_name: "A", website: null, abn: null, phone: null, locality: "Orange" },
    ]);
    expect(loadIdentityList({ companies: [{ company_id: "OC-003", website: "https://b.example" }] }, "known")[0]).toMatchObject({ id: "OC-003", website: "https://b.example" });
    expect(() => loadIdentityList({ version: 1, generated_at: "x" }, "exclusions")).toThrow(/expected an array of companies .* found version, generated_at/);
    expect(() => loadIdentityList([{ note: "x" }], "known")).toThrow(/no usable identity/);
    // A name alone (object or bare string) can never match, so it's refused rather than silently ignored.
    expect(() => loadIdentityList([{ name: "Excluded Cleaning" }], "exclusions")).toThrow(/no usable identity/);
    expect(() => loadIdentityList(["Excluded Cleaning"], "exclusions")).toThrow(/no usable identity/);
    expect(() => loadIdentityList([{ name: "X", website: "not a url at all" }], "known")).toThrow(/public hostname/);
  });
  it("holds identity keys to the candidate rules, so every listed key can actually match", () => {
    expect(() => loadIdentityList([{ name: "X", domain: "localhost" }], "exclusions")).toThrow(/public hostname/);
    expect(() => loadIdentityList([{ name: "X", abn: "12345678901" }], "exclusions")).toThrow(/checksum/);
    expect(() => loadIdentityList([{ name: "X", phone: "12" }], "exclusions")).toThrow(/Australian number/);
    // A locality with no usable name (only stop words) can't match a candidate.
    expect(() => loadIdentityList([{ name: "Pty Ltd", locality: "Orange" }], "exclusions")).toThrow(/no usable identity/);
    expect(loadIdentityList([{ name: "X", abn: "51 824 753 556" }], "exclusions")[0].abn).toBe("51 824 753 556");
  });
});
