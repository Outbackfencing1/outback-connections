// scraper/abn.ts
// Australian Business Number (ABN) modulus-89 checksum validation and optional ABR lookup.
// Strictly distinguishes "unchecked_no_abn", "unchecked_no_guid", "invalid_checksum",
// "no_confident_match", "api_error", "confirmed_active", and "confirmed_cancelled".
// Never treats API errors or missing credentials as business closure.

import type { AbnCheckResult } from "./types.ts";
import type { SupplierArtifactBlocklist } from "./config.ts";

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

/** Extract 11-digit ABN from raw text if present, excluding supplier ABNs. */
export function extractAbnDigits(
  rawText: string | null | undefined,
  supplierBlocklist?: SupplierArtifactBlocklist
): string | null {
  if (!rawText) return null;
  const match = rawText.match(/\bABN\s*:?\s*(\d{2}\s*\d{3}\s*\d{3}\s*\d{3}|\d{11})\b/i);
  const candidate = match
    ? match[1].replace(/\D/g, "")
    : /^\s*\d{2}\s*\d{3}\s*\d{3}\s*\d{3}\s*$/.test(rawText)
      ? rawText.replace(/\D/g, "")
      : null;

  if (!candidate || candidate.length !== 11) return null;
  if (supplierBlocklist?.supplierAbnsDigits.includes(candidate)) return null;
  return candidate;
}

/** Validate 11-digit ABN using the official ATO modulus-89 algorithm. */
export function isValidAbnChecksum(abnInput: string | null | undefined): boolean {
  if (!abnInput) return false;
  const digits = abnInput.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  if (digits[0] === "0") return false;

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number.parseInt(digits[i], 10);
    const adjusted = i === 0 ? d - 1 : d;
    sum += adjusted * ABN_WEIGHTS[i];
  }
  return sum % 89 === 0;
}

export function formatAbn11(abnInput: string | null | undefined): string | null {
  if (!abnInput) return null;
  const digits = abnInput.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits)) return null;
  return digits;
}

/**
 * Check ABN status.
 * - If no ABN is published on the candidate, returns status = "unchecked_no_abn" (unless ABN_LOOKUP_GUID is provided and name lookup is requested, though name lookup is never auto-trusted without corroboration).
 * - If ABN is published, validates checksum first.
 * - If ABN_LOOKUP_GUID is absent, returns status = "unchecked_no_guid" with checksum validation result.
 * - If ABN_LOOKUP_GUID is present, queries ABR JSON endpoint with bounded timeout; on network/API failure returns status = "api_error" (never marking business closed).
 */
export async function verifyCandidateAbn(params: {
  publishedAbn: string | null;
  businessName: string;
  guid?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AbnCheckResult> {
  const raw = params.publishedAbn?.trim() || null;
  const guid = (params.guid ?? process.env.ABN_LOOKUP_GUID ?? "").trim();
  const fetchFn = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 8000;

  if (!raw) {
    return {
      status: guid ? "no_confident_match" : "unchecked_no_abn",
      abn_raw: null,
      abn_normalised: null,
      checksum_valid: null,
      entity_name: null,
      entity_status: null,
      entity_state: null,
      entity_postcode: null,
      checked_at: null,
      notes: guid
        ? "No published ABN on source; name-only ABR lookup is not auto-assigned without corroborating state/postcode/trading name."
        : "No published ABN on source and ABN_LOOKUP_GUID is not configured.",
    };
  }

  const digits = formatAbn11(raw);
  const validChecksum = isValidAbnChecksum(raw);

  if (!digits || !validChecksum) {
    return {
      status: "invalid_checksum",
      abn_raw: raw,
      abn_normalised: digits,
      checksum_valid: false,
      entity_name: null,
      entity_status: null,
      entity_state: null,
      entity_postcode: null,
      checked_at: new Date().toISOString(),
      notes: `Published ABN "${raw}" failed 11-digit ATO modulus-89 checksum validation.`,
    };
  }

  if (!guid) {
    return {
      status: "unchecked_no_guid",
      abn_raw: raw,
      abn_normalised: digits,
      checksum_valid: true,
      entity_name: null,
      entity_status: null,
      entity_state: null,
      entity_postcode: null,
      checked_at: new Date().toISOString(),
      notes:
        "Published ABN passed ATO modulus-89 checksum validation; live ABR entity status unchecked because ABN_LOOKUP_GUID is not set in environment.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(
      digits
    )}&callback=cb&guid=${encodeURIComponent(guid)}`;
    const res = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: "application/json, text/javascript" },
    });
    if (!res.ok) {
      return {
        status: "api_error",
        abn_raw: raw,
        abn_normalised: digits,
        checksum_valid: true,
        entity_name: null,
        entity_status: null,
        entity_state: null,
        entity_postcode: null,
        checked_at: new Date().toISOString(),
        notes: `ABR lookup returned HTTP ${res.status}; business is not marked closed on API failure.`,
      };
    }
    const text = await res.text();
    const jsonMatch = text.match(/^cb\(([\s\S]*)\)\s*;?\s*$/);
    if (!jsonMatch) {
      return {
        status: "api_error",
        abn_raw: raw,
        abn_normalised: digits,
        checksum_valid: true,
        entity_name: null,
        entity_status: null,
        entity_state: null,
        entity_postcode: null,
        checked_at: new Date().toISOString(),
        notes: "ABR lookup returned unexpected payload format; business is not marked closed.",
      };
    }
    const payload = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    if (payload.Message && String(payload.Message).trim().length > 0) {
      return {
        status: "api_error",
        abn_raw: raw,
        abn_normalised: digits,
        checksum_valid: true,
        entity_name: null,
        entity_status: null,
        entity_state: null,
        entity_postcode: null,
        checked_at: new Date().toISOString(),
        notes: `ABR message: ${String(payload.Message)}`,
      };
    }

    const entityStatus = String(payload.AbnStatus ?? "").trim();
    const entityName = String(payload.EntityName ?? "").trim() || null;
    const entityState = String(payload.AddressState ?? "").trim() || null;
    const entityPostcode = String(payload.AddressPostcode ?? "").trim() || null;

    if (/cancelled/i.test(entityStatus)) {
      return {
        status: "confirmed_cancelled",
        abn_raw: raw,
        abn_normalised: digits,
        checksum_valid: true,
        entity_name: entityName,
        entity_status: entityStatus,
        entity_state: entityState,
        entity_postcode: entityPostcode,
        checked_at: new Date().toISOString(),
        notes: `ABR reports ABN ${digits} (${entityName ?? "unknown entity"}) as Cancelled; route candidate to review rather than auto-closing.`,
      };
    }

    if (/active/i.test(entityStatus)) {
      return {
        status: "confirmed_active",
        abn_raw: raw,
        abn_normalised: digits,
        checksum_valid: true,
        entity_name: entityName,
        entity_status: entityStatus,
        entity_state: entityState,
        entity_postcode: entityPostcode,
        checked_at: new Date().toISOString(),
        notes: `ABR confirmed ABN ${digits} active (${entityName ?? "entity"}).`,
      };
    }

    return {
      status: "no_confident_match",
      abn_raw: raw,
      abn_normalised: digits,
      checksum_valid: true,
      entity_name: entityName,
      entity_status: entityStatus || null,
      entity_state: entityState,
      entity_postcode: entityPostcode,
      checked_at: new Date().toISOString(),
      notes: "ABR returned no active or cancelled status for this ABN.",
    };
  } catch (err) {
    return {
      status: "api_error",
      abn_raw: raw,
      abn_normalised: digits,
      checksum_valid: true,
      entity_name: null,
      entity_status: null,
      entity_state: null,
      entity_postcode: null,
      checked_at: new Date().toISOString(),
      notes: `ABR request failed (${err instanceof Error ? err.message : String(err)}); API error is never treated as business closure.`,
    };
  } finally {
    clearTimeout(timer);
  }
}
