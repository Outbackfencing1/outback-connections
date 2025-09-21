type Opportunity = {
  id: string;
  title: string;
  farm: string;
  location: string;
  rate: string;
  summary: string;
};

const SAMPLE: Opportunity[] = [
  {
    id: "1",
    title: "Irrigation Assistant",
    farm: "Green Plains",
    location: "Tamworth, NSW",
    rate: "$30–$34/hr",
    summary:
      "Assist with daily irrigation scheduling, pump checks, and basic maintenance.",
  },
  {
    id: "2",
    title: "Cattle Station Hand",
    farm: "Seven Creeks",
    location: "Charters Towers, QLD",
    rate: "$290/day",
    summary:
      "Yard work, fencing repairs, and general station duties. Experience preferred.",
  },
  {
    id: "3",
    title: "Vineyard Casual",
    farm: "Red Ridge Wines",
    location: "Barossa SA",
    rate: "$32/hr",
    summary:
      "Pruning, wire lifting, and canopy work for 4–6 weeks. Training provided.",
  },
];

export const metadata = {
  title: "Opportunities – OutbackConnections",
};

export default function OpportunitiesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Opportunities</h2>
          <p className="text-sm text-gray-500">
            Sample listings (static data for now).
          </p>
        </div>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {SAMPLE.map((job) => (
          <li key={job.id} className="rounded-xl border p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h3 className="text-lg font-medium">{job.title}</h3>
              <span className="text-sm text-gray-600">{job.rate}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {job.farm} • {job.location}
            </p>
            <p className="mt-3 text-sm text-gray-700">{job.summary}</p>
            <div className="mt-4">
              <a
                href="#"
                className="inline-block rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
              >
                View details
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
