// /dashboard/directory/add — staff quick-add for ONE unclaimed directory entry.
// The proper path for "I found a business online and want it in the directory".
// Goes through the same preview + ingest RPCs as the bulk import, so the row is
// scraped / unclaimed, claimable, honestly attributed, and its phone/email stay
// private. Never use the public post form for a business that isn't yours.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireDirectoryContributor } from "@/lib/directory-access";
import DirectoryAddForm, { type DirectoryCategory } from "./DirectoryAddForm";

export const metadata = {
  title: "Add a directory entry — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DirectoryAddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const fromPost = sp.from === "post";
  const access = await requireDirectoryContributor();
  if (!access.ok && access.reason === "not_signed_in") {
    redirect("/signin?next=/dashboard/directory/add");
  }
  if (!access.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Add a directory entry</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Not switched on for this account</p>
          <p className="mt-2">{access.message}</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  const supabase = createClient();
  const { data: cats } = await supabase
    .from("categories")
    .select("id, slug, label, pillar")
    .in("pillar", ["services", "jobs", "freight"])
    .eq("active", true)
    .order("pillar")
    .order("sort_order");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Add a directory entry</h1>
        <Link href="/dashboard" className="text-sm underline">
          ← Dashboard
        </Link>
      </div>
      {fromPost && (
        <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Please add businesses here.</p>
          <p className="mt-1">
            You opened the public &quot;post a listing&quot; form. That form is only for
            your own business. Every business you find online goes on this page.
            Same details, one extra box: where you found it.
          </p>
        </div>
      )}
      <p className="mt-2 text-sm text-neutral-700">
        For a business you found online that isn&apos;t yours. It goes in as an{" "}
        <strong>unclaimed</strong> listing with a business record, says where you found
        it, and can be claimed by the owner. Phone and email stay private for outreach.
      </p>
      <p className="mt-2 text-xs text-neutral-500">
        Adding the same name and postcode again updates the entry rather than duplicating
        it. Entries stay live for 60 days; re-adding refreshes the clock.
      </p>

      <div className="mt-8">
        <DirectoryAddForm categories={(cats ?? []) as DirectoryCategory[]} />
      </div>

      {access.isAdmin && (
        <p className="mt-10 text-xs text-neutral-500">
          Bulk import (JSON from the scrape script):{" "}
          <Link href="/dashboard/admin/import" className="underline">
            /dashboard/admin/import
          </Link>
        </p>
      )}
    </div>
  );
}
