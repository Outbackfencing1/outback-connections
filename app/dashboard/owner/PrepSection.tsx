// Owner dashboard: the preparation queue (owner-only data, read with the
// service role after the page's owner check). It shows every job's state,
// lease, attempts, backoff and progress, and offers the person-run hand-off:
// download the packet, import the result file. No worker runs automatically.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PREP_JOBS_TABLE,
  PREP_KINDS,
  PREP_KIND_LABELS,
  PREP_NOTICES,
  PREP_PAGE_SIZE,
  PREP_SETTINGS_TABLE,
  type PrepKind,
  type PrepOutcome,
} from "@/lib/digital-services/prep-queue";
import { controlPrepJob, enqueuePrepJob, handOffPrepJob, importPrepResult, setPrepQueuePaused } from "./prep-actions";

type Job = {
  id: string;
  company_id: string;
  kind: PrepKind;
  draft_id: string | null;
  packet_sha256: string;
  evidence_revision: number;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_expires_at: string | null;
  lease_generation: number;
  lease_token: string | null;
  assignment_id: string | null;
  progress: Record<string, unknown>;
  last_error: string | null;
  result_sha256: string | null;
  created_at: string;
  finished_at: string | null;
};

const button = "rounded border border-neutral-300 px-2 py-1 text-xs";
const field = "w-full min-w-0 rounded border border-neutral-300 px-2 py-1 text-xs";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "—");

async function loadPrep(admin: SupabaseClient | null, page: number) {
  let jobs: Job[] | null = null;
  let total = 0;
  let paused: boolean | null = null;
  let readError = false;
  if (admin) {
    const from = (page - 1) * PREP_PAGE_SIZE;
    const [j, s] = await Promise.all([
      admin
        .from(PREP_JOBS_TABLE)
        .select(
          "id, company_id, kind, draft_id, packet_sha256, evidence_revision, status, attempts, max_attempts, next_attempt_at, lease_owner, lease_expires_at, lease_generation, lease_token, assignment_id, progress, last_error, result_sha256, created_at, finished_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(from, from + PREP_PAGE_SIZE - 1),
      admin.from(PREP_SETTINGS_TABLE).select("paused").maybeSingle(),
    ]);
    if (j.error || s.error) readError = true;
    else {
      jobs = (j.data ?? []) as Job[];
      total = j.count ?? jobs.length;
      paused = (s.data as { paused?: boolean } | null)?.paused ?? false;
    }
  }
  // Lease and backoff states are judged at load time.
  return { jobs, total, paused, readError, now: Date.now() };
}

export async function PrepSection({ admin, outcome, reason, page }: { admin: SupabaseClient | null; outcome: PrepOutcome | null; reason: string; page: number }) {
  const { jobs, total, paused, readError, now } = await loadPrep(admin, page);
  const pages = Math.max(1, Math.ceil(total / PREP_PAGE_SIZE));
  const notice = outcome ? PREP_NOTICES[outcome] : null;

  return (
    <section id="prep" className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-semibold">Preparation queue</h2>
      <p className="mt-1 text-sm text-neutral-600">
        No worker runs automatically. A job moves only when you hand it off, work it (or run the private engine on its packet) and import the
        result file. Results are reports: they never approve, send or publish anything.
      </p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {notice.text}
          {reason ? ` ${reason}` : ""}
        </p>
      )}
      {!admin ? (
        <p className="mt-3 text-sm text-neutral-600">{PREP_NOTICES.unavailable.text}</p>
      ) : readError ? (
        <p role="alert" className="mt-3 text-sm text-red-800">
          Couldn&apos;t read the preparation queue (is the draft migration applied?). Nothing is shown rather than an incomplete list.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className={paused ? "font-semibold text-amber-800" : "text-neutral-700"}>{paused ? "Queue paused" : "Queue running"}</span>
            <form action={setPrepQueuePaused}>
              <input type="hidden" name="paused" value={paused ? "false" : "true"} />
              <button className={button}>{paused ? "Resume the queue" : "Pause the queue"}</button>
            </form>
          </div>
          <details className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
            <summary className="cursor-pointer text-sm">Queue a preparation job</summary>
            <form action={enqueuePrepJob} className="mt-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="grid min-w-0 gap-1 text-xs">
                Pilot company
                <input name="company_id" required pattern="OC-\d{3}" placeholder="OC-000" className={field} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs">
                Kind
                <select name="kind" className={field} defaultValue="copy_draft">
                  {PREP_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {PREP_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-xs">
                Draft id (review and preview jobs)
                <input name="draft_id" className={field} />
              </label>
              <div>
                <button className={button}>Queue job</button>
              </div>
            </form>
          </details>
          {jobs && jobs.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No preparation jobs yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {(jobs ?? []).map((j) => {
                const leaseLive = j.status === "leased" && j.lease_expires_at && Date.parse(j.lease_expires_at) > now;
                const backingOff = j.status === "queued" && Date.parse(j.next_attempt_at) > now;
                const progress = j.progress && Object.keys(j.progress).length ? JSON.stringify(j.progress) : null;
                return (
                  <li key={j.id} className="min-w-0 rounded-xl border border-neutral-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold">{PREP_KIND_LABELS[j.kind]}</span>
                      <span className="font-mono text-xs">{j.company_id}</span>
                      <span className="rounded bg-neutral-100 px-1.5 text-xs uppercase">{j.status}</span>
                      <span className="text-xs text-neutral-600">
                        attempt {j.attempts} of {j.max_attempts} · queued {when(j.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-neutral-600">
                      packet {j.packet_sha256} · evidence revision {j.evidence_revision}
                      {j.result_sha256 ? ` · result ${j.result_sha256}` : ""}
                    </p>
                    {j.status === "leased" && (
                      <p className={`mt-1 text-xs ${leaseLive ? "text-neutral-700" : "text-red-800"}`}>
                        Held by {j.lease_owner} (hand-off {j.lease_generation}) until {when(j.lease_expires_at)}
                        {leaseLive ? "" : " (expired: it can be handed off again)"}
                      </p>
                    )}
                    {backingOff && <p className="mt-1 text-xs text-amber-800">Backing off until {when(j.next_attempt_at)}</p>}
                    {progress && <p className="mt-1 break-all text-xs text-neutral-600">Progress: {progress}</p>}
                    {j.last_error && <p className="mt-1 text-xs text-red-800">Last error: {j.last_error}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(j.status === "queued" || (j.status === "leased" && !leaseLive)) && !paused && (
                        <form action={handOffPrepJob}>
                          <input type="hidden" name="job_id" value={j.id} />
                          <button className={button}>Hand off to me (24 h)</button>
                        </form>
                      )}
                      {j.status === "leased" && leaseLive && (
                        <a className={`${button} underline`} href={`/dashboard/owner/prep/${j.id}/assignment`}>
                          Download assignment (hand-off {j.lease_generation})
                        </a>
                      )}
                      {(
                        [
                          ["pause", "Pause", j.status === "queued"],
                          ["resume", "Resume", j.status === "paused"],
                          ["retry", j.status === "failed" ? "Retry (fresh attempts)" : "Run now", j.status === "failed" || backingOff],
                          ["cancel", "Cancel", ["queued", "paused", "leased", "failed"].includes(j.status)],
                        ] as const
                      )
                        .filter(([, , show]) => show)
                        .map(([action, label]) => (
                          <form key={action} action={controlPrepJob}>
                            <input type="hidden" name="job_id" value={j.id} />
                            <input type="hidden" name="action" value={action} />
                            <button className={button}>{label}</button>
                          </form>
                        ))}
                    </div>
                    {j.status === "leased" && leaseLive && (
                      <form action={importPrepResult} className="mt-2 grid min-w-0 gap-1">
                        <input type="hidden" name="job_id" value={j.id} />
                        <input type="hidden" name="lease_token" value={j.lease_token ?? ""} />
                        <input type="hidden" name="assignment_id" value={j.assignment_id ?? ""} />
                        <label className="grid min-w-0 gap-1 text-xs">
                          Result file (oc-prep-result/0.1 JSON)
                          <textarea name="result" required rows={3} className={field} />
                        </label>
                        <div>
                          <button className={button}>Import result</button>
                        </div>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {pages > 1 && (
            <nav className="mt-3 flex gap-3 text-sm" aria-label="Preparation job pages">
              {page > 1 && (
                <a className="underline" href={`/dashboard/owner?pp=${page - 1}#prep`}>
                  ← Newer
                </a>
              )}
              <span className="text-neutral-600">
                page {page} of {pages}
              </span>
              {page < pages && (
                <a className="underline" href={`/dashboard/owner?pp=${page + 1}#prep`}>
                  Older →
                </a>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}
