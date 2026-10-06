// Research staging (draft migration digital_services_research_staging.sql) on
// a real Postgres (PGlite), driven through the same review the owner action
// uses (lib/digital-services/research-staging.ts). Synthetic identities only.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/digital-services/research-handoff";
import { checkAssignmentFiles, priorFromStaged, reviewReturnForStaging, type AssignmentFiles } from "@/lib/digital-services/research-staging";
import {
  EXCLUSIONS,
  EXCLUSIONS_SHA,
  NOW,
  REQUEST_ID,
  candidate,
  exclusionsDoc,
  exclusionsText,
  hold,
  output,
  requestDoc,
  schemaFor,
} from "./fixtures/research-handoff/synthetic";

const PILOT_SQL = readFileSync("supabase/migrations/_drafts/digital_services_pilot.sql", "utf8");
const STAGING_SQL = readFileSync("supabase/migrations/_drafts/digital_services_research_staging.sql", "utf8");

async function db() {
  const pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;`);
  await pg.query(`select set_config('app.ds_owner_user_id', $1, false)`, ["33333333-3333-4333-8333-333333333333"]);
  await pg.exec(PILOT_SQL);
  await pg.exec(STAGING_SQL);
  await pg.exec(STAGING_SQL); // idempotent DDL
  await pg.exec(`insert into digital_services_pilot (id, company, lane) values ('OC-901', 'Alpha Test Cleaning', 'email'), ('OC-950', 'Synthetic 1 Cleaning', 'email')`);
  const call = async <T,>(sql: string, params: unknown[] = []) => {
    await pg.exec(`set role service_role`);
    try {
      return (await pg.query<T>(sql, params)).rows;
    } finally {
      await pg.exec(`reset role`);
    }
  };
  const create = async (requestId = REQUEST_ID, exclusions = EXCLUSIONS, sha = EXCLUSIONS_SHA, limit = 10) => {
    const files = {
      request_text: JSON.stringify(requestDoc({ request_id: requestId, exclusions_sha256: sha })),
      schema_text: JSON.stringify(schemaFor(requestId, sha)),
      exclusions_text: exclusions,
      niche: "cleaning",
      cohort_limit: limit,
    };
    const checked = checkAssignmentFiles(files);
    if (!checked.ok) throw new Error(checked.errors.join("; "));
    const [row] = await call<{ assignment_id: string; outcome: string }>(`select * from research_assignment_create($1, 'cleaning', 'AU', $2, $3, $4, $5, 'owner')`, [
      checked.request_id,
      limit,
      files.request_text,
      files.schema_text,
      files.exclusions_text,
    ]);
    return row;
  };
  const control = (id: string, action: string) => call<{ r: string }>(`select research_assignment_control($1, $2, 'owner') as r`, [id, action]).then((r) => r[0].r);
  const assignment = async (id: string) => (await pg.query<AssignmentFiles>(`select * from digital_services_research_assignments where id = $1`, [id])).rows[0];
  // What the owner's stage action does: review against the issued files and every other request's staged rows.
  const stage = async (id: string, raw: string) => {
    const a = await assignment(id);
    const others = await call<{ request_id: string; candidate_key: string; business: string; locality: string | null; domain: string | null; outcome: string }>(
      `select request_id, candidate_key, business, locality, domain, outcome from digital_services_research_candidates where request_id <> $1 and superseded_by_version is null`,
      [a.request_id]
    );
    const report = reviewReturnForStaging(raw, a, priorFromStaged(others), NOW);
    const [row] = await call<{ return_id: string; version: number; outcome: string }>(`select * from research_stage_return($1, $2, $3::jsonb, 'owner')`, [id, raw, JSON.stringify(report)]);
    return row;
  };
  const current = async (id: string) =>
    (
      await pg.query<{ id: string; candidate_key: string; outcome: string; version: number; reasons: string[]; sendable: boolean }>(
        `select id, candidate_key, outcome, version, reasons, sendable from digital_services_research_candidates where assignment_id = $1 and superseded_by_version is null order by candidate_key`,
        [id]
      )
    ).rows;
  const decide = (candidate: string, decision: string, company: string | null = null) =>
    call<{ r: string }>(`select research_decide($1, $2, $3, 'synthetic note', 'owner') as r`, [candidate, decision, company]).then((r) => r[0].r);
  return { pg, call, create, control, assignment, stage, current, decide };
}

const raw = (rows: unknown[], over: Record<string, unknown> = {}) => JSON.stringify(output(rows, over));

describe("research staging (draft migration)", { timeout: 60_000 }, () => {
  it("an assignment stores its issued files with database hashes, is idempotent, and never changes", async () => {
    const { pg, create, assignment } = await db();
    const a = await create();
    expect(a.outcome).toBe("created");
    const row = await assignment(a.assignment_id);
    expect(row).toMatchObject({ request_id: REQUEST_ID, exclusions_sha256: EXCLUSIONS_SHA, state: "draft", connection: "file_handoff_only" });
    expect(row.request_sha256).toBe(sha256Hex(row.request_text));
    expect(await create()).toEqual({ assignment_id: a.assignment_id, outcome: "already_exists" });
    // The same request ID with other files is refused.
    const other = exclusionsText({ ...exclusionsDoc(), created_at: "2026-01-02T00:00:00+00:00" });
    await expect(create(REQUEST_ID, other, sha256Hex(other))).rejects.toMatchObject({ code: "OC409" });
    await expect(pg.query(`update digital_services_research_assignments set cohort_limit = 20 where id = $1`, [a.assignment_id])).rejects.toMatchObject({ code: "OC409" });
    await expect(pg.query(`delete from digital_services_research_assignments where id = $1`, [a.assignment_id])).rejects.toMatchObject({ code: "OC409" });
    // A request whose exclusions file doesn't match its pin can't even be created.
    expect(checkAssignmentFiles({ request_text: JSON.stringify(requestDoc()), schema_text: "{}", exclusions_text: other, niche: "cleaning", cohort_limit: 5 })).toMatchObject({
      ok: false,
      errors: [expect.stringMatching(/SHA-256/)],
    });
    expect(checkAssignmentFiles({ request_text: JSON.stringify(requestDoc()), schema_text: "{}", exclusions_text: EXCLUSIONS, niche: "detailing", cohort_limit: 50 })).toMatchObject({
      ok: false,
      errors: ["cohort limit must be 1 to 25", 'the request\'s segment is "cleaning", not detailing'],
    });
  });

  it("start/pause/resume/close are recorded; start invokes nobody; a draft or closed assignment takes no return", async () => {
    const { pg, create, control, stage } = await db();
    const { assignment_id: id } = await create();
    await expect(stage(id, raw([candidate(1)]))).rejects.toThrow(/start the assignment/);
    expect(await control(id, "start")).toBe("done");
    expect(await control(id, "start")).toBe("not_allowed");
    expect(await control(id, "pause")).toBe("done");
    expect(await control(id, "resume")).toBe("done");
    expect((await pg.query(`select research_checkpoint($1, '{"inspected":3,"of":10}', 'three pages read', 'owner') as r`, [id])).rows[0]).toEqual({ r: "done" });
    expect(await control(id, "close")).toBe("done");
    await expect(stage(id, raw([candidate(1)]))).rejects.toThrow(/closed/);
    const events = (await pg.query<{ kind: string; detail: { connection?: string } }>(`select kind, detail from digital_services_research_events where assignment_id = $1 order by id`, [id])).rows;
    expect(events.map((e) => e.kind)).toEqual(["created", "start", "pause", "resume", "checkpoint", "close"]);
    expect(events[1].detail.connection).toBe("file_handoff_only");
  });

  it("stages a return as an immutable version; the same text is idempotent; a changed return supersedes and voids old decisions", async () => {
    const { pg, create, control, stage, current, decide } = await db();
    const { assignment_id: id } = await create();
    await control(id, "start");
    const v1 = raw([candidate(1), candidate(2), hold(3)]);
    expect(await stage(id, v1)).toMatchObject({ version: 1, outcome: "staged" });
    expect(await stage(id, v1)).toMatchObject({ version: 1, outcome: "already_staged" });
    const rows1 = await current(id);
    expect(rows1.map((r) => [r.candidate_key, r.outcome, r.sendable])).toEqual([
      ["candidate-001", "proposed_for_owner_review", false],
      ["candidate-002", "proposed_for_owner_review", false],
      ["candidate-003", "held", false],
    ]);
    // A changed return (the researcher revised row 2) is version 2; version 1 stays as history.
    const v2 = raw([candidate(1), candidate(2, { business: "Synthetic 2 Cleaning Services" }), hold(3)]);
    expect(await stage(id, v2)).toMatchObject({ version: 2, outcome: "staged" });
    expect((await current(id)).every((r) => r.version === 2)).toBe(true);
    expect((await pg.query(`select count(*)::int n from digital_services_research_candidates where assignment_id = $1`, [id])).rows[0]).toEqual({ n: 6 });
    expect(await decide(rows1[0].id, "accept", "OC-950")).toBe("superseded");
    const raws = (await pg.query<{ raw_sha256: string; raw_text: string }>(`select raw_sha256, raw_text from digital_services_research_returns where assignment_id = $1 order by version`, [id])).rows;
    expect(raws.map((r) => r.raw_sha256)).toEqual([sha256Hex(v1), sha256Hex(v2)]);
    expect(raws[0].raw_text).toBe(v1);
    await expect(pg.query(`update digital_services_research_returns set raw_text = '{}' where assignment_id = $1`, [id])).rejects.toMatchObject({ code: "OC409" });
    await expect(pg.query(`update digital_services_research_candidates set outcome = 'proposed_for_owner_review' where assignment_id = $1`, [id])).rejects.toMatchObject({ code: "OC409" });
  });

  it("a return failing its contract is kept in the exception queue and stages nothing", async () => {
    const { pg, create, control, stage, current } = await db();
    const { assignment_id: id } = await create(REQUEST_ID, EXCLUSIONS, EXCLUSIONS_SHA, 2);
    await control(id, "start");
    expect(await stage(id, "not json at all")).toMatchObject({ version: 1, outcome: "contract_failed" });
    expect(await stage(id, raw([candidate(1)], { request_id: "someone-elses-request" }))).toMatchObject({ version: 2, outcome: "contract_failed" });
    expect(await stage(id, raw([candidate(1), candidate(2), candidate(3)]))).toMatchObject({ version: 3, outcome: "contract_failed" }); // over the cohort limit
    expect(await current(id)).toEqual([]);
    const failed = (await pg.query<{ contract_ok: boolean; contract_errors: string[] }>(`select contract_ok, contract_errors from digital_services_research_returns where assignment_id = $1 order by version`, [id])).rows;
    expect(failed.every((f) => !f.contract_ok)).toBe(true);
    expect(failed[0].contract_errors[0]).toMatch(/not JSON/);
    expect(failed[2].contract_errors).toContain("return has 3 candidates; the assignment's cohort limit is 2");
  });

  it("compound keys: the same candidate_key in another request is another business; the same business is caught as prior research", async () => {
    const { create, control, stage, current } = await db();
    const first = (await create()).assignment_id;
    await control(first, "start");
    await stage(first, raw([candidate(1), candidate(2)]));
    const second = (await create("synthetic-request-02")).assignment_id;
    await control(second, "start");
    // Request 02's candidate-001 is a different business; its candidate-002 is request 01's row 2 again.
    const r2 = raw(
      [
        candidate(1, { business: "Fresh Synthetic Cleaning", owned_domain: "fresh-synthetic.example", primary_url: "https://fresh-synthetic.example/", contact_page_url: null, evidence: [{ source_url: "https://fresh-synthetic.example/", checked_at: "2026-01-05T10:00:00+11:00", source_type: "primary_business_website", fact_text: "Synthetic fact.", exact_excerpts: ["x"], limitations: [] }] }),
        candidate(2),
      ],
      { request_id: "synthetic-request-02" }
    );
    expect(await stage(second, r2)).toMatchObject({ outcome: "staged" });
    const rows = await current(second);
    expect(rows.map((r) => [r.candidate_key, r.outcome])).toEqual([
      ["candidate-001", "proposed_for_owner_review"],
      ["candidate-002", "held"],
    ]);
    expect(rows[1].reasons.join(" ")).toMatch(/already researched as synthetic-request-01\/candidate-002/);
    // Request 01's rows are untouched by request 02.
    expect((await current(first)).map((r) => r.outcome)).toEqual(["proposed_for_owner_review", "proposed_for_owner_review"]);
  });

  it("legacy identities, the snapshot's previous research and the wrong niche are reconciled before anything is proposed", async () => {
    const { create, control, stage, current } = await db();
    const doc = {
      ...exclusionsDoc(),
      previous_research: [
        { request_id: "legacy-research-00", candidate_key: "k-1", business: "Old Synthetic", owned_domain: "synthetic-2-cleaning.example", locality: "Testville NSW", disposition: "excluded" },
        { request_id: "legacy-research-00", candidate_key: "k-2", business: "Synthetic 3 Cleaning", owned_domain: "elsewhere-3.example", locality: "Far Town WA", disposition: "qualified_research" },
      ],
    };
    const text = exclusionsText(doc);
    const sha = sha256Hex(text);
    const { assignment_id: id } = await create(REQUEST_ID, text, sha);
    await control(id, "start");
    const legacyDomain = candidate(1, { owned_domain: "alpha-test-cleaning.example", primary_url: "https://alpha-test-cleaning.example/", contact_page_url: null, evidence: [{ source_url: "https://alpha-test-cleaning.example/", checked_at: "2026-01-05T10:00:00+11:00", source_type: "primary_business_website", fact_text: "Synthetic fact.", exact_excerpts: ["x"], limitations: [] }] });
    const detailer = candidate(4, { category: "mobile car detailing", business: "Synthetic 4 Detailing" });
    expect(await stage(id, raw([legacyDomain, candidate(2), candidate(3), detailer, candidate(5)], { exclusions_sha256: sha }))).toMatchObject({ outcome: "staged" });
    const rows = await current(id);
    expect(rows.map((r) => [r.candidate_key, r.outcome])).toEqual([
      ["candidate-001", "excluded"], // legacy identity OC-901 by domain
      ["candidate-002", "excluded"], // excluded in earlier research by domain
      ["candidate-003", "held"], // same name as earlier research, other locality: ambiguous
      ["candidate-004", "excluded"], // detailing in a cleaning request
      ["candidate-005", "proposed_for_owner_review"],
    ]);
  });

  it("decisions are append-only; accepting needs a proposed row and an existing company; no ID is invented", async () => {
    const { pg, create, control, stage, current, decide } = await db();
    const { assignment_id: id } = await create();
    await control(id, "start");
    await stage(id, raw([candidate(1), hold(2)]));
    const [proposed, held] = await current(id);
    expect(await decide(proposed.id, "accept", "OC-999")).toBe("no_such_company");
    expect(await decide(held.id, "accept", "OC-901")).toBe("not_allowed");
    expect(await decide(held.id, "hold")).toBe("done");
    expect(await decide(proposed.id, "accept", "OC-950")).toBe("done");
    const decisions = (await pg.query<{ decision: string; pilot_company_id: string | null }>(`select decision, pilot_company_id from digital_services_research_decisions order by decided_at, decision`)).rows;
    expect(decisions).toEqual(
      expect.arrayContaining([
        { decision: "hold", pilot_company_id: null },
        { decision: "accept", pilot_company_id: "OC-950" },
      ])
    );
    await expect(pg.query(`update digital_services_research_decisions set decision = 'reject'`)).rejects.toMatchObject({ code: "OC409" });
    // Nothing was made sendable and no pilot company was created.
    expect((await pg.query(`select id from digital_services_pilot order by id`)).rows).toEqual([{ id: "OC-901" }, { id: "OC-950" }]);
    expect((await pg.query(`select 1 from digital_services_research_candidates where sendable`)).rows).toHaveLength(0);
  });

  it("the service role only reads and calls the functions; anon and authenticated get nothing", async () => {
    const { pg, create } = await db();
    const { assignment_id: id } = await create();
    await pg.exec(`set role service_role`);
    await expect(pg.query(`update digital_services_research_assignments set state = 'returned' where id = $1`, [id])).rejects.toThrow(/permission denied/i);
    await expect(pg.query(`insert into digital_services_research_decisions (candidate_id, decision, decided_by) values (gen_random_uuid(), 'hold', 'x')`)).rejects.toThrow(/permission denied/i);
    await pg.exec(`reset role`);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`set role ${role}`);
      await expect(pg.query(`select * from digital_services_research_candidates`)).rejects.toThrow(/permission denied/i);
      await expect(pg.query(`select research_assignment_control($1, 'start', 'x')`, [id])).rejects.toThrow(/permission denied/i);
      await pg.exec(`reset role`);
    }
  });
});
