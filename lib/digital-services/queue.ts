// lib/digital-services/queue.ts
// Owner queue paging and status filtering. The status filter runs in the
// database so closed/spam rows can't push open leads out of view; plain
// browsing is paged; a search scans every page (enquiries are kept 12 months,
// so the set stays small) and filters in memory with matchesSearch.
export const STATUSES = ["new", "replied", "qualified", "closed", "spam"] as const;
export type Status = (typeof STATUSES)[number];
export const OPEN_STATUSES: Status[] = ["new", "replied", "qualified"];

export const PAGE_SIZE = 50;
export const SEARCH_CHUNK = 500;
export const SEARCH_MAX_ROWS = 10_000;

/** "" or "open" = open leads (default); "all" = everything; else one status. */
export function statusesFor(filter: string): Status[] | null {
  if (filter === "all") return null;
  if ((STATUSES as readonly string[]).includes(filter)) return [filter as Status];
  return OPEN_STATUSES;
}

export function pageFrom(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}
