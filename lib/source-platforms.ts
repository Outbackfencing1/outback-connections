// lib/source-platforms.ts
// Where a directory entry was found. Shared by the honesty UI (labels), the
// staff quick-add form (options + URL builders) and the import tooling.
//
// Honesty rule: a directory row must always say where we saw the business.
// When we know the platform but not the exact page, the source URL is a
// search on that platform for the business name ("search" kind) and the UI
// says "Find the original listing on Facebook", never "View the original".

export type SourcePlatform =
  | "facebook"
  | "yellow_pages"
  | "truelocal"
  | "google_maps"
  | "official_website"
  | "web";

export type SourceUrlKind = "site" | "search";

export type SourcePlatformOption = {
  value: SourcePlatform;
  label: string;
  /** True when there is no honest search fallback, so a real page URL is required. */
  needsUrl: boolean;
  hint: string;
};

export const SOURCE_PLATFORM_OPTIONS: SourcePlatformOption[] = [
  {
    value: "facebook",
    label: "Facebook",
    needsUrl: false,
    hint: "Paste the page URL if you have it. Otherwise we link to a Facebook search for the name.",
  },
  {
    value: "yellow_pages",
    label: "Yellow Pages",
    needsUrl: false,
    hint: "Paste the listing URL if you have it. Otherwise we link to a Yellow Pages search.",
  },
  {
    value: "truelocal",
    label: "TrueLocal",
    needsUrl: false,
    hint: "Paste the listing URL if you have it. Otherwise we link to a TrueLocal search.",
  },
  {
    value: "google_maps",
    label: "Google Maps",
    needsUrl: true,
    hint: "Paste the Google Maps share link for the place.",
  },
  {
    value: "official_website",
    label: "The business's own website",
    needsUrl: true,
    hint: "Paste the website address.",
  },
  {
    value: "web",
    label: "Somewhere else online",
    needsUrl: false,
    hint: "Paste the URL if you have it. Otherwise we link to a web search for the name.",
  },
];

/** Human labels for every platform value that can appear on a listing. */
export const PLATFORM_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  facebook: "Facebook",
  yellow_pages: "Yellow Pages",
  truelocal: "TrueLocal",
  official_website: "its official website",
  web: "the web",
  adzuna: "Adzuna",
};

export function prettyPlatform(p: string | null): string | null {
  if (!p) return null;
  if (PLATFORM_LABELS[p]) return PLATFORM_LABELS[p];
  return p
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function isSourcePlatform(v: unknown): v is SourcePlatform {
  return SOURCE_PLATFORM_OPTIONS.some((o) => o.value === v);
}

/** "Kings Fencing & Gates" -> "Kings Fencing and Gates" (search-safe, ASCII). */
export function cleanBusinessName(name: string): string {
  return name
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/ +/g, " ")
    .trim();
}

/**
 * Stable dedupe key for staff-entered rows: the same name + postcode on the
 * same platform updates the existing row instead of creating a duplicate.
 */
export function directoryExternalId(
  platform: SourcePlatform,
  name: string,
  postcode: string
): string {
  const slug = cleanBusinessName(name).toLowerCase().replace(/ +/g, "-");
  return `${platform}:${slug}:${postcode}`;
}

/** Honest fallback when we know where we saw a business but not the exact page. */
export function buildSearchUrl(
  platform: SourcePlatform,
  name: string,
  postcode: string,
  state: string
): string {
  const q = encodeURIComponent(cleanBusinessName(name)).replace(/%20/g, "+");
  switch (platform) {
    case "facebook":
      return `https://www.facebook.com/search/pages/?q=${q}`;
    case "yellow_pages":
      return `https://www.yellowpages.com.au/search/listings?clue=${q}&locationClue=${postcode}`;
    case "truelocal":
      return `https://www.truelocal.com.au/search?keyword=${q}&location=${postcode}`;
    default:
      return `https://www.google.com/search?q=${q}+${postcode}+${encodeURIComponent(state)}`;
  }
}
