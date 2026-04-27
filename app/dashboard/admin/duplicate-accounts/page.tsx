import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { relativeTime } from "@/lib/format";

export const metadata = {
  title: "Duplicate accounts — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type IpGroup = {
  creation_ip: string;
  account_count: number;
  earliest_created: string;
  latest_created: string;
  user_ids: string[];
};

export default async function DuplicateAccountsPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user)
    redirect("/signin?next=/dashboard/admin/duplicate-accounts");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">
          Duplicate accounts
        </h1>
        <p className="mt-3 text-sm text-neutral-700">
          Admin only. Sign in as an admin user to view this page.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  let groups: IpGroup[] = [];
  let viewError: string | null = null;
  if (admin) {
    const { data, error } = await admin
      .from("admin_duplicate_accounts_by_ip")
      .select("*");
    if (error) {
      viewError = error.message;
    } else {
      groups = (data ?? []) as IpGroup[];
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href="/legal/incidents" className="text-neutral-600 underline">
          ← Incidents dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Duplicate accounts (last 30 days)
      </h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        IPs that have created 3 or more accounts in the last 30 days.
        Surfacing only — no auto-action. Investigate manually before
        suspending anything; legitimate explanations include shared
        family Wi-Fi, depots, country towns with NAT, etc.
      </p>

      {viewError && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Couldn&apos;t load the view: {viewError}
        </p>
      )}

      {groups.length === 0 && !viewError ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-600">
          No IPs with 3+ accounts in the last 30 days.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {groups.map((g) => (
            <li
              key={g.creation_ip}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-sm font-semibold">
                  {g.creation_ip}
                </p>
                <p className="text-sm font-semibold text-amber-700">
                  {g.account_count} accounts
                </p>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                First seen {relativeTime(g.earliest_created)} · last seen{" "}
                {relativeTime(g.latest_created)}
              </p>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-neutral-700">
                  Show user IDs
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-neutral-600">
                  {g.user_ids.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        Source: <code>admin_duplicate_accounts_by_ip</code> view (filters
        on <code>user_profiles.creation_ip</code> populated at signup).
      </p>
    </div>
  );
}
