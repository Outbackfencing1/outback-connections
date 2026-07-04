// lib/adzuna.ts — Adzuna syndicated job-ad ingestion. SERVER-ONLY.
//
// This is the SYNDICATED layer (sprint item 2), deliberately distinct from
// first-party jobs (the 50-jobs milestone) AND from the scraped business
// directory:
//   - attributed:   source_platform='adzuna', source_url = the Adzuna ad
//   - link-out:     the apply path is the /listings/[id]/source redirect
//   - no schema:    a syndicated ad NEVER emits JobPosting JSON-LD
//   - not claimable: no business row is created; the claim flow never shows
// Never conflate the layers: data_source='scraped' + source_platform='adzuna'
// is what marks a row as syndicated everywhere in the UI.
//
// Env-gated: without ADZUNA_APP_ID + ADZUNA_APP_KEY every entry point no-ops
// with a clear "not configured" result (same pattern as the ops Google Ads
// scaffold). No DB migration needed — ad extras live in listings.metadata.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSlug } from "@/lib/posting";

const ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs/au/search";

// One `what` query per rural occupation cluster. Adzuna ANDs words within a
// query, so multi-word terms stay specific. Each run pulls page 1 of each.
export const RURAL_SEARCHES = [
  "station hand",
  "farm hand",
  "shearer",
  "mustering",
  "feedlot",
  "dairy farm",
  "harvest",
  "fencing rural",
] as const;

// Adzuna full state names → regions.state abbreviations.
const STATE_ABBREV: Record<string, string> = {
  "new south wales": "NSW",
  victoria: "VIC",
  queensland: "QLD",
  "south australia": "SA",
  "western australia": "WA",
  tasmania: "TAS",
  "northern territory": "NT",
  "australian capital territory": "ACT",
};

// keyword → categories.slug (pillar=jobs). First match wins; jobs-other fallback.
const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/shear|wool|roustabout|shed hand/i, "shearer"],
  [/muster|stock ?camp|stock ?hand/i, "mustering"],
  [/dairy|feedlot|milk/i, "dairy-feedlot"],
  [/harvest|picker|picking|orchard|fruit|seeding/i, "harvest-worker"],
  [/fenc/i, "fencing-labour"],
  [/truck|livestock transport|road train/i, "ag-truck-driver"],
  [/excavator|dozer|grader|earthmov|plant operator/i, "earthworks-operator"],
  [/station hand|farm ?hand|jackaroo|jillaroo|stockman|overseer|station|farm/i, "station-hand"],
];

export interface AdzunaRawAd {
  id: string;
  title: string;
  description: string;
  redirect_url: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  contract_type?: string; // permanent | contract
  contract_time?: string; // full_time | part_time
  latitude?: number;
  longitude?: number;
  category?: { label?: string; tag?: string };
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
}

export interface NormalisedAd {
  sourceExternalId: string;
  sourceUrl: string;
  title: string;
  description: string;
  categorySlug: string;
  workType: string | null; // full_time | casual | contract | null
  company: string | null;
  locationDisplay: string | null;
  /** Locality candidates, most specific first, for postcode resolution. */
  localityCandidates: string[];
  stateAbbrev: string | null;
  stateFull: string | null;
  metadata: Record<string, unknown>;
  rawPayload: AdzunaRawAd;
}

export function isAdzunaConfigured(): boolean {
  return !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

export async function fetchAdzunaSearch(
  what: string,
  opts: { page?: number; resultsPerPage?: number; maxDaysOld?: number } = {}
): Promise<AdzunaRawAd[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error("Adzuna not configured");

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what,
    results_per_page: String(opts.resultsPerPage ?? 50),
    max_days_old: String(opts.maxDaysOld ?? 35),
    sort_by: "date",
    "content-type": "application/json",
  });
  const res = await fetch(`${ADZUNA_BASE}/${opts.page ?? 1}?${params}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Adzuna ${res.status} for "${what}": ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { results?: AdzunaRawAd[] };
  return json.results ?? [];
}

export function normaliseAdzunaAd(raw: AdzunaRawAd): NormalisedAd | null {
  if (!raw?.id || !raw.title || !raw.redirect_url) return null;

  const area = raw.location?.area ?? [];
  const stateFull = area[1] ?? null;
  const stateAbbrev = stateFull ? STATE_ABBREV[stateFull.toLowerCase()] ?? null : null;

  // Locality candidates: area entries after the state, most specific last in
  // Adzuna's array → reverse so most specific comes first. Strip admin suffixes.
  const localityCandidates = area
    .slice(2)
    .reverse()
    .map((a) =>
      a
        .replace(/\s+(region|regional|shire|city|council|district)$/i, "")
        .trim()
    )
    .filter(Boolean);

  const haystack = `${raw.title} ${raw.category?.label ?? ""}`;
  let categorySlug = "jobs-other";
  for (const [re, slug] of CATEGORY_KEYWORDS) {
    if (re.test(haystack)) {
      categorySlug = slug;
      break;
    }
  }

  const workType =
    raw.contract_type === "contract"
      ? "contract"
      : raw.contract_time === "full_time"
        ? "full_time"
        : raw.contract_time === "part_time"
          ? "casual"
          : null;

  return {
    sourceExternalId: String(raw.id),
    sourceUrl: raw.redirect_url,
    title: raw.title.slice(0, 200),
    description: (raw.description || raw.title).slice(0, 2000),
    categorySlug,
    workType,
    company: raw.company?.display_name ?? null,
    locationDisplay: raw.location?.display_name ?? null,
    localityCandidates,
    stateAbbrev,
    stateFull,
    metadata: {
      syndicated: true,
      provider: "adzuna",
      company: raw.company?.display_name ?? null,
      location_display: raw.location?.display_name ?? null,
      salary_min: raw.salary_min ?? null,
      salary_max: raw.salary_max ?? null,
      salary_predicted: raw.salary_is_predicted === "1",
      adzuna_category: raw.category?.label ?? null,
      created: raw.created ?? null,
    },
    rawPayload: raw,
  };
}

/**
 * Resolve a locality name to a representative postcode via the regions table
 * (region-level accuracy — good enough for postcode-prefix browse filtering;
 * the syndicated notice shows Adzuna's own location text as display truth).
 */
export async function resolvePostcode(
  admin: SupabaseClient,
  candidates: string[],
  stateAbbrev: string | null,
  cache: Map<string, { postcode: string; state: string } | null>
): Promise<{ postcode: string; state: string } | null> {
  for (const cand of candidates) {
    const key = `${stateAbbrev ?? ""}|${cand.toLowerCase()}`;
    if (cache.has(key)) {
      const hit = cache.get(key)!;
      if (hit) return hit;
      continue;
    }
    let q = admin
      .from("regions")
      .select("postcode, state, region_name, lga")
      .or(`region_name.ilike.${cand},lga.ilike.${cand}`)
      .order("postcode", { ascending: true })
      .limit(20);
    if (stateAbbrev) q = q.eq("state", stateAbbrev);
    const { data } = await q;
    const rows = data ?? [];
    // Prefer an exact region_name match over an LGA match.
    const best =
      rows.find((r) => r.region_name?.toLowerCase() === cand.toLowerCase()) ??
      rows[0] ??
      null;
    const resolved = best ? { postcode: best.postcode, state: best.state } : null;
    cache.set(key, resolved);
    if (resolved) return resolved;
  }
  return null;
}

export interface AdzunaSyncSummary {
  configured: boolean;
  dryRun: boolean;
  searches: number;
  fetched: number;
  unique: number;
  created: number;
  updated: number;
  skippedNoPostcode: number;
  /** Creations blocked by the 4:1 syndicated:first-party ratio cap. */
  skippedRatioCap: number;
  firstPartyJobs: number;
  activeSyndicated: number;
  ratioCap: number;
  errors: string[];
  sample?: Array<Record<string, unknown>>;
}

/**
 * Fetch → normalise → resolve postcodes → upsert. `limit` caps how many ads
 * are written per run (staged-rollout discipline: start small, widen after
 * the honesty audit + a full expire-scraped cycle).
 *
 * Ratio discipline (decision 4 Jul 2026): TOTAL active syndicated ads stay
 * under 4× the active first-party job count (floor 4). A /jobs page that is
 * hundreds of link-outs wrapped around one real listing reads as a scraper
 * site. The cap gates NEW creations only — re-sightings of existing ads
 * always refresh (they keep current stock fresh without changing the ratio).
 * As first-party count climbs, the cap climbs automatically.
 *
 * With dryRun, everything runs (including existence checks and the ratio
 * headroom) except the writes.
 */
export async function syncAdzunaJobs(
  admin: SupabaseClient,
  opts: { limit?: number; dryRun?: boolean } = {}
): Promise<AdzunaSyncSummary> {
  const summary: AdzunaSyncSummary = {
    configured: isAdzunaConfigured(),
    dryRun: !!opts.dryRun,
    searches: 0,
    fetched: 0,
    unique: 0,
    created: 0,
    updated: 0,
    skippedNoPostcode: 0,
    skippedRatioCap: 0,
    firstPartyJobs: 0,
    activeSyndicated: 0,
    ratioCap: 0,
    errors: [],
  };
  if (!summary.configured) return summary;

  const limit = Math.max(1, Math.min(opts.limit ?? 50, 250));

  // Ratio headroom: how many NEW syndicated ads may be created this run.
  const nowIso = new Date().toISOString();
  const [{ count: firstParty }, { count: activeSynd }] = await Promise.all([
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("kind", "job")
      .eq("status", "active")
      .neq("data_source", "scraped")
      .gt("expires_at", nowIso),
    admin
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("kind", "job")
      .eq("status", "active")
      .eq("source_platform", "adzuna")
      .gt("expires_at", nowIso),
  ]);
  summary.firstPartyJobs = firstParty ?? 0;
  summary.activeSyndicated = activeSynd ?? 0;
  summary.ratioCap = Math.max(4, 4 * summary.firstPartyJobs);
  const creationHeadroom = Math.max(0, summary.ratioCap - summary.activeSyndicated);

  // 1. Fetch all searches, dedupe by ad id (the same ad matches several terms).
  const byId = new Map<string, NormalisedAd>();
  for (const what of RURAL_SEARCHES) {
    try {
      const ads = await fetchAdzunaSearch(what);
      summary.searches++;
      summary.fetched += ads.length;
      for (const raw of ads) {
        const norm = normaliseAdzunaAd(raw);
        if (norm && !byId.has(norm.sourceExternalId)) byId.set(norm.sourceExternalId, norm);
      }
    } catch (e) {
      summary.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  summary.unique = byId.size;

  // 2. Resolve category ids once.
  const { data: cats } = await admin
    .from("categories")
    .select("id, slug")
    .eq("country_code", "AU")
    .eq("pillar", "jobs")
    .eq("active", true);
  const catBySlug = new Map((cats ?? []).map((c) => [c.slug, c.id]));
  const fallbackCatId = catBySlug.get("jobs-other");
  if (!fallbackCatId) {
    summary.errors.push("jobs-other category missing — aborting");
    return summary;
  }

  // 3. Upsert, capped at `limit`.
  const regionCache = new Map<string, { postcode: string; state: string } | null>();
  const sample: Array<Record<string, unknown>> = [];
  let written = 0;

  for (const ad of byId.values()) {
    if (written >= limit) break;

    const resolved = await resolvePostcode(admin, ad.localityCandidates, ad.stateAbbrev, regionCache);
    if (!resolved) {
      summary.skippedNoPostcode++;
      continue;
    }

    const row = {
      kind: "job",
      vertical: "job",
      side: "demand",
      status: "active",
      title: ad.title,
      description: ad.description,
      postcode: resolved.postcode,
      state: ad.stateFull,
      category_id: catBySlug.get(ad.categorySlug) ?? fallbackCatId,
      user_id: null,
      policy_version_id: null,
      data_source: "scraped",
      source_platform: "adzuna",
      source_url: ad.sourceUrl,
      source_external_id: ad.sourceExternalId,
      scraped_at: new Date().toISOString(),
      imported_at: new Date().toISOString(),
      freshness_status: "fresh",
      expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
      metadata: ad.metadata,
    };

    try {
      const { data: existing } = await admin
        .from("listings")
        .select("id")
        .eq("source_platform", "adzuna")
        .eq("source_external_id", ad.sourceExternalId)
        .maybeSingle();

      // Ratio cap gates NEW creations only; re-sightings always refresh.
      if (!existing && summary.created >= creationHeadroom) {
        summary.skippedRatioCap++;
        continue;
      }

      if (sample.length < 10) {
        sample.push({
          action: existing ? "update" : "create",
          title: ad.title,
          company: ad.company,
          location: ad.locationDisplay,
          postcode: resolved.postcode,
          category: ad.categorySlug,
          work_type: ad.workType,
        });
      }
      if (opts.dryRun) {
        if (existing) summary.updated++;
        else summary.created++;
        written++;
        continue;
      }

      let listingId: string;
      if (existing) {
        // Re-sighting: refresh descriptive fields + freshness, never trust state.
        const { error } = await admin
          .from("listings")
          .update({
            title: row.title,
            description: row.description,
            postcode: row.postcode,
            state: row.state,
            source_url: row.source_url,
            scraped_at: row.scraped_at,
            freshness_status: "fresh",
            expires_at: row.expires_at,
            metadata: row.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw new Error(`update ${ad.sourceExternalId}: ${error.message}`);
        listingId = existing.id;
        summary.updated++;
      } else {
        // Two-step insert (same as lib/posting): placeholder slug, then the
        // real slug once anonymised_id exists.
        const placeholder = `pending-${row.postcode}-${ad.sourceExternalId.slice(-8)}`;
        const { data: inserted, error: insErr } = await admin
          .from("listings")
          .insert({ ...row, slug: placeholder })
          .select("id, anonymised_id")
          .single();
        if (insErr || !inserted) throw new Error(`insert ${ad.sourceExternalId}: ${insErr?.message}`);
        const slug = buildSlug(ad.title, row.postcode, inserted.anonymised_id);
        const { error: slugErr } = await admin.from("listings").update({ slug }).eq("id", inserted.id);
        if (slugErr) {
          await admin.from("listings").delete().eq("id", inserted.id);
          throw new Error(`slug ${ad.sourceExternalId}: ${slugErr.message}`);
        }
        const { error: detErr } = await admin
          .from("job_details")
          .insert({ listing_id: inserted.id, work_type: ad.workType });
        if (detErr) {
          await admin.from("listings").delete().eq("id", inserted.id);
          throw new Error(`job_details ${ad.sourceExternalId}: ${detErr.message}`);
        }
        listingId = inserted.id;
        summary.created++;
      }

      // listing_sources sighting log (private raw_payload archive).
      const { data: src } = await admin
        .from("listing_sources")
        .select("id")
        .eq("listing_id", listingId)
        .eq("source_platform", "adzuna")
        .maybeSingle();
      if (src) {
        await admin
          .from("listing_sources")
          .update({ last_seen_at: new Date().toISOString(), raw_payload: ad.rawPayload, active: true })
          .eq("id", src.id);
      } else {
        await admin.from("listing_sources").insert({
          listing_id: listingId,
          source_platform: "adzuna",
          source_url: ad.sourceUrl,
          source_external_id: ad.sourceExternalId,
          raw_payload: ad.rawPayload,
        });
      }
      written++;
    } catch (e) {
      summary.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  summary.sample = sample;
  return summary;
}
