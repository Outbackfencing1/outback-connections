# DEFAMATION COMPLAINT PROCEDURE

**Owner:** Outback Fencing & Steel Supplies Pty Ltd
**Applies to:** content posted on Outback Connections (www.outbackconnections.com.au)
**Status:** Internal working draft. Not legally binding until reviewed by lawyer.
**Last reviewed:** 2026-04-25

---

## 1. Purpose

Outback Connections is a digital intermediary publishing user-generated listings. We will sometimes receive complaints alleging that a listing defames a real person or business. This procedure governs how those complaints are received, triaged, and resolved.

The legal frame is the **Defamation Act 2005 (NSW)** (and the equivalent uniform legislation in other states), as amended by the Stage 1 reforms (model defamation provisions) and including the **serious harm threshold** and the **concerns notice** procedure.

We do not make legal findings. We make **moderation decisions** — whether content stays on our platform — applying these criteria.

---

## 2. Channels

Complaints arrive via:

- **Email:** `support@outbackfencingsupplies.com.au` with subject `Defamation complaint`
- **On-site form:** the *Report a legal concern* link below the flag button on every listing detail page (`/listings/[id]/legal-concern` or similar). Writes to the `defamation_complaints` table.

Both channels feed the same triage queue. All complaints are recorded in `defamation_complaints` whether they came in by email (manually entered by Josh) or by form.

---

## 3. Response SLA

**5 business days** to acknowledge and provide an initial response.

If the complaint is filed via the on-site form, the system also emails Josh immediately. Don't rely on the SLA being met by accident — actively check the queue.

---

## 4. Triage workflow

For each new complaint:

1. **Receive and record.** Confirm a row exists in `defamation_complaints`. If the complaint came by email, create the row manually. Capture: complainant name (if given), complainant email, listing URL, listing title at time of complaint, type of concern, complainant's exact text, received_at timestamp.

2. **Snapshot the listing.** Take a screenshot or HTML capture of the listing AS IT IS RIGHT NOW. Save to read-only evidence storage (see §7). The listing might be edited or deleted before resolution; we need the version that prompted the complaint.

3. **Assess seriousness.** Apply this checklist:

   - [ ] Does the complaint identify the complainant as the subject (or a person they represent)?
   - [ ] Does the listing make a statement of fact (not just opinion)?
   - [ ] Would the statement, if read by a reasonable person, lower the complainant's reputation in the eyes of the community?
   - [ ] Is the complainant a real person or business who could be reasonably identified from the listing?
   - [ ] Is the statement actually false (so far as we can tell from the public information)?
   - [ ] Could it cause serious harm to the complainant's reputation or finances?

   **If most boxes tick → treat as serious. Hide the listing pending review.**
   **If few boxes tick → respond with a "no action" explanation.**

4. **If serious — hide pending review.** Use the admin Hide action. The listing's status flips to `hidden_flagged`. Public browse no longer surfaces it. Owner sees it in their dashboard with the status. Log the action via `admin_hide_listing` RPC, which writes to `moderation_actions`.

5. **If serious — notify the original poster.** Email the listing owner:
   - That a legal concern has been raised about their listing
   - That the listing has been hidden pending review
   - The substance of the complaint (without naming the complainant if there's a harassment risk)
   - That they have **7 calendar days** to respond with their side ("right of reply")
   - The address to respond to

6. **Wait for the right of reply.** If no response within 7 days, treat as a non-defence and remove permanently. If response received, weigh both sides.

7. **Decide.** Record the decision in `defamation_complaints.action_taken` and `notes`:
   - `no_action` — complaint didn't reach the threshold; explain to complainant.
   - `hidden_pending_review` — interim state during the 7-day window.
   - `removed_permanently` — content stays off; explain to both parties.
   - `restored` — content goes back up unchanged; explain to complainant; flag the complainant if they appear to be using the system to harass.
   - `referred_to_authorities` — escalate (police, ACMA, OAIC) as appropriate.

8. **Resolve.** Set `resolved_at` and `action_taken`. Communicate the outcome to both parties.

9. **Audit trail.** Don't delete the `defamation_complaints` row even if action is `no_action`. We retain for **7 years** (statutory limitation period).

---

## 5. Concerns notice handling (Defamation Act 2005, ss 12A-12D)

A formal **concerns notice** under the Defamation Act has specific elements:

- It must be in writing.
- It must specify where the matter is published (URL) or how it was made known (oral / printed / etc.).
- It must specify the imputations the aggrieved person considers conveyed.
- It must inform the publisher of any serious harm the imputations have caused.

If the complaint we receive meets these requirements (or substantially does), it triggers the formal pre-litigation steps. We have **28 days** from receipt to make an offer to make amends if we choose to (Defamation Act s 14). The offer can include:

- Removing the matter
- Publishing a correction or apology
- Paying compensation

In practice, our first move on a concerns notice is the same as our triage above (hide pending review + right of reply), but the legal clock is also ticking. **Get legal advice within 5 business days of receiving anything that looks like a concerns notice.**

---

## 6. Communication templates

### Template A — Acknowledgement (within 5 business days)

> Subject: Re: defamation complaint regarding listing [LST-XXXXXXXX]
>
> Hi [name],
>
> Thank you for getting in touch. We've received your complaint and recorded it under reference [DEF-XXXXXXXX]. A summary:
>
> - Listing: [URL]
> - Listing title at time of complaint: [title]
> - Date received: [date]
> - Type of concern: [defamation / copyright / illegal content / etc.]
>
> We're a digital noticeboard — we publish content posted by users and don't pre-screen it. We take legal complaints seriously and follow a defined procedure for assessing and acting on them.
>
> [If serious] We've hidden the listing pending review and will give the original poster 7 days to respond. We'll come back to you within [N] business days with the outcome.
>
> [If not serious] After review, we don't believe the listing meets the threshold for action. Reasons: [brief explanation]. If you have additional information that addresses any of the above, send it along.
>
> If you'd like to escalate this as a formal concerns notice under the Defamation Act 2005 (NSW), include the elements set out in s 12A.
>
> Regards,
> Joshua Crawford
> Outback Connections

### Template B — Right of reply notice to original poster

> Subject: Legal concern raised about your listing
>
> Hi [name],
>
> A legal concern has been raised about a listing you posted on Outback Connections:
>
> - Listing: [URL]
> - Listing title: [title]
> - Posted: [date]
>
> Substance of the complaint: [paraphrased; do not include complainant's identity if there's a risk of retaliatory contact]
>
> While we review, we've hidden the listing from the public marketplace. It still appears in your dashboard.
>
> You have **7 days** to respond if you'd like to share your side. Reply to this email with:
>
> - Whether you stand by the content as posted
> - Any context, evidence, or correction you'd like us to consider
> - Whether you're willing to edit the listing to address the concern
>
> If we don't hear from you within 7 days we'll assume you don't dispute the complaint and decide accordingly.
>
> Regards,
> Joshua Crawford
> Outback Connections

### Template C — Resolution

> Subject: Re: defamation complaint [DEF-XXXXXXXX] — outcome
>
> Hi [name],
>
> Following our review of your complaint about [URL], we've decided: [outcome — removed / restored / restored with edits / no action].
>
> Reasoning: [plain-English summary]
>
> [If removed] The listing is no longer visible. We've recorded the action in our moderation log.
> [If restored] The listing is back up. If you have new information you'd like us to consider, get back in touch.
> [If concerns notice] We acknowledge this as a concerns notice under the Defamation Act 2005 (NSW). Our position is [as above].
>
> Regards,
> Joshua Crawford
> Outback Connections

---

## 7. Evidence preservation

For every complaint, regardless of outcome, preserve:

- The original complaint (email or form submission, verbatim)
- Listing snapshot (HTML or screenshot) as it was at the time of complaint
- Listing snapshot at every state change during review
- All correspondence with both parties
- The decision and reasoning

Store in `docs/defamation-evidence/[anonymised_id]/` (gitignored if sensitive) or in a separate evidence locker. Retain for **7 years**.

---

## 8. When to involve a lawyer

Get legal advice within 5 business days if any of the following:

- The complaint looks like a formal concerns notice under the Defamation Act
- A solicitor's letter arrives
- The complaint involves a public figure or politically exposed person
- The complaint involves alleged criminal conduct (e.g. fraud accusations against a real business)
- The complaint asks for compensation
- We've been threatened with litigation
- The same complainant submits multiple complaints in a short period (potential vexatious litigant)

Legal contact: [TBD — to be filled in once retainer is in place].

---

## 9. Things we don't do

- **We don't make findings about whether a statement is true or false.** We make moderation decisions about whether content stays on our platform.
- **We don't mediate between users.** We document, decide, and communicate. Disputes about underlying facts are between the parties.
- **We don't disclose complainant identity to the original poster** unless legally compelled or with the complainant's express consent. Paraphrase the complaint when notifying the poster.
- **We don't automatically reinstate content after the 7-day window if there's no response.** Default in absence of reply is removal.

---

*End of procedure. Update after each significant complaint. Review annually.*
