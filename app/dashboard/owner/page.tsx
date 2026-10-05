// /dashboard/owner — Josh-only digital-services area. Owner identity is the
// verified auth id in DIGITAL_SERVICES_OWNER_USER_ID; marketplace admin status
// is not enough. Everyone else gets a 404, so the page doesn't advertise
// itself. Personal details are shown only here, never in alert emails.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { digitalServicesPublic } from "@/lib/digital-services/flags";
import { matchesSearch, referenceFor } from "@/lib/digital-services/intake";
import { INTERESTS } from "@/lib/digital-services/offer";
import { PILOT, PILOT_BLOCKERS, PILOT_CHECKED_AT } from "@/lib/digital-services/pilot";
import { createAdminClient } from "@/lib/supabase/admin";
import { setEnquiryStatus } from "./actions";

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
  const statusFilter = typeof sp.status === "string" ? sp.status : "";

  const admin = createAdminClient();
  let rows: Enquiry[] = [];
  let tableReady: boolean | null = null;
  if (admin) {
    const { data, error } = await admin
      .from("digital_services_enquiries")
      .select("id, created_at, business_name, contact_name, email, phone, website, interest, message, status, is_test, notified_at, notify_error")
      .order("created_at", { ascending: false })
      .limit(300);
    tableReady = !error;
    rows = (data as Enquiry[] | null) ?? [];
  }
  const shown = rows.filter((r) => (!statusFilter || r.status === statusFilter) && matchesSearch(r, q));
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
          <Check
            ok={process.env.DIGITAL_SERVICES_ALERT_TO ? true : null}
            label="Owner alerts"
            detail={process.env.DIGITAL_SERVICES_ALERT_TO ? "Alerts go to the configured owner address." : "Falls back to NOTIFICATION_TO; set DIGITAL_SERVICES_ALERT_TO for a dedicated address."}
          />
          <Check ok={false} label="Outreach sender" detail="No verified Outback Connections mailbox is connected. No outreach can send." />
          <Check ok={false} label="Engine" detail="The digital-services engine source isn't in this repository yet; reservations, drafts and replies aren't connected." />
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Small pilot</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Preview checks {PILOT_CHECKED_AT}. Every email row is blocked on: {PILOT_BLOCKERS.join("; ")}.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-600">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Lane</th>
                <th className="px-3 py-2">Preview</th>
                <th className="px-3 py-2">Reservation</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {PILOT.map((p) => (
                <tr key={p.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{p.id}</td>
                  <td className="px-3 py-2">{p.company}</td>
                  <td className="px-3 py-2">{p.lane === "email" ? "Email" : p.lane === "walk-in" ? "Walk-in (Josh)" : "Phone (Josh)"}</td>
                  <td className="px-3 py-2">
                    <a href={`${SITE}/preview/${p.previewToken}.html`} className="underline" target="_blank" rel="noreferrer">
                      {p.previewCheck === "pass" ? "Pass" : "Pass, see note"}
                    </a>
                    {p.previewNote && <span className="mt-1 block text-xs text-amber-800">{p.previewNote}</span>}
                  </td>
                  <td className="px-3 py-2">{p.reservedForCowork ? "Reserved for Cowork (engine hold)" : "—"}</td>
                  <td className="px-3 py-2">{p.lane === "email" ? "Held: approval + sender" : "Josh, in person"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Enquiries</h2>
        <form className="mt-3 flex flex-wrap gap-2" method="get">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, business, message"
            className="w-72 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <select name="status" defaultValue={statusFilter} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {["new", "replied", "qualified", "closed", "spam"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white">Filter</button>
        </form>
        {tableReady === false && <p className="mt-3 text-sm text-red-800">Enquiry storage isn&apos;t ready (see Readiness).</p>}
        {tableReady && shown.length === 0 && <p className="mt-3 text-sm text-neutral-600">No enquiries match.</p>}
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
              {r.notify_error && <p className="mt-2 text-xs text-red-800">Owner alert failed: {r.notify_error}</p>}
              <form action={setEnquiryStatus} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className="rounded border border-neutral-300 px-2 py-1 text-xs">
                  {["new", "replied", "qualified", "closed", "spam"].map((s) => (
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
      </section>
    </div>
  );
}
