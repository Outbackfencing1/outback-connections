// lib/directory-records.ts
// ONE definition of "a staff-entered directory entry": validation + the
// ImportRecord it becomes. Used by the quick-add server action, the CSV
// loader on the bulk import page, and the tests. Pure: no server imports.
import {
  buildSearchUrl,
  directoryExternalId,
  isSourcePlatform,
  SOURCE_PLATFORM_OPTIONS,
  type SourcePlatform,
  type SourceUrlKind,
} from "./source-platforms";

export const DIRECTORY_VERTICALS = ["service", "job", "freight"] as const;
export type DirectoryVertical = (typeof DIRECTORY_VERTICALS)[number];
export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

/** Raw input, as strings (form fields or CSV cells). Empty string = not given. */
export type DirectoryEntryInput = {
  name: string;
  vertical: string;
  category_slug?: string;
  postcode: string;
  suburb?: string;
  state?: string;
  platform: string;
  source_url?: string;
  website?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export type DirectoryImportRecord = {
  vertical: DirectoryVertical;
  source_platform: SourcePlatform;
  source_external_id: string;
  source_url: string;
  name: string;
  postcode: string;
  category_slug: string | null;
  suburb: string | null;
  state: string | null;
  website: string | null;
  raw_payload: Record<string, unknown>;
};

export type BuildResult =
  | { ok: true; record: DirectoryImportRecord; urlKind: SourceUrlKind }
  | { ok: false; errors: Record<string, string> };

const PLATFORM_ALIASES: Record<string, SourcePlatform> = {
  facebook: "facebook",
  fb: "facebook",
  "facebook page": "facebook",
  yellow_pages: "yellow_pages",
  "yellow pages": "yellow_pages",
  yellowpages: "yellow_pages",
  yp: "yellow_pages",
  truelocal: "truelocal",
  "true local": "truelocal",
  google_maps: "google_maps",
  "google maps": "google_maps",
  google: "google_maps",
  maps: "google_maps",
  official_website: "official_website",
  "official website": "official_website",
  website: "official_website",
  "own website": "official_website",
  site: "official_website",
  web: "web",
  online: "web",
  other: "web",
  internet: "web",
};

/** Accepts the platform value, its label, or common shorthand. */
export function normalisePlatform(v: string | undefined | null): SourcePlatform | null {
  const key = (v ?? "").trim().toLowerCase();
  if (!key) return null;
  if (isSourcePlatform(key)) return key;
  return PLATFORM_ALIASES[key] ?? null;
}

function isHttpUrl(v: string): boolean {
  return /^https?:[/][/][^ ]+$/i.test(v);
}

const t = (v: string | undefined | null): string => (v ?? "").trim();

export function buildDirectoryRecord(
  input: DirectoryEntryInput,
  meta: { enteredBy: string; enteredVia: string; enteredAt?: string }
): BuildResult {
  const errors: Record<string, string> = {};
  const name = t(input.name);
  const vertical = t(input.vertical).toLowerCase() as DirectoryVertical;
  const categorySlug = t(input.category_slug);
  const postcode = t(input.postcode);
  const suburb = t(input.suburb);
  const state = t(input.state).toUpperCase();
  const platform = normalisePlatform(input.platform);
  const url = t(input.source_url);
  const website = t(input.website);
  const phone = t(input.phone);
  const email = t(input.email);
  const notes = t(input.notes);

  if (name.length < 2 || name.length > 120) errors.name = "Business name: 2 to 120 characters.";
  if (!DIRECTORY_VERTICALS.includes(vertical)) errors.vertical = "Pick which directory it belongs in.";
  if (!/^[0-9]{4}$/.test(postcode)) errors.postcode = "Postcode: 4 digits.";
  if (suburb.length > 80) errors.suburb = "Town or area: under 80 characters.";
  if (state && !(AU_STATES as readonly string[]).includes(state)) errors.state = "Pick a state.";
  if (!platform) errors.platform = "Tell us where you found it.";
  const opt = platform ? SOURCE_PLATFORM_OPTIONS.find((o) => o.value === platform) : undefined;
  if (url && !isHttpUrl(url)) errors.source_url = "Paste a full URL starting with http:// or https://.";
  if (opt?.needsUrl && !url) errors.source_url = `${opt.label}: paste the page URL.`;
  if (website && !isHttpUrl(website)) errors.website = "Website must start with http:// or https://.";
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email)) errors.email = "That email doesn't look right.";
  if (phone && !/^[0-9 ()+-]{6,20}$/.test(phone)) errors.phone = "Phone: digits, spaces and brackets only.";
  if (notes.length > 2000) errors.notes = "Notes: keep under 2000 characters.";
  if (Object.keys(errors).length > 0 || !platform) return { ok: false, errors };

  const urlKind: SourceUrlKind = url ? "site" : "search";
  const sourceUrl = url || buildSearchUrl(platform, name, postcode, state || "NSW");
  const site = website || (platform === "official_website" ? url : "");

  const record: DirectoryImportRecord = {
    vertical,
    source_platform: platform,
    source_external_id: directoryExternalId(platform, name, postcode),
    source_url: sourceUrl,
    name,
    postcode,
    category_slug: categorySlug || null,
    suburb: suburb || null,
    state: state || null,
    website: site || null,
    // Private. Phone/email never reach the public contact columns.
    raw_payload: {
      type: categorySlug || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      found_on: platform,
      source_url_kind: urlKind,
      entered_by: meta.enteredBy,
      entered_via: meta.enteredVia,
      entered_at: meta.enteredAt ?? new Date().toISOString(),
    },
  };
  return { ok: true, record, urlKind };
}

const COLUMN_ALIASES: Record<keyof DirectoryEntryInput, string[]> = {
  name: ["name", "business", "business_name", "company", "trading_name"],
  vertical: ["vertical", "directory", "type"],
  category_slug: ["category", "category_slug", "cat"],
  postcode: ["postcode", "post_code", "pc"],
  suburb: ["suburb", "town", "area", "locality", "town_area"],
  state: ["state"],
  platform: ["platform", "found_on", "source", "found", "source_platform", "where_found"],
  source_url: ["source_url", "url", "page_url", "link", "page", "listing_url"],
  website: ["website", "web", "site", "www"],
  phone: ["phone", "mobile", "tel", "telephone", "contact_phone"],
  email: ["email", "e_mail", "contact_email"],
  notes: ["notes", "note", "comments", "comment"],
};

/** Maps a spreadsheet row (snake_case headers) onto the entry input. */
export function csvRowToInput(row: Record<string, string>, defaults?: Partial<DirectoryEntryInput>): DirectoryEntryInput {
  const pick = (key: keyof DirectoryEntryInput): string => {
    for (const alias of COLUMN_ALIASES[key]) {
      const v = row[alias];
      if (v !== undefined && v !== "") return v;
    }
    return defaults?.[key] ?? "";
  };
  return {
    name: pick("name"),
    vertical: pick("vertical") || "service",
    category_slug: pick("category_slug"),
    postcode: pick("postcode"),
    suburb: pick("suburb"),
    state: pick("state"),
    platform: pick("platform"),
    source_url: pick("source_url"),
    website: pick("website"),
    phone: pick("phone"),
    email: pick("email"),
    notes: pick("notes"),
  };
}
