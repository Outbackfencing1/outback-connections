# First paying customer: scope, quote, intake and delivery

Prepared by Claude Code on 5 October 2026, against master plan revision 14
(`aa7be144…`) and handover revision 3 (`e90eb7b4…`), both SHA-256 verified.
This is the working kit for one sale. It approves nothing, sends nothing and
issues no invoice. Prospect-specific records are not kept here, because this
repository is public. They live in owner-only storage (see "Where records live").

## The offers (decided; before applicable tax)

| Offer | Price | Scope |
|---|---:|---|
| Business website | A$1,990 | Up to five template-based pages, the guided quote form included, mobile checks, two consolidated revision rounds |
| Guided quote form on a useful existing site | A$490 | One agreed supported flow; the rest of the customer's site stays as it is |
| Managed care | A$149/month | Hosting/operation within written limits, from the day the agreed service is live |
| One-page site (downsell only) | A$790 | Offered **only** to a customer who has declined the website |

- The A$1,990 website already includes its guided form, so never add A$490 for it.
- When we host or operate the site or form, care is sold alongside it.
- A form can instead run on the customer's own supported, customer-paid platform, with maintenance handed over in writing.

## 1. Scope and terms checklist (before quoting)

- [ ] Offer chosen from the table above. The downsell is used only after the main offer is declined.
- [ ] Pages agreed, and their number written down (website: up to five).
- [ ] Form flow agreed: the services, questions and recipient address.
- [ ] Hosting decided: managed (with care) or the customer's own platform (handed over).
- [ ] Domain, email and accounts confirmed to stay in the customer's name.
- [ ] Revision rounds stated (website: two consolidated rounds). Extra work is quoted in writing first.
- [ ] Payment terms stated, from the approved version of `TERMS-PROPOSED.md`:
  - **Website:** deposit before production, balance after approval and before launch.
  - **Form:** paid before production.
  - **Care:** billed from go-live.
- [ ] Cancellation and refund wording taken from the approved terms. Never "non-refundable".
- [ ] GST treatment confirmed. A quote can't be sent while GST is pending (the database enforces this).
- [ ] Terms version recorded on the quote.

## 2. Draft quote and deposit record

Kept in the owner-only `digital_services_quotes` table (draft migration
`supabase/migrations/_drafts/digital_services_sales.sql`). Fields:

| Field | Example (fixture, not a real customer) |
|---|---|
| customer_label | Fixture Cleaning Co |
| pilot_company_id / enquiry_id | the pilot ID or enquiry it came from |
| offer | website_1990 |
| amount_cents / deposit_cents | 199000 / 99500 (the deposit amount comes from the approved terms) |
| gst_treatment | exclusive: prices are before GST and the operator is GST-registered (established 5 Oct; see below) |
| terms_version | the approved terms version |
| scope_summary | pages, form flow, hosting choice, revision rounds |
| status | draft → sent → accepted (or withdrawn). **There is no "paid" status.** |

**GST (established, not re-asked):** the operator is Outback Fencing and Steel
Supplies Pty Ltd, ABN 76 674 671 820, GST-registered from 2 February 2024
(private record `marcus-owner-mailbox-tax-confirmed-2026-10-05`). Prices are
quoted "+ GST", so quotes use `exclusive`: the website is A$2,189.00 in total
with a A$1,094.50 deposit, and the form is A$539.00.

**Payment** is recorded only in `digital_services_payments`, and each row needs:
- the bank-statement transaction reference, or the payment-provider record ID;
- the amount and the date received;
- who recorded it.

The same evidence can't be entered twice. Deposit received and the balance
come from those rows (the `digital_services_quote_balance` view), never from a
flag, a screenshot or a statement in chat. A draft invoice is never marked paid.

**Owner controls** (`/dashboard/owner`, "Quotes, payments and delivery"; Josh only):
- **Draft quote:** the price comes from the offer, never typed in.
- **Status:** "I've sent this quote", "Customer accepted in writing" or Withdraw. Nothing is sent from here, and there is no "paid" control.
- **Payment evidence:** the reference, amount and date received. The same evidence is refused twice.
- **Delivery stage:** not started → intake requested → intake received → in production → client review → approved → launched → handed over.
  - The database refuses production until the quote is accepted and the payment due before production is evidenced (website: the deposit; form: the full price).
  - It refuses launch and hand-over until everything is evidenced.
  - Once sent, a quote's price, GST, terms and scope are fixed.
- **Conversation log:** append-only notes, calls and emails, linked to an enquiry, a pilot company or a quote.

## 3. Asset intake (send after the deposit is evidenced)

- [ ] Business name exactly as the customer wants it shown; ABN if they want it on the site.
- [ ] Services, and each service area **in their words**, with what they want removed.
- [ ] Logo files (vector if they have one) and brand colours.
- [ ] Photos they own or license, plus permission to use them. No competitor or stock images without a licence.
- [ ] Contact details to publish, and where form enquiries should go.
- [ ] Opening hours, and any licences, insurances or accreditations they want shown (with proof).
- [ ] Domain: who holds it, and the registrar login or DNS contact (they keep ownership).
- [ ] Existing site: pages or features to keep (for example location pages or a client login).
- [ ] One contact person who consolidates feedback for each revision round.

## 4. Delivery checklist (each item checked against the exact build)

- [ ] Built from the maintained template family, not hand-coded from scratch.
- [ ] Every factual claim matches the customer's own material. No invented reviews, ratings, logos, areas or testimonials.
- [ ] Images are owned, licensed or approved by the customer.
- [ ] Form: a test enquiry is **saved and delivered** to the agreed address, and a failed alert never loses it. No JavaScript-off leaks.
- [ ] Mobile (390px) and desktop (1440px): no overflow and nothing clipped. Links work.
- [ ] Existing features the customer asked to keep still work.
- [ ] Consolidated feedback round 1 applied; round 2 applied. Anything beyond that is quoted in writing.
- [ ] Customer approval recorded, with the date and the exact version.
- [ ] Balance evidenced (website) before launch or handover.
- [ ] Launch: DNS and domain in the customer's name, HTTPS works, the form re-tested on the live domain.
- [ ] Handover note: what's included, care limits (if managed), how to ask for changes, how to cancel and export.
- [ ] Counted as an accepted paid delivery only after all of the above. Previews, builds and internal tests don't count.

## Where records live

- **Public enquiry → `digital_services_enquiries`** (draft migration, not applied). Joshua's queue at `/dashboard/owner`.
- **Pilot companies, email revisions, approvals and contact history:**
  - Stored in `digital_services_pilot` and `_drafts`, `_approvals` and `_events` (draft migration, not applied).
  - Until that migration is applied, the private record is the `oc_planning.agent_updates` row with event key `claude-code-three-cleaner-pilot-pack-2026-10-05`.
- **Quotes and payment evidence → `digital_services_quotes` and `digital_services_payments`** (draft migration, not applied).

There is no separate spreadsheet or sending tracker.

## Decisions still open for Josh

These are the unresolved items in `TERMS-PROPOSED.md` ("Decisions only Josh can make"):
1. **Seller and GST:** settled from existing records (above). Still Josh's: approve the terms wording that names them.
2. **Payment destination:** which existing account receives deposits.
3. **Balance, refund and revision terms:** approve or edit the proposed wording.
4. **Care boundaries:** the written hosting/usage/support cap for A$149/month, and which fees, if any, the customer pays directly.
