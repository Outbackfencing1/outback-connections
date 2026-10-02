// lib/staff-post-adoption.ts
// Staff sometimes list a third-party business through the PUBLIC post form,
// which marks it owner-posted (data_source='manual'): no Unclaimed badge, no
// source, contact in the signed-in-readable columns, no business record to
// claim. This module decides what to do with each such row; the daily cron
// /api/cron/adopt-staff-posts then re-files the good ones through the same
// path as /dashboard/directory/add and closes the original (it 301s to the
// new row). Pure: no server imports, so it is unit-tested.
import { normalisePlatform, type DirectoryEntryInput } from "./directory-records";

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
    const platform = normalisePlatform(m[1]) ?? "web";
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
      state: (row.state || found.state || "NSW").toUpperCase(),
      platform: found.platform,
      source_url: "",
      website: "",
      phone: phone.length >= 6 && phone.length <= 20 ? phone : "",
      email: /^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email) ? email : "",
      notes: `Re-filed from a public-form post (listing ${row.id}).`,
    },
  };
}
