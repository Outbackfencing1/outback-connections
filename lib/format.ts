// lib/format.ts — small text + date helpers used across browse + detail pages.

export function relativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export function teaser(text: string, max = 120): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut) + "…";
}

export function listingHref(kind: string, slug: string): string {
  if (kind === "job") return `/jobs/${slug}`;
  if (kind === "freight") return `/freight/${slug}`;
  return `/services/listing/${slug}`;
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "job":
      return "Job";
    case "freight":
      return "Freight";
    case "service_offering":
      return "Service offering";
    case "service_request":
      return "Service request";
    default:
      return kind;
  }
}
