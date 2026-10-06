// /dashboard/owner/review/[draftId] — Josh-only review of one pilot draft
// before he records a message approval: the exact subject and body, revision
// and hash, source evidence with its age and method, open uncertainties and
// sending holds, offer scope, preview and every review on record. Model text
// is rendered as plain text (React escapes it) with hidden characters made
// visible. Recording an approval does not send anything.
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { loadApprovalReview } from "@/lib/digital-services/approval-review-load";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvePilotMessage } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner — review draft", robots: { index: false, follow: false } };

const KIND_LABELS: Record<string, string> = {
  evidence_refresh: "Evidence refresh",
  preview_review: "Preview review",
  copy_review: "Copy review",
  message_approval: "Your message approval",
};
const STATUS_LABELS: Record<string, string> = {
  valid: "Recorded for this exact revision",
  missing: "Not recorded",
  earlier_revision: "Only on an earlier revision (doesn't carry over)",
  changed_copy: "Recorded against different copy (doesn't count)",
  other_owner: "Recorded by a different owner (doesn't count)",
};
const NOTICES: Record<string, { ok: boolean; text: string }> = {
  approved: { ok: true, text: "Approval recorded for this exact revision. Nothing was sent: sending is not connected." },
  refused: { ok: false, text: "Not approved: the database refused it (only your own session can approve, after the three reviews). Nothing was recorded." },
  stale: {
    ok: false,
    text: "Not approved: this revision is no longer current (a newer revision exists, the evidence changed, or a different owner approved it). Nothing was recorded.",
  },
  unconfirmed: { ok: false, text: "We couldn't confirm the approval. Refresh to see whether it was recorded; trying again is safe." },
  invalid: { ok: false, text: "Not approved: that draft reference isn't valid." },
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }) : "—");

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-neutral-800">{children}</div>
    </section>
  );
}

export default async function ReviewDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { draftId } = await params;
  const access = await getOwnerAccess();
  if (!access.ok) {
    if (access.reason === "not_signed_in") redirect(`/signin?next=${encodeURIComponent(`/dashboard/owner/review/${draftId}`)}`);
    notFound();
  }
  const sp = await searchParams;
  const notice = typeof sp.pilot === "string" ? NOTICES[sp.pilot] : undefined;
  const review = await loadApprovalReview(createAdminClient(), draftId, access.userId, new Date());
  if (review.state === "not_found") notFound();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <a href="/dashboard/owner" className="text-sm underline">
        Back to the owner dashboard
      </a>
      <h1 className="mt-3 text-2xl font-bold">Review a draft before approval</h1>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Approving records your approval of this exact revision only. It does not send anything: sending is not connected,
        and a send would still need every hold below cleared.
      </p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {notice.text}
        </p>
      )}

      {review.state === "unavailable" && (
        <Panel title="Not available">
          Owner storage isn&apos;t connected on this environment (no service key), so no draft can be reviewed or approved here.
        </Panel>
      )}
      {review.state === "error" && (
        <Panel title="Couldn't load this review">
          Reading the pilot {review.what} failed, so the review would be incomplete. Nothing is shown and approval is unavailable.
          Refresh to try again.
        </Panel>
      )}

      {review.state === "ready" && (
        <>
          <Panel title={`${review.company.name} (${review.company.id})`}>
            <p>
              Lane: {review.company.lane}
              {review.company.reserved_for ? `, reserved for ${review.company.reserved_for}` : ", not reserved for a lane"}
            </p>
            <p className="mt-1">
              Revision {review.draft.revision} of {review.draft.latest_revision}
              {review.draft.is_latest ? " (latest)" : " (not the latest)"} · written by {review.draft.author ?? "unknown"} on {when(review.draft.created_at)}
            </p>
            {review.draft.change_reason && <p className="mt-1 text-neutral-600">Change reason: {review.draft.change_reason}</p>}
            <p className="mt-1 break-all font-mono text-xs text-neutral-600">
              SHA-256 {review.draft.sha256} {review.draft.hash_ok ? "(matches the copy)" : "(DOES NOT match the copy)"}
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Evidence revision: draft {review.draft.evidence_revision ?? "unversioned"}, current {review.company.evidence_revision ?? "unversioned"}
              {review.evidence_current ? " (current)" : " (changed since this draft)"}
            </p>
          </Panel>

          <Panel title="Exact email">
            <p className="text-xs uppercase text-neutral-500">Subject</p>
            <pre data-testid="draft-subject" className="mt-1 whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-sans">
              {review.draft.subject.text}
            </pre>
            <p className="mt-3 text-xs uppercase text-neutral-500">Body</p>
            <pre data-testid="draft-body" className="mt-1 whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-sans">
              {review.draft.body.text}
            </pre>
            {(review.draft.subject.found.length > 0 || review.draft.body.found.length > 0) && (
              <p role="alert" className="mt-2 text-red-800">
                Hidden or control characters found: {[...new Set([...review.draft.subject.found, ...review.draft.body.found])].join(", ")}.
              </p>
            )}
            {review.draft.links.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {review.draft.links.map((l) => (
                  <li key={l.url} className={l.ok ? "text-neutral-700" : "text-red-800"}>
                    <span className="break-all">{l.url}</span> {l.ok ? "" : `(${l.why})`}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Offer and preview">
            {review.offer ? (
              <>
                <p>
                  {review.offer.name}, {review.offer.price}
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {review.offer.scope.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                {review.offer.note && <p className="mt-1 text-neutral-600">{review.offer.note}</p>}
              </>
            ) : (
              <p className="text-amber-800">No offer is set on this draft or company.</p>
            )}
            <p className="mt-2">
              Preview check: {review.preview.check}
              {review.preview.checked_at ? ` on ${review.preview.checked_at}` : ""}
              {review.preview.token_ok ? "" : " · no valid preview link"}
            </p>
            {review.preview.note && <p className="mt-1 text-amber-800">{review.preview.note}</p>}
            {review.preview.token_ok && (
              <p className="mt-1 text-xs text-neutral-600">The preview link is opened from the dashboard row (owner-only token, not shown here).</p>
            )}
          </Panel>

          <Panel title={`Source evidence (${review.evidence.length})`}>
            {review.evidence.length === 0 ? (
              <p className="text-amber-800">No evidence is recorded for this company.</p>
            ) : (
              <ul className="space-y-3">
                {review.evidence.map((e) => (
                  <li key={e.id} className="border-b border-neutral-100 pb-2 last:border-0">
                    <p className="break-all font-mono text-xs">{e.source_url}</p>
                    <p className="text-xs text-neutral-600">
                      {e.method} · checked {when(e.checked_at)} · {e.age_days === null ? "age unknown" : `${e.age_days} day${e.age_days === 1 ? "" : "s"} old`}
                      {e.stale ? " · STALE" : ""} · recorded by {e.recorded_by}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{e.fact_text}</p>
                    {e.limitations.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-neutral-600">
                        {e.limitations.map((l) => (
                          <li key={l}>{l}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Open uncertainties and holds">
            {review.uncertainties.length > 0 ? (
              <ul className="list-disc pl-5">
                {review.uncertainties.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-600">No uncertainties recorded.</p>
            )}
            <p className="mt-3 font-medium">Sending holds (sending is not connected regardless)</p>
            <ul className="mt-1 list-disc pl-5 text-neutral-700">
              {review.sending_holds.map((h) => (
                <li key={h.hold}>{h.label}</li>
              ))}
            </ul>
          </Panel>

          <Panel title="Reviews on record">
            <ul className="space-y-1">
              {review.reviews.map((r) => (
                <li key={r.kind}>
                  <span className="font-medium">{KIND_LABELS[r.kind]}:</span>{" "}
                  <span className={r.status === "valid" ? "text-green-800" : "text-amber-800"}>{STATUS_LABELS[r.status]}</span>
                  {r.actor && (
                    <span className="text-neutral-600">
                      {" "}
                      · {r.actor}, {when(r.at)}
                      {r.revision !== null ? `, revision ${r.revision}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {review.revisions.length > 1 && (
              <p className="mt-2 text-xs text-neutral-600">
                All revisions:{" "}
                {review.revisions.map((r) => `${r.revision} (${r.approvals}/4, ${r.sha256.slice(0, 12)}…)`).join(" · ")}
              </p>
            )}
          </Panel>

          <Panel title="Approval">
            {review.can_approve ? (
              <form action={approvePilotMessage}>
                <input type="hidden" name="draft_id" value={review.draft.id} />
                <input type="hidden" name="draft_sha256" value={review.draft.sha256} />
                <p>
                  You are approving revision {review.draft.revision} (SHA-256 {review.draft.sha256.slice(0, 12)}…, evidence revision{" "}
                  {review.draft.evidence_revision}) as shown above. The approval records you, the time and this exact revision. It does not send.
                </p>
                <button className="mt-2 rounded border border-neutral-400 px-3 py-1 text-sm font-medium">
                  Record approval of revision {review.draft.revision} (does not send)
                </button>
              </form>
            ) : (
              <>
                <p className="font-medium">Approval isn&apos;t available yet:</p>
                <ul data-testid="approval-blockers" className="mt-1 list-disc pl-5 text-amber-900">
                  {review.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
