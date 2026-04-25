import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";

export const metadata = {
  title: "Services — Outback Connections",
  description:
    "Rural specialists: bore pumps, helicopter mustering, drone spraying, mobile diesel mechanics, contract croppers, shearing teams, welders.",
};

export const dynamic = "force-dynamic";

export default async function ServicesLandingPage() {
  const supabase = createClient();

  // Categories grid (all active services, sorted by sort_order)
  const { data: cats } = await supabase
    .from("categories")
    .select("id, slug, label")
    .eq("pillar", "services")
    .eq("active", true)
    .order("sort_order");

  // 5 most recent service listings (offerings + requests pooled)
  const { data: recent } = await supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      category:categories(slug, label)
    `
    )
    .in("kind", ["service_offering", "service_request"])
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Services</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-700">
            Rural specialists you can&apos;t find anywhere else. Pick a
            category to browse, or post your own service or request.
          </p>
        </div>
        <Link
          href="/post"
          className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post a service
        </Link>
      </div>

      <h2 className="mt-10 text-lg font-semibold text-neutral-900">
        Browse by category
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {(cats ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/services/${c.slug}`}
              className="block rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm transition hover:border-green-700 hover:shadow-md"
            >
              <span className="font-medium text-neutral-900">{c.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-lg font-semibold text-neutral-900">
        Recent service listings
      </h2>
      {!recent || recent.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-700">
          Nothing posted yet. Be first —{" "}
          <Link href="/post/service/offering" className="underline">
            list your service
          </Link>{" "}
          or{" "}
          <Link href="/post/service/request" className="underline">
            post a request
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-4 space-y-4">
          {recent.map((l) => (
            <li key={l.anonymised_id}>
              <ListingCard
                listing={{
                  anonymised_id: l.anonymised_id,
                  slug: l.slug,
                  kind: l.kind,
                  title: l.title,
                  description: l.description,
                  postcode: l.postcode,
                  state: l.state,
                  created_at: l.created_at,
                  category: Array.isArray(l.category) ? l.category[0] ?? null : l.category,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
