import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestTimestamp } from "@/lib/request-time";
import { signOut } from "./actions";

export const metadata = {
  title: "Dashboard — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard");

  const user = data.user;
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const now = await requestTimestamp();
  const ageMs = createdAt ? now - createdAt.getTime() : 0;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const canPost = ageHours >= 24;

  // Quick listings count (RLS lets owners read their own)
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, directory_contributor")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!profile?.is_admin;
  const canAddDirectory = isAdmin || !!profile?.directory_contributor;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-neutral-700">Signed in as {user.email}.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/listings"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Listings
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            My listings
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            View, edit, or delete what you&apos;ve posted.{" "}
            {count !== null && (
              <span className="text-neutral-500">
                ({count} total)
              </span>
            )}
          </p>
        </Link>

        <Link
          href="/post"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Post
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Post a listing
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Job, freight, or service. Free.
          </p>
        </Link>

        <Link
          href="/dashboard/settings"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md sm:col-span-2"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Settings
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Account settings
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Account age: {ageDays > 0
              ? `${ageDays} day${ageDays === 1 ? "" : "s"}`
              : `${ageHours} hour${ageHours === 1 ? "" : "s"}`}
            .{!canPost && " You can post once your account is 24 hours old."}
          </p>
        </Link>

        {canAddDirectory && (
          <Link
            href="/dashboard/directory/add"
            className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm transition hover:border-green-600 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
              Directory
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">Add a directory entry</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Found a business online that isn&apos;t yours? Add it here, not through
              &quot;Post a listing&quot;. It goes in as unclaimed, says where you found it,
              and the owner can claim it.
            </p>
          </Link>
        )}

        {isAdmin && (
          <Link
            href="/dashboard/admin/flags"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Admin
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">Admin tools</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Flags, moderation, claims, import, analytics, lockdown, duplicate accounts.
            </p>
          </Link>
        )}
      </div>

      <form action={signOut} className="mt-10">
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
