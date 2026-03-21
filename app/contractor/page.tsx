import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

export const metadata = { title: "Contractors – Outback Connections" };

export default async function ContractorsPage() {
  const supa = supabaseServer();
  let profiles: any[] = [];
  let error: string | null = null;

  if (supa) {
    const res = await supa
      .from("profiles")
      .select("handle,company,bio,skills,service_areas,rate_type,rate_amount,insured")
      .order("created_at", { ascending: false })
      .limit(50);

    if (res.error) {
      error = res.error.message;
    } else {
      profiles = res.data ?? [];
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Fencing Contractors</h1>
          <p className="mt-1 text-neutral-600">
            Browse registered fencing contractors across rural Australia.
          </p>
        </div>
        <Link
          href="/dashboard/profile"
          className="hidden sm:inline-block rounded-lg bg-[#2D5016] px-4 py-2 text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
        >
          Register as Contractor
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border bg-red-50 border-red-200 p-4">
          <p className="text-sm text-red-700">Failed to load contractors: {error}</p>
        </div>
      )}

      {!error && profiles.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {profiles.map((p) => (
            <Link
              key={p.handle}
              href={`/c/${p.handle}`}
              className="group rounded-lg border border-neutral-200 bg-white p-5 shadow-sm hover:border-[#2D5016]/40 hover:shadow-md transition"
            >
              <h2 className="font-semibold text-neutral-900 group-hover:text-[#2D5016] transition">
                {p.company || p.handle}
              </h2>

              {p.bio && (
                <p className="mt-1.5 text-sm text-neutral-600 line-clamp-2">{p.bio}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {(p.skills ?? []).slice(0, 4).map((skill: string) => (
                  <span
                    key={skill}
                    className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs text-neutral-500">
                {p.rate_type && p.rate_amount > 0 && (
                  <span>${p.rate_amount}/{p.rate_type === "hourly" ? "hr" : "day"}</span>
                )}
                {(p.service_areas ?? []).length > 0 && (
                  <span>{p.service_areas.slice(0, 3).join(", ")}</span>
                )}
                {p.insured && (
                  <span className="text-[#2D5016] font-medium">Insured</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {!error && profiles.length === 0 && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">No contractors registered yet</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Be the first to create a contractor profile and get found by landholders looking for fencing work.
          </p>
          <Link
            href="/dashboard/profile"
            className="mt-5 inline-block rounded-lg bg-[#2D5016] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
          >
            Register as Contractor
          </Link>
        </div>
      )}

      {/* Mobile CTA */}
      <div className="mt-6 sm:hidden">
        <Link
          href="/dashboard/profile"
          className="block rounded-lg bg-[#2D5016] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
        >
          Register as Contractor
        </Link>
      </div>
    </main>
  );
}
