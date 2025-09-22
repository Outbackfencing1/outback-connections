// app/dashboard/opportunities/page.tsx
import { supabaseServer } from "@/lib/supabase";

export const metadata = { title: "Dashboard – Opportunities" };

export default async function DashboardOpportunitiesPage() {
  const supa = supabaseServer();
  const { data: jobs, error } = await supa
    .from("jobs")
    .select("id,title,company,location,pay_rate,description,created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Opportunities</h1>
      {error ? (
        <p className="text-red-600">Failed to load jobs: {error.message}</p>
      ) : (
        <ul className="grid gap-4">
          {(jobs ?? []).map((j) => (
            <li key={j.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{j.title}</span>
                {j.pay_rate && <span className="text-sm text-gray-600">{j.pay_rate}</span>}
              </div>
              <p className="text-sm text-gray-700">
                {[j.company, j.location].filter(Boolean).join(" • ")}
              </p>
              <p className="mt-2 text-gray-800">{j.description}</p>
            </li>
          ))}
          {(jobs ?? []).length === 0 && <p>No jobs yet.</p>}
        </ul>
      )}
    </main>
  );
}
