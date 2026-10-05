// lib/digital-services/sales.ts
// Owner controls for quotes, payment evidence, delivery stage and the
// conversation log (draft migration digital_services_sales.sql). Everything
// here validates owner input and classifies the database's answer; the
// database is the authority on what's allowed (no "paid" status, a sent quote
// is fixed, production and launch need evidenced payment).
import { isTransportCode } from "./queue";
import type { Offer } from "./pilot";
import { isCalendarDate } from "./research";

export const QUOTES_TABLE = "digital_services_quotes";
export const PAYMENTS_TABLE = "digital_services_payments";
export const BALANCE_VIEW = "digital_services_quote_balance";
export const CONVERSATIONS_TABLE = "digital_services_conversations";

/** Price and deposit come from the decided offer, never typed in. Cents, before GST. */
export const OFFER_PRICES: Record<Offer, { amount: number; deposit: number }> = {
  website_1990: { amount: 199000, deposit: 99500 }, // A$995 deposit (50%), balance before launch
  quote_form_490: { amount: 49000, deposit: 0 }, // paid before production
  care_149: { amount: 14900, deposit: 0 }, // billed from go-live
  one_page_790: { amount: 79000, deposit: 0 }, // downsell only, after the website is declined
};

export const GST_TREATMENTS = ["exclusive", "inclusive", "not_registered", "pending"] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "withdrawn"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/** Which statuses each status can be reached from. There is no "paid". */
export const QUOTE_TRANSITIONS: Record<Exclude<QuoteStatus, "draft">, QuoteStatus[]> = {
  sent: ["draft"],
  accepted: ["sent"],
  withdrawn: ["draft", "sent", "accepted"],
};

export const DELIVERY_STAGES = [
  { value: "not_started", label: "Not started" },
  { value: "intake_requested", label: "Intake requested" },
  { value: "intake_received", label: "Intake received" },
  { value: "in_production", label: "In production (needs the payment due before production)" },
  { value: "client_review", label: "Client review" },
  { value: "approved", label: "Approved by the customer" },
  { value: "launched", label: "Launched (needs payment in full)" },
  { value: "handed_over", label: "Handed over (needs payment in full)" },
] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number]["value"];

export const CONVERSATION_KINDS = [
  { value: "note", label: "Note" },
  { value: "call", label: "Phone call" },
  { value: "email_in", label: "Email received" },
  { value: "email_out", label: "Email sent" },
  { value: "meeting", label: "Meeting" },
] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number]["value"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PILOT_ID = /^OC-\d{3}$/;

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
};
const optional = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export type DraftQuote = {
  customer_label: string;
  offer: Offer;
  amount_cents: number;
  deposit_cents: number;
  gst_treatment: GstTreatment;
  terms_version: string;
  scope_summary: string;
  pilot_company_id: string | null;
  enquiry_id: string | null;
};

/** A new quote is always a draft; its price comes from the offer. */
export function parseDraftQuote(form: FormData): DraftQuote | null {
  const offer = form.get("offer");
  if (!isOneOf(Object.keys(OFFER_PRICES) as Offer[], offer)) return null;
  const customer_label = text(form.get("customer_label"), 120);
  const terms_version = text(form.get("terms_version"), 80);
  const scope_summary = text(form.get("scope_summary"), 2000);
  const gst = form.get("gst_treatment");
  if (!customer_label || !terms_version || !scope_summary || !isOneOf(GST_TREATMENTS, gst)) return null;
  const pilot = optional(form.get("pilot_company_id"));
  const enquiry = optional(form.get("enquiry_id"));
  if (pilot && !PILOT_ID.test(pilot)) return null;
  if (enquiry && !UUID.test(enquiry)) return null;
  return {
    customer_label,
    offer,
    amount_cents: OFFER_PRICES[offer].amount,
    deposit_cents: OFFER_PRICES[offer].deposit,
    gst_treatment: gst,
    terms_version,
    scope_summary,
    pilot_company_id: pilot,
    enquiry_id: enquiry,
  };
}

/** "995", "995.00", "1,094.50" → cents. Positive, at most two decimals. */
export function centsFrom(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[,\s]/g, "").replace(/^A?\$/i, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents > 0 ? cents : null;
}

export type PaymentEvidence = {
  quote_id: string;
  amount_cents: number;
  received_on: string;
  evidence_source: "bank_statement" | "provider_record";
  evidence_ref: string;
};

/** Payment needs genuine evidence: a bank-statement reference or a provider record id. */
export function parsePayment(form: FormData, today: string): PaymentEvidence | null {
  const quote_id = form.get("quote_id");
  const source = form.get("evidence_source");
  const received_on = form.get("received_on");
  const amount_cents = centsFrom(form.get("amount"));
  const evidence_ref = text(form.get("evidence_ref"), 200);
  if (typeof quote_id !== "string" || !UUID.test(quote_id)) return null;
  if (!isOneOf(["bank_statement", "provider_record"] as const, source)) return null;
  if (typeof received_on !== "string" || !isCalendarDate(received_on) || received_on > today) return null;
  if (!amount_cents || !evidence_ref || evidence_ref.length < 3) return null;
  return { quote_id, amount_cents, received_on, evidence_source: source, evidence_ref };
}

export type ConversationEntry = {
  kind: ConversationKind;
  summary: string;
  occurred_at: string | null;
  quote_id: string | null;
  pilot_company_id: string | null;
  enquiry_id: string | null;
};

/** A log entry must be linked to a quote, a pilot company or an enquiry. */
export function parseConversation(form: FormData): ConversationEntry | null {
  const kind = form.get("kind");
  const summary = text(form.get("summary"), 2000);
  if (!isOneOf(CONVERSATION_KINDS.map((k) => k.value), kind) || !summary) return null;
  const quote_id = optional(form.get("quote_id"));
  const pilot_company_id = optional(form.get("pilot_company_id"));
  const enquiry_id = optional(form.get("enquiry_id"));
  if (quote_id && !UUID.test(quote_id)) return null;
  if (pilot_company_id && !PILOT_ID.test(pilot_company_id)) return null;
  if (enquiry_id && !UUID.test(enquiry_id)) return null;
  if (!quote_id && !pilot_company_id && !enquiry_id) return null;
  const when = optional(form.get("occurred_on"));
  if (when && !isCalendarDate(when)) return null;
  return { kind, summary, occurred_at: when ? `${when}T12:00:00+10:00` : null, quote_id, pilot_company_id, enquiry_id };
}

export function parseQuoteStatus(form: FormData): { id: string; to: Exclude<QuoteStatus, "draft"> } | null {
  const id = form.get("quote_id");
  const to = form.get("to");
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (!isOneOf(["sent", "accepted", "withdrawn"] as const, to)) return null;
  return { id, to };
}

export function parseStage(form: FormData): { id: string; stage: DeliveryStage } | null {
  const id = form.get("quote_id");
  const stage = form.get("stage");
  if (typeof id !== "string" || !UUID.test(id)) return null;
  if (!isOneOf(DELIVERY_STAGES.map((s) => s.value), stage)) return null;
  return { id, stage };
}

/** What happened to an owner's sales write; shown back on the page. */
export type SalesOutcome =
  | "saved"
  | "duplicate"
  | "gated"
  | "fixed"
  | "stale"
  | "refused"
  | "unconfirmed"
  | "invalid"
  | "unavailable";

export type WriteResult = { data: unknown[] | null; error: { code?: string; message: string } | null };

/**
 * Run one write and classify the answer. Updates are idempotent, so a
 * transport failure is retried once. Inserts are retried only when a repeat
 * can't double-record (payment evidence is unique); a retried payment that
 * then reports "duplicate" may be the first attempt having committed, so
 * that's reported as unconfirmed rather than a clean duplicate. Nothing is
 * ever assumed saved without rows back.
 */
export async function runSalesWrite(write: (() => Promise<WriteResult>) | null, opts: { retry: boolean }): Promise<SalesOutcome> {
  if (!write) return "unavailable";
  const attempts = opts.retry ? 2 : 1;
  let retried = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const { data, error } = await write();
      if (error) {
        if (!error.code || isTransportCode(error.code)) {
          retried = true;
          continue;
        }
        if (error.code === "23505") return retried ? "unconfirmed" : "duplicate";
        if (error.code === "OC402") return "gated";
        if (error.code === "OC409") return "fixed";
        return "refused";
      }
      return data && data.length > 0 ? "saved" : "stale";
    } catch {
      retried = true;
    }
  }
  return "unconfirmed";
}

export const SALES_NOTICES: Record<SalesOutcome, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Saved." },
  duplicate: { ok: false, text: "Not recorded: that payment evidence is already recorded, so it isn't counted twice." },
  gated: { ok: false, text: "Not moved: production needs an accepted quote with the payment due before production evidenced, and launch or hand-over needs payment in full." },
  fixed: { ok: false, text: "Not changed: a quote that has been sent is fixed. Write a new quote instead." },
  stale: { ok: false, text: "Not changed: that quote no longer exists or is no longer in a state that allows this. Refresh and check." },
  refused: { ok: false, text: "Not saved: the database refused it. Nothing was changed." },
  unconfirmed: { ok: false, text: "We couldn't confirm the save. Refresh to see whether it was recorded before trying again." },
  invalid: { ok: false, text: "Not saved: check the fields (evidence reference, amount, date not in the future, a link for notes)." },
  unavailable: { ok: false, text: "Not saved: sales records aren't connected on this environment." },
};

export const SALES_PAGE_SIZE = 50;
/** Still being worked: not withdrawn and not yet handed over. */
export const OPEN_QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "accepted"];

const pageNumber = (raw: unknown) => {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
};

/**
 * The quote list's filter ("open" by default, or "all") and page, and the
 * page of the log of conversations not tied to a quote, from the URL.
 */
export function quoteListView(qs: unknown, qp: unknown, cp?: unknown): { filter: "open" | "all"; page: number; logPage: number } {
  return { filter: qs === "all" ? "all" : "open", page: pageNumber(qp), logPage: pageNumber(cp) };
}

/** Cents to "A$1,094.50"; null shows as "—". */
export function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
