// lib/abr.ts — ABR ABN Lookup client. SERVER-ONLY.
// Validates an ABN against the Australian Business Register's free JSON web
// service. The GUID comes from ABR_GUID (register at abr.business.gov.au —
// "Web services" / "ABN Lookup"). GUID-ready: if ABR_GUID is unset, returns
// { ok:false, reason:"no_guid" } so nothing breaks.
//
// ⚠️ UNTESTED against the live ABR — no GUID in this environment. The field
// mapping follows the documented AbnDetails.aspx JSON shape; verify the exact
// field names + JSONP wrapper against a real response before relying on it.
import "server-only";

const ABR_ENDPOINT = "https://abr.business.gov.au/json/AbnDetails.aspx";

export type AbrResult =
  | {
      ok: true;
      abn: string;
      isActive: boolean;
      abnStatus: string;
      entityName: string | null;
      gst: boolean | null;
    }
  | { ok: false; reason: string };

// AbnDetails.aspx usually responds as JSONP: `callback({...})`. Extract the
// JSON object regardless of whether the wrapper is present.
export function parseAbrJsonp(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Interpret a parsed ABR payload into our normalised result. Exported so the
// parse/interpret logic is unit-testable without a network call.
export function interpretAbr(abn: string, json: Record<string, unknown>): AbrResult {
  if (json.Message && String(json.Message).trim() !== "") {
    return { ok: false, reason: String(json.Message) };
  }
  const abnStatus = String(json.AbnStatus ?? json.EntityStatusCode ?? "").trim();
  const isActive = /active/i.test(abnStatus);
  const businessNames = Array.isArray(json.BusinessName) ? (json.BusinessName as unknown[]) : [];
  const entityName =
    (json.EntityName as string) ||
    (businessNames[0] as string) ||
    null;
  const gst =
    typeof json.Gst === "string" ? String(json.Gst).trim().length > 0 : null;
  return { ok: true, abn, isActive, abnStatus, entityName, gst };
}

export async function lookupAbn(abnRaw: string): Promise<AbrResult> {
  const guid = process.env.ABR_GUID;
  if (!guid) return { ok: false, reason: "no_guid" };
  const abn = (abnRaw || "").replace(/\s/g, "");
  if (!/^\d{11}$/.test(abn)) return { ok: false, reason: "bad_abn" };
  try {
    const res = await fetch(`${ABR_ENDPOINT}?abn=${abn}&guid=${encodeURIComponent(guid)}`);
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const json = parseAbrJsonp(await res.text());
    if (!json) return { ok: false, reason: "parse_error" };
    return interpretAbr(abn, json);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "fetch_error" };
  }
}
