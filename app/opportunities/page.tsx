export const metadata = { title: "Fencing Opportunities – Outback Connections" };

export default function OpportunitiesListPage() {
  const items = [
    {
      slug: "boundary-fencing-dubbo",
      title: "Boundary Fencing — 4km Hinge Joint Run",
      pay: "$18,000–$22,000",
      where: "Dunedoo Station \u2022 Dubbo, NSW",
      type: "Boundary",
    },
    {
      slug: "cattle-yard-rebuild",
      title: "Cattle Yard Rebuild — Steel Panel Replacement",
      pay: "$8,500 est",
      where: "Doyle Pastoral \u2022 Emerald, QLD",
      type: "Yards",
    },
    {
      slug: "strainer-assembly-molong",
      title: "End Assembly & Strainer Install — 12 Assemblies",
      pay: "$4,200 est",
      where: "Hartley Farms \u2022 Molong, NSW",
      type: "Strainers",
    },
    {
      slug: "electric-fence-strip-grazing",
      title: "Electric Fence Setup — Rotational Grazing",
      pay: "$3,800–$4,500",
      where: "Greenfield Ag \u2022 Hamilton, VIC",
      type: "Electric",
    },
    {
      slug: "gate-install-driveway",
      title: "Driveway Gate & Cattle Grid Install",
      pay: "$6,200 est",
      where: "Willow Creek \u2022 Mudgee, NSW",
      type: "Gates",
    },
    {
      slug: "storm-damage-fence-repair",
      title: "Storm Damage Fence Repair — 2km Boundary",
      pay: "$7,500–$9,000",
      where: "Blackwood Farms \u2022 Armidale, NSW",
      type: "Repairs",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Fencing Opportunities</h1>
      <p className="mt-1 text-neutral-600">
        Browse available fencing work across rural and regional Australia.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((job) => (
          <a
            key={job.slug}
            href={`/opportunities/${job.slug}`}
            className="group rounded-xl border bg-white p-5 shadow-sm hover:border-green-300 hover:shadow-md transition"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-neutral-900 group-hover:text-green-700 transition">
                {job.title}
              </h2>
              <span className="shrink-0 rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800">
                {job.type}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm text-neutral-600">{job.where}</span>
              <span className="text-sm font-semibold text-neutral-800">{job.pay}</span>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-8 rounded-xl border bg-green-50 p-5">
        <p className="text-sm text-green-800">
          <span className="font-semibold">Looking for more work?</span> New fencing jobs
          are posted regularly. Create a free contractor profile to get notified about
          opportunities in your area.
        </p>
      </div>
    </main>
  );
}
