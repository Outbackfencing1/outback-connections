# Operator walkthrough: one customer, enquiry to hand-over

This is how Josh works one customer through the owner dashboard (`/dashboard/owner`).
It follows the fixture journey that `scripts/local-stack/lifecycle.sh` runs on the local stack.

That run has three phases, and the app server is restarted between them, so each unfinished state is shown to survive a restart.

**What it is not:**
- It is not a hosted test.
- Nothing is sent, charged or published.
- The public service is not active.
- Sending is not connected.

## Before you start

- Sign in as yourself. Only the configured owner id opens the dashboard:
  - logged-out visitors go to sign-in;
  - members and other admins get a 404.
- Readiness at the top of the page says what is connected. On the local stack:
  - owner alerts are **Blocked** (no mail key);
  - the engine is **Blocked** (its source isn't in this repository).

## 1. The enquiry arrives

1. The customer fills in the form on `/digital-services` and gets a reference (`DSE-XXXXXXXX`).
   - Submitting the same form twice gives the same reference and one row.
2. **If the owner alert can't be sent, the lead is still kept.** The enquiry shows "Owner alert failed: …" in red.
   - Check the queue daily rather than relying on alerts until the mail key is live.
3. Find the enquiry under **Enquiries**. Search covers every page.
4. Log what happened on the row (call, email, meeting, note). The log is append-only.

## 2. Quote

1. Open **Draft a quote for this enquiry** on the enquiry row.
   - The customer name is pre-filled and the quote is linked to the enquiry.
2. Choose:
   - the offer: A$1,990 website, A$490 guided form, or A$149/month care;
   - GST: "Plus GST" while the business is GST-registered;
   - the terms version;
   - the scope, in plain words.
3. Check the total under **Quotes, payments and delivery**. A website with GST is A$2,189.00, with a deposit of A$1,094.50.
4. Send the quote yourself, outside the app. Then press **I've sent this quote**.
   - From then on the quote is fixed: price, GST, terms and scope can't change.
   - A different price is a new quote.

## 3. Acceptance and deposit

1. When the customer accepts in writing:
   - log the email under **Conversation log**, against the quote;
   - press **Customer accepted in writing**.
2. You can set intake stages (requested/received) before payment.
3. Record each payment as evidence:
   - the source (bank statement or payment provider);
   - the transaction reference;
   - the amount;
   - the date.

   There is no "paid" button.
4. **Production is refused until the deposit is evidenced in full.**
   - An A$500 part-payment on a A$1,094.50 deposit is recorded, but "Set stage → In production" says **Not moved**.
   - Record the rest, then set the stage.
5. The same evidence twice is refused as a duplicate, even with different spacing or case.
6. A failed save says **Not saved: the database refused it**, and nothing changes. Fix the cause and try again.

## 4. Delivery and hand-over

1. Work through the stages: In production → Client review → Approved by the customer.
2. **Launch and hand-over are refused until the balance is evidenced.** Record the balance (A$1,094.50 in the example), then:
   - set **Launched**;
   - then set **Handed over**.
3. If the customer wants managed care, write a separate A$149/month care quote at go-live. Care is billed from go-live, so its stages have no payment gate. It still needs to be accepted in writing.

## Outreach drafts (separate from customer work)

Pilot drafts are reviewed on `/dashboard/owner/review/<draft id>` (the "Review revision N" link in **Small pilot**).

**The screen shows:**
- the exact subject and body;
- the revision and its hash;
- every source, with its age and how it was checked;
- the open uncertainties;
- the sending holds;
- the offer;
- the reviews on record.

**Recording your approval:**
- It records you, the time and that exact revision. **It does not send anything.**
- Sending is not connected, and every sending hold would still apply.
- New evidence, or a new revision, voids the old approval.

## Screens checked

The lifecycle run saves screenshots at phone (390px) and desktop (1280px) widths:
- the service page;
- the sent quote;
- production;
- hand-over.

It also fails if any page scrolls sideways at phone width, with every disclosure opened. The flow run saves the review screen at both widths.

The screenshots use fixture data only and are kept out of the repository.
