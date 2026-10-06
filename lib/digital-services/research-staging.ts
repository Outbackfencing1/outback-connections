// lib/digital-services/research-staging.ts
// Owner-only research work units (draft migration
// digital_services_research_staging.sql). An assignment holds the exact
// request, schema and exclusions it was issued with; a researcher's return is
// reviewed by the existing handoff adapter (research-handoff.ts) against
// those files AND every candidate already staged for other requests, then
// staged as an immutable version. Nothing here imports a company, makes a row
// sendable, or invokes a model: the only connection is a file hand-off.
import {
  HANDOFF_CONTRACT,
  loadExclusionSnapshot,
  loadHandoffRequest,
  loadPriorResearch,
  reviewHandoff,
  sha256Hex,
  type HandoffReport,
  type PriorResearch,
} from "./research-handoff";

export const RESEARCH_ASSIGNMENTS_TABLE = "digital_services_research_assignments";
export const RESEARCH_EVENTS_TABLE = "digital_services_research_events";
export const RESEARCH_RETURNS_TABLE = "digital_services_research_returns";
export const RESEARCH_CANDIDATES_TABLE = "digital_services_research_candidates";
export const RESEARCH_DECISIONS_TABLE = "digital_services_research_decisions";
export const RESEARCH_ASSIGNMENT_CONTRACT = "oc-research-assignment/0.1";
/** The only connection that exists. Start never means a model was invoked. */
export const RESEARCH_CONNECTION = "file_handoff_only";
export const RESEARCH_CONNECTION_TEXT =
  "File hand-off only: no research worker is connected. Start marks the assignment file ready to hand over; nobody is invoked.";

export type AssignmentFiles = {
  id: string;
  request_id: string;
  niche: "cleaning" | "detailing";
  country: string;
  cohort_limit: number;
  request_text: string;
  schema_text: string;
  exclusions_text: string;
  request_sha256: string;
  schema_sha256: string;
  exclusions_sha256: string;
  state: string;
};

/**
 * Check the three issued files before an assignment is created: the request
 * must be the handoff contract for this niche, pin the exclusions file's raw
 * SHA-256, keep every live action off, and the cohort must be small.
 */
export function checkAssignmentFiles(input: {
  request_text: string;
  schema_text: string;
  exclusions_text: string;
  niche: string;
  cohort_limit: number;
}): { ok: true; request_id: string } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (input.niche !== "cleaning" && input.niche !== "detailing") errors.push("niche must be cleaning or detailing");
  if (!Number.isInteger(input.cohort_limit) || input.cohort_limit < 1 || input.cohort_limit > 25) errors.push("cohort limit must be 1 to 25");
  let request: ReturnType<typeof loadHandoffRequest> | null = null;
  try {
    const raw = JSON.parse(input.request_text);
    request = loadHandoffRequest(raw);
    if (raw.segment !== input.niche) errors.push(`the request's segment is ${JSON.stringify(raw.segment)}, not ${input.niche}`);
  } catch (e) {
    errors.push(`request: ${(e as Error).message}`);
  }
  try {
    JSON.parse(input.schema_text);
  } catch {
    errors.push("schema: not JSON");
  }
  if (request) {
    try {
      loadExclusionSnapshot(input.exclusions_text, request.exclusions_sha256);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors.length || !request ? { ok: false, errors } : { ok: true, request_id: request.request_id };
}

/** The file handed to the researcher: the exact issued texts and their hashes. */
export function assignmentPacket(a: AssignmentFiles): string {
  return JSON.stringify(
    {
      contract_id: RESEARCH_ASSIGNMENT_CONTRACT,
      assignment_id: a.id,
      request_id: a.request_id,
      return_contract: HANDOFF_CONTRACT,
      niche: a.niche,
      country: a.country,
      cohort_limit: a.cohort_limit,
      connection: RESEARCH_CONNECTION,
      hashes: { request_sha256: a.request_sha256, schema_sha256: a.schema_sha256, exclusions_sha256: a.exclusions_sha256 },
      constraints: { sendable: false, contact: "none", form_submissions: "none", spending: "none", publishing: "none", database_writes: "none" },
      request: a.request_text,
      schema: a.schema_text,
      exclusions: a.exclusions_text,
    },
    null,
    2
  );
}

/** Staged rows from other requests, as prior research for the adapter. */
export function priorFromStaged(rows: { request_id: string; candidate_key: string; business: string; locality: string | null; domain: string | null; outcome: string }[]): PriorResearch[] {
  return loadPriorResearch(
    rows.map((r) => ({ request_id: r.request_id, candidate_key: r.candidate_key, business: r.business || undefined, owned_domain: r.domain ?? undefined, locality: r.locality, disposition: r.outcome })),
    "staged"
  );
}

export type StagingReport = HandoffReport & { contract_errors: string[]; counts: HandoffReport["summary"] };

/**
 * Review a raw return against its assignment's issued files and prior staged
 * research. A return that isn't JSON, or fails a contract check, still gets a
 * report (with contract_errors) so it is kept in the exception queue.
 */
export function reviewReturnForStaging(raw: string, a: AssignmentFiles, prior: PriorResearch[], now: string): StagingReport {
  const request = loadHandoffRequest(JSON.parse(a.request_text));
  const exclusions = loadExclusionSnapshot(a.exclusions_text, a.exclusions_sha256);
  let output: unknown;
  try {
    output = JSON.parse(raw);
  } catch (e) {
    const empty = reviewHandoff(null, { request, schema: JSON.parse(a.schema_text), exclusions, prior, now });
    return { ...empty, request_id: a.request_id, contract_errors: [`return: not JSON (${(e as Error).message})`], counts: empty.summary };
  }
  const report = reviewHandoff(output, { request, schema: JSON.parse(a.schema_text), exclusions, prior, now });
  const tooMany = report.candidates.length > a.cohort_limit ? [`return has ${report.candidates.length} candidates; the assignment's cohort limit is ${a.cohort_limit}`] : [];
  return { ...report, contract_errors: [...report.adapter_errors, ...tooMany], counts: report.summary };
}

export const rawSha = (raw: string) => sha256Hex(raw);

export type ResearchOutcome =
  | "created"
  | "already_exists"
  | "done"
  | "not_allowed"
  | "staged"
  | "already_staged"
  | "contract_failed"
  | "superseded"
  | "no_such_company"
  | "invalid"
  | "error"
  | "unavailable";

export const RESEARCH_NOTICES: Record<ResearchOutcome, { ok: boolean; text: string }> = {
  created: { ok: true, text: "Assignment created. Nothing was sent to anyone: download its file and hand it over yourself." },
  already_exists: { ok: true, text: "That request already has this assignment; nothing was added." },
  done: { ok: true, text: "Done." },
  not_allowed: { ok: false, text: "Not changed: that isn't possible in its current state." },
  staged: { ok: true, text: "Return staged as a new version. Nothing was imported: each proposed row waits for your decision." },
  already_staged: { ok: true, text: "That exact return was already staged; nothing changed." },
  contract_failed: { ok: false, text: "Return kept in the exception queue: its contract checks failed, so no candidate was staged." },
  superseded: { ok: false, text: "Not recorded: a newer return replaced that row. Decide on the current version." },
  no_such_company: { ok: false, text: "Not accepted: name an existing pilot company (OC-000). No ID is ever invented." },
  invalid: { ok: false, text: "Not saved: check the fields." },
  error: { ok: false, text: "Not saved: the database refused it or couldn't be reached. Nothing changed; try again." },
  unavailable: { ok: false, text: "Research staging isn't connected on this environment." },
};
