# Delivery checklists: five-page website and existing-site guided form

These are working checklists for one sale each. They sit alongside `FIRST-CUSTOMER-KIT.md` (records, owner controls) and `OPERATOR-WALKTHROUGH.md` (the dashboard steps).

Nothing here is active:
- the public service isn't switched on;
- sending isn't connected;
- the terms are proposed (`TERMS-PROPOSED.md`).

No prospect names or details are kept here, because this repository is public. Prospect-specific positions live in the owner-only record.

`tests/delivery-checklists.test.ts` checks the prices and GST figures on this page against the code. If one changes, the test fails until both agree.

## Prices (decided; GST established)

The operator, Outback Fencing & Steel Supplies Pty Ltd, is GST-registered, so prices are quoted "+ GST" (`gst_treatment = exclusive`).

| Offer | Price | GST | Total | Before production |
|---|---:|---:|---:|---|
| Business website (up to five pages, guided form included) | A$1,990.00 | A$199.00 | A$2,189.00 | Deposit A$1,094.50 (A$995.00 + GST); balance A$1,094.50 before launch |
| Guided quote form on an existing site | A$490.00 | A$49.00 | A$539.00 | Paid in full: A$539.00 |
| Managed care (optional) | A$149.00/month | A$14.90 | A$163.90/month | Nothing before go-live; billed from go-live |

**Care is optional:**
- It is offered when we host or operate the site or form.
- A customer can instead keep the build on their own supported, customer-paid platform, with maintenance handed over in writing.
- Never sell the A$490 form on top of a website we build: the website already includes its form.

## A. Five-page website (A$1,990 + GST)

### Scope (agree in writing before the quote)
- [ ] Up to five pages, named. A typical set is Home, Services, Service areas, About, Contact/Quote.
- [ ] Each page's purpose in one line, in the customer's words.
- [ ] One guided quote form. Agree:
  - the questions (service, suburb, property or site type, size or frequency, contact preference);
  - the recipient address;
  - what a successful enquiry looks like.
- [ ] Hosting: managed (with care) or the customer's own platform (handed over).
- [ ] The domain and the email stay in the customer's name. Record who holds the registrar login.
- [ ] Two consolidated revision rounds. Anything beyond that is quoted in writing first.
- [ ] Terms version recorded. Cancellation and refund wording comes from the approved terms (never "non-refundable").

### Quote and payment (owner dashboard)
- [ ] Draft the quote from the enquiry: **Draft a quote for this enquiry**, offer `A$1,990 website`, GST "Plus GST". Check it shows Total due A$2,189.00.
- [ ] Send the quote yourself, then press **I've sent this quote**. From then on it is fixed.
- [ ] Log the customer's written acceptance in the conversation log, then press **Customer accepted in writing**.
- [ ] Record the deposit evidence: the bank or provider reference, A$1,094.50, and the date. Production stays refused until it is evidenced in full.

### Intake (after the deposit is evidenced)
- [ ] Business name as shown; ABN if wanted.
- [ ] Services and service areas in their words.
- [ ] Logo (vector if possible) and colours.
- [ ] Photos they own or license, plus written permission. No stock or competitor images without a licence.
- [ ] Contact details to publish; the form recipient.
- [ ] Hours; any licences, insurances or accreditations, with proof.
- [ ] One person who consolidates feedback.

### Build and test
- [ ] Built from the maintained template family.
- [ ] Every claim matches the customer's own material. No invented reviews, ratings, logos, areas or testimonials.
- [ ] Form: submit a test enquiry and check:
  - it is **saved**;
  - it is **delivered** to the agreed address;
  - a failed alert still keeps it;
  - a double submit makes one record;
  - JavaScript-off submits nothing and leaks nothing into the URL.
- [ ] Phone (390px) and desktop (1280–1440px): no sideways scroll, nothing clipped, every link works.
- [ ] Round 1 feedback applied; round 2 applied.
- [ ] The customer approves the exact preview version. Record the date and version in the conversation log.

### Launch and hand-over
- [ ] Balance evidence recorded: A$1,094.50. Launch and hand-over stay refused until then.
- [ ] Before launch:
  - the domain and DNS are in the customer's name;
  - HTTPS works;
  - the form is re-tested on the live domain (saved and delivered).
- [ ] Hand-over note:
  - what's included;
  - care limits, if managed;
  - how to ask for changes;
  - how to cancel and export.
- [ ] Set the stage to **Launched**, then **Handed over**.
- [ ] Only now does it count as an accepted paid delivery.

## B. Guided quote form on an existing site (A$490 + GST)

### Scope (agree in writing before the quote)
- [ ] The existing site is on a supported platform, and the customer can give us access, or will install it themselves with written steps.
- [ ] Record what the site **already has** and keep it:
  - the existing contact or quote form (state it; never claim it's missing);
  - location pages;
  - logins.
- [ ] Agree the one flow:
  - its questions;
  - the recipient;
  - where it sits on the site;
  - what happens to the existing form (kept alongside, or replaced with consent).
- [ ] **Don't promise what hasn't been tested.** In particular:
  - Don't say the customer will price jobs from the first message. The form collects a better brief; pricing stays the customer's call.
  - Don't say their current form's delivery works or fails until it has been tested with their permission.
- [ ] Hosting: the form runs on our managed hosting (with care) or on their customer-paid platform (handed over).
- [ ] Terms version recorded.

### Quote and payment
- [ ] Offer `A$490 guided form`, GST "Plus GST". Check it shows Total due A$539.00.
- [ ] Send it yourself, press **I've sent this quote**, then log the written acceptance and press **Customer accepted in writing**.
- [ ] Record the full payment evidence: A$539.00. Production stays refused until it is paid in full.

### Intake
- [ ] Access, or a named person who will install it.
- [ ] The recipient address.
- [ ] Their services and areas, in their words, for the form's options.
- [ ] Their existing confirmation or auto-reply wording, if any.

### Build and test
- [ ] Built from the maintained form template.
- [ ] Test on their real site, with their permission:
  - a test enquiry is **saved and delivered**;
  - a failed alert keeps it;
  - a double submit makes one record;
  - JavaScript-off is safe.
- [ ] Their existing pages, form and logins still work after installation.
- [ ] Phone and desktop checked on the page where it sits.

### Hand-over
- [ ] The customer confirms a real test enquiry arrived where they expect it.
- [ ] Hand-over note: how it works, where enquiries go, what care covers (if any), how to remove it.
- [ ] Set the stage to **Launched**, then **Handed over**.
- [ ] Counted as delivered only after the customer confirms.

## Research and outreach records (status, not checklist items)

- **Model-researched prospects stay pending review.** That covers the GLM research returns, v1 and v2, reviewed by `scripts/review-research-handoff.mjs`:
  - "Proposed for owner review" is not accepted outreach.
  - The contact basis is unknown for every row, and sendable is false.
  - Nothing is imported.
- **Prospect-specific positions are kept in the owner-only record, not here.** These are:
  - who is held for weak value;
  - which existing forms are upgrades;
  - which observations are bounded.

  Event `claude-code-overnight-delivery-positions-2026-10-05` holds them.
