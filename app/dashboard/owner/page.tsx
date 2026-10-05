// /dashboard/owner — Josh-only digital-services area. Owner identity is the
// verified auth id in DIGITAL_SERVICES_OWNER_USER_ID; marketplace admin status
// is not enough. Everyone else gets a 404, so the page doesn't advertise
// itself. Personal details are shown only here, never in alert emails.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { alertReadiness, digitalServicesPublic } from "@/lib/digital-services/flags";
import { matchesSearch, referenceFor } from "@/lib/digital-services/intake";
import { INTERESTS } from "@/lib/digital-services/offer";
import {
  OFFER_LABELS,
  PILOT_APPROVALS_TABLE,
  PILOT_BLOCKERS,
  PILOT_DRAFTS_TABLE,
  PILOT_EVENTS_TABLE,
  PILOT_TABLE,
  outreachSender,
  previewHref,
  type PilotRow,
} from "@/lib/digital-services/pilot";
import { HOLD_LABELS, firstContactHolds, type PilotApproval, type PilotDraft, type PilotEvent } from "@/lib/digital-services/dispatch-guard";
import { PAGE_SIZE, SEARCH_CHUNK, SEARCH_MAX_ROWS, STATUSES, pageFrom, statusesFor, type StatusChange } from "@/lib/digital-services/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvePilotMessage, setEnquiryStatus } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owner — digital services", robots: { index: false, follow: false } };

type Enquiry = {
  id: string;
  created_at: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  interest: string;
  message: string;
  status: string;
  is_test: boolean;
  notified_at: string | null;
  notify_error: string | null;
};

const SITE = "https://www.outbackconnections.com.au";

const PILOT_NOTICES: Record<string, { ok: boolean; text: string }> = {
  approved: { ok: true, text: "Message approval recorded for that exact revision." },
  refused: { ok: false, text: "Not approved: the database refused it (only your own session can approve, after the three reviews)." },
  failed: { ok: false, text: "Not approved: something went wrong. Nothing was recorded; try again." },
  invalid: { ok: false, text: "Not approved: that draft reference isn't valid." },
};

const NOTICES: Record<StatusChange, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Status saved." },
  not_found: { ok: false, text: "Not saved: that enquiry no longer exists (it may have been purged)." },
  failed: { ok: false, text: "Not saved: the database refused the change. Nothing was changed; try again." },
  invalid: { ok: false, text: "Not saved: that status isn't allowed." },
  unavailable: { ok: false, text: "Not saved: the enquiry database isn't connected on this environment." },
};

function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const tone = ok === true ? "text-green-800" : ok === false ? "text-red-800" : "text-amber-800";
  const mark = ok === true ? "Ready" : ok === false ? "Blocked" : "Waiting";
  return (
    <li className="flex flex-wrap gap-x-2 border-b border-neutral-100 py-2 text-sm last:border-0">
      <span className={`w-20 shrink-0 font-semibold ${tone}`}>{mark}</span>
      <span className="font-medium text-neutral-900">{label}</span>
      <span className="text-neutral-600">{detail}</span>
    </li>
  );
}

export default async function OwnerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getOwnerAccess();
  if (!access.ok) {
    if (access.reason === "not_signed_in") redirect("/signin?next=/dashboard/owner");
    if (access.reason === "forbidden") notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold">Owner area not configured</h1>
        <p className="mt-3 text-neutral-700">
          Set <code>DIGITAL_SERVICES_OWNER_USER_ID</code> in Vercel to the owner&apos;s Supabase auth user id, then
          redeploy. Until then nobody can open this page.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 200) : "";
  const statusFilter = typeof sp.status === "string" ? sp.status : "open";
  const page = pageFrom(typeof sp.page === "string" ? sp.page : undefined);
  const statuses = statusesFor(statusFilter);

  const viewQuery = new URLSearchParams({ status: statusFilter, ...(q ? { q } : {}), page: String(page) }).toString();
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice as StatusChange] : undefined;
  const pilotNotice = typeof sp.pilot === "string" ? PILOT_NOTICES[sp.pilot] : undefined;
  const noticeRef = typeof sp.ref === "string" && /^DSE-[0-9A-F]{8}$/.test(sp.ref) ? sp.ref : "";

  const admin = createAdminClient();
  let shown: Enquiry[] = [];
  let total: number | null = null;
  let scanCapped = false;
  let tableReady: boolean | null = null;
  if (admin) {
    const COLS =
      "id, created_at, business_name, contact_name, email, phone, website, interest, message, status, is_test, notified_at, notify_error";
    const base = () => {
      const query = admin.from("digital_services_enquiries").select(COLS, { count: "exact" });
      return statuses ? query.in("status", statuses) : query;
    };
    if (q.trim()) {
      // Search every page of the filtered set, newest first.
      tableReady = true;
      for (let from = 0; from < SEARCH_MAX_ROWS; from += SEARCH_CHUNK) {
        const { data, error } = await base().order("created_at", { ascending: false }).range(from, from + SEARCH_CHUNK - 1);
        if (error) {
          tableReady = false;
          break;
        }
        const chunk = (data as Enquiry[] | null) ?? [];
        shown.push(...chunk.filter((r) => matchesSearch(r, q)));
        if (chunk.length < SEARCH_CHUNK) break;
        if (from + SEARCH_CHUNK >= SEARCH_MAX_ROWS) scanCapped = true;
      }
    } else {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await base().order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
      tableReady = !error;
      shown = (data as Enquiry[] | null) ?? [];
      total = count ?? null;
    }
  }
  // Pilot rows: owner-only table, read after the owner check (never in source).
  let pilot: PilotRow[] | null = null;
  let drafts: PilotDraft[] = [];
  let approvals: PilotApproval[] = [];
  let events: (PilotEvent & { occurred_at: string })[] = [];
  if (admin) {
    const [p, d, a, e] = await Promise.all([
      admin.from(PILOT_TABLE).select("*").order("id"),
      admin.from(PILOT_DRAFTS_TABLE).select("id, company_id, revision, subject, body, sha256"),
      admin.from(PILOT_APPROVALS_TABLE).select("draft_id, draft_sha256, kind, actor, approved_at, approver_user_id"),
      admin.from(PILOT_EVENTS_TABLE).select("company_id, kind, occurred_at"),
    ]);
    if (!p.error) pilot = (p.data as PilotRow[] | null) ?? [];
    drafts = (d.data as PilotDraft[] | null) ?? [];
    approvals = (a.data as PilotApproval[] | null) ?? [];
    events = (e.data as (PilotEvent & { occurred_at: string })[] | null) ?? [];
  }
  const sender = outreachSender();
  const latestDraft = (companyId: string) =>
    drafts.filter((d) => d.company_id === companyId).sort((x, y) => y.revision - x.revision)[0] ?? null;
  const pages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const link = (p: number) =>
    `/dashboard/owner?${new URLSearchParams({ status: statusFilter, ...(q ? { q } : {}), page: String(p) }).toString()}`;
  const alerts = alertReadiness();
  const interestLabel = (v: string) => INTERESTS.find((i) => i.value === v)?.label ?? v;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-sm">
        <Link href="/dashboard" className="text-neutral-600 underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Digital services — owner</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Readiness</h2>
        <ul className="mt-2 rounded-xl border border-neutral-200 bg-white px-4">
          <Check ok={true} label="Owner access" detail="Signed in as the configured owner." />
          <Check
            ok={tableReady}
            label="Enquiry storage"
            detail={tableReady ? "Table reachable." : admin ? "Table missing: apply the approved digital_services_enquiries migration." : "Service key not set on this environment."}
          />
          <Check
            ok={digitalServicesPublic() ? true : null}
            label="Public page"
            detail={digitalServicesPublic() ? "/digital-services is live." : "Off (DIGITAL_SERVICES_PUBLIC is not 'on'). Switch on after terms are confirmed."}
          />
          <Check ok={alerts.ok} label="Owner alerts" detail={alerts.detail} />
          <Check
            ok={sender?.verified && !/^help@/i.test(sender.address) ? true : false}
            label="Outreach sender"
            detail={
              !sender
                ? "No outreach sender named (DIGITAL_SERVICES_OUTREACH_SENDER). No outreach can send."
                : /^help@/i.test(sender.address)
                  ? "help@ is the support/transactional address and can't be the outreach sender."
                  : sender.verified
                    ? `${sender.address}: owned-inbox send/reply test recorded.`
                    : `${sender.address} is named but its owned-inbox send/reply test isn't recorded (DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON).`
            }
          />
          <Check ok={false} label="Engine" detail="The digital-services engine source isn't in this repository yet; reservations, drafts and replies aren't connected." />
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Small pilot</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Every email row is blocked on: {PILOT_BLOCKERS.join("; ")}.
        </p>
        {pilotNotice && (
          <p
            role={pilotNotice.ok ? "status" : "alert"}
            className={`mt-3 rounded-xl border px-4 py-3 text-sm ${pilotNotice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
          >
            {pilotNotice.text}
          </p>
        )}
        {pilot === null ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Pilot records aren&apos;t connected. They stay in owner-only storage (the shared plan&apos;s private update
            log) until the approved <code>digital_services_pilot</code> table is applied and loaded. They are never kept
            in the public repository.
          </p>
        ) : pilot.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">The pilot table is empty.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs uppercase text-neutral-600">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Lane</th>
                  <th className="px-3 py-2">Preview</th>
                  <th className="px-3 py-2">Offer</th>
                  <th className="px-3 py-2">Draft</th>
                  <th className="px-3 py-2">First contact</th>
                </tr>
              </thead>
              <tbody>
                {pilot.map((p) => {
                  const href = previewHref(SITE, p.preview_token);
                  const draft = latestDraft(p.id);
                  const contacted = events.find((e) => e.company_id === p.id && e.kind === "contacted");
                  const holds = firstContactHolds({
                    lane: p.reserved_for ?? "cowork",
                    company: p,
                    drafts,
                    draftId: draft?.id ?? null,
                    approvals,
                    events,
                    sender,
                    ownerUserId: access.userId,
                  });
                  const reviewsDone =
                    !!draft &&
                    ["evidence_refresh", "preview_review", "copy_review"].every((k) =>
                      approvals.some((a) => a.draft_id === draft.id && a.draft_sha256 === draft.sha256 && a.kind === k)
                    );
                  const ownerApproved =
                    !!draft &&
                    approvals.some((a) => a.draft_id === draft.id && a.draft_sha256 === draft.sha256 && a.kind === "message_approval" && a.approver_user_id === access.userId);
                  const label = p.preview_check === "pass" ? "Pass" : p.preview_check === "pass-with-note" ? "Pass, see note" : "Not checked";
                  return (
                    <tr key={p.id} className="border-t border-neutral-100 align-top">
                      <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                      <td className="px-3 py-2">{p.company}</td>
                      <td className="px-3 py-2">{p.lane === "email" ? "Email" : p.lane === "walk-in" ? "Walk-in (Josh)" : "Phone (Josh)"}</td>
                      <td className="px-3 py-2">
                        {href ? (
                          <a href={href} className="underline" target="_blank" rel="noreferrer">
                            {label}
                          </a>
                        ) : (
                          label
                        )}
                        {p.checked_at && <span className="block text-xs text-neutral-500">{p.checked_at}</span>}
                        {p.preview_note && <span className="mt-1 block text-xs text-amber-800">{p.preview_note}</span>}
                      </td>
                      <td className="px-3 py-2">{p.offer ? OFFER_LABELS[p.offer] : "—"}</td>
                      <td className="px-3 py-2">
                        {draft ? `Revision ${draft.revision}` : "—"}
                        {draft && (
                          <span className="block text-xs text-neutral-500">
                            {approvals.filter((a) => a.draft_id === draft.id && a.draft_sha256 === draft.sha256).length}/4 approvals
                          </span>
                        )}
                        {draft && reviewsDone && !ownerApproved && (
                          <form action={approvePilotMessage} className="mt-1">
                            <input type="hidden" name="draft_id" value={draft.id} />
                            <input type="hidden" name="draft_sha256" value={draft.sha256} />
                            <input type="hidden" name="view" value={viewQuery} />
                            <button className="rounded border border-neutral-300 px-2 py-0.5 text-xs">Approve revision {draft.revision}</button>
                          </form>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {contacted ? (
                          `Contacted ${new Date(contacted.occurred_at).toLocaleDateString("en-AU")}`
                        ) : p.lane !== "email" ? (
                          "Josh, in person"
                        ) : (
                          <>
                            <span className="font-semibold text-amber-800">Held</span>
                            {p.reserved_for && <span className="block text-xs text-neutral-500">Reserved for {p.reserved_for}</span>}
                            <span className="block text-xs text-neutral-600">{holds.map((h) => HOLD_LABELS[h] ?? h).join("; ")}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Enquiries</h2>
        {notice && (
          <p
            role={notice.ok ? "status" : "alert"}
            className={`mt-3 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
          >
            {noticeRef ? `${noticeRef}: ` : ""}
            {notice.text}
          </p>
        )}
        <form className="mt-3 flex flex-wrap gap-2" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, business, message"
            className="w-72 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={statusFilter} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="open">Open (new, replied, qualified)</option>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Filter</button>
        </form>
        {tableReady === false && <p className="mt-3 text-sm text-red-800">Enquiry storage isn&apos;t ready (see Readiness).</p>}
        {tableReady && shown.length === 0 && <p className="mt-3 text-sm text-neutral-600">No enquiries match.</p>}
        {q.trim() && tableReady && (
          <p className="mt-3 text-xs text-neutral-600">
            {shown.length} match{shown.length === 1 ? "" : "es"} across every page
            {scanCapped ? ` (searched the newest ${SEARCH_MAX_ROWS.toLocaleString("en-AU")} rows only)` : ""}.
          </p>
        )}
        {!q.trim() && total !== null && total > 0 && (
          <p className="mt-3 text-xs text-neutral-600">
            {total} enquir{total === 1 ? "y" : "ies"} · page {page} of {pages}
          </p>
        )}
        <ul className="mt-4 space-y-3">
          {shown.map((r) => (
            <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-xs text-neutral-500">{referenceFor(r.id)}</span>
                {r.is_test && <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">TEST</span>}
                <span className="font-semibold text-neutral-900">{r.business_name}</span>
                <span className="text-neutral-600">{interestLabel(r.interest)}</span>
                <span className="text-neutral-500">{new Date(r.created_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}</span>
              </div>
              <p className="mt-1 text-neutral-800">
                {r.contact_name} · <a className="underline" href={`mailto:${r.email}`}>{r.email}</a>
                {r.phone ? ` · ${r.phone}` : ""}
                {r.website ? (
                  <>
                    {" · "}
                    <a className="underline" href={r.website} target="_blank" rel="noreferrer nofollow">
                      website
                    </a>
                  </>
                ) : null}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-neutral-700">{r.message}</p>
              {r.notify_error ? (
                <p className="mt-2 text-xs text-red-800">Owner alert failed: {r.notify_error}</p>
              ) : !r.notified_at ? (
                <p className="mt-2 text-xs text-amber-800">Owner alert not confirmed (check the server log for {referenceFor(r.id)}).</p>
              ) : null}
              <form action={setEnquiryStatus} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="view" value={viewQuery} />
                <select name="status" defaultValue={r.status} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="rounded border border-neutral-300 px-2 py-1 text-xs">Update</button>
              </form>
            </li>
          ))}
        </ul>
        {!q.trim() && pages > 1 && (
          <nav className="mt-4 flex gap-3 text-sm" aria-label="Enquiry pages">
            {page > 1 && (
              <Link className="underline" href={link(page - 1)}>
                ← Newer
              </Link>
            )}
            {page < pages && (
              <Link className="underline" href={link(page + 1)}>
                Older →
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
