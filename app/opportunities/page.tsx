export const metadata = { title: "Opportunities – OutbackConnections" };

export default function OpportunitiesListPage() {
  // static placeholder for now
  const items = [
    { slug: "irrigation-assistant", title: "Irrigation Assistant", pay: "$30–$34/hr", where: "Green Plains • Tamworth, NSW" },
    { slug: "cattle-station-hand", title: "Cattle Station Hand", pay: "$290/day", where: "Seven Creeks • Charters Towers, QLD" },
    { slug: "vineyard-casual", title: "Vineyard Casual", pay: "$32/hr", where: "Red Ridge Wines • Barossa SA" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Opportunities</h1>
      <p className="mt-1 text-gray-700">Public listings (sample data).</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {items.map((job) => (
          <a
            key={job.slug}
            href={`/opportunities/${job.slug}`}
            className="rounded-2xl border p-5 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">{job.title}</h2>
              <div className="text-sm text-gray-600">{job.pay}</div>
            </div>
            <div className="mt-1 text-sm text-gray-700">{job.where}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
