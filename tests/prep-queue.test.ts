// The preparation queue's packet/result boundary and its owner-only actions
// and packet download, with the database mocked. Synthetic data only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPacket, canonicalJson, sha256Hex, validateResult, PREP_RESULT_CONTRACT, type PrepJobFacts } from "@/lib/digital-services/prep-queue";

const JOB = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
const facts = {
  kind: "copy_draft" as const,
  company: { id: "OC-901", evidence_revision: 2, uncertainties: ["Form delivery untested"] },
  evidence: [
    { source_url: "https://fixture.example/contact", source_type: "primary_business_website", checked_at: "2026-10-05T07:14:52Z" },
    { source_url: "https://fixture.example/", source_type: "primary_business_website", checked_at: "2026-10-05T07:13:56Z" },
  ],
  draft: null,
};

describe("packets", () => {
  it("are built only from database facts, deterministically (same facts, same packet, same job)", () => {
    const a = buildPacket(facts);
    const b = buildPacket({ ...facts, evidence: [...facts.evidence].reverse() });
    if ("error" in a || "error" in b) throw new Error("expected packets");
    expect(a.text).toBe(b.text);
    expect(a.sha256).toBe(sha256Hex(a.text));
    const p = JSON.parse(a.text);
    expect(p).toMatchObject({ contract_id: "oc-prep-packet/0.1", job_kind: "copy_draft", company_id: "OC-901", evidence_revision: 2, constraints: { sendable: false } });
    expect(p.evidence.map((e: { checked_at: string }) => e.checked_at)).toEqual(["2026-10-05T07:13:56Z", "2026-10-05T07:14:52Z"]);
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });
  it("refuse to invent a missing fact", () => {
    expect(buildPacket({ ...facts, kind: "copy_review" })).toEqual({ error: "this kind works on a draft revision; choose one" });
    expect(buildPacket({ ...facts, kind: "copy_review", draft: { id: DRAFT, revision: 1, sha256: "" } })).toEqual({ error: "the draft has no stored hash" });
    expect(buildPacket({ ...facts, company: { ...facts.company, id: "acme" } })).toEqual({ error: "company facts incomplete" });
  });
});

describe("result files", () => {
  const job: PrepJobFacts = { id: JOB, kind: "copy_review", packet_sha256: "a".repeat(64), created_at: "2026-10-05T10:00:00Z" };
  const now = new Date("2026-10-05T12:00:00Z");
  const ok = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      contract_id: PREP_RESULT_CONTRACT,
      job_id: JOB,
      packet_sha256: "a".repeat(64),
      job_kind: "copy_review",
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

  it("enqueue builds the packet from the database and never sends a hash the database would trust", async () => {
    expect(await act("enqueuePrepJob", { company_id: "oc-901", kind: "copy_draft" })).toBe("/dashboard/owner?prep=queued#prep");
    expect(db.inserts[0]).toMatchObject({ company_id: "OC-901", kind: "copy_draft", packet_sha256: "computed-by-database", created_by: "owner:owner-uuid" });
    db.insertError = { code: "23505", message: "duplicate" };
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_draft" })).toBe("/dashboard/owner?prep=already_queued#prep");
    expect(await act("enqueuePrepJob", { company_id: "OC-901", kind: "copy_review" })).toContain("prep=invalid");
  });

  it("hand-off claims that one job for 24 hours; a job that isn't ready says so", async () => {
    db.rpcResult = { data: [{ id: JOB }], error: null };
    expect(await act("handOffPrepJob", { job_id: JOB })).toBe("/dashboard/owner?prep=claimed#prep");
    expect(db.rpc[0]).toEqual(["prep_claim", { p_worker: "handoff:owner", p_lease_seconds: 86400, p_job: JOB }]);
    db.rpcResult = { data: [], error: null };
    expect(await act("handOffPrepJob", { job_id: JOB })).toBe("/dashboard/owner?prep=not_ready#prep");
  });

  it("an imported result is validated against the job first; a blocked result backs off; outcomes are reported", async () => {
    db.job = { id: JOB, kind: "copy_draft", packet_sha256: "a".repeat(64), created_at: "2026-10-05T00:00:00Z" };
    const result = (over: Record<string, unknown> = {}) =>
      JSON.stringify({ contract_id: PREP_RESULT_CONTRACT, job_id: JOB, packet_sha256: "a".repeat(64), job_kind: "copy_draft", produced_by: "fixture", produced_at: "2026-10-05T01:00:00Z", status: "completed", summary: "Draft attached", ...over });
    expect(await act("importPrepResult", { job_id: JOB, result: result({ packet_sha256: "f".repeat(64) }) })).toContain("prep=rejected");
    expect(db.rpc).toHaveLength(0);
    db.rpcResult = { data: "succeeded", error: null };
    expect(await act("importPrepResult", { job_id: JOB, result: result() })).toBe("/dashboard/owner?prep=succeeded#prep");
    expect(db.rpc.at(-1)).toEqual(["prep_complete", { p_job: JOB, p_worker: "handoff:owner", p_result_text: result() }]);
    db.rpcResult = { data: "stale", error: null };
    expect(await act("importPrepResult", { job_id: JOB, result: result() })).toBe("/dashboard/owner?prep=stale#prep");
    db.rpcResult = { data: "retrying", error: null };
    expect(await act("importPrepResult", { job_id: JOB, result: result({ status: "blocked", summary: "Site was down" }) })).toBe("/dashboard/owner?prep=retrying#prep");
    expect(db.rpc.at(-1)?.[0]).toBe("prep_fail");
    db.rpcResult = { data: null, error: { message: "timeout" } };
    expect(await act("importPrepResult", { job_id: JOB, result: result() })).toBe("/dashboard/owner?prep=error#prep");
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

  it("the packet download is owner-only and returns the exact stored text with its database hash", async () => {
    const { GET } = await import("@/app/dashboard/owner/prep/[jobId]/packet/route");
    const call = () => GET(new Request("http://x/"), { params: Promise.resolve({ jobId: JOB }) });
    db.job = { id: JOB, packet_text: '{"contract_id":"oc-prep-packet/0.1"}', packet_sha256: "d".repeat(64) };
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"contract_id":"oc-prep-packet/0.1"}');
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
