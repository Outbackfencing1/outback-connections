import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLockdownState } from "@/lib/lockdown";
import LockdownForm from "./LockdownForm";

export const metadata = {
  title: "Lockdown — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LockdownAdminPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/lockdown");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">Lockdown</h1>
        <p className="mt-3 text-sm text-neutral-700">
          Admin only. Sign in as an admin user to access lockdown controls.
        </p>
      </div>
    );
  }

  const state = await getLockdownState();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="text-sm">
        <Link href="/legal/incidents" className="text-neutral-600 underline">
          ← Incidents dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Lockdown</h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        Emergency switch. When active, signups and new posting are blocked
        and a maintenance banner appears across the entire site. Existing
        sessions still work — see <code className="text-xs">docs/BREACH-PLAYBOOK.md</code> for
        session revocation steps.
      </p>

      <div
        className={`mt-6 rounded-xl border p-5 ${
          state.active
            ? "border-red-300 bg-red-50"
            : "border-neutral-200 bg-white"
        }`}
      >
        <p className="text-sm font-semibold">
          Status:{" "}
          {state.active ? (
            <span className="text-red-900">ACTIVE</span>
          ) : (
            <span className="text-green-800">Off</span>
          )}
        </p>
        {state.active && state.reason && (
          <p className="mt-1 text-sm text-red-900">Reason: {state.reason}</p>
        )}
        {state.active && state.activated_at && (
          <p className="mt-1 text-xs text-red-900">
            Activated{" "}
            {new Date(state.activated_at).toLocaleString("en-AU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>

      <div className="mt-6">
        <LockdownForm currentlyActive={state.active} />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        Activating lockdown also sets the cache-key invalidation tag so the
        banner appears within ~30 seconds across all server-rendered pages.
      </p>
    </div>
  );
}
