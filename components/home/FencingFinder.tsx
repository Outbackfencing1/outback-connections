// components/home/FencingFinder.tsx — server component.
// The one thing farmers ask Outback Fencing for most: "who can build it?"
// A postcode box straight to the fencing-contractor directory, plus the
// regions that actually have contractors listed. Renders nothing while the
// category is empty (never advertise an empty shelf).
import Link from "next/link";
import { createAnonClient } from "@/lib/supabase/anon";
import { regionCounts } from "@/lib/regions";

const CATEGORY = "fencing-contractor";

export default async function FencingFinder() {
  const sb = createAnonClient();
  const { data: cat } = await sb
    .from("categories")
    .select("id")
    .eq("country_code", "AU")
    .eq("pillar", "services")
    .eq("slug", CATEGORY)
    .maybeSingle();
  if (!cat) return null;

  const { data: rows } = await sb
    .from("listings")
    .select("postcode")
    .eq("category_id", cat.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .limit(2000);
  const postcodes = (rows ?? []).map((r) => r.postcode as string);
  if (postcodes.length === 0) return null;
  const regions = (await regionCounts(postcodes)).slice(0, 8);
  const states = Array.from(new Set(regions.map((r) => r.state)));

  return (
    <section className="mx-auto max-w-3xl px-4 pb-8">
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 sm:p-6">
        <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">Need a fencing contractor?</h2>
        <p className="mt-1 text-sm text-neutral-700">
          {postcodes.length} listed{states.length === 1 ? ` across ${states[0]}` : ""}. Enter your
          postcode, or pick a region.
        </p>
        <form action={`/services/${CATEGORY}`} method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="fencing-postcode">
            Postcode
          </label>
          <input
            id="fencing-postcode"
            name="postcode"
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="Postcode, e.g. 2800"
            className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base sm:max-w-xs"
          />
          <button
            type="submit"
            className="rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Find contractors
          </button>
        </form>
        {regions.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {regions.map((r) => (
              <Link
                key={r.slug}
                href={`/services/${CATEGORY}/${r.slug}`}
                className="rounded-full border border-green-700 bg-white px-3 py-1 text-green-900 hover:bg-green-100"
              >
                {r.region_name} <span className="text-neutral-500">({r.count})</span>
              </Link>
            ))}
            <Link href={`/services/${CATEGORY}`} className="self-center text-green-800 underline">
              All contractors →
            </Link>
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-600">
          Free to use. Ask any contractor for a quote straight from their listing, no account
          needed. Unclaimed entries were found online; our team forwards your request.
        </p>
      </div>
    </section>
  );
}
