// lib/staff-post-adoption.ts
// Staff sometimes list a third-party business through the PUBLIC post form,
// which marks it owner-posted (data_source='manual'): no Unclaimed badge, no
// source, contact in the signed-in-readable columns, no business record to
// claim. This module decides what to do with each such row; the daily cron
// /api/cron/adopt-staff-posts then re-files the good ones through the same
// path as /dashboard/directory/add and closes the original (it 301s to the
// new row). Pure: no server imports, so it is unit-tested.
import {
  AU_STATES,
  buildDirectoryRecord,
  normalisePlatform,
  type DirectoryEntryInput,
  type DirectoryImportRecord,
} from "./directory-records";
import { buildSearchUrl, SOURCE_PLATFORM_OPTIONS } from "./source-platforms";
import type { SourceUrlKind } from "./source-platforms";

export type StaffPostRow = {
  id: string;
  title: string;
  description: string | null;
  postcode: string | null;
  state: string | null;
  category_slug: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  created_at: string;
  user_id: string;
};

export type Screen =
  | { verdict: "adopt"; input: DirectoryEntryInput }
  | { verdict: "hold"; reasons: string[] };

// Not farm/rural trades. A fencing-and-concreting outfit is fine; a
// scaffolding hire or pool-glass installer is not what a farmer is after.
// Whole words only: "Douglass" is not glass, "Liverpool" is not a pool.
const OFF_TOPIC: [string, RegExp][] = [
  ["scaffold", /scaffold/i],
  ["pool", /(^|[^a-z])pools?([^a-z]|$)/i],
  ["glass", /(^|[^a-z])glass([^a-z]|$)/i],
  ["balustrade", /balustrad/i],
  ["removal", /(^|[^a-z])removals?([^a-z]|$)/i],
  ["cleaning", /(^|[^a-z])cleaning([^a-z]|$)/i],
  ["playground", /playground/i],
  ["real estate", /real estate/i],
];

const STATES = "NSW|VIC|QLD|SA|WA|TAS|NT|ACT";
const PLACE_ONLY = new RegExp(`^[A-Za-z' ]+ (${STATES})$`);
const TRADE_WORD =
  /(fenc|contract|rural|ag\b|agri|farm|pastoral|fabricat|weld|post|gate|steel|wire|services|pty|ltd|co\.?$|bros|& sons)/i;

/** "… we found listed on yellow_pages in Dalmeny, NSW. …" -> platform, town, state. */
export function parseFoundOn(description: string | null | undefined): {
  platform: string;
  suburb: string;
  state: string;
} {
  const d = (description ?? "").replace(/\s+/g, " ");
  const site = d.match(/found listed on its official website in ([^,.]+), ([A-Z]{2,3})/i);
  if (site) return { platform: "official_website", suburb: site[1].trim(), state: site[2].toUpperCase() };
  const m = d.match(/found listed on ([a-z_ ]+?) in ([^,.]+), ([A-Z]{2,3})/i);
  if (m) {
    const platform = normalisePlatform(m[1].replace(/^the /i, "")) ?? "web";
    return { platform, suburb: m[2].trim(), state: m[3].toUpperCase() };
  }
  return { platform: "web", suburb: "", state: "" };
}

export function screenStaffPost(row: StaffPostRow): Screen {
  const reasons: string[] = [];
  const name = (row.title ?? "").trim();
  const lower = name.toLowerCase();

  if (name.length < 3) reasons.push("name too short");
  if (PLACE_ONLY.test(name) && !TRADE_WORD.test(name)) reasons.push("title is a place, not a business name");
  const off = OFF_TOPIC.find(([, re]) => re.test(lower));
  if (off) reasons.push(`not a farm trade ("${off[0]}")`);
  if (!/^[0-9]{4}$/.test(row.postcode ?? "")) reasons.push("postcode missing or invalid");
  if (reasons.length > 0) return { verdict: "hold", reasons };

  const found = parseFoundOn(row.description);
  // Google Maps and "own website" need the exact page, and these posts never
  // carry one. Say "found online" (a web search for the name) rather than
  // claim a page we can't link to.
  const needsUrl = SOURCE_PLATFORM_OPTIONS.find((o) => o.value === found.platform)?.needsUrl ?? false;
  const platform = needsUrl ? "web" : found.platform;
  const phone = (row.contact_phone ?? "").replace(/[^0-9 ()+-]/g, "").trim();
  const email = (row.contact_email ?? "").trim();
  return {
    verdict: "adopt",
    input: {
      name,
      vertical: "service",
      category_slug: row.category_slug ?? "",
      postcode: row.postcode ?? "",
      suburb: found.suburb,
      state: resolveState(row.state, found.state, row.postcode),
      platform,
      source_url: "",
      website: "",
      phone: phone.length >= 6 && phone.length <= 20 ? phone : "",
      email: /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email) ? email : "",
      notes:
        `Re-filed from a public-form post (listing ${row.id}).` +
        (needsUrl ? ` The post said it was found on ${found.platform}, with no page URL.` : ""),
    },
  };
}

/** Australian postcode -> state code, or null if it doesn't look Australian. */
export function stateFromPostcode(postcode: string | null | undefined): string | null {
  if (!/^[0-9]{4}$/.test(postcode ?? "")) return null;
  const n = Number(postcode);
  if (n >= 200 && n <= 299) return "ACT";
  if (n >= 800 && n <= 999) return "NT";
  if ((n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return "ACT";
  if (n >= 1000 && n <= 2999) return "NSW";
  if ((n >= 3000 && n <= 3999) || (n >= 8000 && n <= 8999)) return "VIC";
  if ((n >= 4000 && n <= 4999) || (n >= 9000 && n <= 9999)) return "QLD";
  if (n >= 5000 && n <= 5999) return "SA";
  if (n >= 6000 && n <= 6999) return "WA";
  if (n >= 7000 && n <= 7999) return "TAS";
  return null;
}

const isState = (v: string): boolean => (AU_STATES as readonly string[]).includes(v);

/** First valid state code from the row, the description, then the postcode. */
function resolveState(rowState: string | null, foundState: string, postcode: string | null): string {
  for (const c of [rowState, foundState]) {
    const v = (c ?? "").trim().toUpperCase();
    if (isState(v)) return v;
  }
  return stateFromPostcode(postcode) ?? "";
}

export type Plan =
  | { verdict: "adopt"; record: DirectoryImportRecord; urlKind: SourceUrlKind }
  | { verdict: "hold"; reasons: string[] };

/**
 * The whole decision for one row: the screen, then the same record builder
 * the quick-add page uses. A row the builder rejects is held for a person,
 * never left live as an owner post. The cron's dry run and the real run both
 * call this, so the dry run shows exactly what will happen.
 */
export function planStaffPost(row: StaffPostRow): Plan {
  const screen = screenStaffPost(row);
  if (screen.verdict === "hold") return screen;
  const built = buildDirectoryRecord(screen.input, {
    enteredBy: row.user_id,
    enteredVia: "adopted from public post form",
    enteredAt: row.created_at,
  });
  if (!built.ok) return { verdict: "hold", reasons: Object.values(built.errors).map((e) => `could not re-file: ${e}`) };
  return { verdict: "adopt", record: built.record, urlKind: built.urlKind };
}

/**
 * Source link for a closed original once its phone/email are cleared. Every
 * listing must keep a phone, an email or a source URL (listings_contact_required),
 * so clearing the contact columns alone fails.
 */
export function closedOriginalSourceUrl(row: Pick<StaffPostRow, "title" | "postcode" | "state">): string {
  const state = resolveState(row.state, "", row.postcode) || "NSW";
  return buildSearchUrl("web", row.title ?? "", row.postcode ?? "", state);
}
