import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TeamAccessManager, { type OutreachStaffRow } from "./TeamAccessManager";

export const metadata = {
  title: "Team access — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TeamAccessPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect("/signin?next=/dashboard/admin/team-access");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Team access</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
          <p className="mt-1">Only a full administrator can manage team access.</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  // The signed-in RPC independently enforces full-admin access before joining
  // the private account email to the narrow outreach role.
  const { data, error } = await supabase.rpc("admin_list_outreach_staff");
  const staff = ((data ?? []) as OutreachStaffRow[]).filter(
    (staffMember) => staffMember.is_active
  );
  if (error) {
    console.error("[team-access] list failed:", error.message);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Administration
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Team access</h1>
        </div>
        <Link href="/dashboard/outreach" className="text-sm underline">
          Open outreach workspace
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-neutral-700">
        Give trusted helpers access to contractor outreach while keeping claims,
        imports, moderation and security controls restricted to full admins.
      </p>
      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">They need their own account first.</p>
        <p className="mt-1">
          Ask the team member to create an account on the{" "}
          <Link
            href="/signup?next=/dashboard/outreach"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline"
          >
            sign-up page
          </Link>
          , then enter the exact email they used below.
        </p>
      </div>

      {error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          Couldn’t load the outreach team. Please try again.
        </p>
      ) : (
        <TeamAccessManager staff={staff} />
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
