import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Contractor outreach — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LegacyContractorOutreachPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect(
      "/signin?next=" +
        encodeURIComponent("/dashboard/admin/contractor-outreach")
    );
  }

  const { data: canOutreach, error } = await supabase.rpc(
    "current_user_can_outreach"
  );
  if (!error && canOutreach) redirect("/dashboard/outreach");

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
        Contractor outreach
      </h1>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-semibold">Outreach access is required</p>
        <p className="mt-1">
          Ask the Outback Connections owner to grant access to this account.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="mt-6 inline-block text-sm text-green-800 underline"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
