// lib/digital-services/research.ts
// Dry-run validation for prospect research produced by a model (for example
// GLM's "ten fresh cleaners" JSON). Model output is context, not permission:
// nothing here imports, reserves, drafts or contacts anyone. It checks each
// candidate against the documented shape, reconciles identities against
// companies we already hold (by canonical domain, ABN, phone, then name +
// locality) and inside the batch, and keeps lanes separate (a detailer is
// never accepted into the cleaners batch). The report says what a person
// should review before anything goes through the engine's own import.
// Shape: docs/digital-services/RESEARCH-IMPORT.md.

export const RESEARCH_LANES = ["cleaning", "detailing"] as const;
export type ResearchLane = (typeof RESEARCH_LANES)[number];

export type Evidence = { claim: string; url: string; observed_on: string };
export type Candidate = {
  business_name: string;
  category: ResearchLane;
  website: string | null;
  locality: string;
  state: string;
  abn: string | null;
  phone: string | null;
  public_email: string | null;
  evidence: Evidence[];
};
export type KnownCompany = { id: string; business_name: string; website?: string | null; abn?: string | null; phone?: string | null; locality?: string | null; lane?: string | null };

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

export function canonicalDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(pty|ltd|limited|the|co|company|services?|group|australia|aust)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("61")) d = `0${d.slice(2)}`;
  return d.length >= 8 && d.length <= 10 ? d : null;
}

const abnDigits = (raw: string | null | undefined) => {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length === 11 ? d : null;
};

/** The ATO ABN checksum: subtract 1 from the first digit, weight, sum, mod 89. */
export function validAbn(raw: string): boolean {
  const d = abnDigits(raw);
  if (!d) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = d.split("").reduce((s, c, i) => s + (Number(c) - (i === 0 ? 1 : 0)) * w[i], 0);
  return sum % 89 === 0;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** A parsed https URL with a real hostname (a dot, no spaces), or null. */
export function httpsUrl(raw: string | null): URL | null {
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) ? u : null;
  } catch {
    return null;
  }
}

export function validateCandidate(raw: unknown, today: string): { candidate: Candidate | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { candidate: null, errors: ["not an object"] };
  const r = raw as Record<string, unknown>;
  const business_name = str(r.business_name);
  if (!business_name || business_name.length > 160) errors.push("business_name missing or too long");
  const category = str(r.category);
  if (!category || !(RESEARCH_LANES as readonly string[]).includes(category)) errors.push("category must be cleaning or detailing");
  const website = str(r.website);
  if (website && !httpsUrl(website)) errors.push("website must be an https URL with a hostname");
  const locality = str(r.locality);
  const state = str(r.state)?.toUpperCase() ?? null;
  if (!locality) errors.push("locality missing");
  if (!state || !STATES.includes(state)) errors.push("state must be an Australian state or territory");
  const abn = str(r.abn);
  if (abn && !validAbn(abn)) errors.push("abn fails the checksum");
  const phone = str(r.phone);
  if (phone && !phoneDigits(phone)) errors.push("phone isn't an Australian number");
  const public_email = str(r.public_email);
  if (public_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(public_email)) errors.push("public_email malformed");
  const evidence: Evidence[] = [];
  if (!Array.isArray(r.evidence) || r.evidence.length === 0) errors.push("evidence: at least one public source is required");
  else {
    for (const [i, e] of (r.evidence as unknown[]).entries()) {
      const ev = (e ?? {}) as Record<string, unknown>;
      const claim = str(ev.claim);
      const url = str(ev.url);
      const observed_on = str(ev.observed_on);
      if (!claim || !httpsUrl(url)) errors.push(`evidence[${i}]: claim and an https url with a hostname are required`);
      else if (!observed_on || !/^\d{4}-\d{2}-\d{2}$/.test(observed_on) || observed_on > today) errors.push(`evidence[${i}]: observed_on must be a past date`);
      else evidence.push({ claim, url: url!, observed_on });
    }
  }
  const domain = canonicalDomain(website);
  // The contact address must be one the business publishes itself.
  if (public_email && !evidence.some((e) => e.claim.toLowerCase().includes(public_email.toLowerCase()))) {
    errors.push("public_email has no evidence entry showing where the business publishes it");
  }
  if (domain && !evidence.some((e) => canonicalDomain(e.url) === domain)) errors.push("no evidence from the business's own website");
  if (errors.length) return { candidate: null, errors };
  return {
    candidate: { business_name: business_name!, category: category as ResearchLane, website, locality: locality!, state: state!, abn, phone, public_email, evidence },
    errors,
  };
}

export type Verdict =
  | { index: number; status: "invalid"; errors: string[] }
  | { index: number; status: "wrong_lane"; business_name: string; category: ResearchLane }
  | { index: number; status: "matches_existing"; business_name: string; existing_id: string; by: "domain" | "abn" | "phone" | "name_locality" }
  | { index: number; status: "duplicate_in_batch"; business_name: string; same_as: number; by: "domain" | "abn" | "phone" | "name_locality" }
  | { index: number; status: "new_for_review"; business_name: string; domain: string | null };

function keys(c: { business_name: string; website?: string | null; abn?: string | null; phone?: string | null; locality?: string | null }) {
  return {
    domain: canonicalDomain(c.website ?? null),
    abn: abnDigits(c.abn),
    phone: phoneDigits(c.phone ?? null),
    name_locality: c.locality ? `${normName(c.business_name)}|${c.locality.trim().toLowerCase()}` : null,
  };
}

/**
 * Validate a research batch for one lane and reconcile it. Nothing is
 * imported: "new_for_review" means a person still checks the evidence and the
 * engine's own import decides.
 */
export function reviewResearchBatch(input: unknown, lane: ResearchLane, known: KnownCompany[], today: string): { verdicts: Verdict[]; summary: Record<Verdict["status"], number> } {
  const list = Array.isArray(input) ? input : Array.isArray((input as { candidates?: unknown })?.candidates) ? (input as { candidates: unknown[] }).candidates : null;
  const verdicts: Verdict[] = [];
  if (!list) {
    verdicts.push({ index: -1, status: "invalid", errors: ["expected an array of candidates or { candidates: [...] }"] });
  } else {
    const knownKeys = known.map((k) => ({ id: k.id, ...keys(k) }));
    const seen: { index: number; k: ReturnType<typeof keys> }[] = [];
    list.forEach((raw, index) => {
      const { candidate, errors } = validateCandidate(raw, today);
      if (!candidate) return verdicts.push({ index, status: "invalid", errors });
      if (candidate.category !== lane) return verdicts.push({ index, status: "wrong_lane", business_name: candidate.business_name, category: candidate.category });
      const k = keys(candidate);
      const order = ["domain", "abn", "phone", "name_locality"] as const;
      for (const by of order) {
        const hit = k[by] && knownKeys.find((x) => x[by] === k[by]);
        if (hit) return verdicts.push({ index, status: "matches_existing", business_name: candidate.business_name, existing_id: hit.id, by });
      }
      for (const by of order) {
        const twin = k[by] && seen.find((s) => s.k[by] === k[by]);
        if (twin) return verdicts.push({ index, status: "duplicate_in_batch", business_name: candidate.business_name, same_as: twin.index, by });
      }
      seen.push({ index, k });
      verdicts.push({ index, status: "new_for_review", business_name: candidate.business_name, domain: k.domain });
    });
  }
  const summary = { invalid: 0, wrong_lane: 0, matches_existing: 0, duplicate_in_batch: 0, new_for_review: 0 };
  for (const v of verdicts) summary[v.status]++;
  return { verdicts, summary };
}
