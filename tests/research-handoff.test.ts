// The explicit research handoff adapter (oc-research-handoff/0.1-proposed),
// exercised with synthetic identities only. Real research files stay private.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HANDOFF_CONTRACT,
  laneOf,
  loadExclusionSnapshot,
  loadPriorResearch,
  loadHandoffRequest,
  registrableDomain,
  reportDigest,
  reviewHandoff,
  sha256Hex,
  unsafeUrl,
  validateSchema,
  type HandoffContext,
} from "@/lib/digital-services/research-handoff";

const NOW = "2026-01-10T12:00:00+11:00";
const REQUEST_ID = "synthetic-request-01";

const exclusionsDoc = () => ({
  contract_id: "oc-research-exclusions/1",
  created_at: "2026-01-01T00:00:00+00:00",
  status: "dated_private_identity_snapshot_not_send_approval",
  identity_count: 3,
  identities: [
    identity("OC-901", "Alpha Test Cleaning", "alpha-test-cleaning.example", "cleaning", { cowork_reserved: true }),
    identity("OC-902", "Beta Test Detailing", "beta-test-detailing.example", "detailing"),
    {
      ...identity("OC-903", "Gamma Test Cleaners", "gamma-test.example", "cleaning", { research_held: true }),
      aliases: [
        { source: "outreach-engine", source_id: "OC-903", company_id: "OC-903" },
        { source: "primary-refresh-2026-01-02", source_id: "OC-777", company_id: "OC-903" },
      ],
    },
  ],
  cowork_reservations: [{ prospect_id: "OC-901", business: "Alpha Test Cleaning", segment: "cleaning", meaning: "reserved" }],
});
function identity(id: string, business: string, domain: string, segment: string, flags: Record<string, boolean> = {}) {
  return {
    prospect_id: id,
    business,
    identity_name: business.toLowerCase(),
    aliases: [{ source: "outreach-engine", source_id: id, company_id: id }],
    observed_name_variants: [business],
    owned_domain: domain,
    location: "Testville NSW",
    segment,
    country: "AU",
    local_snapshot_state: "qa_hold",
    suppressed: false,
    paused: false,
    bounced: false,
    contacted: false,
    research_held: false,
    cowork_reserved: false,
    reserved_cleaner_lane: false,
    ...flags,
  };
}

const exclusionsText = (doc: unknown = exclusionsDoc()) => `${JSON.stringify(doc, null, 2)}\r\n`;
const EXCLUSIONS = exclusionsText();
const EXCLUSIONS_SHA = sha256Hex(EXCLUSIONS);

const requestDoc = (over: Record<string, unknown> = {}) => ({
  contract_id: HANDOFF_CONTRACT,
  request_id: REQUEST_ID,
  exclusions_sha256: EXCLUSIONS_SHA,
  geography: { country: "AU", towns: ["Testville", "Sampleton"] },
  segment: "cleaning",
  excluded_segments: ["auto detailing", "car washing", "ambiguous mixed cleaning/detailing"],
  existing_refreshes: [{ prospect_id: "OC-901", business: "Alpha Test Cleaning", primary_url: "https://alpha-test-cleaning.example/", provisional_offer_fit: "website_1990" }],
  authority: { live_sending: false, spending: false, publishing: false, form_submissions: false, production_changes: false, database_write_access: false },
  ...over,
});

const schemaFile = resolve("tests/fixtures/research-handoff/schema.synthetic.json");
function schemaFor(requestId = REQUEST_ID, sha = EXCLUSIONS_SHA) {
  const s = JSON.parse(readFileSync(schemaFile, "utf8"));
  s.properties.request_id.const = requestId;
  s.properties.exclusions_sha256.const = sha;
  return s;
}

const ev = (url: string, over: Record<string, unknown> = {}) => ({
  source_url: url,
  checked_at: "2026-01-05T10:00:00+11:00",
  source_type: "primary_business_website",
  fact_text: "Synthetic fact.",
  exact_excerpts: ["synthetic excerpt"],
  limitations: ["Public-page reading only"],
  ...over,
});

function candidate(n: number, over: Record<string, unknown> = {}) {
  const key = `candidate-${String(n).padStart(3, "0")}`;
  const domain = `synthetic-${n}-cleaning.example`;
  return {
    candidate_key: key,
    existing_prospect_id: null,
    business: `Synthetic ${n} Cleaning`,
    locality: "Testville NSW",
    state: "NSW",
    country: "AU",
    category: "commercial and office cleaning",
    owned_domain: domain,
    primary_url: `https://${domain}/`,
    contact_page_url: `https://${domain}/contact`,
    disposition: "qualified_research",
    duplicate_of: [],
    cleaner_verified: true,
    australia_verified: true,
    offer_fit: "existing_site_form_490",
    proposal: "Synthetic proposal.",
    evidence: [ev(`https://${domain}/`)],
    observed_journey: "Synthetic journey.",
    actual_checks: ["Fetched homepage"],
    contact_basis_status: "not_established",
    contact_restrictions: ["Contact basis not established"],
    uncertainties: ["Form delivery untested"],
    identity_confidence: "high",
    fit_confidence: "medium",
    sendable: false,
    ...over,
  };
}
const hold = (n: number, over: Record<string, unknown> = {}) =>
  candidate(n, { disposition: "research_hold", cleaner_verified: false, offer_fit: "no_clear_fit", identity_confidence: "low", fit_confidence: "unknown", ...over });

function refresh(over: Record<string, unknown> = {}) {
  return {
    prospect_id: "OC-901",
    business: "Alpha Test Cleaning",
    status: "refreshed",
    primary_url: "https://alpha-test-cleaning.example/",
    evidence: [ev("https://alpha-test-cleaning.example/quote")],
    observed_journey: "Synthetic.",
    proposed_offer_fit: "website_1990",
    proposal: "Synthetic.",
    actual_checks: ["Fetched quote page"],
    contact_basis_status: "not_established",
    limitations: ["Reservation unchanged"],
    sendable: false,
    ...over,
  };
}

function output(candidates: unknown[], over: Record<string, unknown> = {}) {
  const count = (d: string) => candidates.filter((c) => (c as { disposition?: string }).disposition === d).length;
  return {
    contract_id: HANDOFF_CONTRACT,
    request_id: REQUEST_ID,
    exclusions_sha256: EXCLUSIONS_SHA,
    actual_model: "synthetic-model",
    started_at: "2026-01-05T09:00:00+11:00",
    finished_at: "2026-01-05T11:00:00+11:00",
    status: "completed",
    candidates,
    existing_refreshes: [refresh()],
    receipt: {
      fresh_qualified_count: count("qualified_research"),
      fresh_held_count: count("research_hold"),
      duplicate_count: count("duplicate_existing"),
      excluded_count: count("excluded"),
      fresh_candidates_inspected: candidates.length,
      primary_page_inspections: candidates.length,
      elapsed_seconds: 60,
      stop_reason: "synthetic",
      usage: null,
      usage_exposure: "not_exposed",
      outbound_sends: 0,
      form_submissions: 0,
      purchases: 0,
      paid_api_activations: 0,
      blocking_dependencies: [],
      coverage_limitations: [],
    },
    ...over,
  };
}

const ctx = (over: Partial<HandoffContext> = {}): HandoffContext => ({
  request: loadHandoffRequest(requestDoc()),
  schema: schemaFor(),
  exclusions: loadExclusionSnapshot(EXCLUSIONS, EXCLUSIONS_SHA),
  now: NOW,
  ...over,
});
const byKey = (r: ReturnType<typeof reviewHandoff>, key: string) => r.candidates.find((c) => c.candidate_key === key)!;

describe("research handoff: a valid synthetic return", () => {
  const rows = [candidate(1), candidate(2), hold(3), candidate(4, { disposition: "excluded", offer_fit: "no_clear_fit", identity_confidence: "low" })];
  const report = reviewHandoff(output(rows), ctx());

  it("keeps the researcher's dispositions and reconciles the receipt", () => {
    expect(report.adapter_errors).toEqual([]);
    expect(report.summary).toMatchObject({ proposed_for_owner_review: 2, held: 1, excluded: 1, rejected: 0, rows: 4, row_errors: 0 });
    expect(report.receipt?.findings).toEqual([]);
    expect(report.imported).toBe(0);
    expect(report.writes).toBe(0);
  });

  it("preserves evidence time, method and limitations, the holds, sendable:false and the unknown contact basis", () => {
    const c = byKey(report, "candidate-001");
    expect(c.evidence[0]).toMatchObject({ checked_at: "2026-01-05T10:00:00+11:00", source_type: "primary_business_website", limitations: ["Public-page reading only"], age_days: 5 });
    expect(c.holds).toEqual(["Form delivery untested", "Contact basis not established"]);
    for (const r of [...report.candidates, ...report.refreshes]) {
      expect(r.sendable).toBe(false);
      expect(r.contact_basis_status).toBe("not_established");
    }
    expect(byKey(report, "candidate-003").outcome).toBe("held");
    expect(byKey(report, "candidate-003").value).toContain("fit confidence unknown");
  });

  it("assigns no IDs, adds no emails and doesn't move segments", () => {
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/"(id|company_id|application_id)":/);
    expect(report.candidates.every((c) => c.lane === "cleaning")).toBe(true);
  });

  it("is stable on repeat", () => {
    expect(reportDigest(reviewHandoff(output(rows), ctx()))).toBe(reportDigest(report));
  });

  it("reviews requested refreshes as evidence only", () => {
    expect(report.refreshes).toEqual([expect.objectContaining({ prospect_id: "OC-901", outcome: "evidence_for_review", provisional_offer_fit: "website_1990", limitations: ["Reservation unchanged"] })]);
  });
});

describe("research handoff: contract-level adapter errors judge no business", () => {
  it("wrong request, contract or exclusions hash in the output", () => {
    for (const over of [{ request_id: "another-request" }, { contract_id: "oc-research-handoff/0.2" }, { exclusions_sha256: "f".repeat(64) }]) {
      const r = reviewHandoff(output([candidate(1)], over), ctx());
      expect(r.adapter_errors.length).toBeGreaterThan(0);
      expect(r.candidates).toEqual([]);
      expect(r.summary.rows).toBe(0);
    }
  });
  it("a schema pinned to another request or using unknown keywords", () => {
    expect(reviewHandoff(output([candidate(1)]), ctx({ schema: schemaFor("another-request") })).adapter_errors).toContainEqual(expect.stringContaining("schema: request_id const"));
    const s = schemaFor();
    s.properties.candidates.uniqueItems = true;
    expect(reviewHandoff(output([candidate(1)]), ctx({ schema: s })).adapter_errors).toContainEqual(expect.stringContaining("doesn't implement"));
  });
  it("an exclusions file that isn't the pinned bytes, or isn't the exclusions contract", () => {
    expect(() => loadExclusionSnapshot(EXCLUSIONS.replace(/\r\n/g, "\n"), EXCLUSIONS_SHA)).toThrow(/SHA-256/);
    const other = exclusionsText({ ...exclusionsDoc(), contract_id: "something-else" });
    expect(() => loadExclusionSnapshot(other, sha256Hex(other))).toThrow(/contract_id/);
  });
  it("a request for another contract, or one granting sending authority", () => {
    expect(() => loadHandoffRequest(requestDoc({ contract_id: "oc-research-handoff/0.2" }))).toThrow(/contract_id/);
    expect(() => loadHandoffRequest(requestDoc({ authority: { ...requestDoc().authority, live_sending: true } }))).toThrow(/live_sending/);
  });
  it("approval-like fields at the top level", () => {
    const r = reviewHandoff(output([candidate(1)], { owner_approved: true }), ctx());
    expect(r.adapter_errors.join(" ")).toMatch(/owner_approved/);
    expect(r.candidates).toEqual([]);
  });
});

describe("research handoff: row-level adapter errors and eligibility", () => {
  it("malformed and credential-bearing URLs reject the row and never echo the credential", () => {
    const rows = [
      candidate(1, { primary_url: "https://exa mple/" }),
      candidate(2, { evidence: [ev("https://user:hunter2@synthetic-2-cleaning.example/")] }),
      candidate(3, { contact_page_url: "https://synthetic-3-cleaning.example/contact?access_token=abc123" }),
      candidate(4, { evidence: [ev("http://synthetic-4-cleaning.example/")] }),
    ];
    const r = reviewHandoff(output(rows), ctx());
    expect(r.candidates.map((c) => c.outcome)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    expect(r.summary.row_errors).toBe(4);
    const text = JSON.stringify(r);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("abc123");
    expect(byKey(r, "candidate-002").evidence[0].source_url).toMatch(/^\[redacted/);
  });

  it("cross-business evidence and an off-domain primary URL hold the row", () => {
    const r = reviewHandoff(
      output([candidate(1, { evidence: [ev("https://someone-else.example/about")] }), candidate(2, { primary_url: "https://another-business.example/" })]),
      ctx()
    );
    expect(byKey(r, "candidate-001")).toMatchObject({ outcome: "held" });
    expect(byKey(r, "candidate-001").eligibility.join(" ")).toMatch(/another business's site/);
    expect(byKey(r, "candidate-002").eligibility).toContain("primary_url is not on the owned domain");
  });

  it("ambiguous shared domains hold the row: hosting platforms, town subdomains, a shared parent", () => {
    const rows = [
      candidate(1, { owned_domain: "synthetic-one.wordpress.com", primary_url: "https://synthetic-one.wordpress.com/", contact_page_url: null, evidence: [ev("https://synthetic-one.wordpress.com/")] }),
      hold(2, { owned_domain: null, primary_url: "https://testville.shared-network.example/", contact_page_url: null, evidence: [ev("https://testville.shared-network.example/", { source_type: "discovery_only_directory_or_search" })] }),
      candidate(3, { owned_domain: "north.parent-co.example", primary_url: "https://north.parent-co.example/", contact_page_url: null, evidence: [ev("https://north.parent-co.example/")] }),
      candidate(4, { owned_domain: "south.parent-co.example", primary_url: "https://south.parent-co.example/", contact_page_url: null, evidence: [ev("https://south.parent-co.example/")] }),
    ];
    const r = reviewHandoff(output(rows), ctx());
    expect(r.candidates.map((c) => c.outcome)).toEqual(["held", "held", "held", "held"]);
    expect(byKey(r, "candidate-001").eligibility.join(" ")).toMatch(/shared hosting platform/);
    expect(byKey(r, "candidate-002").eligibility.join(" ")).toMatch(/shared parent domain/);
    expect(byKey(r, "candidate-004").eligibility).toContain("same site as candidate-003");
  });

  it("existing identities: a domain match is excluded, a name-only match is held, aliases resolve", () => {
    const rows = [
      candidate(1, { owned_domain: "alpha-test-cleaning.example", primary_url: "https://www.alpha-test-cleaning.example/", contact_page_url: null, evidence: [ev("https://alpha-test-cleaning.example/")] }),
      candidate(2, { business: "Gamma Test Cleaners Pty Ltd" }),
      candidate(3, { disposition: "duplicate_existing", duplicate_of: ["OC-777"], offer_fit: "no_clear_fit", identity_confidence: "low" }),
      candidate(4, { disposition: "duplicate_existing", duplicate_of: ["OC-999"], offer_fit: "no_clear_fit", identity_confidence: "low" }),
    ];
    const r = reviewHandoff(output(rows), ctx());
    expect(byKey(r, "candidate-001")).toMatchObject({ outcome: "excluded", matches: [{ prospect_id: "OC-901", by: "domain" }] });
    expect(byKey(r, "candidate-002")).toMatchObject({ outcome: "held", matches: [{ prospect_id: "OC-903", by: "name" }] });
    expect(byKey(r, "candidate-003")).toMatchObject({ outcome: "excluded", matches: [{ prospect_id: "OC-903", by: "alias" }] });
    expect(byKey(r, "candidate-004").eligibility).toContain("duplicate_of OC-999 is not in the exclusions snapshot");
  });

  it("prior research (the snapshot's previous_research and earlier staged returns) is reconciled, never re-proposed", () => {
    const doc = {
      ...exclusionsDoc(),
      previous_research: [
        { request_id: "synthetic-request-00", candidate_key: "candidate-001", business: "Synthetic 1 Cleaning", owned_domain: "synthetic-1-cleaning.example", locality: "Testville NSW", disposition: "research_hold" },
        { request_id: "synthetic-request-00", candidate_key: "candidate-002", business: "Old Two", website: "https://www.synthetic-2-cleaning.example/", locality: "Elsewhere NSW", disposition: "excluded" },
        // Same candidate_key as this request's own row 3, but another request: keys are only unique per request.
        { request_id: "synthetic-request-00", candidate_key: "candidate-003", business: "Unrelated Old Business", owned_domain: "unrelated.example", locality: "Testville NSW", disposition: "qualified_research" },
        { request_id: "synthetic-request-00", candidate_key: "candidate-009", business: "Synthetic 5 Cleaning", owned_domain: "other-five.example", locality: "Faraway WA", disposition: "qualified_research" },
        // This request's own earlier rows are a repeated return, not prior research.
        { request_id: REQUEST_ID, candidate_key: "candidate-006", business: "Synthetic 6 Cleaning", owned_domain: "synthetic-6-cleaning.example", locality: "Testville NSW", disposition: "qualified_research" },
      ],
    };
    const text = exclusionsText(doc);
    const sha = sha256Hex(text);
    const snapshot = loadExclusionSnapshot(text, sha);
    expect(snapshot.previous_research).toHaveLength(5);
    const staged = loadPriorResearch([{ request_id: "synthetic-request-02", candidate_key: "c-77", business: "Synthetic 4 Cleaning", locality: "Testville NSW", disposition: "held" }], "staged");
    const r = reviewHandoff(
      output([candidate(1), candidate(2), candidate(3), candidate(4), candidate(5), candidate(6)], { exclusions_sha256: sha }),
      ctx({ request: loadHandoffRequest(requestDoc({ exclusions_sha256: sha })), schema: schemaFor(REQUEST_ID, sha), exclusions: snapshot, prior: staged })
    );
    expect(r.exclusions).toMatchObject({ previous_research: 6 });
    expect(byKey(r, "candidate-001")).toMatchObject({ outcome: "held", prior_matches: [{ request_id: "synthetic-request-00", candidate_key: "candidate-001", by: "domain" }] });
    expect(byKey(r, "candidate-002")).toMatchObject({ outcome: "excluded", prior_matches: [{ by: "domain", disposition: "excluded" }] });
    expect(byKey(r, "candidate-003")).toMatchObject({ outcome: "proposed_for_owner_review", prior_matches: [] });
    expect(byKey(r, "candidate-004")).toMatchObject({ outcome: "held", prior_matches: [{ request_id: "synthetic-request-02", by: "name_locality" }] });
    expect(byKey(r, "candidate-005")).toMatchObject({ outcome: "held", prior_matches: [{ by: "name_only" }] });
    expect(byKey(r, "candidate-005").eligibility.join(" ")).toMatch(/identity ambiguous/);
    expect(byKey(r, "candidate-006")).toMatchObject({ outcome: "proposed_for_owner_review", prior_matches: [] });
    // A malformed or doubled prior row is refused rather than silently ignored.
    const bad = (rows: unknown) => () => loadExclusionSnapshot(exclusionsText({ ...exclusionsDoc(), previous_research: rows }), sha256Hex(exclusionsText({ ...exclusionsDoc(), previous_research: rows })));
    expect(bad([{ request_id: "a", candidate_key: "b" }])).toThrow(/no usable identity/);
    expect(bad([{ request_id: "a", candidate_key: "b", business: "X" }, { request_id: "a", candidate_key: "b", business: "Y" }])).toThrow(/appears twice/);
    expect(bad({ request_id: "a" })).toThrow(/must be an array/);
  });

  it("duplicate candidate keys reject every row that shares the key", () => {
    const r = reviewHandoff(output([candidate(1), candidate(1, { business: "Different Synthetic Cleaning", owned_domain: "different.example" })]), ctx());
    expect(r.candidates.map((c) => c.outcome)).toEqual(["rejected", "rejected"]);
    expect(r.candidates[0].row_errors).toContain("duplicate candidate_key candidate-001");
  });

  it("keeps cleaners and detailers apart", () => {
    const r = reviewHandoff(
      output([
        candidate(1, { category: "mobile car detailing", business: "Synthetic Shine" }),
        candidate(2, { category: "house cleaning incl. car detailing" }),
        candidate(3, { category: "carpet and window cleaning" }),
      ]),
      ctx()
    );
    expect(r.candidates.map((c) => [c.lane, c.outcome])).toEqual([
      ["detailing", "excluded"],
      ["mixed", "excluded"],
      ["cleaning", "proposed_for_owner_review"],
    ]);
    expect(laneOf("Synthetic Gleam Cleaning – Car Detailing")).toBe("mixed");
    expect(laneOf("carpet cleaning")).toBe("cleaning");
  });

  it("fabricated approval fields or a sendable row are rejected, never treated as approval", () => {
    const r = reviewHandoff(
      output([candidate(1, { approved_by: "owner" }), candidate(2, { sendable: true }), candidate(3, { contact_basis_status: "established" }), candidate(4, { evidence: [{ ...ev("https://synthetic-4-cleaning.example/"), consent: true }] })]),
      ctx()
    );
    expect(r.candidates.map((c) => c.outcome)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    expect(r.candidates.every((c) => c.sendable === false)).toBe(true);
    expect(r.candidates[0].row_errors.join(" ")).toMatch(/approved_by/);
  });

  it("a researcher hold is never promoted, and evidence dated after the run holds a qualified row", () => {
    const r = reviewHandoff(output([hold(1), candidate(2, { evidence: [ev("https://synthetic-2-cleaning.example/", { checked_at: "2026-01-09T00:00:00+11:00" })] })]), ctx());
    expect(byKey(r, "candidate-001").outcome).toBe("held");
    expect(byKey(r, "candidate-002").outcome).toBe("held");
  });

  it("a receipt that disagrees with its rows is a finding", () => {
    const o = output([candidate(1)]);
    o.receipt.fresh_qualified_count = 3;
    expect(reviewHandoff(o, ctx()).receipt?.findings).toContain("fresh_qualified_count 3 but 1 rows are qualified_research");
  });

  it("a refresh for an identity that wasn't requested, or from another site, is rejected", () => {
    const r = reviewHandoff(output([candidate(1)], { existing_refreshes: [refresh({ primary_url: "https://not-alpha.example/" })] }), ctx({ schema: schemaFor() }));
    expect(r.refreshes[0]).toMatchObject({ outcome: "rejected" });
    expect(r.refreshes[0].row_errors.join(" ")).toMatch(/isn't the identity's domain/);
  });
});

describe("exclusions snapshot", () => {
  it("recognises identities, dated aliases, holds and reservations", () => {
    const s = loadExclusionSnapshot(EXCLUSIONS, EXCLUSIONS_SHA);
    expect(s.identities).toHaveLength(3);
    const g = s.identities.find((x) => x.prospect_id === "OC-903")!;
    expect(g.alias_ids).toEqual(["OC-777"]);
    expect(g.dated_aliases).toEqual([{ source: "primary-refresh-2026-01-02", date: "2026-01-02" }]);
    expect(g.flags).toEqual(["research_held"]);
    expect(s.identities[0].reserved).toBe(true);
  });
  it("refuses an inconsistent snapshot", () => {
    const bad = (doc: unknown) => {
      const t = exclusionsText(doc);
      return () => loadExclusionSnapshot(t, sha256Hex(t));
    };
    expect(bad({ ...exclusionsDoc(), identity_count: 4 })).toThrow(/identity_count/);
    const d = exclusionsDoc();
    d.cowork_reservations.push({ prospect_id: "OC-902", business: "Beta Test Detailing", segment: "detailing", meaning: "reserved" });
    expect(bad(d)).toThrow(/isn't marked cowork_reserved/);
    const dup = exclusionsDoc();
    dup.identities[1].owned_domain = "alpha-test-cleaning.example";
    expect(bad(dup)).toThrow(/shares owned_domain/);
  });
});

describe("helpers", () => {
  it("unsafeUrl", () => {
    expect(unsafeUrl("https://synthetic.example/page?q=cleaning")).toBeNull();
    expect(unsafeUrl("https://synthetic.example/page?keywords=cleaning")).toBeNull();
    expect(unsafeUrl("https://synthetic.example/?x-vercel-protection-bypass=1")).toMatch(/credential/);
    expect(unsafeUrl("https://synthetic.example/?X-Amz-Signature=1")).toMatch(/credential/);
    expect(unsafeUrl("https://127.0.0.1/")).toMatch(/hostname/);
  });
  it("registrableDomain", () => {
    expect(registrableDomain("au.synthetic.com.au")).toBe("synthetic.com.au");
    expect(registrableDomain("north.parent-co.example")).toBe("parent-co.example");
  });
  it("validateSchema handles if/then", () => {
    const s = { type: "object", allOf: [{ if: { properties: { a: { const: 1 } } }, then: { required: ["b"] } }] };
    expect(validateSchema({ a: 1 }, s)).toEqual(["$: missing b"]);
    expect(validateSchema({ a: 2 }, s)).toEqual([]);
  });
});

describe("review-research-handoff CLI", { timeout: 30_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "handoff-cli-"));
  const put = (name: string, body: string) => {
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };
  const req = put("request.json", JSON.stringify(requestDoc()));
  const schema = put("schema.json", JSON.stringify(schemaFor()));
  const excl = put("exclusions.json", EXCLUSIONS);
  const run = (out: string, ...extra: string[]) => {
    const r = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", resolve("scripts/review-research-handoff.mjs"), out, "--request", req, "--schema", schema, "--exclusions", excl, "--now", NOW, ...extra],
      { encoding: "utf8", cwd: dir }
    );
    return { code: r.status, out: r.stdout };
  };

  it("0 reviewed, stable digest, summary carries no business names, nothing written", () => {
    const before = readdirSync(dir).sort();
    const ok = put("ok.json", JSON.stringify(output([candidate(1), hold(2)])));
    const a = run(ok, "--summary");
    const b = run(ok, "--summary");
    expect(a.code).toBe(0);
    expect(JSON.parse(a.out).digest).toBe(JSON.parse(b.out).digest);
    expect(a.out).not.toContain("Synthetic 1 Cleaning");
    expect(JSON.parse(a.out)).toMatchObject({ imported: 0, writes: 0, summary: { proposed_for_owner_review: 1, held: 1 } });
    expect(readdirSync(dir).sort()).toEqual([...before, "ok.json"].sort());
  });
  it("1 when a row has adapter errors, 3 for a contract error, 2 for unreadable input", () => {
    expect(run(put("rows.json", JSON.stringify(output([candidate(1, { approved: true })])))).code).toBe(1);
    expect(run(put("wrong.json", JSON.stringify(output([candidate(1)], { request_id: "other" })))).code).toBe(3);
    expect(run(put("bad.json", "{ nope")).code).toBe(2);
  });
  it("3 when the exclusions bytes don't match the request's hash", () => {
    const r = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", resolve("scripts/review-research-handoff.mjs"), put("x.json", "{}"), "--request", req, "--schema", schema, "--exclusions", put("ex2.json", EXCLUSIONS.trim())],
      { encoding: "utf8", cwd: dir }
    );
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stdout).adapter_errors[0]).toMatch(/SHA-256/);
  });
});
