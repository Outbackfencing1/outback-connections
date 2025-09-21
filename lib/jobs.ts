// lib/jobs.ts

export type Job = {
  slug: string;
  title: string;
  location: string;
  rate: string;
  description: string;
  postedAt: string; // ISO date string
};

const JOBS: Job[] = [
  {
    slug: "irrigation-assistant-tamworth-nsw",
    title: "Irrigation Assistant",
    location: "Green Plains • Tamworth, NSW",
    rate: "$30–$34/hr",
    description:
      "Assist with irrigation scheduling, pump checks, and basic maintenance. Early starts preferred. Experience helpful but not required.",
    postedAt: "2025-09-10",
  },
  {
    slug: "cattle-station-hand-charters-towers-qld",
    title: "Cattle Station Hand",
    location: "Seven Creeks • Charters Towers, QLD",
    rate: "$290/day",
    description:
      "General station work including yard work, fencing repairs, water runs, and stock handling. Must be comfortable working outdoors.",
    postedAt: "2025-09-12",
  },
  {
    slug: "vineyard-casual-barossa-sa",
    title: "Vineyard Casual",
    location: "Red Ridge Wines • Barossa, SA",
    rate: "$32/hr",
    description:
      "Pruning, wire lifting, and canopy work for 4–6 weeks. Training provided. Good level of fitness required.",
    postedAt: "2025-09-14",
  },
];

export function allJobs(): Job[] {
  return JOBS;
}

export function getJobBySlug(slug: string): Job | undefined {
  return JOBS.find((j) => j.slug === slug);
}
