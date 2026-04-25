# SHIP-REPORT.md

**Session:** 2026-04-25 / 26 — pre-launch hardening + improvements
**Reference brief:** chat brief, "PART A — LEGAL HARDENING" + "PART B — GENUINE IMPROVEMENTS" + "PART C — POLISH"
**Source-of-truth docs:** `PLAN-MARKETPLACE.md`, `PHASE-1-AUDIT.md`
**Branch:** `main` (production deploys auto-trigger via Vercel)

---

## What was shipped

### PART A — Legal hardening (all 9 items shipped)

| # | Item | Commit | What |
|---|---|---|---|
| 1 | Privacy v3 — APP-compliant | `40328e5` | Restructured around 13 APPs explicitly. Added APP 12 right-of-access, APP 13 right-of-correction, NDB 72-hour commitment, processor list (Supabase / Vercel / Resend), cross-border disclosure (APP 8), under-18 ban, OAIC complaints path, retention schedule including 7-year defamation complaint retention. New `policy_versions` row `v3-2026-04-25-app-compliant-draft`. Working-draft banner retained. |
| 2 | Terms v3 — defamation-hardened | `534d8cf` | 16 numbered sections per the brief. Added: 18+ requirement, content licence to us (perpetual sublicensable while-active + 60d), full indemnity clause, defamation procedure with 5-bus-day SLA + serious-harm threshold + 7d right of reply + concerns notice (s 12A) reference, "we're not the publisher" / s 31A safe-harbour positioning, AUD $100 liability cap (ACL preserved), 14-day notice for changes, NSW exclusive jurisdiction. Stamp `v3-2026-04-25-defamation-hardened-draft`. |
| 3 | Acceptable Use Policy | `975fc85` | New `/acceptable-use`. Plain-English bullets with rural examples for: illegal / defamation / scams / harassment / sexual + hate / IP / doxxing / off-platform harvesting. Cross-linked from Terms §4 + Footer + (next session) post forms. |
| 4 | Cookies notice | `975fc85` | New `/cookies`. Discloses Supabase auth cookies + flash cookies. Explicit list of what we don't set (no GA, no Meta Pixel, no third-party tracking). Forward-looking commitment to ask consent first if analytics ever added. |
| 5 + 18 | Signup consent + 18+ check | `bec322a` | DB columns added on `user_profiles`: `terms_consent_at`, `terms_consent_version`, `marketing_consent_at`, `marketing_consent_revoked_at`, `dob_confirmed_at`. Indexed on marketing-active users. AuthForm in signup mode requires Terms+Privacy tickbox + 18+ tickbox; offers optional marketing tickbox. Server-side validation in `sendMagicLink` rejects without consent. Cookie `oc_signup_consent` stashes the decision; `/auth/callback` writes it to `user_profiles` after the user actually exists in `auth.users`. |
| 6 | Data Breach Response Plan | `c50897e` | `docs/DATA-BREACH-RESPONSE-PLAN.md`. Detection sources, internal escalation chain (4h notify Josh / 24h initial assessment / 72h OAIC stretch goal / 30d eligibility window), containment + key-rotation list, eligibility assessment, evidence preservation, post-incident review template. Appendices: OAIC notification template, user notification template, contact list. |
| 7 | Defamation Complaint Procedure | `c50897e` | `docs/DEFAMATION-COMPLAINT-PROCEDURE.md`. 9-step triage, 5-bus-day SLA, hide-pending-review on serious-harm threshold, 7d right of reply, decision workflow with 5 outcomes, communication templates (acknowledgement, right-of-reply, resolution), evidence preservation (7-year retention), lawyer-escalation triggers. New table `public.defamation_complaints` (anonymised_id `DEF-XXXXXXXX`, listing snapshot, complainant, type enum, action enum). RLS: public can INSERT, admins + service_role SELECT. |
| 8 | Moderation audit trail | `715132d`, `895ac35` | New table `public.moderation_actions` (anonymised_id `MOD-XXXXXXXX`, actor, listing snapshot, action enum, before/after status, jsonb before_data, timestamp). Existing admin RPCs `admin_hide_listing` + `admin_clear_flags` updated to insert audit rows inside the same SECURITY DEFINER call. New `/dashboard/admin/moderation` page (admin-gated) showing the last 200 actions. Linked from the flag queue. |
| 9 | Footer Legal block | `fe0cfb2` | Footer expanded from 3 columns to 4 on md+: Marketplace / Legal / Who we are / Contact. Legal column lists Privacy / Terms / Acceptable use / Cookies. Mobile collapses to single column via existing grid responsive classes. COI line + ABN block unchanged. |

### PART B — Genuine improvements (priority items 10, 11, 14, 18, 19, 20 + opportunistic 12, 13, 25)

| # | Item | Commit | What |
|---|---|---|---|
| 10 | Admin alerts on flag | `eed25e4` | `flagListing` action now sends an email to `NOTIFICATION_TO` (currently `support@outbackfencingsupplies.com.au`) with subject `[FLAG] {title} flagged by {flagger_email}`. Body: listing identity, flag reason label, optional note, link to `/dashboard/admin/flags`, reply-to set to flagger. Best-effort — failure logs but doesn't break the user-side flag write. |
| 11 | First-listing email | `ef26326` | After a successful insert, `insertListing` fires a no-await call to `sendFirstListingEmail`. The function checks the user's listings count via admin client, only sends when count = 1. Body: link to public detail, expiry date, three response-rate tips, pointer to "Mark as filled" flow on dashboard, reply-invite. All four post actions pass `guard.email` through. |
| 14 + 19 | Signed-token system + renewal cron + unsubscribe | `a6b299d` | New `lib/signed-tokens.ts` (HMAC-SHA256, base64url, timing-safe verify). `/listings/[id]/renew?t=...` extends expiry by 30 days. `/unsubscribe?t=...` stamps `marketing_consent_revoked_at`, returns standalone HTML page. Vercel Cron `/api/cron/renewal-reminders` daily at 22:00 UTC: finds listings expiring in 2.5–3.5d, signs a 5-day renew token, sends a reminder email with one-click renew link. Auth via `Bearer $CRON_SECRET` or `?k=` param for manual trigger. |
| 18 | Under-18 ban | `bec322a` | Bundled with item 5. 18+ confirmation tickbox required on signup. `dob_confirmed_at` column. Terms language already covers it. |
| 20 | Legal-concern report form | `cfa48ea` | New `submitLegalConcern` server action. Inserts a `defamation_complaints` row with type-of-concern enum, listing snapshot (title + URL preserved in case the listing is later edited/deleted), complainant email + name + details. Sends admin alert subject `[LEGAL] DEF-XXXXXXXX type — title`. New `LegalConcernForm` component on every listing detail page below the regular flag — collapsed by default, amber-bordered when expanded. Returns reference number on success. |
| 12 | Homepage live stats | `a3b01c0` | New section between hero and pillars. One sentence: "X active listings. Y new this week. Z postcodes covered." Hidden if active < 10 — never show fake numbers. |
| 13 | Post-form tip | `a3b01c0` | One-line tip above the submit button on every `/post/*` form: "Specific listings get more responses. Mention postcode, price range, and best contact times if you can." |
| 25 | Sitemap update | `a3b01c0` | `/acceptable-use` and `/cookies` added to sitemap. |

---

## What was deferred and why

### Deferred from PART B

| # | Item | Reason |
|---|---|---|
| 15 | Search alerts (saved searches + weekly digest) | Substantial: new table, new dashboard page, weekly cron, digest email template. Per Josh: "can defer to a future session if needed." Stopping here to avoid burning out and to deliver a working 80%. |
| 16 | Postcode-radius search | Needs lat/lng on regions (currently just state/lga/region_name from the matthewproctor dataset) plus a haversine implementation in browse queries. Doable but adds significant query complexity. Deferred. |
| 17 | Saved listings | New table, new save button on detail pages, new `/dashboard/saved` page. Independent of legal hardening. Deferred. |

### Deferred from PART C (polish)

| # | Item | Reason |
|---|---|---|
| 21 | Branded 404 | The default Next.js 404 already shows "This page could not be found" with home/etc. links. Not blocking launch. |
| 22 | Better empty-state copy | `/jobs` `/freight` `/services` already have decent empty states with reset-filter links and post-CTAs. Not blocking. |
| 23 | Loading skeletons | Pages are fast enough that this is a perceived-speed polish, not a real one. Deferred. |
| 24 | Per-browse-page metadata polish | `/services/[slug]` already has dynamic metadata; `/jobs` `/freight` `/services` rely on layout metadata which is acceptable. Detail pages now have proper metadata + JSON-LD from a previous session. Deferred. |

---

## What you need to set on Vercel

These env vars exist in `.env.local` but **must be mirrored to the Vercel project** before the cron / signed-token features work in production:

| Env var | Purpose | Where it's used |
|---|---|---|
| `URL_SIGNING_SECRET` | HMAC secret for renewal + unsubscribe tokens | `/listings/[id]/renew`, `/unsubscribe`, renewal cron |
| `CRON_SECRET` | Auth for Vercel Cron requests | `/api/cron/renewal-reminders` |

Both values are in your `.env.local` (committed nowhere — Vercel needs them too). Copy them in via **Vercel project → Settings → Environment Variables → Production**, scope each to all environments. After adding, redeploy with **Use existing Build Cache UNCHECKED** so the new env vars are baked in.

`vercel.json` is already committed and declares the cron schedule — Vercel will pick it up automatically once `CRON_SECRET` is set.

---

## Manual SQL Josh needs to run

**None.** Every migration in this session was applied via Supabase MCP. The four migrations applied:

- `user_profiles_consent_columns` — added `terms_consent_at`, `terms_consent_version`, `marketing_consent_at`, `marketing_consent_revoked_at`, `dob_confirmed_at`
- `defamation_complaints_table` — new table + RLS
- `moderation_actions_audit_trail` — new table + updated `admin_hide_listing` / `admin_clear_flags` RPCs
- (Plus the `policy_versions` row insert for v3)

If you want to verify, query:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'user_profiles'
  and column_name like '%consent%' or column_name = 'dob_confirmed_at';

select count(*) from public.defamation_complaints;
select count(*) from public.moderation_actions;
```

---

## Items the lawyer brief should now reflect (these have shifted)

The lawyer brief was being prepared separately. Many of its items are now **partially or substantially addressed** in code/docs and need less from the lawyer than originally scoped. Update the brief to reflect:

| Lawyer brief topic | What's now in place | What the lawyer still does |
|---|---|---|
| Defamation handling procedure | `docs/DEFAMATION-COMPLAINT-PROCEDURE.md` written, including templates and 9-step workflow | Review for compliance with NSW Defamation Act 2005 and concerns-notice procedure. Confirm the wording of the right-of-reply notice. Confirm the lawyer-escalation trigger list. |
| Liability limitation in Terms | AUD $100 cap + ACL preservation language drafted in `/terms` §10 | Tighten phrasing against ACL non-derogation requirements. Confirm the cap is enforceable. |
| User content licence | Drafted in `/terms` §5 (perpetual, sublicensable, while-active + 60d) | Review scope of "perpetual" — may want to limit. Confirm sublicensable is needed. |
| User indemnity to platform | Drafted in `/terms` §6 (full indemnity for content + conduct) | Standard wording, but confirm enforceability and scope vs ACL. |
| Defamation safe harbour positioning | Drafted in `/terms` §8 (digital intermediary, s 31A reference) | Confirm s 31A applicability for marketplace listings (the safe harbour was drafted with social media in mind). |
| APP compliance for Privacy notice | Restructured in `/privacy` to cover all 13 APPs explicitly | Sense-check each section. Particular attention to APP 8 (cross-border) and APP 11 (security). |
| Data breach plan | `docs/DATA-BREACH-RESPONSE-PLAN.md` written | Confirm 72-hour stretch goal is realistic given internal capacity. Confirm template language. |
| Acceptable Use Policy | `/acceptable-use` page drafted | Sense-check that examples don't accidentally over-restrict legitimate listings. |
| Cookies notice | `/cookies` page drafted, no analytics today | Confirm Australian Privacy Act + (if any) GDPR-equivalent obligations are met given we don't currently set non-essential cookies. |
| 18+ requirement | Tickbox at signup, language in `/terms` §3 | Confirm wording and whether we need stronger COPPA-equivalent language. |
| NSW exclusive jurisdiction | Drafted in `/terms` §15 | Standard. |
| User content takedown audit trail | `moderation_actions` table + admin history page | Confirm record-keeping satisfies any data-retention obligations under defamation law. |

Items the lawyer still owns end-to-end:
- Whether to engage a Privacy Impact Assessment (PIA) before public launch
- Confirming insurance coverage (PI + cyber)
- Reviewing the `URL_SIGNING_SECRET` rotation policy (none yet)
- Reviewing the marketing-consent capture flow against ACMA Spam Act guidance
- Confirming we're not inadvertently a "publisher" under defamation tests beyond what s 31A covers

---

## Smoke test plan (for Josh, with a real signed-in user)

The following requires a real human + browser + email inbox. None of it can be fully automated from this side.

1. **Signup with consent** — visit `/signup`, enter email, verify both required tickboxes block submit, verify the marketing tickbox is unticked by default, submit, click magic link. After landing on `/dashboard`, query Supabase: `select terms_consent_at, terms_consent_version, dob_confirmed_at, marketing_consent_at from public.user_profiles where user_id = (select id from auth.users where email = '<your test email>')`. All four should be set (marketing only if you ticked it).
2. **Post first listing → first-listing email arrives** — post any listing as a brand-new user. Check inbox for "Your listing is live on Outback Connections" within ~30s. Body should include the listing link, expiry date, and tips.
3. **Flag → admin alert email arrives** — sign in as a second test user (`+test2@gmail.com`), visit a listing posted by your first user, click "Flag this listing", pick a reason, submit. Check the admin inbox for `[FLAG] {title} flagged by {email}`. Then verify a row in `moderation_actions` was NOT yet created (the flag is reported but no admin action has taken place yet — admin actions only get logged when you Hide or Clear).
4. **Hide via admin queue → moderation_actions row created** — as the first user (with `is_admin = true`), visit `/dashboard/admin/flags`, click Hide on the flagged listing, confirm. Then visit `/dashboard/admin/moderation` and verify the action shows up. Verify the listing no longer appears on `/jobs` or wherever it used to.
5. **Submit a legal concern → defamation_complaints row + admin alert** — on a listing detail page (signed out is fine), click "Report a legal concern", pick Defamation, fill in email + details, submit. Check the admin inbox for `[LEGAL] DEF-XXXXXXXX Defamation — title`. Query `select anonymised_id, complainant_email, type_of_concern from public.defamation_complaints order by received_at desc limit 1`. Verify the listing snapshot was captured.
6. **Renewal email + one-click renew** — manually push a listing's expiry: `update public.listings set expires_at = now() + interval '3 days' where id = '<listing-id>'`. Run the cron manually: `curl 'https://www.outbackconnections.com.au/api/cron/renewal-reminders?k=<CRON_SECRET>'`. Check the inbox for the renewal email. Click the renew link. Verify expires_at jumps forward 30 days from now.
7. **Unsubscribe link** — sign up a fresh test user with the marketing tickbox ON. Manually mint an unsubscribe token by importing `signToken` from a Node REPL or writing a tiny one-shot route. Visit the link. Verify the response page renders + `marketing_consent_revoked_at` is set on the profile.
8. **Live stats appear** — once 10 active listings exist, the home page shows the X / Y / Z line. Below 10, the section is hidden.
9. **Footer legal links** — every page should now have a 4-column footer with the Legal column showing Privacy / Terms / Acceptable use / Cookies, all clickable.

---

## Where I stopped and why

**Stopped at end of priority Part B (items 10, 11, 14, 18, 19, 20) plus opportunistic items 12, 13, 25.**

Reasons:
- All non-negotiable items shipped (Part A complete + item 10).
- All items in Josh's priority list shipped (10, 11, 14, 18, 20).
- Item 19 (unsubscribe) shipped as part of the signed-token system since it shares infrastructure with item 14.
- Items 12, 13, 25 were quick wins so I included them.
- Items 15 (search alerts), 16 (postcode-radius), 17 (saved listings) are each substantial and standalone — better to ship them in a focused next session rather than bolt them on tired.
- Polish items 21, 22, 23, 24 are not blocking and not high-value pre-launch.

Total: **17 commits across this session**, all on `main`, all auto-deployed by Vercel on push.

---

*End of report. Work resumes when Josh is ready.*
