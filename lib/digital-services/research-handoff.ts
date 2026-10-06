// lib/digital-services/research-handoff.ts
// Dry-run adapter for the private research handoff contract
// "oc-research-handoff/0.1-proposed" (the GLM first-customer research return).
// It reads three things the owner holds privately: the request packet, the
// JSON Schema shipped with it, and the raw exclusions snapshot whose SHA-256
// the packet pins. Nothing here imports, assigns IDs, reserves, drafts or
// contacts anyone, and nothing is written: the result is a report a person
// reviews before anything goes through the engine's own owner-only import.
//
// Rules this adapter keeps:
// - Adapter errors (wrong contract, request, schema or exclusions hash; a
//   malformed row) are reported apart from eligibility and value findings.
//   A contract-level adapter error means no business was judged.
// - A row's outcome only ever gets stricter than the researcher's own call:
//   holds and exclusions are preserved, never cleared or promoted.
// - Every row stays sendable:false with the contact basis "not_established".
// - Evidence keeps its timestamp, method (source_type) and limitations.
// - No new application IDs, emails or segment changes are produced.
// Self-contained (no local imports) so the Node CLI can load it directly.
import { createHash } from "node:crypto";

export const HANDOFF_CONTRACT = "oc-research-handoff/0.1-proposed";
export const EXCLUSIONS_CONTRACT = "oc-research-exclusions/1";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function sha256Hex(raw: string | Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ---------------------------------------------------------------------------
// Minimal JSON Schema (2020-12 subset) interpreter. It refuses keywords it
// doesn't implement rather than silently ignoring them.

const SUPPORTED = new Set([
  "$schema", "$id", "title", "description", "type", "const", "enum", "pattern", "minLength", "maxLength",
  "minimum", "maximum", "minItems", "maxItems", "items", "properties", "required", "additionalProperties",
  "allOf", "if", "then", "format",
]);

export function schemaKeywordsSupported(schema: unknown, path = "#"): string[] {
  if (!isObj(schema)) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(schema)) {
    if (!SUPPORTED.has(k)) out.push(`${path}/${k}`);
    if (k === "properties" && isObj(v)) for (const [p, s] of Object.entries(v)) out.push(...schemaKeywordsSupported(s, `${path}/properties/${p}`));
    else if ((k === "items" || k === "if" || k === "then") && isObj(v)) out.push(...schemaKeywordsSupported(v, `${path}/${k}`));
    else if (k === "allOf" && Array.isArray(v)) v.forEach((s, i) => out.push(...schemaKeywordsSupported(s, `${path}/allOf/${i}`)));
  }
  return out;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;
const typeOf = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeOk = (v: unknown, t: string) => typeOf(v) === t || (t === "number" && typeof v === "number");
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Validate a value against the schema subset; returns "path: problem" strings. */
export function validateSchema(v: unknown, s: unknown, path = "$"): string[] {
  if (!isObj(s)) return [];
  const errs: string[] = [];
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? (s.type as string[]) : [s.type as string];
    if (!types.some((t) => typeOk(v, t))) return [`${path}: expected ${types.join("|")}, got ${typeOf(v)}`];
  }
  if ("const" in s && !sameJson(v, s.const)) errs.push(`${path}: must be ${JSON.stringify(s.const)}`);
  if (Array.isArray(s.enum) && !s.enum.some((e) => sameJson(e, v))) errs.push(`${path}: must be one of ${JSON.stringify(s.enum)}`);
  if (typeof v === "string") {
    if (typeof s.maxLength === "number" && [...v].length > s.maxLength) errs.push(`${path}: longer than ${s.maxLength}`);
    if (typeof s.minLength === "number" && [...v].length < s.minLength) errs.push(`${path}: shorter than ${s.minLength}`);
    if (typeof s.pattern === "string" && !new RegExp(s.pattern, "u").test(v)) errs.push(`${path}: doesn't match ${s.pattern}`);
    if (s.format === "date-time" && (!RFC3339.test(v) || Number.isNaN(Date.parse(v)))) errs.push(`${path}: not an RFC 3339 date-time`);
    if (s.format === "uri" && !isAbsoluteUri(v)) errs.push(`${path}: not an absolute URI`);
  }
  if (typeof v === "number") {
    if (typeof s.minimum === "number" && v < s.minimum) errs.push(`${path}: below ${s.minimum}`);
    if (typeof s.maximum === "number" && v > s.maximum) errs.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (typeof s.maxItems === "number" && v.length > s.maxItems) errs.push(`${path}: more than ${s.maxItems} items`);
    if (typeof s.minItems === "number" && v.length < s.minItems) errs.push(`${path}: fewer than ${s.minItems} items`);
    if (isObj(s.items)) v.forEach((item, i) => errs.push(...validateSchema(item, s.items, `${path}[${i}]`)));
  }
  if (isObj(v)) {
    const props = isObj(s.properties) ? s.properties : {};
    if (Array.isArray(s.required)) for (const k of s.required as string[]) if (!(k in v)) errs.push(`${path}: missing ${k}`);
    for (const [k, val] of Object.entries(v)) {
      if (k in props) errs.push(...validateSchema(val, props[k], `${path}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${path}: unexpected field ${k}`);
    }
  }
  if (Array.isArray(s.allOf)) {
    for (const sub of s.allOf) {
      if (isObj(sub) && isObj(sub.if)) {
        if (validateSchema(v, sub.if, path).length === 0 && isObj(sub.then)) errs.push(...validateSchema(v, sub.then, path));
      } else errs.push(...validateSchema(v, sub, path));
    }
  }
  return errs;
}

function isAbsoluteUri(v: string): boolean {
  try {
    return !!new URL(v).protocol && /^[a-z][a-z0-9+.-]*:/i.test(v);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// URLs, domains and names.

const SECRET_PARAM = /^(x-amz-.*|x-goog-.*|(.*[_-])?(token|secret|password|passwd|pwd|signature|sig|apikey|api_key|key|auth|session|sessionid|sid|bypass|credential|credentials|code))$/i;

/** Why a URL can't be used as evidence or identity (null when it's fine). */
export function unsafeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "malformed URL";
  }
  if (u.protocol !== "https:") return "not https";
  if (u.username || u.password) return "credential-bearing URL (userinfo)";
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || /^\d+(\.\d+){3}$/.test(u.hostname)) return "no public hostname";
  for (const k of u.searchParams.keys()) if (SECRET_PARAM.test(k)) return "credential-bearing URL (query)";
  if (/(access_token|id_token|token=)/i.test(u.hash)) return "credential-bearing URL (fragment)";
  return null;
}

/** Report a URL without leaking a credential it carries. */
export function safeUrlForReport(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const why = unsafeUrl(raw);
  return why && /credential/.test(why) ? `[redacted: ${why}]` : raw;
}

export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const AU_SECOND_LEVEL = /\.(com|net|org|gov|edu|asn|id)\.au$/;
/** The registrable domain: last three labels under an Australian second level, else last two. */
export function registrableDomain(host: string): string {
  const labels = host.split(".");
  return labels.slice(AU_SECOND_LEVEL.test(host) ? -3 : -2).join(".");
}

/** Hosting platforms where the registrable domain is shared by unrelated businesses. */
export const SHARED_PLATFORMS = [
  "wordpress.com", "wixsite.com", "wix.com", "squarespace.com", "weebly.com", "blogspot.com", "business.site",
  "godaddysites.com", "square.site", "webflow.io", "netlify.app", "vercel.app", "github.io", "facebook.com",
  "instagram.com", "linktr.ee", "google.com", "mystrikingly.com", "site123.me", "jimdosite.com", "carrd.co", "yolasite.com",
];
export const isSharedPlatform = (host: string) => SHARED_PLATFORMS.some((p) => host === p || host.endsWith(`.${p}`));
const onDomain = (host: string | null, domain: string | null) => !!host && !!domain && (host === domain || host.endsWith(`.${domain}`));

export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/&/g, " and ")
    .replace(/'/g, "")
    .replace(/\b(pty|ltd|limited|the|co|company|services?|group|australia|aust)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type Lane = "cleaning" | "detailing" | "mixed" | "unknown";
const DETAILING = /\b(car|auto|vehicle|motor|mobile)\s+(detail(ing|ers?)?|wash(ing)?|valet)|\bdetail(ing|ers?)\b|\bcar\s?wash|\bauto\s?care\b/i;
const CLEANING = /\bclean|\bjanitor|\bhygien|\bsanitis|\bsanitiz|\bcarpet|\bwindow|\bpressure\s+wash|\bhouse\s+wash|\bgutter|\bupholster|\bpressure\s+clean/i;
/** Which lane a category (and name) describes; a mix of cleaning and detailing is its own lane. */
export function laneOf(category: string, business = ""): Lane {
  const text = `${category} ${business}`;
  const d = DETAILING.test(text);
  const c = CLEANING.test(text.replace(DETAILING, " "));
  return d && c ? "mixed" : d ? "detailing" : c ? "cleaning" : "unknown";
}

// ---------------------------------------------------------------------------
// Inputs: the request packet and the exclusions snapshot.

export type HandoffRequest = {
  contract_id: string;
  request_id: string;
  exclusions_sha256: string;
  segment: string;
  excluded_segments: string[];
  towns: string[];
  existing_refreshes: { prospect_id: string; business: string; primary_url: string; provisional_offer_fit: string | null }[];
};

const FORBIDDEN_AUTHORITY = ["live_sending", "spending", "publishing", "form_submissions", "production_changes", "database_write_access"];

/** Read the request packet. Throws an adapter error that names what's wrong. */
export function loadHandoffRequest(raw: unknown): HandoffRequest {
  if (!isObj(raw)) throw new Error("request: not a JSON object");
  if (raw.contract_id !== HANDOFF_CONTRACT) throw new Error(`request: contract_id must be ${HANDOFF_CONTRACT}; found ${JSON.stringify(raw.contract_id)}`);
  const request_id = str(raw.request_id);
  if (!request_id) throw new Error("request: request_id missing");
  const exclusions_sha256 = str(raw.exclusions_sha256);
  if (!exclusions_sha256 || !/^[0-9a-f]{64}$/.test(exclusions_sha256)) throw new Error("request: exclusions_sha256 must be 64 lowercase hex characters");
  const authority = isObj(raw.authority) ? raw.authority : {};
  const granted = FORBIDDEN_AUTHORITY.filter((k) => authority[k] !== false);
  if (granted.length) throw new Error(`request: authority must keep ${granted.join(", ")} false; this adapter only runs preparation research`);
  const geography = isObj(raw.geography) ? raw.geography : {};
  const refreshes = Array.isArray(raw.existing_refreshes) ? raw.existing_refreshes : [];
  return {
    contract_id: HANDOFF_CONTRACT,
    request_id,
    exclusions_sha256,
    segment: str(raw.segment) ?? "",
    excluded_segments: Array.isArray(raw.excluded_segments) ? raw.excluded_segments.filter((s): s is string => typeof s === "string") : [],
    towns: Array.isArray(geography.towns) ? geography.towns.filter((s): s is string => typeof s === "string") : [],
    existing_refreshes: refreshes.filter(isObj).map((r) => ({
      prospect_id: String(r.prospect_id ?? ""),
      business: String(r.business ?? ""),
      primary_url: String(r.primary_url ?? ""),
      provisional_offer_fit: str(r.provisional_offer_fit),
    })),
  };
}

export type ExclusionIdentity = {
  prospect_id: string;
  names: string[];
  name_keys: string[];
  domain: string | null;
  segment: string;
  location: string | null;
  state: string | null;
  flags: string[];
  reserved: boolean;
  alias_ids: string[];
  dated_aliases: { source: string; date: string }[];
};
/**
 * A row from an earlier research return (any request). Prior research is not
 * an application identity: it has no OC ID until the owner accepts it, so it
 * is matched by real domain, or name plus locality, and never invents one.
 */
export type PriorResearch = {
  request_id: string;
  candidate_key: string;
  business: string;
  name_key: string;
  domain: string | null;
  locality: string | null;
  disposition: string;
};
export type ExclusionSnapshot = {
  sha256: string;
  bytes: number;
  created_at: string | null;
  identities: ExclusionIdentity[];
  /** The snapshot's previous_research rows (empty when it has none). */
  previous_research: PriorResearch[];
};

/** Reads prior research rows (from a snapshot or from earlier staged returns). */
export function loadPriorResearch(rows: unknown, where = "previous_research"): PriorResearch[] {
  if (rows === undefined || rows === null) return [];
  if (!Array.isArray(rows)) throw new Error(`${where}: must be an array`);
  const seen = new Set<string>();
  return rows.map((r, i): PriorResearch => {
    if (!isObj(r)) throw new Error(`${where}[${i}]: not an object`);
    const request_id = str(r.request_id);
    const candidate_key = str(r.candidate_key);
    const business = str(r.business) ?? str(r.business_name);
    if (!request_id || !candidate_key) throw new Error(`${where}[${i}]: needs request_id and candidate_key`);
    const compound = `${request_id}\u0000${candidate_key}`;
    if (seen.has(compound)) throw new Error(`${where}[${i}]: ${request_id}/${candidate_key} appears twice`);
    seen.add(compound);
    const domain = hostOf(str(r.owned_domain) ?? str(r.website) ?? str(r.primary_url));
    const name_key = business ? normName(business) : "";
    if (!domain && !name_key) throw new Error(`${where}[${i}]: no usable identity (a domain or a name)`);
    return { request_id, candidate_key, business: business ?? "", name_key, domain, locality: str(r.locality), disposition: str(r.disposition) ?? str(r.outcome) ?? "unknown" };
  });
}

const IDENTITY_FLAGS = ["suppressed", "paused", "bounced", "contacted", "research_held", "cowork_reserved", "reserved_cleaner_lane"];

/**
 * Read the raw exclusions snapshot (bytes as delivered) and check it against
 * the hash the request pins. Recognises the identities list, each identity's
 * aliases (including dated sources such as "primary-refresh-2026-10-04"),
 * observed name variants, hold state and reservations.
 */
export function loadExclusionSnapshot(raw: string | Uint8Array, expectedSha256: string): ExclusionSnapshot {
  const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
  const sha = sha256Hex(bytes);
  if (sha !== expectedSha256) throw new Error(`exclusions: SHA-256 ${sha} doesn't match the request's ${expectedSha256}`);
  let doc: unknown;
  try {
    doc = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new Error(`exclusions: not JSON (${(e as Error).message})`);
  }
  if (!isObj(doc)) throw new Error("exclusions: not a JSON object");
  if (doc.contract_id !== EXCLUSIONS_CONTRACT) throw new Error(`exclusions: contract_id must be ${EXCLUSIONS_CONTRACT}; found ${JSON.stringify(doc.contract_id)}`);
  if (!Array.isArray(doc.identities)) throw new Error(`exclusions: expected an identities array; found ${Object.keys(doc).join(", ")}`);
  if (typeof doc.identity_count === "number" && doc.identity_count !== doc.identities.length) {
    throw new Error(`exclusions: identity_count ${doc.identity_count} but ${doc.identities.length} identities`);
  }
  const seenIds = new Set<string>();
  const seenDomains = new Map<string, string>();
  const identities = doc.identities.map((e, i): ExclusionIdentity => {
    if (!isObj(e)) throw new Error(`exclusions.identities[${i}]: not an object`);
    const prospect_id = str(e.prospect_id);
    if (!prospect_id || !/^OC-\d{3}$/.test(prospect_id)) throw new Error(`exclusions.identities[${i}]: prospect_id must look like OC-000`);
    if (seenIds.has(prospect_id)) throw new Error(`exclusions.identities[${i}]: duplicate prospect_id ${prospect_id}`);
    seenIds.add(prospect_id);
    const names = [str(e.business), str(e.identity_name), ...(Array.isArray(e.observed_name_variants) ? e.observed_name_variants.map(str) : [])].filter(
      (n): n is string => !!n
    );
    const domain = hostOf(str(e.owned_domain));
    const name_keys = [...new Set(names.map(normName).filter(Boolean))];
    if (!domain && name_keys.length === 0) throw new Error(`exclusions.identities[${i}]: no usable identity (owned_domain or a name)`);
    if (domain) {
      const twin = seenDomains.get(domain);
      if (twin) throw new Error(`exclusions.identities[${i}]: ${prospect_id} shares owned_domain with ${twin}`);
      seenDomains.set(domain, prospect_id);
    }
    if (e.aliases !== undefined && !Array.isArray(e.aliases)) throw new Error(`exclusions.identities[${i}]: aliases must be an array`);
    const aliases = (Array.isArray(e.aliases) ? e.aliases : []).map((a, j) => {
      if (!isObj(a) || !str(a.source)) throw new Error(`exclusions.identities[${i}].aliases[${j}]: needs a source`);
      return a;
    });
    const alias_ids = [...new Set(aliases.flatMap((a) => [str(a.source_id), str(a.company_id)]).filter((x): x is string => !!x && x !== prospect_id))];
    const dated_aliases = aliases
      .map((a) => ({ source: String(a.source), date: /(\d{4}-\d{2}-\d{2})/.exec(String(a.source))?.[1] ?? "" }))
      .filter((a) => a.date);
    const flags = IDENTITY_FLAGS.filter((f) => e[f] === true);
    const state = str(e.local_snapshot_state);
    return {
      prospect_id,
      names,
      name_keys,
      domain,
      segment: str(e.segment) ?? "",
      location: str(e.location),
      state,
      flags,
      reserved: e.cowork_reserved === true,
      alias_ids,
      dated_aliases,
    };
  });
  // Reservations must agree with the identities they name.
  if (Array.isArray(doc.cowork_reservations)) {
    for (const [i, r] of doc.cowork_reservations.entries()) {
      const id = isObj(r) ? str(r.prospect_id) : null;
      const hit = identities.find((x) => x.prospect_id === id);
      if (!hit) throw new Error(`exclusions.cowork_reservations[${i}]: ${id ?? "entry"} is not in identities`);
      if (!hit.reserved) throw new Error(`exclusions.cowork_reservations[${i}]: ${id} is reserved but its identity isn't marked cowork_reserved`);
    }
  }
  const previous_research = loadPriorResearch(doc.previous_research, "exclusions.previous_research");
  return { sha256: sha, bytes: bytes.length, created_at: str(doc.created_at), identities, previous_research };
}

// ---------------------------------------------------------------------------
// The review.

export type Outcome = "proposed_for_owner_review" | "held" | "excluded" | "rejected";
export type EvidenceView = {
  source_url: string | null;
  source_type: string;
  checked_at: string;
  age_days: number | null;
  limitations: string[];
  excerpt_count: number;
};
export type CandidateReview = {
  candidate_key: string;
  business: string;
  locality: string | null;
  lane: Lane;
  reported_disposition: string;
  outcome: Outcome;
  /** Row-level adapter errors: the row couldn't be read under the contract. */
  row_errors: string[];
  /** Eligibility findings that hold or exclude the row. */
  eligibility: string[];
  /** Value and fit observations for the owner; they don't change the outcome. */
  value: string[];
  identity: { domain: string | null; registrable: string | null; name_key: string };
  matches: { prospect_id: string; by: "domain" | "registrable_domain" | "name" | "alias" }[];
  /** Earlier research rows (other requests) that look like the same business. */
  prior_matches: { request_id: string; candidate_key: string; by: "domain" | "registrable_domain" | "name_locality" | "name_only"; disposition: string }[];
  offer_fit: string | null;
  identity_confidence: string | null;
  fit_confidence: string | null;
  evidence: EvidenceView[];
  /** The researcher's uncertainties and contact restrictions, verbatim. */
  holds: string[];
  duplicate_of: string[];
  contact_basis_status: "not_established";
  sendable: false;
};
export type RefreshReview = {
  prospect_id: string;
  status: string;
  outcome: "evidence_for_review" | "rejected";
  row_errors: string[];
  findings: string[];
  provisional_offer_fit: string | null;
  proposed_offer_fit: string | null;
  evidence: EvidenceView[];
  limitations: string[];
  contact_basis_status: "not_established";
  sendable: false;
};
export type HandoffReport = {
  contract_id: string;
  request_id: string | null;
  exclusions: { sha256: string; identities: number; previous_research: number } | null;
  adapter_errors: string[];
  run: { status: string | null; started_at: string | null; finished_at: string | null; model: string | null } | null;
  candidates: CandidateReview[];
  refreshes: RefreshReview[];
  receipt: { reported: Record<string, number>; findings: string[] } | null;
  summary: Record<Outcome, number> & { rows: number; row_errors: number };
  imported: 0;
  writes: 0;
};

const APPROVAL_KEY = /(approv|consent|authori[sz]|cleared|permission|send_?ok|send_?ready|ready_to_send|whitelist|allowlist)/i;
function approvalKeys(v: unknown, path: string, out: string[]) {
  if (Array.isArray(v)) v.forEach((x, i) => approvalKeys(x, `${path}[${i}]`, out));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) {
    if (APPROVAL_KEY.test(k)) out.push(`${path}.${k}`);
    approvalKeys(x, `${path}.${k}`, out);
  }
}

function evidenceView(e: unknown, now: number): EvidenceView {
  const r = isObj(e) ? e : {};
  const checked = String(r.checked_at ?? "");
  const t = Date.parse(checked);
  return {
    source_url: safeUrlForReport(str(r.source_url)),
    source_type: String(r.source_type ?? ""),
    checked_at: checked,
    age_days: Number.isNaN(t) ? null : Math.floor((now - t) / 86_400_000),
    limitations: Array.isArray(r.limitations) ? r.limitations.map(String) : [],
    excerpt_count: Array.isArray(r.exact_excerpts) ? r.exact_excerpts.length : 0,
  };
}

const PRIMARY_SOURCES = new Set(["primary_business_website"]);
const STRICTER: Record<Outcome, number> = { proposed_for_owner_review: 0, held: 1, excluded: 2, rejected: 3 };
const stricter = (a: Outcome, b: Outcome) => (STRICTER[b] > STRICTER[a] ? b : a);

/** The schema's own constants must name this request, or it's a schema for something else. */
function schemaPins(schema: Obj, request: HandoffRequest): string[] {
  const props = isObj(schema.properties) ? schema.properties : {};
  const pin = (k: string) => (isObj(props[k]) ? (props[k] as Obj).const : undefined);
  const errs: string[] = [];
  if (pin("contract_id") !== HANDOFF_CONTRACT) errs.push(`schema: contract_id const is ${JSON.stringify(pin("contract_id"))}, not ${HANDOFF_CONTRACT}`);
  if (pin("request_id") !== request.request_id) errs.push(`schema: request_id const is ${JSON.stringify(pin("request_id"))}, not the request's ${request.request_id}`);
  if (pin("exclusions_sha256") !== request.exclusions_sha256) errs.push("schema: exclusions_sha256 const doesn't match the request");
  const unsupported = schemaKeywordsSupported(schema);
  if (unsupported.length) errs.push(`schema: uses keywords this adapter doesn't implement: ${unsupported.join(", ")}`);
  return errs;
}

export type HandoffContext = {
  request: HandoffRequest;
  schema: unknown;
  exclusions: ExclusionSnapshot;
  /** Rows from earlier staged returns, reconciled alongside the snapshot's previous_research. */
  prior?: PriorResearch[];
  /** ISO time the review is "as of"; evidence age is measured from here. */
  now: string;
};

/**
 * Review a research return against its request, schema and exclusions.
 * Pure: the same inputs give the same report, and nothing is written.
 */
export function reviewHandoff(output: unknown, ctx: HandoffContext): HandoffReport {
  const { request, exclusions } = ctx;
  const now = Date.parse(ctx.now);
  const summary = { proposed_for_owner_review: 0, held: 0, excluded: 0, rejected: 0, rows: 0, row_errors: 0 };
  const base: HandoffReport = {
    contract_id: HANDOFF_CONTRACT,
    request_id: isObj(output) ? str(output.request_id) : null,
    exclusions: { sha256: exclusions.sha256, identities: exclusions.identities.length, previous_research: exclusions.previous_research.length + (ctx.prior?.length ?? 0) },
    adapter_errors: [],
    run: null,
    candidates: [],
    refreshes: [],
    receipt: null,
    summary,
    imported: 0,
    writes: 0,
  };
  const fail = (errs: string[]) => ({ ...base, adapter_errors: errs });
  if (Number.isNaN(now)) return fail(["review: now must be an ISO date-time"]);
  if (!isObj(output)) return fail(["output: not a JSON object"]);
  if (!isObj(ctx.schema)) return fail(["schema: not a JSON object"]);

  // Contract-level checks first: any failure means no business is judged.
  const errs: string[] = [];
  if (output.contract_id !== HANDOFF_CONTRACT) errs.push(`output: contract_id must be ${HANDOFF_CONTRACT}; found ${JSON.stringify(output.contract_id)}`);
  if (output.request_id !== request.request_id) errs.push(`output: request_id ${JSON.stringify(output.request_id)} isn't this request (${request.request_id})`);
  if (output.exclusions_sha256 !== request.exclusions_sha256) errs.push("output: exclusions_sha256 doesn't match the request");
  if (exclusions.sha256 !== request.exclusions_sha256) errs.push("exclusions: snapshot hash doesn't match the request");
  errs.push(...schemaPins(ctx.schema, request));
  // Schema errors outside candidates/refreshes rows are contract errors.
  const schemaErrs = validateSchema(output, ctx.schema);
  const rowErr = (prefix: string) => schemaErrs.filter((e) => e.startsWith(prefix));
  errs.push(...schemaErrs.filter((e) => !/^\$\.(candidates|existing_refreshes)\[\d+\]/.test(e)));
  const topApproval: string[] = [];
  for (const [k, v] of Object.entries(output)) if (k !== "candidates" && k !== "existing_refreshes") approvalKeys({ [k]: v }, "$", topApproval);
  if (topApproval.length) errs.push(`output: approval-like fields aren't part of this contract: ${topApproval.join(", ")}`);
  if (!Array.isArray(output.candidates)) errs.push("output: candidates must be an array");
  if (errs.length) return fail(errs);

  const run = { status: str(output.status), started_at: str(output.started_at), finished_at: str(output.finished_at), model: str(output.actual_model) };
  const finished = run.finished_at ? Date.parse(run.finished_at) : NaN;
  const rows = output.candidates as unknown[];
  const keyCounts = new Map<string, number>();
  for (const r of rows) if (isObj(r) && typeof r.candidate_key === "string") keyCounts.set(r.candidate_key, (keyCounts.get(r.candidate_key) ?? 0) + 1);

  const reviews: CandidateReview[] = rows.map((raw, i) => {
    const r = isObj(raw) ? raw : {};
    const row_errors = rowErr(`$.candidates[${i}]`).map((e) => e.replace(`$.candidates[${i}]`, "$"));
    const key = typeof r.candidate_key === "string" ? r.candidate_key : `#${i}`;
    if ((keyCounts.get(key) ?? 0) > 1) row_errors.push(`duplicate candidate_key ${key}`);
    const approvals: string[] = [];
    approvalKeys(r, "$", approvals);
    if (approvals.length) row_errors.push(`approval-like fields aren't part of this contract: ${approvals.join(", ")}`);
    if (r.sendable !== false) row_errors.push("sendable must be false");
    if (r.contact_basis_status !== "not_established") row_errors.push("contact_basis_status must stay not_established");
    const urls: [string, unknown][] = [
      ["primary_url", r.primary_url],
      ["contact_page_url", r.contact_page_url],
      ...(Array.isArray(r.evidence) ? r.evidence.map((e, j): [string, unknown] => [`evidence[${j}].source_url`, isObj(e) ? e.source_url : null]) : []),
    ];
    for (const [where, u] of urls) {
      const why = typeof u === "string" ? unsafeUrl(u) : null;
      if (why) row_errors.push(`${where}: ${why}`);
    }

    const business = String(r.business ?? "");
    const category = String(r.category ?? "");
    const lane = laneOf(category, business);
    const reported = String(r.disposition ?? "");
    const ownedRaw = str(r.owned_domain);
    const owned = hostOf(ownedRaw);
    const primaryHost = hostOf(str(r.primary_url));
    const identityHost = owned ?? primaryHost;
    const evidence = (Array.isArray(r.evidence) ? r.evidence : []).map((e) => evidenceView(e, now));
    const holds = [...(Array.isArray(r.uncertainties) ? r.uncertainties : []), ...(Array.isArray(r.contact_restrictions) ? r.contact_restrictions : [])].map(String);
    const eligibility: string[] = [];
    const value: string[] = [];
    let outcome: Outcome =
      reported === "qualified_research" ? "proposed_for_owner_review" : reported === "research_hold" ? "held" : "excluded";
    if (reported === "duplicate_existing") eligibility.push("reported duplicate of an existing identity");
    if (reported === "excluded") eligibility.push("researcher excluded");
    if (reported === "research_hold") eligibility.push("researcher hold");

    // Lane: the request is one segment; detailing and mixed rows never pass.
    if (request.segment === "cleaning") {
      if (lane === "detailing") (eligibility.push("wrong lane: detailing is an excluded segment"), (outcome = stricter(outcome, "excluded")));
      else if (lane === "mixed") (eligibility.push("ambiguous mixed cleaning/detailing is an excluded segment"), (outcome = stricter(outcome, "excluded")));
      else if (lane === "unknown") (eligibility.push("lane not established from the category"), (outcome = stricter(outcome, "held")));
    }
    // Domain identity.
    if (ownedRaw && ownedRaw.toLowerCase().replace(/^www\./, "") !== owned) eligibility.push("owned_domain isn't a bare hostname");
    if (identityHost && isSharedPlatform(identityHost)) {
      eligibility.push("domain is on a shared hosting platform: identity is ambiguous");
      outcome = stricter(outcome, "held");
    } else if (identityHost && identityHost !== registrableDomain(identityHost) && !owned) {
      eligibility.push("site is a subdomain of a shared parent domain: ownership not established");
      outcome = stricter(outcome, "held");
    }
    if (owned && primaryHost && !onDomain(primaryHost, owned)) {
      eligibility.push("primary_url is not on the owned domain");
      outcome = stricter(outcome, "held");
    }
    // Evidence must be about this business.
    const rawEvidence = Array.isArray(r.evidence) ? (r.evidence as unknown[]).map((e) => (isObj(e) ? e : {})) : [];
    const ownEvidence = rawEvidence.filter((e) => PRIMARY_SOURCES.has(String(e.source_type)) && onDomain(hostOf(str(e.source_url)), owned));
    rawEvidence.forEach((ev, j) => {
      const h = hostOf(str(ev.source_url));
      if (PRIMARY_SOURCES.has(String(ev.source_type)) && owned && h && !onDomain(h, owned)) {
        eligibility.push(`evidence[${j}] is labelled primary but comes from another business's site (${h})`);
        outcome = stricter(outcome, "held");
      }
      const t = Date.parse(String(ev.checked_at ?? ""));
      if (!Number.isNaN(t) && (t > now || (!Number.isNaN(finished) && t > finished))) {
        eligibility.push(`evidence[${j}] is dated after the run finished`);
        outcome = stricter(outcome, "held");
      }
    });
    if (outcome === "proposed_for_owner_review" && ownEvidence.length === 0) {
      eligibility.push("no primary evidence from the owned domain");
      outcome = "held";
    }
    // Existing identities.
    const name_key = normName(business);
    const matches: CandidateReview["matches"] = [];
    for (const x of exclusions.identities) {
      const by =
        identityHost && x.domain && identityHost === x.domain
          ? "domain"
          : identityHost && x.domain && !isSharedPlatform(identityHost) && registrableDomain(identityHost) === registrableDomain(x.domain)
            ? "registrable_domain"
            : name_key && x.name_keys.includes(name_key)
              ? "name"
              : null;
      if (by) matches.push({ prospect_id: x.prospect_id, by });
    }
    const duplicate_of = Array.isArray(r.duplicate_of) ? r.duplicate_of.map(String) : [];
    for (const id of duplicate_of) {
      const x = exclusions.identities.find((y) => y.prospect_id === id || y.alias_ids.includes(id));
      if (!x) eligibility.push(`duplicate_of ${id} is not in the exclusions snapshot`);
      else if (!matches.some((m) => m.prospect_id === x.prospect_id)) matches.push({ prospect_id: x.prospect_id, by: "alias" });
    }
    // Earlier research (legacy snapshot rows and earlier staged returns). The
    // same request's own rows are a repeated return, handled by versioning.
    const prior_matches: CandidateReview["prior_matches"] = [];
    const sameLocality = (a: string | null, b: string | null) => !!a && !!b && normName(a) === normName(b);
    for (const pr of [...exclusions.previous_research, ...(ctx.prior ?? [])]) {
      if (pr.request_id === request.request_id) continue;
      if (prior_matches.some((m) => m.request_id === pr.request_id && m.candidate_key === pr.candidate_key)) continue;
      const by =
        identityHost && pr.domain && identityHost === pr.domain
          ? "domain"
          : identityHost && pr.domain && !isSharedPlatform(identityHost) && registrableDomain(identityHost) === registrableDomain(pr.domain)
            ? "registrable_domain"
            : name_key && pr.name_key === name_key
              ? sameLocality(str(r.locality), pr.locality)
                ? "name_locality"
                : "name_only"
              : null;
      if (by) prior_matches.push({ request_id: pr.request_id, candidate_key: pr.candidate_key, by, disposition: pr.disposition });
    }
    for (const m of prior_matches) {
      const where = `${m.request_id}/${m.candidate_key}`;
      if ((m.by === "domain" || m.by === "registrable_domain") && /exclu/i.test(m.disposition)) {
        eligibility.push(`excluded in earlier research ${where} (${m.by})`);
        outcome = stricter(outcome, "excluded");
      } else if (m.by === "name_only") {
        eligibility.push(`same name as earlier research ${where} in another locality: identity ambiguous, reconcile before use`);
        outcome = stricter(outcome, "held");
      } else {
        eligibility.push(`already researched as ${where} (${m.by}, ${m.disposition}): reconcile, don't re-propose`);
        outcome = stricter(outcome, "held");
      }
    }
    for (const m of matches) {
      if (m.by === "name") {
        eligibility.push(`same name as existing identity ${m.prospect_id}: reconcile before use`);
        outcome = stricter(outcome, "held");
      } else {
        eligibility.push(`existing identity ${m.prospect_id} (${m.by})`);
        outcome = stricter(outcome, "excluded");
      }
    }
    // Value observations, for the owner; they don't move the outcome.
    if (r.offer_fit === "no_clear_fit") value.push("no clear offer fit");
    if (r.fit_confidence === "low" || r.fit_confidence === "unknown") value.push(`fit confidence ${r.fit_confidence}`);
    if (r.identity_confidence === "low" || r.identity_confidence === "unknown") value.push(`identity confidence ${r.identity_confidence}`);
    const loc = str(r.locality);
    if (loc && request.towns.length && !request.towns.some((t) => new RegExp(`\\b${t}\\b`, "i").test(loc))) value.push("locality outside the request's start towns");
    if (row_errors.length) outcome = "rejected";
    return {
      candidate_key: key,
      business,
      locality: loc,
      lane,
      reported_disposition: reported,
      outcome,
      row_errors,
      eligibility,
      value,
      identity: { domain: identityHost, registrable: identityHost ? registrableDomain(identityHost) : null, name_key },
      matches,
      prior_matches,
      offer_fit: str(r.offer_fit),
      identity_confidence: str(r.identity_confidence),
      fit_confidence: str(r.fit_confidence),
      evidence,
      holds,
      duplicate_of,
      contact_basis_status: "not_established",
      sendable: false,
    };
  });

  // In-batch identity: the same site twice, or the same name on different sites.
  reviews.forEach((a, i) => {
    if (a.outcome === "rejected") return;
    for (let j = 0; j < i; j++) {
      const b = reviews[j];
      if (b.outcome === "rejected") continue;
      const da = a.identity.domain;
      const db = b.identity.domain;
      const sameSite = !!da && !!db && (da === db || (!isSharedPlatform(da) && a.identity.registrable === b.identity.registrable));
      if (sameSite) {
        a.eligibility.push(`same site as ${b.candidate_key}`);
        a.outcome = stricter(a.outcome, "held");
        if (da !== db) {
          b.eligibility.push(`shares a parent domain with ${a.candidate_key}`);
          b.outcome = stricter(b.outcome, "held");
        }
      } else if (a.identity.name_key && a.identity.name_key === b.identity.name_key) {
        a.eligibility.push(`same name as ${b.candidate_key}: reconcile identities`);
        b.eligibility.push(`same name as ${a.candidate_key}: reconcile identities`);
        a.outcome = stricter(a.outcome, "held");
        b.outcome = stricter(b.outcome, "held");
      }
    }
  });

  // Refreshes of identities the request named.
  const refreshRows = Array.isArray(output.existing_refreshes) ? (output.existing_refreshes as unknown[]) : [];
  const refreshes: RefreshReview[] = refreshRows.map((raw, i) => {
    const r = isObj(raw) ? raw : {};
    const row_errors = rowErr(`$.existing_refreshes[${i}]`).map((e) => e.replace(`$.existing_refreshes[${i}]`, "$"));
    const approvals: string[] = [];
    approvalKeys(r, "$", approvals);
    if (approvals.length) row_errors.push(`approval-like fields aren't part of this contract: ${approvals.join(", ")}`);
    const pid = String(r.prospect_id ?? "");
    const asked = request.existing_refreshes.find((x) => x.prospect_id === pid);
    const ident = exclusions.identities.find((x) => x.prospect_id === pid);
    const findings: string[] = [];
    if (!asked) row_errors.push(`${pid || "row"} wasn't requested for refresh`);
    if (!ident) row_errors.push(`${pid || "row"} isn't in the exclusions snapshot`);
    const host = hostOf(str(r.primary_url));
    if (ident && ident.domain && host && !onDomain(host, ident.domain)) row_errors.push(`primary_url (${host}) isn't the identity's domain`);
    if (ident && !ident.name_keys.includes(normName(String(r.business ?? "")))) findings.push("business name differs from the identity's known names");
    (Array.isArray(r.evidence) ? (r.evidence as unknown[]) : []).forEach((e, j) => {
      const ev = isObj(e) ? e : {};
      const why = unsafeUrl(str(ev.source_url));
      if (why) row_errors.push(`evidence[${j}].source_url: ${why}`);
      const h = hostOf(str(ev.source_url));
      if (PRIMARY_SOURCES.has(String(ev.source_type)) && ident?.domain && h && !onDomain(h, ident.domain)) {
        row_errors.push(`evidence[${j}] is labelled primary but comes from another site (${h})`);
      }
    });
    if (asked?.provisional_offer_fit && r.proposed_offer_fit && asked.provisional_offer_fit !== r.proposed_offer_fit) findings.push("proposed offer fit differs from the provisional one");
    return {
      prospect_id: pid,
      status: String(r.status ?? ""),
      outcome: row_errors.length ? "rejected" : "evidence_for_review",
      row_errors,
      findings,
      provisional_offer_fit: asked?.provisional_offer_fit ?? null,
      proposed_offer_fit: str(r.proposed_offer_fit),
      evidence: (Array.isArray(r.evidence) ? r.evidence : []).map((e) => evidenceView(e, now)),
      limitations: Array.isArray(r.limitations) ? r.limitations.map(String) : [],
      contact_basis_status: "not_established",
      sendable: false,
    };
  });
  for (const asked of request.existing_refreshes) {
    if (!refreshes.some((x) => x.prospect_id === asked.prospect_id)) {
      refreshes.push({
        prospect_id: asked.prospect_id,
        status: "missing",
        outcome: "rejected",
        row_errors: ["requested refresh not returned"],
        findings: [],
        provisional_offer_fit: asked.provisional_offer_fit,
        proposed_offer_fit: null,
        evidence: [],
        limitations: [],
        contact_basis_status: "not_established",
        sendable: false,
      });
    }
  }

  // The receipt must agree with the rows it describes.
  const rec = isObj(output.receipt) ? output.receipt : {};
  const count = (d: string) => rows.filter((x) => isObj(x) && x.disposition === d).length;
  const reported: Record<string, number> = {};
  for (const k of ["fresh_qualified_count", "fresh_held_count", "duplicate_count", "excluded_count", "fresh_candidates_inspected", "primary_page_inspections", "outbound_sends", "form_submissions", "purchases", "paid_api_activations"]) {
    if (typeof rec[k] === "number") reported[k] = rec[k] as number;
  }
  const receiptFindings: string[] = [];
  const pairs: [string, string][] = [
    ["fresh_qualified_count", "qualified_research"],
    ["fresh_held_count", "research_hold"],
    ["duplicate_count", "duplicate_existing"],
    ["excluded_count", "excluded"],
  ];
  for (const [k, d] of pairs) if (reported[k] !== count(d)) receiptFindings.push(`${k} ${reported[k]} but ${count(d)} rows are ${d}`);
  for (const k of ["outbound_sends", "form_submissions", "purchases", "paid_api_activations"]) if (reported[k] !== 0) receiptFindings.push(`${k} must be 0`);

  for (const c of reviews) summary[c.outcome]++;
  summary.rows = reviews.length;
  summary.row_errors = reviews.filter((c) => c.row_errors.length).length + refreshes.filter((x) => x.row_errors.length).length;
  return { ...base, run, candidates: reviews, refreshes, receipt: { reported, findings: receiptFindings }, summary };
}

/** A stable digest of a report, for "same result on repeat" checks. */
export function reportDigest(report: HandoffReport): string {
  return sha256Hex(JSON.stringify(report));
}

export type { Json };
