// Interim dashboard for Step 2 of the marketplace build.
// Step 8 replaces this with the full listings management surface.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata = {
  title: "Dashboard — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) redirect("/signin");

  const user = data.user;
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const ageDays = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Signed in as</dt>
          <dd className="text-neutral-900">{user.email}</dd>

          <dt className="text-neutral-600">Account age</dt>
          <dd className="text-neutral-900">
            {ageDays} day{ageDays === 1 ? "" : "s"}
          </dd>

          <dt className="text-neutral-600">Email verified</dt>
          <dd className="text-neutral-900">
            {user.email_confirmed_at ? "Yes" : "No"}
          </dd>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">
          What&apos;s next
        </h2>
        <p className="mt-2 text-sm text-neutral-700">
          The marketplace is being built in stages. Posting, browsing, and
          your listings management will light up over the next few steps.
          For now, this is the sign-in check.
        </p>
      </section>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="inline-block rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>

      <p className="mt-8 text-xs text-neutral-500">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
