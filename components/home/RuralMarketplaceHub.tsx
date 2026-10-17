import Link from "next/link";
import { WORKER_TICKETS, WORKER_TICKET_LABELS } from "@/lib/work-board";
import { COMMODITY_GROUPS } from "@/lib/sale";

const QUICK_TICKETS: { code: string; label: string }[] = [
  { code: "mc_licence", label: "MC Truck Drivers" },
  { code: "hc_licence", label: "HC / HR Drivers" },
  { code: "header_operator", label: "Header & Harvester Operators" },
  { code: "tractor_gps", label: "Tractor & GPS Operators" },
  { code: "excavator_dozer", label: "Excavator & Dozer" },
  { code: "fencing", label: "Rural Fencers" },
  { code: "shearing_crutching", label: "Shearers & Crutchers" },
  { code: "livestock_dogs", label: "Station Hands & Dogs" },
  { code: "welding_mechanic", label: "Diesel Mechanics & Welders" },
  { code: "chemcert_spraying", label: "ChemCert Spraying" },
];

const QUICK_COMMODITIES: { code: string; label: string }[] = [
  { code: "cattle-steers", label: "Cattle (Steers & Heifers)" },
  { code: "cattle-breeders", label: "Cows & Calves" },
  { code: "sheep-lambs", label: "Sheep & Lambs" },
  { code: "lucerne-hay", label: "Lucerne Hay" },
  { code: "wheaten-hay", label: "Wheaten & Oaten Hay" },
  { code: "silage", label: "Silage" },
  { code: "feed-barley", label: "Feed Barley & Oats" },
  { code: "wheat", label: "Wheat & Canola" },
  { code: "tractors", label: "Tractors & Loaders" },
  { code: "headers-harvesters", label: "Headers & Chaser Bins" },
  { code: "fencing-materials", label: "Mesh, Pickets & Gates" },
];

export default function RuralMarketplaceHub() {
  return (
    <section
      aria-label="Rural marketplace search and quick actions"
      className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Door 1: Two-Sided Rural Work & Skills Board */}
        <div className="flex flex-col rounded-2xl border border-green-300 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-900">
              Two-Sided Work &amp; Skills Board
            </span>
            <Link
              href="/jobs"
              className="text-xs font-semibold text-green-800 underline hover:text-green-950"
            >
              Open full work board →
            </Link>
          </div>

          <h2 className="mt-3 text-xl font-bold text-neutral-900 sm:text-2xl">
            Find rural workers &amp; operators — or list your skills
          </h2>
          <p className="mt-1 text-sm text-neutral-700">
            Search truck drivers, header &amp; machine operators, fencers, shearers and station hands by
            licence/ticket and postcode — or put your own skills and rates on the board.
          </p>

          <form action="/jobs" method="get" className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Looking for</span>
              <select
                name="direction"
                defaultValue=""
                className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Workers &amp; jobs hiring</option>
                <option value="available_for_work">Workers &amp; operators available</option>
                <option value="hiring">Farms &amp; businesses hiring</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Licence / skill</span>
              <select
                name="ticket"
                defaultValue=""
                className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Any ticket or skill</option>
                {WORKER_TICKETS.map((t) => (
                  <option key={t} value={t}>
                    {WORKER_TICKET_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Postcode</span>
              <div className="mt-1 flex gap-2">
                <input
                  name="postcode"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 2800"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
                >
                  Search
                </button>
              </div>
            </label>
          </form>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Jump straight to a skill or ticket:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_TICKETS.map((t) => (
                <Link
                  key={t.code}
                  href={`/jobs?ticket=${t.code}`}
                  className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:border-green-700 hover:bg-green-50 hover:text-green-900"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-5">
            <div className="flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-4">
              <Link
                href="/post/job?direction=available_for_work"
                className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
              >
                + List your skills &amp; tickets
              </Link>
              <Link
                href="/post/job?direction=hiring"
                className="inline-flex items-center justify-center rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
              >
                + Post a job (Hiring)
              </Link>
              <Link
                href="/jobs?direction=available_for_work"
                className="text-xs font-semibold text-green-800 underline hover:text-green-950"
              >
                See available workers →
              </Link>
            </div>
          </div>
        </div>

        {/* Door 2: Livestock, Harvest & Gear Marketplace */}
        <div className="flex flex-col rounded-2xl border border-amber-300 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950">
              Livestock, Harvest &amp; Gear · 0% Commission
            </span>
            <Link
              href="/sale"
              className="text-xs font-semibold text-green-800 underline hover:text-green-950"
            >
              Open marketplace →
            </Link>
          </div>

          <h2 className="mt-3 text-xl font-bold text-neutral-900 sm:text-2xl">
            Buy &amp; sell livestock, hay, grain and machinery
          </h2>
          <p className="mt-1 text-sm text-neutral-700">
            Cattle, sheep, lucerne &amp; cereal hay, silage, feed grain, headers, tractors and fencing
            steel. Deal direct with the property — zero commission or agent fees.
          </p>

          <form action="/sale" method="get" className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Side</span>
              <select
                name="side"
                defaultValue=""
                className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">For sale &amp; wanted</option>
                <option value="supply">For sale (Available)</option>
                <option value="demand">Wanted to buy (Chasing)</option>
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Stock, crop or gear</span>
              <select
                name="sub_category"
                defaultValue=""
                className="mt-1 block w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
              >
                <option value="">All stock, crops &amp; gear</option>
                {COMMODITY_GROUPS.map((g) => (
                  <optgroup key={g.categorySlug} label={g.groupLabel}>
                    {g.options.map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-xs font-medium text-neutral-700">Postcode</span>
              <div className="mt-1 flex gap-2">
                <input
                  name="postcode"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 2800"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
                >
                  Search
                </button>
              </div>
            </label>
          </form>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Browse by livestock, harvest or machinery:
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_COMMODITIES.map((c) => (
                <Link
                  key={c.code}
                  href={`/sale?sub_category=${c.code}`}
                  className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-800 hover:border-green-700 hover:bg-green-50 hover:text-green-900"
                >
                  {c.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-auto pt-5">
            <div className="flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-4">
              <Link
                href="/post/sale?side=supply"
                className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
              >
                + Sell stock, hay or gear
              </Link>
              <Link
                href="/post/sale?side=demand"
                className="inline-flex items-center justify-center rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
              >
                + Post wanted to buy
              </Link>
              <Link
                href="/sale"
                className="text-xs font-semibold text-green-800 underline hover:text-green-950"
              >
                Browse all for sale →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
