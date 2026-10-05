// Owner-only sales section of /dashboard/owner: draft quotes, quote status,
// payment evidence, intake/delivery stage and the conversation log. Rendered
// only after the page's owner check; every action re-checks the owner itself.
// There is no "mark paid" control anywhere: paid amounts come only from
// evidence rows, and the database gates production and launch on them.
import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFER_LABELS, type Offer } from "@/lib/digital-services/pilot";
import {
  BALANCE_VIEW,
  CONVERSATIONS_TABLE,
  CONVERSATION_KINDS,
  DELIVERY_STAGES,
  OFFER_PRICES,
  QUOTES_TABLE,
  SALES_NOTICES,
  money,
  type QuoteStatus,
  type SalesOutcome,
} from "@/lib/digital-services/sales";
import { addConversation, createDraftQuote, recordPaymentEvidence, setDeliveryStage, setQuoteStatus } from "./sales-actions";

type QuoteRow = {
  id: string;
  created_at: string;
  customer_label: string;
  offer: Offer;
  gst_treatment: string;
  terms_version: string;
  scope_summary: string;
  status: QuoteStatus;
  delivery_stage: string;
  pilot_company_id: string | null;
  enquiry_id: string | null;
};
type Balance = {
  quote_id: string;
  total_due_cents: number | null;
  deposit_due_cents: number | null;
  paid_cents: number;
  outstanding_cents: number | null;
  deposit_received: boolean;
};
type Conversation = {
  id: string;
  occurred_at: string;
  kind: string;
  summary: string;
  quote_id: string | null;
  pilot_company_id: string | null;
  enquiry_id: string | null;
};

const input = "rounded border border-neutral-300 px-2 py-1 text-xs";
const button = "rounded border border-neutral-300 px-2 py-1 text-xs";

const NEXT_STATUS: Record<QuoteStatus, { to: "sent" | "accepted" | "withdrawn"; label: string }[]> = {
  draft: [
    { to: "sent", label: "I've sent this quote" },
    { to: "withdrawn", label: "Withdraw" },
  ],
  sent: [
    { to: "accepted", label: "Customer accepted in writing" },
    { to: "withdrawn", label: "Withdraw" },
  ],
  accepted: [{ to: "withdrawn", label: "Withdraw" }],
  withdrawn: [],
};

export async function SalesSection({
  admin,
  viewQuery,
  outcome,
}: {
  admin: SupabaseClient | null;
  viewQuery: string;
  outcome: SalesOutcome | null;
}) {
  let quotes: QuoteRow[] | null = null;
  let balances: Balance[] = [];
  let conversations: Conversation[] = [];
  if (admin) {
    const [q, b, c] = await Promise.all([
      admin
        .from(QUOTES_TABLE)
        .select("id, created_at, customer_label, offer, gst_treatment, terms_version, scope_summary, status, delivery_stage, pilot_company_id, enquiry_id")
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from(BALANCE_VIEW).select("quote_id, total_due_cents, deposit_due_cents, paid_cents, outstanding_cents, deposit_received"),
      admin.from(CONVERSATIONS_TABLE).select("id, occurred_at, kind, summary, quote_id, pilot_company_id, enquiry_id").order("occurred_at", { ascending: false }).limit(100),
    ]);
    if (!q.error) quotes = (q.data as QuoteRow[] | null) ?? [];
    balances = (b.data as Balance[] | null) ?? [];
    conversations = (c.data as Conversation[] | null) ?? [];
  }
  const notice = outcome ? SALES_NOTICES[outcome] : null;
  const kindLabel = (k: string) => CONVERSATION_KINDS.find((x) => x.value === k)?.label ?? k;

  return (
    <section id="sales" className="mt-10 scroll-mt-24">
      <h2 className="text-lg font-semibold">Quotes, payments and delivery</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Prices come from the decided offer. Nothing here sends a quote or an invoice: record what you sent. Paid
        amounts come only from payment evidence (a bank-statement reference or a payment-provider record).
      </p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${notice.ok ? "border-green-200 bg-green-50 text-green-900" : "border-red-200 bg-red-50 text-red-900"}`}
        >
          {notice.text}
        </p>
      )}
      {quotes === null ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sales records aren&apos;t connected. Apply the approved <code>digital_services_sales</code> migration first.
        </p>
      ) : (
        <>
          <details className="mt-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <summary className="cursor-pointer font-medium">New draft quote</summary>
            <form action={createDraftQuote} className="mt-3 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="view" value={viewQuery} />
              <label className="grid gap-1 text-xs">
                Customer
                <input name="customer_label" required maxLength={120} className={input} />
              </label>
              <label className="grid gap-1 text-xs">
                Offer
                <select name="offer" className={input} defaultValue="website_1990">
                  {(Object.keys(OFFER_PRICES) as Offer[]).map((o) => (
                    <option key={o} value={o}>
                      {OFFER_LABELS[o]} ({money(OFFER_PRICES[o].amount)}
                      {OFFER_PRICES[o].deposit ? `, deposit ${money(OFFER_PRICES[o].deposit)}` : ""} + GST)
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                GST
                <select name="gst_treatment" className={input} defaultValue="exclusive">
                  <option value="exclusive">Plus GST (prices are before GST)</option>
                  <option value="inclusive">Includes GST</option>
                  <option value="not_registered">No GST</option>
                  <option value="pending">Not decided (can&apos;t be sent)</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Terms version
                <input name="terms_version" required maxLength={80} className={input} placeholder="the approved terms version" />
              </label>
              <label className="grid gap-1 text-xs">
                Pilot ID (optional)
                <input name="pilot_company_id" pattern="OC-\d{3}" className={input} placeholder="OC-000" />
              </label>
              <label className="grid gap-1 text-xs">
                Enquiry ID (optional)
                <input name="enquiry_id" className={input} />
              </label>
              <label className="grid gap-1 text-xs sm:col-span-2">
                Scope (pages, form flow, hosting, revision rounds)
                <textarea name="scope_summary" required maxLength={2000} rows={3} className={input} />
              </label>
              <div className="sm:col-span-2">
                <button className={button}>Save draft quote</button>
              </div>
            </form>
          </details>

          {quotes.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-600">No quotes yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {quotes.map((q) => {
                const b = balances.find((x) => x.quote_id === q.id);
                const notes = conversations.filter((c) => c.quote_id === q.id);
                return (
                  <li key={q.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold">{q.customer_label}</span>
                      <span>{OFFER_LABELS[q.offer]}</span>
                      <span className="rounded bg-neutral-100 px-1.5 text-xs font-semibold uppercase">{q.status}</span>
                      <span className="text-xs text-neutral-500">
                        GST: {q.gst_treatment} · terms {q.terms_version}
                        {q.pilot_company_id ? ` · ${q.pilot_company_id}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-neutral-700">{q.scope_summary}</p>
                    <p className="mt-2 text-xs text-neutral-700">
                      Total due {money(b?.total_due_cents)} · deposit due {money(b?.deposit_due_cents)} · evidenced{" "}
                      {money(b?.paid_cents ?? 0)} · outstanding {money(b?.outstanding_cents)}
                      {b?.deposit_received ? " · deposit received" : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {NEXT_STATUS[q.status].map((n) => (
                        <form key={n.to} action={setQuoteStatus}>
                          <input type="hidden" name="view" value={viewQuery} />
                          <input type="hidden" name="quote_id" value={q.id} />
                          <input type="hidden" name="to" value={n.to} />
                          <button className={button}>{n.label}</button>
                        </form>
                      ))}
                      <form action={setDeliveryStage} className="flex gap-1">
                        <input type="hidden" name="view" value={viewQuery} />
                        <input type="hidden" name="quote_id" value={q.id} />
                        <select name="stage" defaultValue={q.delivery_stage} className={input} aria-label="Delivery stage">
                          {DELIVERY_STAGES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button className={button}>Set stage</button>
                      </form>
                    </div>
                    {q.status !== "withdrawn" && (
                      <form action={recordPaymentEvidence} className="mt-2 flex flex-wrap items-end gap-1">
                        <input type="hidden" name="view" value={viewQuery} />
                        <input type="hidden" name="quote_id" value={q.id} />
                        <select name="evidence_source" className={input} aria-label="Evidence source">
                          <option value="bank_statement">Bank statement</option>
                          <option value="provider_record">Payment provider record</option>
                        </select>
                        <input name="evidence_ref" required minLength={3} maxLength={200} placeholder="Transaction reference" className={input} />
                        <input name="amount" required inputMode="decimal" placeholder="Amount received, A$" className={input} />
                        <input name="received_on" type="date" required className={input} aria-label="Date received" />
                        <button className={button}>Record payment evidence</button>
                      </form>
                    )}
                    {notes.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2 text-xs text-neutral-700">
                        {notes.map((c) => (
                          <li key={c.id}>
                            {new Date(c.occurred_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })} · {kindLabel(c.kind)}: {c.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 rounded-xl border border-neutral-200 bg-white p-4 text-sm">
            <h3 className="font-medium">Conversation log</h3>
            <form action={addConversation} className="mt-2 grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="view" value={viewQuery} />
              <select name="kind" className={input} aria-label="Kind">
                {CONVERSATION_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              <select name="quote_id" className={input} aria-label="Quote" defaultValue="">
                <option value="">No quote</option>
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.customer_label} ({OFFER_LABELS[q.offer]})
                  </option>
                ))}
              </select>
              <input name="pilot_company_id" pattern="OC-\d{3}" placeholder="Pilot ID (optional)" className={input} />
              <input name="occurred_on" type="date" className={input} aria-label="Date (default today)" />
              <input name="enquiry_id" placeholder="Enquiry ID (optional)" className={`${input} sm:col-span-2`} />
              <textarea name="summary" required maxLength={2000} rows={2} placeholder="What was said or agreed" className={`${input} sm:col-span-4`} />
              <div className="sm:col-span-4">
                <button className={button}>Add to log</button>
              </div>
            </form>
            {conversations.filter((c) => !c.quote_id).length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-neutral-700">
                {conversations
                  .filter((c) => !c.quote_id)
                  .map((c) => (
                    <li key={c.id}>
                      {new Date(c.occurred_at).toLocaleDateString("en-AU", { timeZone: "Australia/Sydney" })} · {kindLabel(c.kind)}
                      {c.pilot_company_id ? ` · ${c.pilot_company_id}` : ""}: {c.summary}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
