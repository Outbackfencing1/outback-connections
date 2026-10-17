import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import ListingCard from "@/components/browse/ListingCard";
import { socialMeta } from "@/lib/seo";

const SERVICES_TITLE = "Rural services — Outback Connections";
const SERVICES_DESCRIPTION =
  "Rural services across NSW, starting with fencing contractors. Browse by category, region or postcode and ask for a quote without an account.";

export const metadata = {
  alternates: { canonical: "/services" },
  title: SERVICES_TITLE,
  description: SERVICES_DESCRIPTION,
  ...socialMeta({ title: SERVICES_TITLE, description: SERVICES_DESCRIPTION, path: "/services" }),
};

export const dynamic = "force-dynamic";

export default async function ServicesLandingPage() {
  const supabase = createClient();

  // Categories grid + counts (sorted: most active first, then alphabetical).
  const [{ data: cats }, counts] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, label")
      .eq("pillar", "services")
      .eq("active", true)
      .order("sort_order"),
    getCategoryCounts("services"),
  ]);

  const sortedCats = (cats ?? [])
    .map((c) => ({ ...c, count: counts.byCategory[c.id] ?? 0 }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "en-AU");
    });

  // 5 most recent service listings (offerings + requests pooled)
  const { data: recent } = await supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      data_source, source_platform, contact_phone, contact_email,
      category:categories(slug, label),
      business:businesses(claim_status, contact_phone, contact_email, website_url, suburb, outback_verified)
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

      <div className="mt-10 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-neutral-900">
          Browse by category
        </h2>
        <p className="text-xs text-neutral-500">Sorted: most active first</p>
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {sortedCats.map((c) => {
          const empty = c.count === 0;
          return (
            <li key={c.id}>
              <Link
                href={`/services/${c.slug}`}
                aria-label={
                  empty
                    ? `${c.label} — no active listings`
                    : `${c.label} — ${c.count} active`
                }
                className={`block rounded-xl border bg-white p-4 text-sm shadow-sm transition hover:border-green-700 hover:shadow-md ${
                  empty
                    ? "border-neutral-200 opacity-50"
                    : "border-neutral-200"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-neutral-900">{c.label}</span>
                  {!empty && (
                    <span className="shrink-0 text-xs font-medium text-green-800">
                      ({c.count})
                    </span>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
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
          {recent.map((l) => {
            const biz = Array.isArray(l.business) ? l.business[0] ?? null : l.business;
            return (
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
                    data_source: l.data_source,
                    source_platform: l.source_platform,
                    contact_phone: l.contact_phone,
                    contact_email: l.contact_email,
                    business_claim_status: biz?.claim_status ?? null,
                    business: biz,
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
