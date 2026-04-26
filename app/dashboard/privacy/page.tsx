import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import RequestExportForm from "./RequestExportForm";
import RevokeMarketingForm from "./RevokeMarketingForm";

export const metadata = {
  title: "Your data — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PrivacyDashboardPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/privacy");
  const user = userData.user;

  const [profileRes, listingsRes, flagsRes, exportsRes, eventsRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "display_name, postcode, abn, abn_entity_name, terms_consent_at, terms_consent_version, marketing_consent_at, marketing_consent_revoked_at, dob_confirmed_at, created_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("listings")
      .select("id, title, kind, status, created_at, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("listing_flags")
      .select("anonymised_id, reason, created_at, listing:listings(title)")
      .eq("flagged_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("data_export_requests")
      .select("anonymised_id, requested_at, completed_at, status, expires_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(5),
    supabase
      .from("auth_events")
      .select("event_type, created_at, ip, user_agent")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const profile = profileRes.data;
  const listings = listingsRes.data ?? [];
  const flags = flagsRes.data ?? [];
  const exports = exportsRes.data ?? [];
  const events = eventsRes.data ?? [];

  const marketingActive =
    !!profile?.marketing_consent_at && !profile?.marketing_consent_revoked_at;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/dashboard" className="text-neutral-600 underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Your data</h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        Everything we hold on you. Australian Privacy Principles 12 (right of
        access) and 13 (right of correction) apply. You can export it, revoke
        marketing consent, or delete your account.
      </p>

      <Section title="Account">
        <Row label="Email" value={user.email ?? "—"} />
        <Row label="Account created" value={formatDate(user.created_at)} />
        <Row
          label="Email confirmed"
          value={user.email_confirmed_at ? formatDate(user.email_confirmed_at) : "No"}
        />
        <Row label="Listings" value={String(listings.length)} />
      </Section>

      <Section title="Profile">
        <Row label="Display name" value={profile?.display_name ?? "—"} />
        <Row label="Postcode" value={profile?.postcode ?? "—"} />
        <Row label="ABN" value={profile?.abn ?? "—"} />
        <Row label="ABN entity" value={profile?.abn_entity_name ?? "—"} />
      </Section>

      <Section title="Consent record">
        <Row
          label="Terms agreed"
          value={
            profile?.terms_consent_at
              ? `${formatDate(profile.terms_consent_at)} (version ${profile.terms_consent_version ?? "—"})`
              : "—"
          }
        />
        <Row
          label="18+ confirmed"
          value={profile?.dob_confirmed_at ? formatDate(profile.dob_confirmed_at) : "Not recorded"}
        />
        <Row
          label="Marketing consent"
          value={
            profile?.marketing_consent_at
              ? marketingActive
                ? `Active since ${formatDate(profile.marketing_consent_at)}`
                : `Revoked ${profile?.marketing_consent_revoked_at ? formatDate(profile.marketing_consent_revoked_at) : "—"}`
              : "Never opted in"
          }
        />
        {marketingActive && (
          <div className="mt-3">
            <RevokeMarketingForm />
          </div>
        )}
      </Section>

      <Section title="Listings ({count})" titleArgs={{ count: listings.length }}>
        {listings.length === 0 ? (
          <p className="text-sm text-neutral-700">No listings.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {listings.map((l) => (
              <li key={l.id} className="text-neutral-800">
                <span className="font-medium">{l.title}</span>{" "}
                <span className="text-xs text-neutral-500">
                  · {l.kind} · {l.status} · {relativeTime(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Flags you have submitted">
        {flags.length === 0 ? (
          <p className="text-sm text-neutral-700">None.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {flags.map((f) => {
              const listing = Array.isArray(f.listing) ? f.listing[0] : f.listing;
              return (
                <li key={f.anonymised_id} className="text-neutral-800">
                  <span className="font-mono text-xs text-neutral-500">{f.anonymised_id}</span>{" "}
                  <span>{f.reason}</span> ·{" "}
                  <span className="text-neutral-600">{listing?.title ?? "—"}</span> ·{" "}
                  <span className="text-xs text-neutral-500">{relativeTime(f.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Recent account activity (last 90 days)">
        {events.length === 0 ? (
          <p className="text-sm text-neutral-700">
            Nothing logged yet. Activity is captured from sign-in events going forward.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {events.map((e, i) => (
              <li key={i} className="text-neutral-800">
                <span className="font-mono text-xs">{e.event_type}</span> ·{" "}
                <span className="text-xs text-neutral-500">
                  {relativeTime(e.created_at)}
                </span>
                {e.ip && (
                  <span className="text-xs text-neutral-500"> · {e.ip}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Download my data">
        <p className="mb-3 text-sm text-neutral-700">
          We&apos;ll generate a JSON export of everything tied to your account
          and email a download link to <strong>{user.email}</strong>. The link
          stays valid for 7 days. Limit: one export per 24 hours.
        </p>
        {exports.length > 0 && (
          <p className="mb-3 text-xs text-neutral-500">
            Last requested {relativeTime(exports[0].requested_at)} (status:{" "}
            {exports[0].status}).
          </p>
        )}
        <RequestExportForm />
      </Section>

      <Section title="Delete my account" tone="danger">
        <p className="mb-3 text-sm text-red-900">
          Deletes your account, all your listings, and personal data. We may
          retain a minimal record (account ID, deletion timestamp, and
          retention reason) where required by law — for example, if you have an
          unresolved defamation complaint against you.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-block rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-900 hover:bg-red-100"
        >
          Go to delete account →
        </Link>
      </Section>

      <p className="mt-10 text-xs text-neutral-500">
        Privacy questions or correction requests:{" "}
        <a
          href="mailto:help@outbackconnections.com.au"
          className="underline"
        >
          help@outbackconnections.com.au
        </a>
        . See our{" "}
        <Link href="/privacy" className="underline">
          Privacy notice
        </Link>{" "}
        for full details on how we handle your data.
      </p>
    </div>
  );
}

function Section({
  title,
  titleArgs,
  tone,
  children,
}: {
  title: string;
  titleArgs?: Record<string, unknown>;
  tone?: "danger";
  children: React.ReactNode;
}) {
  const formatted = titleArgs
    ? title.replace(/\{(\w+)\}/g, (_, k) => String(titleArgs[k] ?? ""))
    : title;
  const isDanger = tone === "danger";
  return (
    <section
      className={`mt-6 rounded-xl border p-5 ${
        isDanger ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"
      }`}
    >
      <h2
        className={`text-sm font-semibold ${
          isDanger ? "text-red-900" : "text-neutral-900"
        }`}
      >
        {formatted}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-neutral-900">{value}</dd>
    </div>
  );
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
