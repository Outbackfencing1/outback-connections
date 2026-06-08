// /dashboard/admin/claims — admin review queue for claim-this-business requests.
// Approve promotes the business unclaimed -> claimed + links the user via
// business_members; reject closes the claim. Admins only.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import ClaimRowActions from "./ClaimRowActions";

export const metadata = {
  title: "Claim review — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Biz = {
  id: string;
  trading_name: string | null;
  legal_name: string | null;
  postcode: string | null;
  state_code: string | null;
  claim_status: string;
  source_platform: string | null;
};

type Row = {
  id: string;
  status: string;
  method: string;
  created_at: string;
  claimant_user_id: string;
  business: Biz | Biz[] | null;
};

export default async function ClaimsPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/claims");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Claim review</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">← Back to dashboard</Link>
        </p>
      </div>
    );
  }

  const { data } = await supabase
    .from("claims")
    .select(
      `id, status, method, created_at, claimant_user_id,
       business:businesses(id, trading_name, legal_name, postcode, state_code, claim_status, source_platform)`
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);

  const rows: Row[] = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Claim review</h1>
        <Link href="/dashboard/admin/flags" className="text-sm underline">← Admin</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Pending claim-this-business requests. Approve promotes the business to{" "}
        <strong>claimed</strong> and links the claimant; reject closes the request.
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          No pending claims.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const b = Array.isArray(r.business) ? r.business[0] ?? null : r.business;
            const name = b?.trading_name || b?.legal_name || "(unknown business)";
            return (
              <li
                key={r.id}
                className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-neutral-900">{name}</span>
                  <span className="text-xs text-neutral-500">{relativeTime(r.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-600">
                  {[b?.postcode, b?.state_code].filter(Boolean).join(" ") || "—"}
                  {b?.source_platform ? ` · source: ${b.source_platform}` : ""}
                  {b ? ` · currently ${b.claim_status}` : ""}
                  {" · method: "}{r.method}
                </p>
                <p className="mt-1 font-mono text-[11px] text-neutral-400">
                  claimant {r.claimant_user_id}
                </p>
                <div className="mt-3">
                  <ClaimRowActions claimId={r.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">← Back to dashboard</Link>
      </p>
    </div>
  );
}
