import Link from "next/link";
import { createAnonClient } from "@/lib/supabase/anon";
import { listingHref } from "@/lib/format";
import { filterRuralRecords } from "@/lib/rural-postcodes";

type ActiveAltRow = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  postcode: string;
  state: string | null;
  category: { slug: string; label: string } | { slug: string; label: string }[] | null;
  business:
    | { suburb?: string | null; outback_verified?: boolean | null }
    | { suburb?: string | null; outback_verified?: boolean | null }[]
    | null;
};

export default async function ExpiredListingBanner({
  listingId,
  kind,
  categoryId,
  categoryName,
  suburb,
  postcode,
  state,
  browseHref,
}: {
  listingId: string;
  kind: string;
  categoryId?: string | null;
  categoryName?: string | null;
  suburb?: string | null;
  postcode: string;
  state?: string | null;
  browseHref: string;
}) {
  const sb = createAnonClient();
  const nowIso = new Date().toISOString();
  const cleanCat = (categoryName || "rural").replace(/\s*\(.*\)\s*$/, "").trim();
  const locationDisplay = [suburb || `Postcode ${postcode}`, state || "NSW"]
    .filter(Boolean)
    .join(" / ");

  const kinds =
    kind === "service_offering" || kind === "service_request"
      ? ["service_offering", "service_request"]
      : [kind];

  let activeRows: ActiveAltRow[] = [];
  if (categoryId) {
    const { data: sameCat } = await sb
      .from("listings")
      .select(
        `
        id, slug, kind, title, postcode, state,
        category:categories(slug, label),
        business:businesses(suburb, outback_verified)
      `
      )
      .in("kind", kinds)
      .eq("category_id", categoryId)
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .neq("id", listingId)
      .order("created_at", { ascending: false })
      .limit(12);
    activeRows = filterRuralRecords((sameCat ?? []) as unknown as ActiveAltRow[]).slice(0, 6);
  }

  if (activeRows.length < 3) {
    const existingIds = new Set([listingId, ...activeRows.map((r) => r.id)]);
    const { data: fallbackRows } = await sb
      .from("listings")
      .select(
        `
        id, slug, kind, title, postcode, state,
        category:categories(slug, label),
        business:businesses(suburb, outback_verified)
      `
      )
      .in("kind", kinds)
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(16);
    const extra = filterRuralRecords((fallbackRows ?? []) as unknown as ActiveAltRow[]).filter(
      (r) => !existingIds.has(r.id)
    );
    activeRows = [...activeRows, ...extra].slice(0, 6);
  }

  return (
    <section
      aria-label="Expired listing notice"
      className="mt-5 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Archived / Expired Listing
        </span>
        <Link
          href={browseHref}
          className="text-xs font-semibold text-amber-950 underline hover:text-green-800"
        >
          Browse all active {cleanCat.toLowerCase()} listings →
        </Link>
      </div>

      <p className="mt-3 text-sm font-semibold text-amber-950 sm:text-base">
        This listing has expired or been filled. Browse active {cleanCat} listings in{" "}
        {locationDisplay} below.
      </p>
      <p className="mt-1 text-xs text-amber-900">
        Direct contact and quote buttons on this archived listing have been disabled. Pick an
        active regional provider or listing below to connect immediately.
      </p>

      {activeRows.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeRows.slice(0, 6).map((item) => {
            const cat = Array.isArray(item.category) ? item.category[0] : item.category;
            const biz = Array.isArray(item.business) ? item.business[0] : item.business;
            const itemHref = listingHref(item.kind, item.slug);
            return (
              <Link
                key={item.id}
                href={itemHref}
                className="flex flex-col justify-between rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm transition hover:border-green-700 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-neutral-900 line-clamp-2">
                      {item.title}
                    </h3>
                    {biz?.outback_verified && (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-950">
                        ★ Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    {cat?.label ?? cleanCat} ·{" "}
                    {biz?.suburb ? `${biz.suburb}, ` : ""}
                    {item.postcode} {item.state ?? "NSW"}
                  </p>
                </div>
                <span className="mt-2.5 inline-block text-xs font-semibold text-green-800">
                  View active listing →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
