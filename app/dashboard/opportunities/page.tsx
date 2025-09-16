// app/dashboard/opportunities/page.tsx
import { requireRole } from "@/lib/requireRole";
import { prisma } from "@/lib/prisma";

export default async function OpportunitiesPage() {
  await requireRole("contractor");

  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Opportunities</h1>
      {!jobs.length && <div className="text-sm text-neutral-500">No jobs yet.</div>}
      <div className="space-y-3">
        {jobs.map((j) => (
          <div key={j.id} className="border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">{j.title}</div>
              <div className="text-xs text-neutral-500">{new Date(j.createdAt).toLocaleDateString()}</div>
            </div>
            <div className="text-sm text-neutral-600">{j.location}</div>
            {j.budget != null && <div className="text-sm mt-1">Budget: ${j.budget}</div>}
            <p className="text-sm mt-2">{j.description}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
