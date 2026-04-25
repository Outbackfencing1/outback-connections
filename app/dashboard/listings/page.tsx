import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAndClearFlash } from "@/lib/posting";
import { kindLabel, listingHref, relativeTime } from "@/lib/format";
import OwnerActions from "@/components/detail/OwnerActions";
import CloseListingForm from "@/components/detail/CloseListingForm";

export const metadata = {
  title: "My listings — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  anonymised_id: string;
  slug: string;
  kind: string;
  title: string;
  status: string;
  postcode: string;
  flag_count: number;
  created_at: string;
  expires_at: string;
  category: { slug: string; label: string } | { slug: string; label: string }[] | null;
};

export default async function MyListingsPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard/listings");

  const flash = readAndClearFlash();

  const { data: rows } = await supabase
    .from("listings")
    .select(`
      id, anonymised_id, slug, kind, title, status, postcode, flag_count,
      created_at, expires_at,
      category:categories(slug, label)
    `)
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const listings: ListingRow[] = (rows ?? []) as unknown as ListingRow[];
  const now = Date.now();

  const active = listings.filter(
    (l) => l.status === "active" && new Date(l.expires_at).getTime() > now
  );
  const expired = listings.filter(
    (l) => l.status === "expired" || (l.status === "active" && new Date(l.expires_at).getTime() <= now)
  );
  const closed = listings.filter((l) => l.status === "closed");
  const hidden = listings.filter(
    (l) => l.status === "hidden_flagged" || l.status === "deleted_by_admin"
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">My listings</h1>
        <Link
          href="/post"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post a listing
        </Link>
      </div>

      {flash && (
        <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {flash}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-sm text-neutral-700">You haven&apos;t posted anything yet.</p>
          <p className="mt-2 text-xs text-neutral-500">
            <Link href="/post" className="underline">
              Post your first listing
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <ListingGroup title="Active" subtitle="Visible on the public marketplace." rows={active} showClose />
          <ListingGroup title="Closed" subtitle="You marked these as filled or withdrawn. Kept here for your records." rows={closed} />
          <ListingGroup title="Expired" subtitle="Past 30 days; not visible publicly. Edit + repost if you want them back up." rows={expired} />
          <ListingGroup title="Hidden" subtitle="Hidden by moderation. Email support if you think this is wrong." rows={hidden} />
        </>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}

function ListingGroup({
  title,
  subtitle,
  rows,
  showClose,
}: {
  title: string;
  subtitle: string;
  rows: ListingRow[];
  showClose?: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-neutral-900">
        {title}{" "}
        <span className="text-sm font-normal text-neutral-500">
          ({rows.length})
        </span>
      </h2>
      <p className="mt-1 text-xs text-neutral-600">{subtitle}</p>

      <ul className="mt-4 space-y-3">
        {rows.map((l) => {
          const cat = Array.isArray(l.category) ? l.category[0] ?? null : l.category;
          return (
            <li
              key={l.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={listingHref(l.kind, l.slug)}
                  className="font-medium text-neutral-900 underline-offset-2 hover:underline"
                >
                  {l.title}
                </Link>
                <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
                  {kindLabel(l.kind)}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                {cat?.label ?? "—"} · postcode {l.postcode} · posted{" "}
                {relativeTime(l.created_at)} · expires{" "}
                {new Date(l.expires_at).toLocaleDateString("en-AU")}
                {l.flag_count > 0 && (
                  <>
                    {" "}· <span className="text-amber-700">{l.flag_count} flag{l.flag_count === 1 ? "" : "s"}</span>
                  </>
                )}
              </p>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                <OwnerActions listingId={l.id} listingTitle={l.title} />
                {showClose && (
                  <CloseListingForm listingId={l.id} listingTitle={l.title} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
