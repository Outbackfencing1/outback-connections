import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import DeleteAccountForm from "./DeleteAccountForm";

export const metadata = {
  title: "Settings — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard/settings");

  const user = data.user;
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const ageDays = createdAt
    ? Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Listings count for the delete-account confirmation copy
  const { count: listingCount } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Email</dt>
          <dd className="text-neutral-900">{user.email}</dd>

          <dt className="text-neutral-600">Email verified</dt>
          <dd className="text-neutral-900">
            {user.email_confirmed_at ? "Yes" : "No"}
          </dd>

          <dt className="text-neutral-600">Account age</dt>
          <dd className="text-neutral-900">
            {ageDays} day{ageDays === 1 ? "" : "s"}
          </dd>

          <dt className="text-neutral-600">Listings</dt>
          <dd className="text-neutral-900">{listingCount ?? 0}</dd>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Sign out</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Sign out of this device. You can sign back in any time with a magic
          link.
        </p>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-semibold text-red-900">
          Delete my account
        </h2>
        <p className="mt-2 text-sm text-red-900">
          This deletes your account and all {listingCount ?? 0} of your
          listings immediately. It cannot be undone.
        </p>
        <div className="mt-3">
          <DeleteAccountForm listingCount={listingCount ?? 0} />
        </div>
      </section>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
