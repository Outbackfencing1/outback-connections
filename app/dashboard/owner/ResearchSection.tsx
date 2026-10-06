// Owner dashboard: research work units (owner-only data, read with the
// service role after the page's owner check). Each assignment shows its
// issued hashes, connection (file hand-off only), state, progress and event
// history; each staged return its version, raw hash and contract result; the
// current candidates their review outcome and reasons, with hold / reject /
// accept-as-existing-company. Failed returns are the exception queue.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RESEARCH_ASSIGNMENTS_TABLE,
  RESEARCH_CANDIDATES_TABLE,
  RESEARCH_CONNECTION_TEXT,
  RESEARCH_DECISIONS_TABLE,
  RESEARCH_EVENTS_TABLE,
  RESEARCH_NOTICES,
  RESEARCH_RETURNS_TABLE,
  type ResearchOutcome,
} from "@/lib/digital-services/research-staging";
import { checkpointResearch, controlResearchAssignment, createResearchAssignment, decideResearchCandidate, stageResearchReturn } from "./research-actions";

type Assignment = {
  id: string;
  request_id: string;
  niche: string;
  country: string;
  cohort_limit: number;
  request_sha256: string;
  schema_sha256: string;
  exclusions_sha256: string;
  connection: string;
  state: string;
  progress: Record<string, unknown>;
  created_at: string;
};
type Event = { id: number; assignment_id: string; kind: string; detail: Record<string, unknown>; actor: string; at: string };
type Return = { id: string; assignment_id: string; version: number; raw_sha256: string; contract_ok: boolean; contract_errors: string[]; counts: Record<string, number>; created_at: string };
type Candidate = {
  id: string;
  assignment_id: string;
  request_id: string;
  candidate_key: string;
  version: number;
  business: string;
  locality: string | null;
  domain: string | null;
  outcome: string;
  reasons: string[];
  holds: string[];
};
type Decision = { candidate_id: string; decision: string; pilot_company_id: string | null; decided_at: string };

const button = "rounded border border-neutral-300 px-2 py-1 text-xs";
const field = "w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-xs";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "—");
const PAGE = 10;

async function loadResearch(admin: SupabaseClient | null) {
  if (!admin) return null;
  const a = await admin
    .from(RESEARCH_ASSIGNMENTS_TABLE)
    .select("id, request_id, niche, country, cohort_limit, request_sha256, schema_sha256, exclusions_sha256, connection, state, progress, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (a.error) return { readError: true as const };
  const assignments = (a.data ?? []) as Assignment[];
  const ids = assignments.map((x) => x.id);
  if (!ids.length) return { readError: false as const, assignments, events: [], returns: [], candidates: [], decisions: [] };
  const [e, r, c] = await Promise.all([
    admin.from(RESEARCH_EVENTS_TABLE).select("id, assignment_id, kind, detail, actor, at").in("assignment_id", ids).order("id", { ascending: false }).limit(200),
    admin
      .from(RESEARCH_RETURNS_TABLE)
      .select("id, assignment_id, version, raw_sha256, contract_ok, contract_errors, counts, created_at")
      .in("assignment_id", ids)
      .order("version", { ascending: false }),
    admin
      .from(RESEARCH_CANDIDATES_TABLE)
      .select("id, assignment_id, request_id, candidate_key, version, business, locality, domain, outcome, reasons, holds")
      .in("assignment_id", ids)
      .is("superseded_by_version", null)
      .order("candidate_key"),
  ]);
  if (e.error || r.error || c.error) return { readError: true as const };
  const candidates = (c.data ?? []) as Candidate[];
  const d = candidates.length
    ? await admin
        .from(RESEARCH_DECISIONS_TABLE)
        .select("candidate_id, decision, pilot_company_id, decided_at")
        .in(
          "candidate_id",
          candidates.map((x) => x.id)
        )
        .order("decided_at", { ascending: false })
    : { data: [], error: null };
  if (d.error) return { readError: true as const };
  return {
    readError: false as const,
    assignments,
    events: (e.data ?? []) as Event[],
    returns: (r.data ?? []) as Return[],
    candidates,
    decisions: (d.data ?? []) as Decision[],
  };
}

const CONTROLS: Record<string, [string, string][]> = {
  draft: [["start", "Start (mark handed over)"], ["close", "Close"]],
  started: [["pause", "Pause"], ["close", "Close"]],
  paused: [["resume", "Resume"], ["close", "Close"]],
  returned: [["pause", "Pause"], ["close", "Close"]],
  closed: [],
};

export async function ResearchSection({ admin, outcome, reason }: { admin: SupabaseClient | null; outcome: ResearchOutcome | null; reason: string }) {
  const data = await loadResearch(admin);
  const notice = outcome ? RESEARCH_NOTICES[outcome] : null;

  return (
    <section id="research" className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-semibold">Research work units</h2>
      <p className="mt-1 text-sm text-neutral-600">{RESEARCH_CONNECTION_TEXT} Staged rows are never sendable and never become companies on their own.</p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {notice.text}
          {reason ? ` ${reason}` : ""}
        </p>
      )}
      {!data ? (
        <p className="mt-3 text-sm text-neutral-600">{RESEARCH_NOTICES.unavailable.text}</p>
      ) : data.readError ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          Couldn&apos;t read research staging (is the draft migration applied?). Nothing is shown rather than an incomplete list.
        </p>
      ) : (
        <>
          <details className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
            <summary className="cursor-pointer text-sm">Create an assignment</summary>
            <form action={createResearchAssignment} className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid min-w-0 gap-1 text-xs">
                Niche
                <select name="niche" className={field} defaultValue="cleaning">
                  <option value="cleaning">Cleaning</option>
                  <option value="detailing">Detailing</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs">
                Country
                <input name="country" defaultValue="AU" pattern="[A-Za-z]{2}" className={field} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs">
                Cohort limit (1 to 25)
                <input name="cohort_limit" type="number" min={1} max={25} defaultValue={10} className={field} />
              </label>
              {(
                [
                  ["request", "Request file"],
                  ["schema", "Return schema file"],
                  ["exclusions", "Exclusions snapshot file"],
                ] as const
              ).map(([name, label]) => (
                <label key={name} className="grid min-w-0 gap-1 text-xs">
                  {label}
                  <input name={`${name}_file`} type="file" accept="application/json,.json" className={field} />
                </label>
              ))}
              <div>
                <button className={button}>Create assignment</button>
              </div>
            </form>
          </details>
          {data.assignments.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No research assignments yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.assignments.map((a) => {
                const returns = data.returns.filter((r) => r.assignment_id === a.id);
                const failed = returns.filter((r) => !r.contract_ok);
                const rows = data.candidates.filter((c) => c.assignment_id === a.id);
                const events = data.events.filter((e) => e.assignment_id === a.id);
                const progress = a.progress && Object.keys(a.progress).length ? JSON.stringify(a.progress) : null;
                return (
                  <li key={a.id} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="break-all font-semibold">{a.request_id}</span>
                      <span className="rounded bg-neutral-100 px-1.5 text-xs uppercase">{a.state}</span>
                      <span className="text-xs text-neutral-600">
                        {a.niche} · {a.country} · up to {a.cohort_limit} · {a.connection.replaceAll("_", " ")} · created {when(a.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-neutral-600">
                      assignment {a.id} · request {a.request_sha256} · schema {a.schema_sha256} · exclusions {a.exclusions_sha256}
                    </p>
                    {progress && <p className="mt-1 break-all text-xs text-neutral-600">Progress (your checkpoint): {progress}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a className={`${button} underline`} href={`/dashboard/owner/research/${a.id}/assignment`}>
                        Download assignment file
                      </a>
                      {(CONTROLS[a.state] ?? []).map(([action, label]) => (
                        <form key={action} action={controlResearchAssignment}>
                          <input type="hidden" name="assignment_id" value={a.id} />
                          <input type="hidden" name="action" value={action} />
                          <button className={button}>{label}</button>
                        </form>
                      ))}
                    </div>
                    {a.state !== "draft" && a.state !== "closed" && (
                      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                        <form action={checkpointResearch} className="flex min-w-0 flex-wrap items-end gap-2">
                          <input type="hidden" name="assignment_id" value={a.id} />
                          <label className="grid gap-1 text-xs">
                            Inspected so far
                            <input name="inspected" type="number" min={0} max={1000} className={`${field} w-24`} />
                          </label>
                          <label className="grid min-w-0 flex-1 gap-1 text-xs">
                            Note
                            <input name="note" maxLength={500} className={field} />
                          </label>
                          <button className={button}>Save checkpoint</button>
                        </form>
                        <form action={stageResearchReturn} className="flex min-w-0 flex-wrap items-end gap-2">
                          <input type="hidden" name="assignment_id" value={a.id} />
                          <label className="grid min-w-0 flex-1 gap-1 text-xs">
                            Return file (staged as a new version, never imported)
                            <input name="return_file" type="file" accept="application/json,.json" className={field} />
                          </label>
                          <button className={button}>Stage return</button>
                        </form>
                      </div>
                    )}
                    {returns.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs">
                        {returns.map((r) => (
                          <li key={r.id} className={`break-all ${r.contract_ok ? "text-neutral-700" : "text-red-800"}`}>
                            Version {r.version} · {r.contract_ok ? "contract checks passed" : "exception queue"} · raw {r.raw_sha256} · {when(r.created_at)}
                            {r.contract_ok && r.counts ? ` · ${Object.entries(r.counts).map(([k, n]) => `${k.replaceAll("_", " ")} ${n}`).join(", ")}` : ""}
                            {!r.contract_ok && r.contract_errors.length ? ` · ${r.contract_errors.slice(0, 3).join("; ")}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {failed.length > 0 && failed.length === returns.length && <p className="mt-1 text-xs text-red-800">Every return so far failed its contract: no candidate is staged.</p>}
                    {rows.length > 0 && (
                      <ul className="mt-2 space-y-2">
                        {rows.map((c) => {
                          const latest = data.decisions.find((d) => d.candidate_id === c.id);
                          return (
                            <li key={c.id} className="min-w-0 rounded border border-neutral-100 p-2 text-xs">
                              <div className="flex flex-wrap gap-x-2">
                                <span className="font-mono">{c.candidate_key}</span>
                                <span className="font-semibold">{c.business || "(no name)"}</span>
                                <span className="text-neutral-600">{[c.locality, c.domain].filter(Boolean).join(" · ")}</span>
                                <span className="rounded bg-neutral-100 px-1.5 uppercase">{c.outcome.replaceAll("_", " ")}</span>
                                <span className="text-neutral-600">v{c.version} · not sendable</span>
                                {latest && (
                                  <span className="text-neutral-800">
                                    Your decision: {latest.decision}
                                    {latest.pilot_company_id ? ` as ${latest.pilot_company_id}` : ""}
                                  </span>
                                )}
                              </div>
                              {[...c.reasons, ...c.holds].length > 0 && <p className="mt-1 break-words text-neutral-600">{[...c.reasons, ...c.holds].join(" · ")}</p>}
                              <form action={decideResearchCandidate} className="mt-1 flex min-w-0 flex-wrap items-end gap-2">
                                <input type="hidden" name="candidate_id" value={c.id} />
                                <select name="decision" className={`${field} w-auto`} defaultValue="hold">
                                  <option value="hold">Hold</option>
                                  <option value="reject">Reject</option>
                                  {c.outcome === "proposed_for_owner_review" && <option value="accept">Accept as existing company</option>}
                                </select>
                                {c.outcome === "proposed_for_owner_review" && <input name="pilot_company_id" pattern="OC-\d{3}" placeholder="OC-000 (existing)" className={`${field} w-36`} />}
                                <input name="note" maxLength={1000} placeholder="Note" className={`${field} w-40 flex-1`} />
                                <button className={button}>Record</button>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {events.length > 0 && (
                      <details className="mt-2 text-xs text-neutral-600">
                        <summary className="cursor-pointer">History ({events.length})</summary>
                        <ul className="mt-1 space-y-0.5">
                          {events.map((e) => (
                            <li key={e.id} className="break-all">
                              {when(e.at)} · {e.kind} · {e.actor}
                              {e.detail && Object.keys(e.detail).length ? ` · ${JSON.stringify(e.detail)}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
