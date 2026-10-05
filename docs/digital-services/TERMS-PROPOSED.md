# Digital services: proposed terms sheet (for Josh to confirm)

Status: **proposed, not active.** Drawn from master plan revision 12
("Current launch decision" and "Sender, invoicing and terms"). Nothing here is
an offer to a customer until Josh confirms it and the public page is switched
on (`DIGITAL_SERVICES_PUBLIC=on`). Prices are AUD before any applicable tax.

## Offers (decided; not to be changed here)

| Offer | Price | Scope |
|---|---:|---|
| Business website | A$1,990 | Up to five template-based pages, mobile checks, one guided quote flow, two consolidated revision rounds. The guided form is included. |
| Guided quote form on an existing site | A$490 | One flow on a supported existing platform, with saving and delivery tested end to end. Not sold on top of a website we build. |
| Managed care | A$149/month | We host and operate the site/form we built, within written hosting, usage and support limits. |

The A$790 one-page site is offered only after the main website is declined.
Post-sale add-ons (booking setup, Google profile, review kit, reply kit) stay
parked until a sale makes them relevant.

## Proposed payment terms

- **Website:** A$995 deposit (50%) before production starts; A$995 balance
  after the client approves the finished preview, before launch/hand-over.
- **Standalone quote form:** A$490 before production starts.
- **Managed care:** A$149/month from the day the agreed service goes live.
- **Payment method:** invoice with bank transfer to the verified existing
  business account. No new payment provider or recurring charge without Josh.
- **Genuine payment** is the bank/provider record, never a screenshot or an
  AI statement.

## Proposed boundaries

- **Ownership:** the client owns their domain and accounts. Client-paid
  hosting/form accounts are allowed as a scoped option, with maintenance
  explicitly handed over.
- **Care limits:** a written cap on hosting/usage and support time. One
  interpretation only: either A$149 covers the named infrastructure, or named
  client-paid fees are extra. Not both.
- **When care stops:** we export the site/form content and hand over access;
  a form we host stops being hosted at the end of the paid period, with notice.
  No "free hosting forever" and no unlimited support.
- **Extra work:** extra pages or revision rounds are quoted in writing first.
- **Cancellation and refunds:** before production starts, the deposit is
  returned. After authorised work starts, a change-of-mind refund returns the
  unearned amount after completed agreed work and approved non-recoverable
  costs. Consumer guarantees under Australian Consumer Law always apply. No
  blanket "non-refundable" wording
  (https://www.accc.gov.au/business/selling-products-and-services/consumer-rights-and-guarantees).
- **Content:** source-grounded text, licensed or client-approved images; no
  invented reviews, logos, ratings, service areas or testimonials.

## Decisions only Josh can make (bundle)

1. **Seller and tax.** Confirm Outback Fencing & Steel Supplies Pty Ltd (ABN
   76 674 671 820) is the invoicing entity for digital services and its
   current GST status (the ABN record seen is dated September 2025). Until
   then the public page says only that tax is confirmed in writing.
2. **Payment destination.** Which existing account receives deposits.
3. **Care cap.** The hosting/usage/support limit for A$149/month, and whether
   any client-paid fees sit on top.
4. **Terms above.** Approve, edit or reject the payment, cancellation and
   hand-over wording.
5. **Privacy notice.** Add one paragraph covering digital-services enquiries
   (what is collected, owner-only access, 12-month retention) before the page
   is switched on.
6. **Release.** Apply the `digital_services_enquiries` migration, set
   `DIGITAL_SERVICES_OWNER_USER_ID` (and optionally `DIGITAL_SERVICES_ALERT_TO`),
   then set `DIGITAL_SERVICES_PUBLIC=on`.
7. **Sender.** Which no-extra-cost Outback Connections mailbox (not help@)
   sends the pilot, once ownership, send-as, SPF/DKIM/DMARC and reply routing
   are checked.
