# Legal hardening pass — ship report

Date: 27 April 2026
Pass version: `v4-2026-04-26-legal-hardening-draft`
Lead commit: `1bdaded` through `3e9c8b3` (15 commits, all on `main`).

This document summarises what shipped in the legal-hardening pass, what
remains for the lawyer, what infrastructure was added, and what
operational levers are now available.

## What shipped (by item from the brief)

### Part A — Right of access / right of deletion

**Item 1 — `/dashboard/privacy` data control page** ✅
- Server-rendered page showing every record we hold on the signed-in
  user: account, profile, consent record (with version + date),
  listings, flags submitted, recent auth activity.
- Buttons for data export and marketing-consent revocation.
- Links to delete-account flow (already in `/dashboard/settings`).

**Item 2 — Schema additions** ✅
- New tables: `data_export_requests`, `account_deletions`, `auth_events`,
  `listing_edits`, `app_settings`.
- New columns: `user_profiles.creation_ip`, `creation_user_agent`,
  `defamation_complaints.notice_type` + half a dozen related columns,
  `listings.under_review`, `under_review_reason`, `under_review_since`.
- New view: `admin_duplicate_accounts_by_ip`.
- New RPC: `purge_old_auth_events()`, `admin_set_lockdown(p_active, p_reason)`.
- Applied via single MCP migration `legal_hardening_pass_schema`.

**Item 3 — `/api/user/export`** ✅
- POST: rate-limited (1/24h), generates JSON of profile/listings/flags/
  defamation complaints/auth events (last 90 days), signs a 7-day
  download token, emails the link.
- GET ?token=...: serves the JSON for download.
- Logs every request in `data_export_requests`.

### Part B — Defamation safe-harbour hardening

**Item 4 — `/legal/concerns-notice`** ✅
- Public form for defamation/copyright/illegal-content/general
  concerns. Validates with zod, captures the structured fields a
  concerns notice needs, marks listing under_review with 7-day
  deadline for defamation/illegal claims, sends ack to complainant
  with DEF-XXXXXXXX reference, dispatches admin alert.

**Item 5 — Right of reply workflow** ✅
- `/dashboard/listings/[id]/respond-to-complaint`: owner-only page
  showing the complaint and a response form.
- `/dashboard/listings`: amber 'Action required' banner on any
  under_review listing the user owns.
- Owner response goes to admin queue with reply-to set to owner.

**Item 6 — Stronger content licence** ✅
- Terms section 5 rewritten: finite operating licence (active +
  60 days post-expiry) + perpetual irrevocable retention licence
  for legal/audit/regulatory purposes only. User retains ownership.

**Item 7 — Anti-harvest copy** ✅
- ContactBlock now shows a blue notice when contact is visible
  to signed-in users (don't share, don't bulk-outreach, Spam Act).
- AUP rewrote the harvesting section into zero-tolerance enumeration
  with named enforcement (OAIC/ACMA/police).

### Part C — Data integrity and audit

**Item 8 — Auth event log** ✅
- `auth_events` table; `lib/auth-events.ts` logs events fire-and-forget
  from sign-in, sign-up, magic-link callback, sign-out.
- 90-day retention via `purge_old_auth_events()` RPC + Vercel cron at
  `/api/cron/purge-auth-events` (03:00 UTC daily).
- Visible to users on `/dashboard/privacy`.

**Item 9 — Listing edit history** ✅
- `listing_edits` table populated by `editListing` action with full
  before/after snapshots of listing + detail rows.
- Admin-only; phase-2 UI in `/dashboard/admin/flags` flagged for later.

**Item 10 — IP fingerprinting + duplicate-account view** ✅
- `creation_ip` + `creation_user_agent` captured on `/auth/callback`.
- `admin_duplicate_accounts_by_ip` view groups by IP for any IP with
  3+ accounts in last 30 days.
- `/dashboard/admin/duplicate-accounts` admin UI.

### Part D — Transparency + accountability

**Item 11 — `/transparency`** ✅
- Public page; aggregate 30-day stats with PII stripped. Auto-hides
  the stats grid when there's been zero activity. Cached 10 min.

**Item 12 — `/legal/incidents`** ✅
- Admin-only weekly review screen: open complaints (red highlight on
  overdue deadlines), listings under review or hidden, listings with
  2+ flags, account deletions in retention. Quick links to flag
  queue, moderation history, duplicate-accounts, lockdown.

**Item 13 — Versioned legal documents archive** ✅
- `docs/legal-archive/` with frozen markdown snapshots for current
  and superseded versions.
- `/legal/archive` public index page with 'Current' badges and links
  to each frozen snapshot in GitHub.
- 'previous versions' link added under the version stamp on
  /privacy, /terms, /acceptable-use, /cookies.
- AUP and cookies got version stamps for the first time.

### Part E — Breach + incident readiness

**Item 14 — Breach playbook + lockdown** ✅
- `docs/BREACH-PLAYBOOK.md`: operational what-to-type runbook
  (SQL snippets, OAIC + user notification templates, escalation
  chain, restore-service checklist).
- `/dashboard/admin/lockdown`: admin-only control. Activate writes
  via `admin_set_lockdown` SECURITY DEFINER RPC.
- `LockdownBanner`: site-wide banner from cached `app_settings.lockdown`.
- Posting + signup actions check lockdown state before any DB write.

**Item 15 — Sentry stub** 🟡 — needs Josh to set up
- `lib/sentry.ts` no-op stub awaiting `SENTRY_DSN` and the wizard:
  `npx @sentry/wizard@latest -i nextjs`.
- Did not add the package to package.json — wizard handles that and
  generates the right config files.

### Part F — Email safety

**Item 16 — Standard transactional footer helpers** ✅
- `lib/email.ts` exports `buildTextFooter`, `buildHtmlFooter`,
  `wrapTransactional`. Includes postal address, ABN, ref number,
  why-am-I-getting-this, didn't-expect-this contact line, privacy
  + terms links.
- New transactional emails written this session use these. Existing
  flag/legal alerts still send via direct templates that already
  include the same elements inline.

**Item 17 — Bulk-email rate limiting** ✅
- `lib/email-throttle.ts`: `sendThrottledEmail` wraps `sendEmail`
  with a token bucket (default 100/hour, configurable via
  `BULK_EMAIL_PER_HOUR`) and a kill switch
  (`EMAIL_THROTTLE_DISABLED=true`).

### Part G — Terms-level clarity

**Items 18, 19, 20 — Terms additions** ✅
- New section 10A: What we are NOT.
- New section 10B: What you do at your own risk.
- New section 10C: Prohibited content (zero-tolerance enumeration).

### Part H — Loose ends

**Item 21 — Footer disclaimer** ✅
- Comprehensive small-print line at the bottom of every page.

**Item 22 — Word audit** ✅
- Sitewide grep for risky language ('agreement', 'contract', 'warrant',
  'guarantee') turned up no problems on home or About. Terms uses these
  words only in their proper exclusion-clause context.

**Item 23 — `/report` unified intake** ✅
- Single landing page with five categories routing to:
  `/legal/concerns-notice`, in-listing flag, mailto for safety
  concerns, mailto for general.

## New tables, columns, RPCs, env vars

### Tables
- `data_export_requests`
- `account_deletions`
- `auth_events`
- `listing_edits`
- `app_settings`

### Columns
- `user_profiles.creation_ip` (inet)
- `user_profiles.creation_user_agent` (text)
- `defamation_complaints.notice_type` (text)
- `defamation_complaints.complainant_phone` (text)
- `defamation_complaints.complainant_address` (text)
- `defamation_complaints.statement_at_issue` (text)
- `defamation_complaints.reputation_harm_narrative` (text)
- `defamation_complaints.evidence_urls` (jsonb)
- `defamation_complaints.serious_harm_acknowledged` (boolean)
- `defamation_complaints.owner_response_text` (text)
- `defamation_complaints.owner_response_deadline` (timestamptz)
- `defamation_complaints.owner_responded_at` (timestamptz)
- `listings.under_review` (boolean)
- `listings.under_review_reason` (text)
- `listings.under_review_since` (timestamptz)

### RPCs
- `purge_old_auth_events()` → integer (deletes rows older than 90 days)
- `admin_set_lockdown(p_active boolean, p_reason text)` → jsonb

### View
- `admin_duplicate_accounts_by_ip` (groups user_profiles by creation_ip,
  filters to last 30 days + 3+ accounts)

### Cron
- `/api/cron/purge-auth-events` at 03:00 UTC daily (in `vercel.json`).

### Policy version row
- `policy_versions` row inserted: `v4-2026-04-26-legal-hardening-draft`
  (kind=combined).

### Env vars

Required for full functionality (Josh: mirror to Vercel Production +
Preview):

| Variable | Purpose | Status |
|----------|---------|--------|
| `URL_SIGNING_SECRET` | HMAC sigs for export download tokens, renewal links, unsubscribe | Already set |
| `CRON_SECRET` | Auth on `/api/cron/*` routes | Already set |
| `RESEND_API_KEY` | Transactional email | Already set |
| `FROM_EMAIL` | Resend From header | Already set |
| `SENTRY_DSN` | Sentry error monitoring | **Not set** — needs Josh |
| `BULK_EMAIL_PER_HOUR` | Optional override for the throttle (default 100) | Optional |
| `EMAIL_THROTTLE_DISABLED` | Kill switch — set to `true` to block all sends | Optional, do not set unless incident |

## What still needs the lawyer

The brief said this pass was about doing everything I can in code so
the lawyer is polishing not rebuilding. These are the items where the
lawyer's input is now needed:

| Topic | What the lawyer does |
|-------|----------------------|
| Privacy notice v3 | Confirm APP coverage; check the 7-year retention exception is correctly scoped; sign off the data-breach 72h commitment language. |
| Terms v4 | Section 5 — confirm the perpetual-retention licence is enforceable in AU and NZ. Section 10A/B/C — confirm the disclaimers don't accidentally exclude things ACL won't permit. Section 10 — confirm AUD $100 cap holds (or recommend an alternative). |
| Terms s 31A safe-harbour reference | Confirm the wording adequately preserves the safe-harbour for digital intermediaries under the Defamation Act 2005 (NSW) and equivalents. |
| Concerns notice intake | Confirm the form fields satisfy `s 12A` 'concerns notice' minimum content under the 2021 amendments. |
| Right of reply window | Confirm 7 days is appropriate (the Act allows reasonable but doesn't specify). |
| Indemnity in s 6 | Confirm scope and enforceability against consumers in AU. |
| Liability cap | Confirm AUD $100 vs Australian Consumer Law re-supply remedy. |
| Prohibited content list | Confirm enforcement language ('report to police without notification') doesn't accidentally fall foul of any specific notice obligation. |
| Defamation complaints procedure | Review `docs/DEFAMATION-COMPLAINT-PROCEDURE.md` (already exists) and `docs/BREACH-PLAYBOOK.md` (new). |

## What's deferred / explicitly not in scope

- **Sentry full integration** — package install + wizard run + DSN
  setup. Stub in place; no functional impact until DSN is set.
- **Phase-2 listing-edit-history UI in admin flag queue** — the
  `listing_edits` table is populated, the UI to read it isn't built.
- **Account deletion record creation** — when a user clicks the
  existing delete-account button in `/dashboard/settings`, we don't
  yet write a row into `account_deletions`. The table is in place;
  wiring it into the existing delete flow is a one-action change
  that didn't fit in this pass.
- **Soft delete with retention period** — we do hard delete on user
  request. The brief implies a retention period for legal-hold cases;
  this would require a soft-delete refactor of the existing flow.
- **Real session revocation UI** — the breach playbook has the SQL,
  but there's no admin button for it. Manual via Supabase dashboard.

## Final verification

```
npx tsc --noEmit       — clean
npx next build         — clean
node scripts/link-audit.mjs — 241 links, 44 routes, 0 unresolved
```

## Smoke test plan

After Josh deploys, log in as a real user and verify:

1. **Privacy dashboard renders** — visit `/dashboard/privacy`. Account,
   profile, consent record, listings, flags, exports, auth activity all
   show. Marketing-consent toggle works (if marketing was opted in).

2. **Data export delivers** — click "Request my data export". Email
   arrives within minutes with a 7-day signed link. Click the link;
   downloads a JSON file with your data.

3. **Concerns notice flow** — open `/legal/concerns-notice`. Submit a
   test concerns notice for a test listing. Verify:
   - Acknowledgement email arrives with `DEF-XXXXXXXX` reference.
   - Admin email arrives at `help@outbackconnections.com.au`.
   - The target listing shows `under_review=true` in DB.
   - Logged-in owner of that listing sees the amber 'Action required'
     banner on `/dashboard/listings`.
   - Owner can submit a response via
     `/dashboard/listings/[id]/respond-to-complaint`.

4. **Transparency page** — visit `/transparency`. Should show the
   stats grid (since the test concerns notice gives at least one
   number > 0).

5. **Lockdown** — visit `/dashboard/admin/lockdown` (must be admin).
   Activate. Within 30s, the red banner appears site-wide and
   `/post`/`/signup` show the lockdown error. Deactivate.

6. **Versioned archive** — visit `/legal/archive`. Each frozen
   snapshot link should resolve to a markdown file in GitHub.

7. **Footer** — every page should now end with the comprehensive
   small-print disclaimer line.

8. **Auth events** — sign in, sign out, sign back in. Visit
   `/dashboard/privacy` and confirm the events appear in the
   'Recent account activity' list.

## Commit log (this pass)

```
3e9c8b3 feat(legal): footer disclaimer + word audit + /report unified intake
c52f781 feat(email): standard transactional footer helpers
97718ce feat(observability): Sentry stub awaiting SENTRY_DSN
b9ce873 feat(legal): breach playbook + site-wide lockdown control
35592d0 feat(legal): versioned legal documents archive
f8cb8c8 feat(legal): /transparency public stats + /legal/incidents admin dashboard
17e5822 feat(audit): listing edit history
dc0f6a9 feat(audit): auth event log + IP fingerprinting + 90-day purge cron
9944cc5 feat(legal): anti-harvest copy on listings + AUP enforcement detail
ef086da feat(legal): terms hardening — content licence, what we are NOT, at your own risk, prohibited content
9817fc2 feat(legal): right-of-reply workflow for listing owners
5211212 feat(legal): /legal/concerns-notice intake form
1bdaded feat(privacy): /dashboard/privacy data-control page + JSON export endpoint
```

## What to do with this document

Hand to the lawyer alongside `docs/DATA-BREACH-RESPONSE-PLAN.md`,
`docs/DEFAMATION-COMPLAINT-PROCEDURE.md`, `docs/BREACH-PLAYBOOK.md`,
and the four legal pages (live + the matching frozen snapshots in
`docs/legal-archive/`). Their job is now polishing words, not
rebuilding flow.
