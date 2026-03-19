// app/dashboard/opportunities/page.tsx
import { supabaseServer } from "@/lib/supabase";

export const metadata = { title: "Fencing Opportunities – Dashboard" };

export default async function DashboardOpportunitiesPage() {
  const supa = supabaseServer();

  if (!supa) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-neutral-900">Fencing Opportunities</h1>
        <div className="mt-6 rounded-xl border bg-amber-50 border-amber-200 p-6">
          <h2 className="font-semibold text-amber-800">Coming Soon</h2>
          <p className="mt-1 text-sm text-amber-700">
            Live fencing job listings will appear here once the database is connected.
            Check back soon.
          </p>
        </div>
      </main>
    );
  }

  const { data: jobs, error } = await supa
    .from("jobs")
    .select("id,title,location,rate,description,slug,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Fencing Opportunities</h1>
      <p className="mt-1 text-neutral-600">Open fencing jobs from landholders and businesses.</p>

      {error ? (
        <div className="mt-6 rounded-xl border bg-red-50 border-red-200 p-4">
          <p className="text-sm text-red-700">Failed to load jobs: {error.message}</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4">
          {(jobs ?? []).map((j) => (
            <li key={j.id} className="rounded-xl border bg-white p-5 shadow-sm hover:border-green-300 hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-900">{j.title}</span>
                {j.rate && (
                  <span className="text-sm font-semibold text-neutral-700">{j.rate}</span>
                )}
              </div>
              {j.location && (
                <p className="mt-1 text-sm text-neutral-500">{j.location}</p>
              )}
              {j.description && (
                <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{j.description}</p>
              )}
            </li>
          ))}
          {(jobs ?? []).length === 0 && (
            <p className="text-neutral-500">No fencing jobs posted yet. Check back soon.</p>
          )}
        </ul>
      )}
    </main>
  );
}
