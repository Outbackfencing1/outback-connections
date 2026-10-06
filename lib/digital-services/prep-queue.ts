// lib/digital-services/prep-queue.ts
// The preparation queue's packet/result boundary (owner-only; draft migration
// digital_services_prep_queue.sql). No automatic worker exists here: a person
// hands a job's packet to the private engine (or works it by hand) and
// imports the result file. Packets are built only by the database
// (prep_enqueue), from one locked snapshot of the company, its evidence and
// the draft, so this module never builds or edits one. It validates result
// files against the exact packet they answer, and never invents a hash or a
// review verdict; an imported review is the worker's report, never an approval.
import { createHash } from "node:crypto";

export const PREP_JOBS_TABLE = "digital_services_prep_jobs";
export const PREP_SETTINGS_TABLE = "digital_services_prep_settings";
export const PREP_PAGE_SIZE = 20;
export const PREP_PACKET_CONTRACT = "oc-prep-packet/0.2";
export const PREP_RESULT_CONTRACT = "oc-prep-result/0.2";
/** What a worker downloads for one claim: the exact packet plus this claim's identity. */
export const PREP_ASSIGNMENT_CONTRACT = "oc-prep-assignment/0.1";
export const PREP_KINDS = ["research_review", "evidence_refresh", "preview_build", "copy_draft", "copy_review"] as const;
export type PrepKind = (typeof PREP_KINDS)[number];
export const PREP_KIND_LABELS: Record<PrepKind, string> = {
  research_review: "Research review",
  evidence_refresh: "Evidence refresh",
  preview_build: "Preview build",
  copy_draft: "Copy draft",
  copy_review: "Copy review",
};
/** Kinds that work on one existing draft revision (the database enforces this too). */
export const DRAFT_KINDS: PrepKind[] = ["copy_review", "preview_build"];
export const PREP_HANDOFF_WORKER = "handoff:owner";
export const PREP_HANDOFF_LEASE_SECONDS = 86_400;

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Plain-language reasons prep_enqueue refuses a packet (its own messages), shown to the owner. */
export const ENQUEUE_REFUSALS = [
  "no such pilot company",
  "unknown job kind",
  "this company has no recorded evidence: record evidence first",
  "this kind works on a draft revision: choose one",
  "the draft belongs to another company",
  "the draft's stored hash doesn't match its copy",
  "the draft was written against older evidence: add a new revision first",
  "this kind doesn't take a draft",
  "choose the company's offer before drafting copy",
  "this packet was captured before an evidence change: build a new one",
] as const;

/**
 * The job as it stands now. assignment_id and lease_generation identify the
 * live claim (null/0 when nobody holds it); a result file must repeat both.
 */
export type PrepJobFacts = {
  id: string;
  kind: PrepKind;
  packet_sha256: string;
  created_at: string;
  assignment_id: string | null;
  lease_generation: number;
};

/**
 * The assignment envelope for the live claim: the exact packet text (its hash
 * unchanged), and the identity the result file must repeat. A file made from
 * an earlier claim's envelope names another assignment and is refused.
 */
export function buildAssignment(job: PrepJobFacts & { packet_text: string }): string | null {
  if (!job.assignment_id || job.lease_generation < 1) return null;
  return JSON.stringify(
    {
      contract_id: PREP_ASSIGNMENT_CONTRACT,
      job_id: job.id,
      job_kind: job.kind,
      assignment_id: job.assignment_id,
      lease_generation: job.lease_generation,
      packet_sha256: job.packet_sha256,
      packet_text: job.packet_text,
      result_contract: PREP_RESULT_CONTRACT,
      result_must_repeat: ["job_id", "packet_sha256", "job_kind", "assignment_id", "lease_generation"],
    },
    null,
    2
  );
}
export type PrepResult = {
  status: "completed" | "blocked";
  produced_by: string;
  produced_at: string;
  summary: string;
  outputs: { name: string; sha256: string; media_type: string }[];
  review: { verdict: "pass" | "changes_requested" | "hold"; reviewer: string; notes: string } | null;
};

const RESULT_KEYS = [
  "contract_id",
  "job_id",
  "packet_sha256",
  "job_kind",
  "assignment_id",
  "lease_generation",
  "produced_by",
  "produced_at",
  "status",
  "summary",
  "outputs",
  "review",
  "findings",
];
const APPROVAL_KEY = /(approv|consent|authori[sz]|cleared|permission|send_?ok|send_?ready|ready_to_send)/i;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

function deepProblems(v: unknown, path: string, out: string[]) {
  if (Array.isArray(v)) v.forEach((x, i) => deepProblems(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (APPROVAL_KEY.test(k)) out.push(`${path}.${k}: approvals happen only on the owner's review screen`);
      if (k === "sendable" && x !== false) out.push(`${path}.sendable must be false`);
      deepProblems(x, `${path}.${k}`, out);
    }
  }
}

/**
 * Validate a result file against the job it claims to answer. The result must
 * name this job, this exact packet hash, this kind, and the live claim's
 * assignment and lease generation, so a file made for an earlier claim (by
 * the same worker or another) is refused even after a refresh. Nothing is
 * trusted that the database can check itself; it re-checks the assignment,
 * and computes the result's hash when it's recorded.
 */
export function validateResult(text: string, job: PrepJobFacts, now: Date): { ok: true; result: PrepResult } | { ok: false; errors: string[] } {
  if (text.length > 500_000) return { ok: false, errors: ["result file is larger than 500 KB"] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["result file isn't JSON"] };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["result file isn't a JSON object"] };
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (r.contract_id !== PREP_RESULT_CONTRACT) errors.push(`contract_id must be ${PREP_RESULT_CONTRACT}`);
  if (r.job_id !== job.id) errors.push("job_id isn't this job");
  if (r.packet_sha256 !== job.packet_sha256) errors.push("packet_sha256 isn't this job's packet: the result answers a different packet");
  if (r.job_kind !== job.kind) errors.push("job_kind doesn't match the job");
  if (!job.assignment_id) errors.push("the job isn't handed off now: hand it off and work from the new assignment");
  else if (r.assignment_id !== job.assignment_id || r.lease_generation !== job.lease_generation) {
    errors.push("assignment_id/lease_generation aren't the current hand-off's: this file answers an earlier hand-off");
  }
  for (const k of Object.keys(r)) if (!RESULT_KEYS.includes(k)) errors.push(`unexpected field ${k}`);
  deepProblems(r, "$", errors);
  const produced_by = typeof r.produced_by === "string" ? r.produced_by.trim() : "";
  if (!produced_by || produced_by.length > 120) errors.push("produced_by must name who or what produced the result");
  const produced_at = typeof r.produced_at === "string" ? r.produced_at : "";
  const t = Date.parse(produced_at);
  if (!RFC3339.test(produced_at) || Number.isNaN(t)) errors.push("produced_at must be an RFC 3339 date-time");
  else if (t > now.getTime() + 5 * 60_000) errors.push("produced_at is in the future");
  else if (t < Date.parse(job.created_at) - 60_000) errors.push("produced_at is before the job was queued");
  if (r.status !== "completed" && r.status !== "blocked") errors.push("status must be completed or blocked");
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  if (!summary || summary.length > 2000) errors.push("summary is required (up to 2000 characters)");
  const outputs: PrepResult["outputs"] = [];
  if (r.outputs !== undefined && !Array.isArray(r.outputs)) errors.push("outputs must be a list");
  for (const [i, o] of (Array.isArray(r.outputs) ? r.outputs : []).entries()) {
    const x = (o ?? {}) as Record<string, unknown>;
    if (typeof x.name !== "string" || !x.name.trim() || typeof x.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.sha256) || typeof x.media_type !== "string") {
      errors.push(`outputs[${i}] needs a name, a 64-character sha256 and a media_type`);
    } else outputs.push({ name: x.name.trim(), sha256: x.sha256, media_type: x.media_type });
  }
  if (outputs.length > 20) errors.push("at most 20 outputs");
  let review: PrepResult["review"] = null;
  if (r.review !== undefined && r.review !== null) {
    const v = r.review as Record<string, unknown>;
    if (job.kind !== "copy_review" && job.kind !== "research_review") errors.push("only review jobs carry a review");
    else if (!["pass", "changes_requested", "hold"].includes(String(v.verdict)) || typeof v.reviewer !== "string" || !v.reviewer.trim()) {
      errors.push("review needs a verdict (pass, changes_requested or hold) and a named reviewer");
    } else review = { verdict: v.verdict as "pass" | "changes_requested" | "hold", reviewer: v.reviewer.trim(), notes: typeof v.notes === "string" ? v.notes : "" };
  } else if (job.kind === "copy_review" && r.status === "completed") {
    errors.push("a completed copy review must carry its verdict");
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, result: { status: r.status as PrepResult["status"], produced_by, produced_at, summary, outputs, review } };
}

/** The backoff the database applies after a failed attempt (minutes), for display. */
export function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** Math.max(attempts - 1, 0));
}

export type PrepOutcome =
  | "queued"
  | "already_queued"
  | "claimed"
  | "not_ready"
  | "succeeded"
  | "already"
  | "conflict"
  | "lost_lease"
  | "superseded"
  | "stale"
  | "retrying"
  | "failed"
  | "rejected"
  | "done"
  | "not_allowed"
  | "paused"
  | "resumed"
  | "invalid"
  | "error"
  | "unavailable";

export const PREP_NOTICES: Record<PrepOutcome, { ok: boolean; text: string }> = {
  queued: { ok: true, text: "Queued. Nothing runs by itself: hand it off when you're ready." },
  already_queued: { ok: true, text: "That exact packet is already queued for this company and kind; nothing was added." },
  claimed: { ok: true, text: "Handed off to you for 24 hours. Download the assignment (packet + hand-off ID), and import the result file here." },
  not_ready: { ok: false, text: "Not handed off: the job isn't ready (paused, backing off, stale, already leased, or the queue is paused)." },
  succeeded: { ok: true, text: "Result recorded. It is the worker's report: nothing was approved, sent or published." },
  already: { ok: true, text: "That exact result was already recorded; nothing changed." },
  conflict: { ok: false, text: "Not recorded: this job already has a different result." },
  lost_lease: { ok: false, text: "Not recorded: the hand-off expired or was cancelled. Hand it off again first." },
  superseded: {
    ok: false,
    text: "Not recorded: that result answers an earlier hand-off of this job (or the page was out of date). Nothing changed. Download the current assignment and redo the work from it.",
  },
  stale: { ok: false, text: "Not recorded: the company's evidence changed since this job was queued. Queue a new job." },
  retrying: { ok: true, text: "Recorded as blocked; the job will be retried after its backoff." },
  failed: { ok: false, text: "Recorded as blocked, and the job has no attempts left. Retry it to start again." },
  rejected: { ok: false, text: "Not recorded: the result file doesn't answer this job's packet (see the reasons)." },
  done: { ok: true, text: "Done." },
  not_allowed: { ok: false, text: "Not changed: that isn't possible in the job's current state." },
  paused: { ok: true, text: "The queue is paused: nothing can be handed off." },
  resumed: { ok: true, text: "The queue is running again." },
  invalid: { ok: false, text: "Not saved: check the fields." },
  error: { ok: false, text: "Not saved: the database refused it or couldn't be reached. Nothing changed; try again." },
  unavailable: { ok: false, text: "The preparation queue isn't connected on this environment." },
};
