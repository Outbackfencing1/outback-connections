# DATA BREACH RESPONSE PLAN

**Owner:** Outback Fencing & Steel Supplies Pty Ltd
**Applies to:** Outback Connections (www.outbackconnections.com.au)
**Status:** Internal working draft. Not legally binding until reviewed by lawyer.
**Last reviewed:** 2026-04-25

---

## 1. Purpose

This plan governs how we detect, contain, assess, notify, and learn from data breaches affecting personal information held in the Outback Connections marketplace. It exists to meet our obligations under the **Notifiable Data Breaches (NDB) scheme** in Part IIIC of the *Privacy Act 1988* (Cth).

The threshold to act: a breach is "eligible" (and therefore notifiable) if a reasonable person would conclude it is likely to result in **serious harm** to one or more affected individuals, AND we have not been able to prevent that likely harm with remedial action.

We have **30 days** from becoming aware of a possible eligible breach to assess it. If eligible, we must notify the Office of the Australian Information Commissioner (OAIC) and affected individuals **as soon as practicable**. As a stronger internal commitment, we aim to notify the OAIC within **72 hours** of being satisfied that a breach is eligible.

---

## 2. Detection

A breach can be detected via:

- **Supabase monitoring** — auth anomaly alerts, RLS policy violations, unusual query patterns. Check the Supabase Dashboard logs daily during active operations.
- **Vercel monitoring** — runtime error logs, deployment alerts, security advisories. Vercel notifies via email.
- **User reports** — emails to `help@outbackconnections.com.au` reporting suspicious account activity, exposed data, or requests they didn't make.
- **Admin discovery** — anything Josh or another admin notices during routine moderation.
- **Third-party disclosure** — researcher reports, security firms, or other companies notifying us of leaked credentials.

Any of the above creates an obligation to begin assessment within 24 hours.

---

## 3. Internal escalation chain

| Step | Who | Within |
|---|---|---|
| Detector identifies a possible breach | Anyone (admin, user, system) | — |
| Notify Josh Crawford | Detector → Josh | 4 hours |
| Initial assessment | Josh | 24 hours |
| Containment decisions | Josh + technical adviser | 24 hours |
| Eligible-breach determination | Josh | within 30 days |
| OAIC notification (if eligible) | Josh | within 72 hours of eligible-breach finding |
| Affected user notification | Josh | as soon as practicable |
| Post-incident review | Josh + technical adviser | within 14 days of resolution |

If Josh is unavailable, escalate to the next named admin in `user_profiles` where `is_admin = true`.

---

## 4. Containment checklist

Immediately on learning of a possible breach:

- [ ] Identify the affected systems (Supabase, Vercel, Resend, etc.)
- [ ] Pause or restrict the affected access path (rotate keys, revoke sessions, take affected pages offline)
- [ ] Snapshot logs and database state for evidence preservation (see §6)
- [ ] Check whether the breach is ongoing or contained
- [ ] If credentials are leaked: rotate `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `URL_SIGNING_SECRET`, and any third-party API keys
- [ ] Verify backups are intact and untainted
- [ ] If a user account is the source: lock that account immediately

---

## 5. Eligibility assessment

For each suspected breach, document:

1. **What information was involved?** (account emails, listings content, contact details, IP logs, etc.)
2. **How many individuals are affected?**
3. **Who could have accessed the information?** (specific person, the public, an attacker, an insider)
4. **What is the likely harm?** (financial, reputational, physical safety, identity theft, harassment)
5. **Have we taken remedial action that has likely prevented serious harm?** (e.g. password resets, account lockouts before any data was used)

If after this assessment a reasonable person would conclude serious harm is likely AND remedial action has not removed that likelihood — the breach is eligible. Notify.

---

## 6. Evidence preservation checklist

Within 24 hours of detection:

- [ ] Snapshot Supabase database (export of affected tables to read-only storage)
- [ ] Save Vercel runtime logs covering the relevant time window
- [ ] Save Supabase auth logs covering the relevant time window
- [ ] Save the exact request that triggered detection (if applicable)
- [ ] Save any user reports verbatim
- [ ] Record timestamps in Sydney time AND UTC
- [ ] Make all evidence read-only and store outside the production system

Don't modify the production system in ways that destroy evidence. If you must rotate keys (you usually must), document key versions and timestamps.

---

## 7. Post-incident review

Within 14 days of the breach being resolved:

- [ ] Document root cause
- [ ] Document timeline (detection → containment → notification → resolution)
- [ ] Document what worked
- [ ] Document what failed (detection gaps, response delays, communication issues)
- [ ] Identify two or three concrete fixes
- [ ] Schedule a follow-up to verify the fixes are in place

Record the review in `docs/incidents/YYYY-MM-DD-summary.md`.

---

## Appendix A — OAIC notification template

> **To:** enquiries@oaic.gov.au (or the OAIC online form at https://www.oaic.gov.au/privacy/notifiable-data-breaches/report-a-data-breach)
>
> **Subject:** Notifiable Data Breach — Outback Fencing & Steel Supplies Pty Ltd (Outback Connections)
>
> Outback Fencing & Steel Supplies Pty Ltd (ABN 76 674 671 820), the operator of Outback Connections (www.outbackconnections.com.au), is reporting an eligible data breach under section 26WK of the Privacy Act 1988 (Cth).
>
> **Description of breach:** [summary in plain language]
>
> **Type of information involved:** [e.g. account email addresses, listing contact phone numbers]
>
> **Approximate number of individuals affected:** [number]
>
> **Date of breach:** [date]
>
> **Date we became aware:** [date]
>
> **Steps we have taken or will take to contain the breach:** [bullet list]
>
> **Recommendations to affected individuals:** [bullet list — typically password change, watch for phishing, etc.]
>
> **Contact for OAIC follow-up:**
> Joshua Crawford
> help@outbackconnections.com.au
> 76 Astill Drive, Orange NSW 2800
>
> Documentation and supporting evidence are available on request.

---

## Appendix B — User notification template

> **Subject:** An incident affecting your Outback Connections account
>
> Hi,
>
> We're writing to let you know about a data incident at Outback Connections that may have affected your account.
>
> **What happened:** [plain English summary]
>
> **What information was involved:** [specific to this user]
>
> **What we've done:** [containment, fixes]
>
> **What you should do:** [specific actions — change password elsewhere if you reuse it, watch for phishing emails referencing your listings, etc.]
>
> **What this means for your account:** [is the account still usable, do they need to do anything to restore]
>
> If you have questions, reply to this email — we'll respond personally.
>
> If you want to make a complaint or escalate, you can contact the Office of the Australian Information Commissioner at https://www.oaic.gov.au/.
>
> — Joshua Crawford, Outback Connections

---

## Appendix C — Quick-reference contact list

| Role | Person | Contact |
|---|---|---|
| Primary admin | Joshua Crawford | help@outbackconnections.com.au |
| OAIC | — | https://www.oaic.gov.au/ |
| Supabase incident response | — | https://supabase.com/dashboard/support |
| Vercel incident response | — | https://vercel.com/support |
| Resend incident response | — | support@resend.com |

---

*End of plan. Update this document after each incident. Review annually even without incidents.*
