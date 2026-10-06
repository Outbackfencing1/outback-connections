// Owner research actions and the assignment download: owner only, inputs
// checked before the database is called, returns reviewed against the issued
// files and other requests' staged rows, and nothing invokes a researcher.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@/lib/digital-services/research-handoff";
import { RESEARCH_ASSIGNMENT_CONTRACT } from "@/lib/digital-services/research-staging";
import { EXCLUSIONS, EXCLUSIONS_SHA, REQUEST_ID, candidate, output, requestDoc, schemaFor } from "./fixtures/research-handoff/synthetic";

const A = "22222222-2222-4222-8222-222222222222";
const C = "44444444-4444-4444-8444-444444444444";
const REQUEST = JSON.stringify(requestDoc());
const SCHEMA = JSON.stringify(schemaFor(REQUEST_ID, EXCLUSIONS_SHA));
const ASSIGNMENT = {
  id: A,
  request_id: REQUEST_ID,
  niche: "cleaning",
  country: "AU",
  cohort_limit: 10,
  request_text: REQUEST,
  schema_text: SCHEMA,
  exclusions_text: EXCLUSIONS,
  request_sha256: sha256Hex(REQUEST),
  schema_sha256: sha256Hex(SCHEMA),
  exclusions_sha256: EXCLUSIONS_SHA,
  state: "started",
};

const access = vi.hoisted(() => ({ user: "owner" as "owner" | "member" | null }));
const db = vi.hoisted(() => ({
  rpc: [] as [string, Record<string, unknown>][],
  rpcResult: { data: null as unknown, error: null as { code?: string; message: string } | null },
  assignment: null as Record<string, unknown> | null,
  staged: [] as Record<string, unknown>[],
  reads: [] as string[],
  available: true,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/digital-services/owner", () => ({
  getOwnerAccess: async () => (access.user === "owner" ? { ok: true, userId: "owner-uuid" } : { ok: false, reason: access.user ? "forbidden" : "not_signed_in" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    db.available
      ? {
          rpc: async (name: string, args: Record<string, unknown>) => (db.rpc.push([name, args]), db.rpcResult),
          from: (table: string) => {
            db.reads.push(table);
            const q = {
              select: () => q,
              eq: () => q,
              neq: () => q,
              is: () => q,
              limit: () => q,
              maybeSingle: async () => ({ data: table === "digital_services_research_assignments" ? db.assignment : null, error: null }),
              then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "digital_services_research_candidates" ? db.staged : [], error: null }).then(ok),
            };
            return q;
          },
        }
      : null,
}));

const fd = (fields: Record<string, string | File>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
async function act(name: string, fields: Record<string, string | File>): Promise<string> {
  const actions = (await import("@/app/dashboard/owner/research-actions")) as unknown as Record<string, (f: FormData) => Promise<void>>;
  try {
    await actions[name](fd(fields));
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
}
const file = (text: string) => new File([text], "f.json", { type: "application/json" });
const raw = (rows: unknown[], over: Record<string, unknown> = {}) => JSON.stringify(output(rows, over));

describe("research actions", () => {
  beforeEach(() => {
    access.user = "owner";
    db.rpc = [];
    db.rpcResult = { data: null, error: null };
    db.assignment = { ...ASSIGNMENT };
    db.staged = [];
    db.reads = [];
    db.available = true;
  });

  it("members, other admins and logged-out callers are sent back and nothing is read or called", async () => {
    for (const user of ["member", null] as const) {
      access.user = user;
      for (const name of ["createResearchAssignment", "controlResearchAssignment", "checkpointResearch", "stageResearchReturn", "decideResearchCandidate"]) {
        expect(await act(name, { assignment_id: A, candidate_id: C, action: "start", decision: "hold", inspected: "1", return: "{}" })).toBe("/dashboard/owner");
      }
    }
    expect(db.rpc).toHaveLength(0);
    expect(db.reads).toHaveLength(0);
  });

  it("create checks the three files before the database sees them, and passes the exact texts", async () => {
    db.rpcResult = { data: [{ assignment_id: A, outcome: "created" }], error: null };
    const form = { niche: "cleaning", country: "au", cohort_limit: "10", request_file: file(REQUEST), schema_file: file(SCHEMA), exclusions_file: file(EXCLUSIONS) };
    expect(await act("createResearchAssignment", form)).toBe("/dashboard/owner?research=created#research");
    expect(db.rpc[0]).toEqual([
      "research_assignment_create",
      { p_request_id: REQUEST_ID, p_niche: "cleaning", p_country: "AU", p_cohort_limit: 10, p_request_text: REQUEST, p_schema_text: SCHEMA, p_exclusions_text: EXCLUSIONS, p_by: "owner:owner-uuid" },
    ]);
    db.rpc = [];
    expect(await act("createResearchAssignment", { ...form, exclusions_file: file(EXCLUSIONS + " ") })).toMatch(/research=invalid&reason=.*SHA-256/);
    expect(await act("createResearchAssignment", { ...form, niche: "detailing" })).toMatch(/research=invalid&reason=.*segment/);
    expect(await act("createResearchAssignment", { ...form, cohort_limit: "40" })).toMatch(/research=invalid&reason=cohort/);
    expect(db.rpc).toHaveLength(0);
    db.rpcResult = { data: null, error: { code: "OC409", message: "x" } };
    expect(await act("createResearchAssignment", form)).toBe("/dashboard/owner?research=not_allowed&reason=that+request+ID+was+issued+with+other+files#research");
  });

  it("start, pause and checkpoints only record the owner's bookkeeping", async () => {
    db.rpcResult = { data: "done", error: null };
    expect(await act("controlResearchAssignment", { assignment_id: A, action: "start" })).toBe("/dashboard/owner?research=done#research");
    expect(db.rpc[0]).toEqual(["research_assignment_control", { p_id: A, p_action: "start", p_by: "owner:owner-uuid" }]);
    expect(await act("controlResearchAssignment", { assignment_id: A, action: "invoke" })).toBe("/dashboard/owner?research=invalid#research");
    expect(await act("checkpointResearch", { assignment_id: A, inspected: "4", note: "four pages" })).toBe("/dashboard/owner?research=done#research");
    expect(db.rpc[1]).toEqual(["research_checkpoint", { p_id: A, p_progress: { inspected: 4 }, p_note: "four pages", p_by: "owner:owner-uuid" }]);
    db.rpcResult = { data: "not_allowed", error: null };
    expect(await act("controlResearchAssignment", { assignment_id: A, action: "resume" })).toBe("/dashboard/owner?research=not_allowed#research");
  });

  it("a return is reviewed against the issued files and other requests' rows before it is staged", async () => {
    db.staged = [{ request_id: "synthetic-request-00", candidate_key: "candidate-009", business: "Synthetic 2 Cleaning", locality: "Testville NSW", domain: "synthetic-2-cleaning.example", outcome: "proposed_for_owner_review" }];
    db.rpcResult = { data: [{ return_id: C, version: 1, outcome: "staged" }], error: null };
    const text = raw([candidate(1), candidate(2)]);
    expect(await act("stageResearchReturn", { assignment_id: A, return_file: file(text) })).toBe("/dashboard/owner?research=staged&v=1#research");
    const [name, args] = db.rpc[0];
    expect(name).toBe("research_stage_return");
    expect(args.p_raw_text).toBe(text);
    const report = args.p_report as { candidates: { candidate_key: string; outcome: string }[]; contract_errors: string[] };
    expect(report.contract_errors).toEqual([]);
    expect(report.candidates.map((c) => [c.candidate_key, c.outcome])).toEqual([
      ["candidate-001", "proposed_for_owner_review"],
      ["candidate-002", "held"],
    ]);
    // A failed contract is reported with its reasons.
    db.rpcResult = { data: [{ return_id: C, version: 2, outcome: "contract_failed" }], error: null };
    expect(await act("stageResearchReturn", { assignment_id: A, return: "not json" })).toMatch(/research=contract_failed&reason=return%3A\+not\+JSON/);
    // Not before Start, and not after Close.
    db.rpc = [];
    db.assignment = { ...ASSIGNMENT, state: "draft" };
    expect(await act("stageResearchReturn", { assignment_id: A, return: text })).toBe("/dashboard/owner?research=not_allowed&reason=start+the+assignment+first#research");
    db.assignment = null;
    expect(await act("stageResearchReturn", { assignment_id: A, return: text })).toBe("/dashboard/owner?research=invalid#research");
    expect(db.rpc).toHaveLength(0);
  });

  it("accepting needs an existing company ID; other decisions can't carry one", async () => {
    expect(await act("decideResearchCandidate", { candidate_id: C, decision: "accept" })).toBe("/dashboard/owner?research=no_such_company#research");
    expect(await act("decideResearchCandidate", { candidate_id: C, decision: "hold", pilot_company_id: "OC-002" })).toBe("/dashboard/owner?research=invalid#research");
    expect(await act("decideResearchCandidate", { candidate_id: C, decision: "send" })).toBe("/dashboard/owner?research=invalid#research");
    expect(db.rpc).toHaveLength(0);
    db.rpcResult = { data: "superseded", error: null };
    expect(await act("decideResearchCandidate", { candidate_id: C, decision: "accept", pilot_company_id: "oc-950" })).toBe("/dashboard/owner?research=superseded#research");
    expect(db.rpc[0]).toEqual(["research_decide", { p_candidate: C, p_decision: "accept", p_pilot_company: "OC-950", p_note: null, p_by: "owner:owner-uuid" }]);
  });

  it("the assignment download is owner-only and carries the issued texts and hashes", async () => {
    const { GET } = await import("@/app/dashboard/owner/research/[assignmentId]/assignment/route");
    const get = () => GET(new Request("http://x"), { params: Promise.resolve({ assignmentId: A }) });
    access.user = "member";
    expect((await get()).status).toBe(404);
    access.user = null;
    expect((await get()).status).toBe(404);
    access.user = "owner";
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = JSON.parse(await res.text());
    expect(body).toMatchObject({ contract_id: RESEARCH_ASSIGNMENT_CONTRACT, assignment_id: A, request_id: REQUEST_ID, connection: "file_handoff_only", cohort_limit: 10, request: REQUEST, exclusions: EXCLUSIONS });
    expect(body.constraints).toMatchObject({ sendable: false, contact: "none" });
    expect(body.hashes.exclusions_sha256).toBe(EXCLUSIONS_SHA);
  });
});
