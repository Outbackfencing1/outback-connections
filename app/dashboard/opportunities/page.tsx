export const metadata = {
  title: "Opportunities – Dashboard",
  description: "Your saved and suggested opportunities.",
};

type CardProps = {
  title: string;
  location: string;
  rate: string;
  blurb: string;
};

function OpportunityCard({ title, location, rate, blurb }: CardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <span className="text-sm text-gray-600">{rate}</span>
      </div>
      <p className="mt-1 text-sm text-gray-600">{location}</p>
      <p className="mt-3 text-sm leading-6 text-gray-700">{blurb}</p>
      <div className="mt-4">
        <a
          href="#"
          className="inline-flex items-center rounded-xl border px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          View details
        </a>
      </div>
    </div>
  );
}

export default function OpportunitiesDashboardPage() {
  const jobs: CardProps[] = [
    {
      title: "Irrigation Assistant",
      location: "Green Plains • Tamworth, NSW",
      rate: "$30–$34/hr",
      blurb:
        "Assist with daily irrigation scheduling, pump checks, and basic maintenance.",
    },
    {
      title: "Cattle Station Hand",
      location: "Seven Creeks • Charters Towers, QLD",
      rate: "$290/day",
      blurb:
        "Yard work, fencing repairs, and general station duties. Experience preferred.",
    },
    {
      title: "Vineyard Casual",
      location: "Red Ridge Wines • Barossa SA",
      rate: "$32/hr",
      blurb:
        "Pruning, wire lifting, and canopy work for 4–6 weeks. Training provided.",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">
        Dashboard
      </h1>

      <section className="mt-6 rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Opportunities</h2>
        <p className="mt-1 text-sm text-gray-600">
          Sample listings (static data for now).
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {jobs.map((j) => (
            <OpportunityCard key={j.title} {...j} />
          ))}
        </div>
      </section>
    </main>
  );
}
