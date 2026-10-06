// The preparation queue's packet/result boundary and its owner-only actions
// and packet download, with the database mocked. Synthetic data only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { ENQUEUE_REFUSALS, buildAssignment, validateResult, PREP_ASSIGNMENT_CONTRACT, PREP_RESULT_CONTRACT, type PrepJobFacts } from "@/lib/digital-services/prep-queue";

const JOB = "11111111-1111-4111-8111-111111111111";
const TOKEN = "44444444-4444-4444-8444-444444444444";
const ASSIGN_1 = "55555555-5555-4555-8555-555555555551"; // claim 1
const ASSIGN_2 = "55555555-5555-4555-8555-555555555552"; // claim 2 (after reclaim)

describe("packets", () => {
  it("are built only by the database; every refusal the dashboard explains is one the migration raises", () => {
    const sql = readFileSync("supabase/migrations/_drafts/digital_services_prep_queue.sql", "utf8").replace(/''/g, "'");
    for (const reason of ENQUEUE_REFUSALS) expect(sql).toContain(`'${reason}'`);
  });
});

describe("result files", () => {
  const job: PrepJobFacts = { id: JOB, kind: "copy_review", packet_sha256: "a".repeat(64), created_at: "2026-10-05T10:00:00Z", assignment_id: ASSIGN_1, lease_generation: 1 };
  const now = new Date("2026-10-05T12:00:00Z");
  const ok = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      contract_id: PREP_RESULT_CONTRACT,
      job_id: JOB,
      packet_sha256: "a".repeat(64),
      job_kind: "copy_review",
      assignment_id: ASSIGN_1,
      lease_generation: 1,
      produced_by: "fixture reviewer",
      produced_at: "2026-10-05T11:00:00Z",
      status: "completed",
      summary: "Copy matches the evidence; one claim softened.",
      outputs: [{ name: "notes.md", sha256: "b".repeat(64), media_type: "text/markdown" }],
      review: { verdict: "changes_requested", reviewer: "fixture reviewer", notes: "Soften 'tested'." },
      ...over,
    });

  it("a result answering this exact packet is accepted, and its review is the worker's report", () => {
    const r = validateResult(ok(), job, now);
    expect(r).toMatchObject({ ok: true, result: { status: "completed", review: { verdict: "changes_requested", reviewer: "fixture reviewer" } } });
  });
  it("a result made for an earlier hand-off (another assignment or generation), or for a job nobody holds, is rejected", () => {
    const reclaimed = { ...job, assignment_id: ASSIGN_2, lease_generation: 2 };
    expect(validateResult(ok(), reclaimed, now)).toEqual({ ok: false, errors: [expect.stringContaining("earlier hand-off")] });
    expect(validateResult(ok({ assignment_id: ASSIGN_2 }), reclaimed, now).ok).toBe(false); // generation still 1
    expect(validateResult(ok({ assignment_id: ASSIGN_2, lease_generation: 2 }), reclaimed, now).ok).toBe(true);
    expect(validateResult(ok(), { ...job, assignment_id: null, lease_generation: 1 }, now)).toEqual({ ok: false, errors: [expect.stringContaining("isn't handed off")] });
  });
  it("the assignment envelope carries the exact packet text and this claim's identity; no claim, no envelope", () => {
    const env = JSON.parse(buildAssignment({ ...job, packet_text: '{"contract_id":"oc-prep-packet/0.2","x":1}' })!);
    expect(env).toMatchObject({ contract_id: PREP_ASSIGNMENT_CONTRACT, job_id: JOB, assignment_id: ASSIGN_1, lease_generation: 1, packet_sha256: "a".repeat(64), packet_text: '{"contract_id":"oc-prep-packet/0.2","x":1}', result_contract: PREP_RESULT_CONTRACT });
    expect(buildAssignment({ ...job, assignment_id: null, packet_text: "{}" })).toBeNull();
  });
  it("a result for another job, another packet or another kind is rejected", () => {
    for (const over of [{ job_id: "33333333-3333-4333-8333-333333333333" }, { packet_sha256: "c".repeat(64) }, { job_kind: "copy_draft" }, { contract_id: "other" }]) {
      expect(validateResult(ok(over), job, now).ok).toBe(false);
    }
  });
  it("approval-like fields, sendable rows and unknown fields are rejected: approvals happen only on the review screen", () => {
    expect(validateResult(ok({ approved: true }), job, now)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("approvals happen only")]) });
    expect(validateResult(ok({ outputs: [{ name: "x", sha256: "b".repeat(64), media_type: "a", sendable: true }] }), job, now).ok).toBe(false);
    expect(validateResult(ok({ review: { verdict: "pass", reviewer: "r", owner_consent: true } }), job, now).ok).toBe(false);
    expect(validateResult(ok({ extra: 1 }), job, now)).toMatchObject({ ok: false, errors: ["unexpected field extra"] });
  });
  it("dates must be real, not in the future and not before the job was queued", () => {
    expect(validateResult(ok({ produced_at: "2026-10-06T00:00:00Z" }), job, now).ok).toBe(false);
    expect(validateResult(ok({ produced_at: "2026-10-01T00:00:00Z" }), job, now).ok).toBe(false);
    expect(validateResult(ok({ produced_at: "yesterday" }), job, now).ok).toBe(false);
  });
  it("a completed copy review needs its verdict and a named reviewer; other kinds can't carry one; outputs need real hashes", () => {
    expect(validateResult(ok({ review: undefined }), job, now).ok).toBe(false);
    expect(validateResult(ok({ review: { verdict: "pass", reviewer: "" } }), job, now).ok).toBe(false);
    expect(validateResult(ok({ job_kind: "copy_draft" }), { ...job, kind: "copy_draft" }, now).ok).toBe(false);
    expect(validateResult(ok({ outputs: [{ name: "x", sha256: "short", media_type: "a" }] }), job, now).ok).toBe(false);
    expect(validateResult(ok({ status: "blocked", review: undefined, summary: "Site down" }), job, now)).toMatchObject({ ok: true, result: { status: "blocked" } });
    expect(validateResult("not json", job, now)).toEqual({ ok: false, errors: ["result file isn't JSON"] });
  });
});

// ------------------------------------------------------- actions and route
const access = vi.hoisted(() => ({ user: "owner" as "owner" | "member" | null }));
const db = vi.hoisted(() => ({
  rpc: [] as [string, unknown][],
  rpcResult: { data: null as unknown, error: null as { code?: string; message: string } | null },
  inserts: [] as unknown[],
  insertError: null as { code?: string; message: string } | null,
  job: null as Record<string, unknown> | null,
  available: true,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("@/lib/digital-services/owner", () => ({
  getOwnerAccess: async () =>
    access.user === "owner" ? { ok: true, userId: "owner-uuid" } : { ok: false, reason: access.user ? "forbidden" : "not_signed_in" },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () =>
    db.available
      ? {
          rpc: async (name: string, args: unknown) => (db.rpc.push([name, args]), db.rpcResult),
          from: (table: string) => {
            const q = {
              select: () => q,
              eq: () => q,
              maybeSingle: async () => {
                if (table === "digital_services_pilot") return { data: { id: "OC-901", evidence_revision: 2, uncertainties: [] }, error: null };
                if (table === "digital_services_prep_jobs") return { data: db.job, error: null };
                return { data: null, error: null };
              },
              insert: (row: unknown) => {
                db.inserts.push(row);
                return { select: async () => ({ data: db.insertError ? null : [{ id: JOB }], error: db.insertError }) };
              },
              then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
            };
            return q;
          },
        }
      : null,
}));

const fd = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
async function act(name: string, fields: Record<string, string>): Promise<string> {
  const actions = (await import("@/app/dashboard/owner/prep-actions")) as unknown as Record<string, (f: FormData) => Promise<void>>;
  try {
    await actions[name](fd(fields));
  } catch (e) {
    return (e as { url: string }).url;
  }
  throw new Error("expected a redirect");
}

describe("preparation queue actions", () => {
  beforeEach(() => {
    access.user = "owner";
    db.rpc = [];
    db.inserts = [];
    db.insertError = null;
    db.rpcResult = { data: null, error: null };
    db.job = null;
    db.available = true;
  });

  it("members and logged-out callers are sent back and nothing is called", async () => {
    for (const user of ["member", null] as const) {
      access.user = user;
      for (const name of ["enqueuePrepJob", "handOffPrepJob", "importPrepResult", "controlPrepJob", "setPrepQueuePaused"]) {
        expect(await act(name, { job_id: JOB, company_id: "OC-901", kind: "copy_draft", action: "pause", paused: "true", result: "{}" })).toBe("/dashboard/owner");
      }
    }
    expect(db.rpc).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it("enqueue asks the database to build the packet and explains its refusals; nothing is inserted directly", async () => {
    db.rpcResult = { data: [{ job_id: JOB, outcome: "queued", packet_sha256: "a".repeat(64) }], error: null };
    expect(await act("enqueuePrepJob", { company_id: "oc-901", kind: "copy_draft" })).toBe("/dashboard/owner?prep=queued#prep");
    expect(db.rpc[0]).toEqual(["prep_enqueue", { p_company: "OC-901", p_kind: "copy_draft", p_draft: null, p_created_by: "owner:owner-uuid" }]);
    db.rpcResult = { data: [{ job_id: JOB, outcome: "already_queued", packet_sha256: "a".repeat(64) }], error: null };
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_draft" })).toBe("/dashboard/owner?prep=already_queued#prep");
    db.rpcResult = { data: null, error: { code: "OC403", message: "this kind works on a draft revision: choose one" } };
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_review" })).toBe(
      "/dashboard/owner?prep=invalid&reason=this+kind+works+on+a+draft+revision%3A+choose+one#prep"
    );
    db.rpcResult = { data: null, error: { code: "OC409", message: "this packet was captured before an evidence change: build a new one" } };
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_draft" })).toContain("prep=invalid&reason=this+packet+was+captured");
    db.rpcResult = { data: null, error: { code: "XX000", message: "connection reset (internal detail)" } };
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_draft" })).toBe("/dashboard/owner?prep=error#prep"); // no internal text shown
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_review", draft_id: "not-a-uuid" })).toBe("/dashboard/owner?prep=invalid#prep");
    expect(db.inserts).toHaveLength(0);
  });

  it("hand-off claims that one job for 24 hours; a job that isn't ready says so", async () => {
    db.rpcResult = { data: [{ id: JOB }], error: null };
    expect(await act("handOffPrepJob", { job_id: JOB })).toBe("/dashboard/owner?prep=claimed#prep");
    expect(db.rpc[0]).toEqual(["prep_claim", { p_worker: "handoff:owner", p_lease_seconds: 86400, p_job: JOB }]);
    db.rpcResult = { data: [], error: null };
    expect(await act("handOffPrepJob", { job_id: JOB })).toBe("/dashboard/owner?prep=not_ready#prep");
  });

  it("an imported result is validated against the job first; a blocked result backs off; outcomes are reported", async () => {
    db.job = { id: JOB, kind: "copy_draft", packet_sha256: "a".repeat(64), created_at: "2026-10-05T00:00:00Z", assignment_id: ASSIGN_1, lease_generation: 1 };
    const result = (over: Record<string, unknown> = {}) =>
      JSON.stringify({ contract_id: PREP_RESULT_CONTRACT, job_id: JOB, packet_sha256: "a".repeat(64), job_kind: "copy_draft", assignment_id: ASSIGN_1, lease_generation: 1, produced_by: "fixture", produced_at: "2026-10-05T01:00:00Z", status: "completed", summary: "Draft attached", ...over });
    const form = { job_id: JOB, lease_token: TOKEN, assignment_id: ASSIGN_1 };
    expect(await act("importPrepResult", { ...form, result: result({ packet_sha256: "f".repeat(64) }) })).toContain("prep=rejected");
    expect(await act("importPrepResult", { job_id: JOB, result: result() })).toBe("/dashboard/owner?prep=invalid#prep"); // no hand-off token
    expect(await act("importPrepResult", { job_id: JOB, lease_token: TOKEN, result: result() })).toBe("/dashboard/owner?prep=invalid#prep"); // no assignment
    expect(db.rpc).toHaveLength(0);
    db.rpcResult = { data: "succeeded", error: null };
    expect(await act("importPrepResult", { ...form, result: result() })).toBe("/dashboard/owner?prep=succeeded#prep");
    expect(db.rpc.at(-1)).toEqual(["prep_complete", { p_job: JOB, p_token: TOKEN, p_assignment: ASSIGN_1, p_result_text: result() }]);
    db.rpcResult = { data: "stale", error: null };
    expect(await act("importPrepResult", { ...form, result: result() })).toBe("/dashboard/owner?prep=stale#prep");
    db.rpcResult = { data: "wrong_assignment", error: null };
    expect(await act("importPrepResult", { ...form, result: result() })).toBe("/dashboard/owner?prep=superseded#prep");
    db.rpcResult = { data: "retrying", error: null };
    expect(await act("importPrepResult", { ...form, result: result({ status: "blocked", summary: "Site was down" }) })).toBe("/dashboard/owner?prep=retrying#prep");
    expect(db.rpc.at(-1)).toEqual(["prep_fail", { p_job: JOB, p_token: TOKEN, p_assignment: ASSIGN_1, p_error: "blocked: Site was down" }]);
    db.rpcResult = { data: null, error: { message: "timeout" } };
    expect(await act("importPrepResult", { ...form, result: result() })).toBe("/dashboard/owner?prep=error#prep");
  });

  it("after a reclaim, an old file is refused even through a refreshed form carrying the new token, and nothing is called", async () => {
    // Claim 1 produced oldFile; the lease expired; the job was claimed again (claim 2).
    db.job = { id: JOB, kind: "copy_draft", packet_sha256: "a".repeat(64), created_at: "2026-10-05T00:00:00Z", assignment_id: ASSIGN_2, lease_generation: 2 };
    const file = (assignment: string, generation: number, over: Record<string, unknown> = {}) =>
      JSON.stringify({ contract_id: PREP_RESULT_CONTRACT, job_id: JOB, packet_sha256: "a".repeat(64), job_kind: "copy_draft", assignment_id: assignment, lease_generation: generation, produced_by: "fixture", produced_at: "2026-10-05T01:00:00Z", status: "completed", summary: "Draft attached", ...over });
    const oldFile = file(ASSIGN_1, 1);
    const refreshed = { job_id: JOB, lease_token: TOKEN, assignment_id: ASSIGN_2 };
    expect(await act("importPrepResult", { ...refreshed, result: oldFile })).toContain("prep=superseded");
    expect(await act("importPrepResult", { ...refreshed, result: file(ASSIGN_1, 1, { status: "blocked", summary: "late" }) })).toContain("prep=superseded");
    // A stale page (still showing claim 1) is refused before the file is even read.
    expect(await act("importPrepResult", { job_id: JOB, lease_token: TOKEN, assignment_id: ASSIGN_1, result: oldFile })).toBe("/dashboard/owner?prep=superseded#prep");
    expect(db.rpc).toHaveLength(0);
    // The current file goes through, bound to claim 2.
    db.rpcResult = { data: "succeeded", error: null };
    expect(await act("importPrepResult", { ...refreshed, result: file(ASSIGN_2, 2) })).toBe("/dashboard/owner?prep=succeeded#prep");
    expect(db.rpc).toEqual([["prep_complete", { p_job: JOB, p_token: TOKEN, p_assignment: ASSIGN_2, p_result_text: file(ASSIGN_2, 2) }]]);
  });

  it("controls and pause go through the database functions with the owner named", async () => {
    db.rpcResult = { data: "done", error: null };
    expect(await act("controlPrepJob", { job_id: JOB, action: "cancel" })).toBe("/dashboard/owner?prep=done#prep");
    expect(db.rpc[0]).toEqual(["prep_control", { p_job: JOB, p_action: "cancel", p_by: "owner:owner-uuid" }]);
    db.rpcResult = { data: "not_allowed", error: null };
    expect(await act("controlPrepJob", { job_id: JOB, action: "resume" })).toBe("/dashboard/owner?prep=not_allowed#prep");
    expect(await act("controlPrepJob", { job_id: JOB, action: "succeed" })).toBe("/dashboard/owner?prep=invalid#prep");
    db.rpcResult = { data: true, error: null };
    expect(await act("setPrepQueuePaused", { paused: "true" })).toBe("/dashboard/owner?prep=paused#prep");
  });

  it("the assignment download is owner-only, exists only for a live hand-off, and carries the exact packet text", async () => {
    const { GET } = await import("@/app/dashboard/owner/prep/[jobId]/assignment/route");
    const call = () => GET(new Request("http://x/"), { params: Promise.resolve({ jobId: JOB }) });
    const live = new Date(Date.now() + 3_600_000).toISOString();
    db.job = { id: JOB, kind: "copy_draft", packet_text: '{"contract_id":"oc-prep-packet/0.2"}', packet_sha256: "d".repeat(64), created_at: "2026-10-05T00:00:00Z", status: "leased", assignment_id: ASSIGN_2, lease_generation: 2, lease_expires_at: live };
    const res = await call();
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text())).toMatchObject({ assignment_id: ASSIGN_2, lease_generation: 2, packet_text: '{"contract_id":"oc-prep-packet/0.2"}', packet_sha256: "d".repeat(64) });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    db.job = { ...db.job, lease_expires_at: new Date(Date.now() - 1000).toISOString() };
    expect((await call()).status).toBe(409); // expired: hand it off again first
    db.job = { ...db.job, status: "queued", assignment_id: null, lease_expires_at: null };
    expect((await call()).status).toBe(409);
    for (const user of ["member", null] as const) {
      access.user = user;
      expect((await call()).status).toBe(404);
    }
  });

  it("the packet download is owner-only and returns the exact stored text with its database hash", async () => {
    const { GET } = await import("@/app/dashboard/owner/prep/[jobId]/packet/route");
    const call = () => GET(new Request("http://x/"), { params: Promise.resolve({ jobId: JOB }) });
    db.job = { id: JOB, packet_text: '{"contract_id":"oc-prep-packet/0.2"}', packet_sha256: "d".repeat(64) };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"contract_id":"oc-prep-packet/0.2"}');
    expect(res.headers.get("X-Packet-SHA256")).toBe("d".repeat(64));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    for (const user of ["member", null] as const) {
      access.user = user;
      expect((await call()).status).toBe(404);
    }
    access.user = "owner";
    db.available = false;
    expect((await call()).status).toBe(503);
  });
});
