// lib/digital-services/intake.ts
// Public enquiry intake for the digital-services page. Order of operations:
//   1. validate (strict, length-capped) and drop honeypot hits silently;
//   2. a retried submit with the same idempotency key returns the saved row;
//   3. per-IP rate limit (counted from saved rows; fails open on a count error
//      so a real customer isn't blocked by our bookkeeping);
//   4. save the row;
//   5. THEN notify the owner. The alert carries a reference and a link only,
//      never the customer's details. A failed alert is recorded on the row
//      and the customer still gets their reference: the lead is never lost.
// Dependencies are injected so the whole flow is unit-tested without a
// database or mail provider.
import { INTERESTS, type Interest } from "./offer";

export type IntakeInput = {
  idempotency_key: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  interest: string;
  message: string;
  consent: boolean;
  honeypot: string;
};

export type CleanEnquiry = {
  idempotency_key: string;
  business_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  interest: Interest;
  message: string;
};

export type Validation =
  | { ok: true; honeypot: false; value: CleanEnquiry }
  | { ok: true; honeypot: true }
  | { ok: false; errors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Collapse whitespace and strip control characters; keep Unicode letters,
// apostrophes and accents (O'Brien, Đặng, Müller).
const clean = (v: string) => v.normalize("NFC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
const cleanMultiline = (v: string) =>
  v.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export function validateIntake(input: IntakeInput): Validation {
  if (input.honeypot.trim() !== "") return { ok: true, honeypot: true };
  const errors: Record<string, string> = {};
  const business_name = clean(input.business_name);
  const contact_name = clean(input.contact_name);
  const email = clean(input.email).toLowerCase();
  const phone = clean(input.phone);
  let website = clean(input.website);
  const message = cleanMultiline(input.message);
  const interest = input.interest as Interest;

  if (!UUID.test(input.idempotency_key)) errors._ = "Please reload the page and try again.";
  if (business_name.length < 2 || business_name.length > 120) errors.business_name = "Business name: 2 to 120 characters.";
  if (contact_name.length < 2 || contact_name.length > 80) errors.contact_name = "Your name: 2 to 80 characters.";
  if (!EMAIL.test(email) || email.length > 254) errors.email = "That email doesn't look right.";
  if (phone && !/^[0-9 ()+-]{6,30}$/.test(phone)) errors.phone = "Phone: digits, spaces and brackets only.";
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!u.hostname.includes(".") || website.length > 300) throw new Error("bad");
    } catch {
      errors.website = "That website address doesn't look right.";
    }
  }
  if (!INTERESTS.some((i) => i.value === interest)) errors.interest = "Pick what you're interested in.";
  if (message.length < 10 || message.length > 2000) errors.message = "Tell us a little about the business (10 to 2,000 characters).";
  if (!input.consent) errors.consent = "Please tick the box so we can reply to you.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    honeypot: false,
    value: {
      idempotency_key: input.idempotency_key.toLowerCase(),
      business_name,
      contact_name,
      email,
      phone: phone || null,
      website: website || null,
      interest,
      message,
    },
  };
}

/** "DSE-1A2B3C4D": a short reference derived from the row id. */
export function referenceFor(id: string): string {
  return `DSE-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export type IntakeResult =
  | { ok: true; reference: string; duplicate: boolean; notified: boolean }
  | { ok: false; errors: Record<string, string> };

type DbError = { code?: string; message: string } | null;
type Row = { id: string };
type KeyedRow = Row & { notified_at?: string | null };

/** The few database operations intake needs (service role). */
export type IntakeStore = {
  findByKey(key: string): Promise<{ data: KeyedRow | null; error: DbError }>;
  countRecentByIp(ip: string, sinceIso: string): Promise<{ count: number | null; error: DbError }>;
  insert(row: Record<string, unknown>): Promise<{ data: Row | null; error: DbError }>;
  markNotified(id: string, patch: { notified_at: string | null; notify_error: string | null }): Promise<{ error: DbError }>;
};

export type IntakeDeps = {
  store: IntakeStore | null;
  notifyOwner(reference: string): Promise<{ ok: boolean; error?: string }>;
  now(): Date;
  meta: { ip: string | null; ua: string | null; host: string | null };
  /** Server-side log for failures that must not reach the customer. */
  log?: (message: string) => void;
};

export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const RATE_MAX = 5;
/** SQLSTATE raised by the digital_services_enquiries rate-limit trigger. */
export const RATE_LIMITED_CODE = "OC429";
const RATE_LIMITED =
  "That's a few enquiries in a short time. Try again in an hour, or email help@outbackconnections.com.au.";
const NOT_READY =
  "Enquiries aren't open yet. Please email help@outbackconnections.com.au and we'll get back to you.";

// Table missing (PostgREST / Postgres codes): a readiness failure the user
// can see, not a silent drop.
const isMissingTable = (e: DbError) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST204");

async function recordAlert(
  store: IntakeStore,
  id: string,
  patch: { notified_at: string | null; notify_error: string | null }
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await store.markNotified(id, patch);
      if (!error) return true;
    } catch {
      // fall through to retry
    }
  }
  return false;
}

export async function processIntake(input: IntakeInput, deps: IntakeDeps): Promise<IntakeResult> {
  const v = validateIntake(input);
  if (!v.ok) return v;
  // Bots fill the hidden field: pretend it worked, write nothing.
  if (v.honeypot) return { ok: true, reference: "DSE-RECEIVED", duplicate: false, notified: false };
  const store = deps.store;
  if (!store) return { ok: false, errors: { _: NOT_READY } };

  const existing = await store.findByKey(v.value.idempotency_key);
  if (isMissingTable(existing.error)) return { ok: false, errors: { _: NOT_READY } };
  if (existing.data) {
    const reference = referenceFor(existing.data.id);
    // Saved before, but the owner alert never landed (the first request died
    // between insert and notify, or the send failed): this retry sends it.
    // A double click mid-flight can at worst send a second reference-only
    // alert; a lost lead is the worse failure.
    if (existing.data.notified_at == null) {
      const notified = await alertOwner(store, deps, existing.data.id, reference);
      return { ok: true, reference, duplicate: true, notified };
    }
    return { ok: true, reference, duplicate: true, notified: false };
  }

  // Early exit only: parallel submits can all pass this count. The database
  // trigger enforces the cap atomically and answers RATE_LIMITED_CODE.
  if (deps.meta.ip) {
    const since = new Date(deps.now().getTime() - RATE_WINDOW_MS).toISOString();
    const { count, error } = await store.countRecentByIp(deps.meta.ip, since);
    if (!error && (count ?? 0) >= RATE_MAX) return { ok: false, errors: { _: RATE_LIMITED } };
  }

  const inserted = await store.insert({
    ...v.value,
    consent_at: deps.now().toISOString(),
    consent_ip: deps.meta.ip,
    user_agent: deps.meta.ua?.slice(0, 400) ?? null,
    origin_host: deps.meta.host?.slice(0, 200) ?? null,
  });
  const row = inserted.data;
  if (inserted.error) {
    if (isMissingTable(inserted.error)) return { ok: false, errors: { _: NOT_READY } };
    // Two identical submits raced past findByKey: the unique index (or, at
    // the IP cap, the rate-limit trigger) caught the second one. Return the
    // row that won rather than an error for an enquiry that was saved.
    if (inserted.error.code === "23505" || inserted.error.code === RATE_LIMITED_CODE) {
      const again = await store.findByKey(v.value.idempotency_key);
      if (again.data) return { ok: true, reference: referenceFor(again.data.id), duplicate: true, notified: false };
    }
    if (inserted.error.code === RATE_LIMITED_CODE) return { ok: false, errors: { _: RATE_LIMITED } };
    return { ok: false, errors: { _: "We couldn't save that just now. Please try again, or email help@outbackconnections.com.au." } };
  }
  if (!row) return { ok: false, errors: { _: "We couldn't save that just now. Please try again." } };

  const reference = referenceFor(row.id);
  const notified = await alertOwner(store, deps, row.id, reference);
  return { ok: true, reference, duplicate: false, notified };
}

/** Send the owner alert for a saved row and record the outcome on it. */
async function alertOwner(store: IntakeStore, deps: IntakeDeps, id: string, reference: string): Promise<boolean> {
  let notified = false;
  let patch: { notified_at: string | null; notify_error: string | null };
  try {
    const sent = await deps.notifyOwner(reference);
    notified = sent.ok;
    patch = sent.ok
      ? { notified_at: deps.now().toISOString(), notify_error: null }
      : { notified_at: null, notify_error: (sent.error ?? "unknown").slice(0, 300) };
  } catch (e) {
    patch = { notified_at: null, notify_error: String(e).slice(0, 300) };
  }
  // Record the alert outcome; retry once. If it still can't be written, the
  // row keeps notified_at = null, which the owner queue shows as "alert not
  // confirmed", and the server log carries the reference.
  const recorded = await recordAlert(store, id, patch);
  if (!recorded) {
    deps.log?.(`[digital-services] alert state not recorded for ${reference} (notified=${notified})`);
  }
  return notified;
}

/**
 * Owner-queue search, case- and accent-insensitive, done in memory over the
 * owner's recent rows so there is no query string to escape at all: spaces,
 * @, apostrophes, commas and Unicode are just characters.
 */
export function matchesSearch(
  row: { business_name: string; contact_name: string; email: string; message: string; website: string | null },
  q: string
): boolean {
  // NFKD strips most accents; a few letters (đ, ł, ø, ß) don't decompose.
  const fold = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("en-AU")
      .replace(/đ/g, "d")
      .replace(/ł/g, "l")
      .replace(/ø/g, "o")
      .replace(/ß/g, "ss");
  const needle = fold(q.trim());
  if (!needle) return true;
  const hay = fold([row.business_name, row.contact_name, row.email, row.website ?? "", row.message].join(" \u0001 "));
  return needle.split(/\s+/).every((term) => hay.includes(term));
}
