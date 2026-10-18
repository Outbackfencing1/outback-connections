#!/usr/bin/env node
/**
 * scripts/cleanup-seo-hygiene.mjs
 *
 * Executes Task 1 & Task 3 database hygiene against Outback Connections:
 * 1. Archives existing unclaimed listings and businesses in excluded NSW metro
 *    postcodes (2000-2263, 2280-2308, 2500-2530, 2555-2570, 2745-2770, 1000-1999).
 * 2. Replaces static boilerplate unclaimed descriptions and removes all "Yellow Pages"
 *    mentions from `listings`, `businesses`, and `listing_sources`.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Guardrail: never touch cuoassggfjbnsdtmoaxg or rzetxkcwblclfhtfeycu
if (
  SUPABASE_URL.includes("cuoassggfjbnsdtmoaxg") ||
  SUPABASE_URL.includes("rzetxkcwblclfhtfeycu")
) {
  console.error("Refusing to run against guarded Supabase project.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const NSW_EXCLUDED_METRO_RANGES = [
  [1000, 1999],
  [2000, 2263],
  [2280, 2308],
  [2500, 2530],
  [2555, 2570],
  [2745, 2770],
];

function isRuralPostcode(postcode, state = "NSW") {
  const clean = String(postcode ?? "").trim();
  if (!/^\d{4}$/.test(clean)) return false;
  const num = Number(clean);
  const st = String(state || "NSW").trim().toUpperCase();
  if (st === "NSW" || (num >= 1000 && num <= 2999 && st !== "ACT")) {
    for (const [min, max] of NSW_EXCLUDED_METRO_RANGES) {
      if (num >= min && num <= max) return false;
    }
  }
  return true;
}

function buildDynamicUnclaimedDescription({ businessName, categoryName, suburb, postcode, state }) {
  const name = (businessName || "This rural business").trim();
  const cat = (categoryName || "Rural Service Provider")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  const st = (state || "NSW").trim().toUpperCase();
  const town = (suburb || `Regional ${st}`).trim();
  const pc = (postcode || "").trim();

  let hash = 0;
  const seed = `${name.toLowerCase()}|${pc}`;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  if (hash % 2 === 0) {
    return `${name} operates as a local ${cat} servicing ${town}${pc ? ` (${pc})` : ""} and surrounding regional properties in ${st}. Request a direct quote or claim this business profile to update service details.`;
  }
  return `Regional ${cat} based in ${town}, ${st}${pc ? ` ${pc}` : ""}. Connect directly with ${name} for rural property work, contracting, and local quotes with zero lead fees.`;
}

async function main() {
  console.log("1. Fetching categories and regions...");
  const [{ data: categories }, { data: regions }] = await Promise.all([
    supabase.from("categories").select("id, label"),
    supabase.from("regions").select("postcode, locality, state"),
  ]);

  const catMap = new Map((categories ?? []).map((c) => [c.id, c.label]));
  const regionMap = new Map();
  for (const r of regions ?? []) {
    if (r.postcode && !regionMap.has(r.postcode)) {
      regionMap.set(r.postcode, { locality: r.locality, state: r.state });
    }
  }

  console.log("2. Auditing listings for metro postcodes & unclaimed copy...");
  const { data: listings, error: lstErr } = await supabase
    .from("listings")
    .select(
      "id, title, description, postcode, state, status, user_id, business_id, category_id, data_source, source_platform, metadata"
    )
    .limit(5000);

  if (lstErr) {
    console.error("Failed to fetch listings:", lstErr.message);
    process.exit(1);
  }

  let archivedMetroListings = 0;
  let updatedDescriptions = 0;

  for (const l of listings ?? []) {
    const isUnclaimed = l.user_id === null || l.data_source === "scraped" || l.data_source === "imported";
    const rural = isRuralPostcode(l.postcode, l.state);

    if (isUnclaimed && !rural && l.status !== "deleted_by_admin") {
      const { error } = await supabase
        .from("listings")
        .update({ status: "deleted_by_admin" })
        .eq("id", l.id);
      if (!error) archivedMetroListings++;
      continue;
    }

    const desc = String(l.description ?? "");
    const needsCopyUpdate =
      /yellow\s*pages/i.test(desc) ||
      /unclaimed directory listing/i.test(desc) ||
      /we found listed/i.test(desc) ||
      (isUnclaimed && /was not posted by the business/i.test(desc));

    const needsPlatformClean = l.source_platform === "yellow_pages";

    if (needsCopyUpdate || needsPlatformClean) {
      const metaSuburb =
        l.metadata && typeof l.metadata === "object" && typeof l.metadata.suburb === "string"
          ? l.metadata.suburb
          : null;
      const reg = regionMap.get(l.postcode);
      const suburb = metaSuburb || reg?.locality || `Regional ${l.state || "NSW"}`;
      const state = l.state || reg?.state || "NSW";
      const categoryName = catMap.get(l.category_id) || "Rural Service Provider";

      const newDesc = needsCopyUpdate
        ? buildDynamicUnclaimedDescription({
            businessName: l.title,
            categoryName,
            suburb,
            postcode: l.postcode,
            state,
          })
        : desc;

      const patch = {};
      if (needsCopyUpdate) patch.description = newDesc;
      if (needsPlatformClean) patch.source_platform = "web";

      const { error } = await supabase.from("listings").update(patch).eq("id", l.id);
      if (!error) updatedDescriptions++;
    }
  }

  console.log("3. Auditing businesses for metro postcodes & yellow_pages platform...");
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, trading_name, postcode, state_code, status, claim_status, source_platform")
    .limit(5000);

  let archivedMetroBusinesses = 0;
  let cleanedBizPlatforms = 0;

  for (const b of businesses ?? []) {
    const rural = isRuralPostcode(b.postcode, b.state_code);
    if (b.claim_status === "unclaimed" && !rural && b.status === "active") {
      const { error } = await supabase
        .from("businesses")
        .update({ status: "suspended" })
        .eq("id", b.id);
      if (!error) archivedMetroBusinesses++;
    }
    if (b.source_platform === "yellow_pages") {
      const { error } = await supabase
        .from("businesses")
        .update({ source_platform: "web" })
        .eq("id", b.id);
      if (!error) cleanedBizPlatforms++;
    }
  }

  await supabase
    .from("listing_sources")
    .update({ source_platform: "web" })
    .eq("source_platform", "yellow_pages");

  console.log(
    JSON.stringify(
      {
        archivedMetroListings,
        archivedMetroBusinesses,
        updatedDescriptions,
        cleanedBizPlatforms,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
