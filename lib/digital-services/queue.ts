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

/** What happened to an owner's status change; shown back on the queue. */
export type StatusChange = "saved" | "not_found" | "failed" | "invalid" | "unavailable";

type UpdateResult = { data: { id: string; status: string }[] | null; error: { message: string } | null };

/**
 * Validate and apply a status change. "saved" only when the database returns
 * the updated row with the new status; an error is "failed" (nothing
 * changed, try again) and zero rows is "not_found". Never assumes success.
 */
export async function applyStatusChange(
  input: { id: unknown; status: unknown },
  update: ((id: string, status: Status) => Promise<UpdateResult>) | null
): Promise<StatusChange> {
  const { id, status } = input;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return "invalid";
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) return "invalid";
  if (!update) return "unavailable";
  try {
    const { data, error } = await update(id, status as Status);
    if (error) return "failed";
    if (!data || data.length === 0) return "not_found";
    return data[0].status === status ? "saved" : "failed";
  } catch {
    return "failed";
  }
}

/** Keep only the queue's own view parameters from a posted query string. */
export function queueViewParams(raw: unknown): URLSearchParams {
  const keep = new URLSearchParams();
  if (typeof raw !== "string") return keep;
  const given = new URLSearchParams(raw.replace(/^\?/, ""));
  for (const key of ["q", "status", "page"]) {
    const v = given.get(key);
    if (v) keep.set(key, v.slice(0, 200));
  }
  return keep;
}
