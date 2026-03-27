import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

export const metadata = { title: "Freight – Outback Connections" };

export default async function FreightPage() {
  const supa = supabaseServer();
  let listings: any[] = [];
  let error: string | null = null;

  if (supa) {
    const res = await supa
      .from("freight_listings")
      .select("id, title, origin, destination, description, weight, vehicle_type, budget, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);

    if (res.error) {
      error = res.error.message;
    } else {
      listings = res.data ?? [];
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Freight &amp; Transport</h1>
          <p className="mt-1 text-neutral-600">
            Find and post freight jobs across rural and regional Australia.
          </p>
        </div>
        <Link
          href="/dashboard/post-freight"
          className="hidden sm:inline-block rounded-lg bg-[#2D5016] px-4 py-2 text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
        >
          Post Freight
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border bg-red-50 border-red-200 p-4">
          <p className="text-sm text-red-700">Failed to load freight listings: {error}</p>
        </div>
      )}

      {!error && listings.length > 0 && (
        <div className="mt-6 grid gap-4">
          {listings.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-neutral-900">{item.title}</h2>
                {item.budget && (
                  <span className="shrink-0 text-sm font-semibold text-neutral-800">{item.budget}</span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-sm text-neutral-500">
                {item.origin && item.destination && (
                  <span className="inline-flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H6.375c-.621 0-1.125-.504-1.125-1.125v-3.659a1.125 1.125 0 01.328-.794l3.1-3.1a1.125 1.125 0 01.795-.329H13.5m7.125 7.5V12m0 0V5.625A1.125 1.125 0 0019.5 4.5h-6.75a1.125 1.125 0 00-1.125 1.125v12m8.25-6h-2.25m0 0h-2.25" />
                    </svg>
                    {item.origin} &rarr; {item.destination}
                  </span>
                )}
                {item.vehicle_type && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                    {item.vehicle_type}
                  </span>
                )}
                {item.weight && (
                  <span className="text-xs text-neutral-400">{item.weight}</span>
                )}
              </div>

              {item.description && (
                <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{item.description}</p>
              )}
              <p className="mt-3 text-xs text-neutral-400">
                Posted {new Date(item.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
          ))}
        </div>
      )}

      {!error && listings.length === 0 && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H6.375c-.621 0-1.125-.504-1.125-1.125v-3.659a1.125 1.125 0 01.328-.794l3.1-3.1a1.125 1.125 0 01.795-.329H13.5m7.125 7.5V12m0 0V5.625A1.125 1.125 0 0019.5 4.5h-6.75a1.125 1.125 0 00-1.125 1.125v12m8.25-6h-2.25m0 0h-2.25" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">No freight listings yet</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Be the first to post a freight listing and connect with transport operators.
          </p>
          <Link
            href="/dashboard/post-freight"
            className="mt-5 inline-block rounded-lg bg-[#2D5016] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
          >
            Post Freight
          </Link>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="mt-6 sm:hidden">
        <Link
          href="/dashboard/post-freight"
          className="block rounded-lg bg-[#2D5016] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
        >
          Post Freight
        </Link>
      </div>
    </main>
  );
}
