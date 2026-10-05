# HANDOFF

Date: 2026-10-04 (previous: 2026-09-06)
Branch: `main`. Live: https://www.outbackconnections.com.au

Everything from the 6 Sep session is on `main` and deployed (PR #18, 7 Sep;
PR #19, the staff-post clean-up, 2 Oct).
Pushing to `main` deploys production. All migrations in
`supabase/migrations/` are applied to the live project.

---

## 5 Oct 2026: digital services, marketplace side (branch `ccr-a7a02618-x1gnjy-digital-services`)

Handover: `oc_planning.plan_versions` `claude-code-build-handover` rev 2 on
master rev 12. Engine source, the ten review JSONs and the Cowork drafts are
only on Josh's PC, so engine import/repairs/adapter are blocked on that
handoff (`docs/digital-services/ENGINE-HANDOFF.md`). Done here, not merged,
not published:

- `/digital-services` ("Websites & digital tools"): the three launch offers at
  the decided prices, honest terms wording, enquiry form. Off unless
  `DIGITAL_SERVICES_PUBLIC=on`; nav/footer/sitemap entries follow the switch.
- Intake (`lib/digital-services/intake.ts`): strict validation, honeypot,
  idempotency key (retries save one row; a race is caught by the unique index),
  per-IP limit, save first, then an owner alert with reference + link only; an
  alert failure is recorded on the row and never loses the lead. Missing table
  or key shows a visible "not open yet" message.
- `/dashboard/owner`: Josh only (`DIGITAL_SERVICES_OWNER_USER_ID`; admin is not
  enough; logged-out → sign in, others → 404). Readiness checks, the pilot
  view, enquiry queue with Unicode/apostrophe/@ search and status updates.
- Draft migration `supabase/migrations/_drafts/digital_services_enquiries.sql`
  (not applied), tested on PGlite.
- `docs/digital-services/`: `PILOT-READINESS.md`, `TERMS-PROPOSED.md`,
  `ENGINE-HANDOFF.md`.

Josh's decisions are bundled at the end of `TERMS-PROPOSED.md`.

### Later on 5 Oct: first-customer priority (master rev 14, handover rev 3)

**Enquiry flow:**
- The owner status change now says "saved" only when the database returns the updated row. A refused write or a missing row shows a red "Not saved" notice, and the queue isn't revalidated.
- Proven end to end on a **local** stack (`scripts/local-stack/`: Postgres 16 + PostgREST + a gateway that mimics Supabase, persona sign-ins):
  - the four personas behave correctly;
  - no JavaScript means no save and no URL leak;
  - the form saves one row, a failed alert keeps the lead, and a replayed submit creates no duplicate;
  - Joshua's queue status changes save, and failures are shown.
- Not a hosted test. Hosted end-to-end needs the enquiry migration applied (approval needed).

**Pilot records:** the pilot draft migration now has revisioned email drafts with database-computed hashes, approvals bound to the exact revision, and contact, reply and suppression events. A first contact is refused unless:
- the reservation matches the lane;
- the company isn't suppressed and hasn't replied;
- the contact basis is confirmed;
- all four approvals exist on the latest revision;
- a sender is named and isn't help@.

Only one first contact per company is possible. `lib/digital-services/dispatch-guard.ts` applies the same rules in the server. Three cleaners are prepared and held; the records are private (`oc_planning.agent_updates` event `claude-code-three-cleaner-pilot-pack-2026-10-05`).

**Sale:**
- `docs/digital-services/FIRST-CUSTOMER-KIT.md`: scope/terms checklist, quote record, asset intake, delivery checklist.
- Draft migration `digital_services_sales.sql`: quotes have no "paid" status. Payments need bank or provider evidence, and evidence can't be counted twice.

**Outreach sender:** named via `DIGITAL_SERVICES_OUTREACH_SENDER`. It counts as verified only with `DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON`, set after the owned-inbox send/reply test. help@ is refused.

**Not done (access):**
- evidence refresh for the three sites (network policy blocks them);
- the owned-inbox test (no Outback Connections Workspace mailbox is connected);
- hosted smoke (paused until the trace-safety fix is on `main`; separate draft PR).

**Release order (once approved):**
1. Enquiry migration.
2. Pilot migration, in the same session as `select set_config('app.ds_owner_user_id', '<owner auth id>', false);`. Without it the migration refuses to apply.
3. Sales migration.
4. Environment variables: `DIGITAL_SERVICES_OWNER_USER_ID`, `RESEND_API_KEY`, the sender variables after the owned-inbox test.
5. Privacy wording approved.
6. `DIGITAL_SERVICES_PUBLIC=on`.

### Later still on 5 Oct: owner controls, sender adapter, revision 3

- **Owner controls** (`/dashboard/owner` → "Quotes, payments and delivery"; owner-gated actions in `app/dashboard/owner/sales-actions.ts`):
  - draft quote (price from the offer);
  - quote status (sent / accepted in writing / withdrawn; no "paid");
  - payment evidence (unique);
  - delivery stage;
  - an append-only conversation log, also on each enquiry.
  - The sales draft migration now refuses production until the quote is accepted and the payment due before production is evidenced, refuses launch/hand-over until fully paid, and fixes a quote's price/GST/terms/scope once sent.
  - Local e2e proves the whole sequence (6/6 flow tests).
- **Sender/reply adapter:** `lib/digital-services/outreach/` (Gmail REST; scopes gmail.send + gmail.readonly).
  - Order of operations: guard → `send_attempt` with our own Message-ID → send → `contacted` or `send_failed`.
  - An unknown outcome stays unresolved and blocks another attempt until `reconcileAttempt()` finds it in the mailbox.
  - `syncReplies()` records replies, opt-outs and bounces idempotently.
  - Not wired to any route. `DIGITAL_SERVICES_OUTREACH_SENDING` must be `on` as well.
  - Josh's connection steps: `docs/digital-services/OUTREACH-SENDER.md` (find the Workspace admin, add a free alias, send-as, owned-inbox test, Internal OAuth client, refresh token, Vercel vars).
- **Seller/GST settled** from existing records: GST-registered operator, prices "+ GST", quotes `exclusive`. Not re-asked.
- **Pilot revision 3:** private record `claude-code-three-cleaner-pilot-rev3-2026-10-05`. The older local A$1,490 pitch Codex reported is superseded.
  - The two form prospects' previews are repaired in this branch (deploys only on merge).
  - All three are still held: 0/12 approvals, evidence refresh blocked, no connected sender.
- **GLM research:** a dry-run validator, `scripts/review-research.mjs` (see `docs/digital-services/RESEARCH-IMPORT.md`).
  - The ten-cleaner file is on Josh's laptop and isn't validated yet: attach it, or have Codex run the script locally.
  - Nothing imports it.
- **Ten engine reviews (all HOLD):** their repair and re-review live in the private engine, which isn't in this repository. Not touched here.

## 4 Oct 2026: the staff-post clean-up was failing; fixed (branch `ccr-a7a02618-x1gnjy`)

Live check (read-only) before the fix: the 2 and 3 Oct runs of
`/api/cron/adopt-staff-posts` created 53 unclaimed copies but could not close
a single original. `listings_contact_required` needs a phone, email OR
source_url, and the close cleared both contacts on rows with no source_url.
So 92 staff posts were still live as owner-posted with phone/email readable by
any signed-in user, 53 of those contractors showed twice in the directory,
and 40 closed rows (38 from 6 Sep + 2 held) still held contact. The 9 "found
on its official website" rows also failed the record builder every day (that
platform needs a page URL), and the dry run never ran the builder, so it
couldn't show either failure.

Fixed, no migration:
- Closing an original now sets `source_url` (the new row's attribution URL;
  a web search for held rows) when it clears phone/email.
- `planStaffPost()` (lib, tested) runs the screen AND the record builder, for
  both the dry run and the real run. Google Maps / own-website posts with no
  page URL are filed as "found online" (web search). State comes from the
  row, then the description, then the postcode. Anything the builder still
  rejects is held, never left live.
- Held rows have phone/email moved to a private `listing_sources` row
  (`source_platform='staff_post'`, admin read) and cleared; a held row is
  never picked up again, so a person's call sticks.
- Each run also sweeps closed staff posts that still carry phone/email (the
  40 above) the same way.
- Quote requests on an adopted original move to the new row.
- **After deploy:** hit `/api/cron/adopt-staff-posts?dry=1&k=<CRON_SECRET>`
  (expect ~92 adopt, ~0 hold, 40 to clear), then let the 7:30am run go, or
  call it once without `dry`. Re-ingest is idempotent, so the 53 existing
  copies are updated, not duplicated.

Also in this branch: `safeNextPath` refuses any control character (`/\t/evil.com`
resolved off-site after sign-in); the two public legal-concern forms get a
honeypot and a loose hourly cap (3 per email, 20 overall, refusals point to
help@); staff see a warning on the job, freight and for-sale forms (those
stay open to them for Outback Fencing's own ads). Left for later: the renew
and unsubscribe links act on GET (mail scanners can trigger them);
`CRON_SECRET` is accepted as `?k=` (lands in logs); a staff account's own
real business would still be re-filed as unclaimed (only admins are exempt).

## 2 Oct 2026: staff posts through the public form get re-filed daily

Between 7 Sep and 1 Oct Ali added 94 fencing contractors (great volume) but
through the PUBLIC "post a listing" form, so every row was owner-posted
(`data_source='manual'`): no Unclaimed badge, no source, phone/email in the
signed-in-readable columns, no business record to claim, Ali as the owner.
Farmer enquiries on them still went to the team (no business = unclaimed
path), so no farmer data leaked.

Fix (branch `fix/adopt-staff-posts`, no migration):

- `/post/service/offering` now redirects staff and directory contributors
  (not admins) to `/dashboard/directory/add?from=post`, page and server
  action both, with a plain-English note on arrival.
- `/api/cron/adopt-staff-posts` (daily 21:30 UTC = 7:30am AEST) re-files
  any such row through the same path as the quick-add page
  (`buildDirectoryRecord` + `ingest_scraped_business`), closes the
  original with `canonical_listing_id` so its URL 301s, and nulls its
  contact columns. Rows that fail the screen in
  `lib/staff-post-adoption.ts` (place-name titles, off-topic trades) are
  closed, not deleted, and listed in the team email. `?dry=1&k=<secret>`
  shows the plan.
- Dry run against the live 94 (public fields only): 92 publish, 2 held
  ("Seven Hills NSW", "Dubbo Scaffolding").

## What Outback Connections is now (the Aug–Sep 2026 pivot)

A **rural business directory + staff outreach tool**, run by Outback Fencing &
Steel Supplies (disclosed on every page). The live vertical is **Services**:
fencing contractors across NSW, which feed the wholesale pipeline (clip-gun
and trade pricing). Jobs and Freight exist but are empty and, as of this
session, hidden from navigation and the sitemap while empty.

This replaced the "generic rural jobs/freight platform, parked" framing of the
July handoff. It is money-first aligned: the directory is the lead source, the
claim flow is the retention mechanism, and the trade offer on fencing pages is
the revenue message.

## Live numbers, 6 Sep 2026 (after this session)

| Measure | Value |
|---|---|
| Active directory listings (Services) | 53 (52 fencing contractors + Outback Fencing) |
| Businesses / claimed | 58 / 0 |
| Live job ads / freight listings | 0 / 0 |
| Human searches with a filter, last 7 days | 26 (gate target 25/week) |
| Claims last 30 days / first-party posts last 30 days | 0 / 0 (targets 5 / 10) |
| Crawler share of browse loads, last 30 days | 40% |
| Contact reveals, last 30 days | 36 |

Read live at `/dashboard/admin/analytics` (new "Traction gate" block, humans only).

## What happened between the handoffs

- **14 Aug (Codex, PR #16, merged, deployed):** contractor outreach workspace
  at `/dashboard/admin/contractor-outreach`, `/claim/[businessId]`, Next.js 16
  + `proxy.ts`, three migrations (outreach tables + RPC, safe vertical
  reclassification in ingest, contact columns hidden from anon). 18 fencing
  contractors ingested properly.
- **14 Aug (Codex, PR #17, OPEN, unmerged):** `/dashboard/outreach` team
  tracker + outreach-only access for Jess and Daryl, two more migrations.
  Its own release gate: run `supabase/tests/outreach_access_and_suppression.sql`
  on a disposable Supabase branch first. **Needs Josh's decision on who does
  outreach before it's worth finishing.**
- **26 Aug–4 Sep (staff):** 39 fencing contractors hand-entered through the
  PUBLIC post form (the only path they had), so the site treated them as
  owner-posted: contact block, LocalBusiness JSON-LD, 30-day expiry, no
  business record, not claimable. Fixed this session (below).
- Farm Hand ad expired 8 Jul, never renewed. Pilot-5 scraped jobs expired
  mid-Aug. Adzuna never configured. Outreach table was empty (unused).

## This session (6 Sep 2026, Claude, autonomous per Josh's "no rules")

### Data (applied to prod, atomic, verified)
1. **39 hand-entered contractors migrated.** 34 re-ingested via
   `ingest_scraped_business()` as scraped/unclaimed rows with business records
   (Facebook / Yellow Pages / TrueLocal / own website / web attribution; phone +
   email private in `listing_sources.raw_payload`; 60-day expiry to 5 Nov).
   5 were duplicates of 14 Aug rows and were closed pointing at them. All 39
   originals closed (`status='closed'`, `canonical_listing_id` set); old URLs
   301 to the new rows. 0 manual rows remain active.
2. **Outback Fencing & Steel Supplies directory entry created** (listing
   `c2f877ed-…`, business `0e402f26-…`, category `rural-supplies`, unclaimed)
   so Josh can claim it through the real flow (decision 7, 4 Jul).
3. `user_profiles.directory_contributor = true` for the staff account that was
   adding contractors (the outbackfencingsupplies.com.au user, not admin).

### Migrations (all applied)
| File | What |
|---|---|
| `20260906020000_ingest_platform_labels` | Ingest wording: "we found listed on Facebook / on its official website / online" instead of raw slugs; "is a fencing contractor" from the category label. |
| `20260906030000_directory_contributor_flag` | `user_profiles.directory_contributor` (service-role-only to set; grants only the quick-add page). |
| `20260906040000_services_supply_categories` | Promoted from `_drafts`: rural-supplies, produce-stock-feed, farm-machinery-dealer, fodder-hay. |
| `20260906050000_analytics_bot_flag_and_gate_metrics` | `is_bot` on `events` + `search_queries` (backfilled from user agents); `admin_gate_metrics(p_weeks)`. |
| `20260906060000_function_execute_privileges` + `…061000_…_public` | Closed the default-privilege gap: service-role-only RPCs and trigger functions no longer callable by anon/authenticated via PostgREST; admin RPCs revoked from anon only; default privileges no longer grant anon EXECUTE on new functions. |
| `20260906070000_enquiries_and_claim_polish` | `listing_enquiries` + `purge_old_enquiries()`; `approve_claim` v3 (claimed provenance + boilerplate strip); `admin_gate_metrics` v2 (enquiries); fencing label. |
| `20260906080000_admin_demand_by_region` | `admin_demand_by_region(p_months)` planning report (aggregate only). |
| `20260906090000_staff_role` | `user_profiles.is_staff`, `current_user_is_staff()`, staff read policies, outreach view + RPCs re-pointed. |
| `20260906100000_enquiry_outcomes` | `listing_enquiries.followup_sent_at/outcome/outcome_at`; `business_response_stats(listing)`. |
| `20260906110000_for_sale_vertical` | kind `for_sale`, vertical `sale`, pillar `sale` + 8 categories, `sale_details` with RLS. |
| `20260906120000_sales_by_postcode` | `sales_by_postcode_monthly` (aggregate, staff read) + demand report v3 with sales columns and coverage. |
| `20260906130000_review_fixes` | `sale` allowed on events/search_queries; `business_response_stats` only for live offerings; demand report v4 (Sydney months, grouped joins). |

### Code (local commits, unpushed)
- **Staff quick-add** `/dashboard/directory/add` (admins + contributors): one
  business through the same preview + ingest RPCs as bulk import. Search-URL
  fallback when no page URL, flagged `metadata.source_url_kind=search` so the
  detail page says "Find the original listing on Facebook". Nudge on the
  public "Offer a service" form; card on the dashboard; admin nav link.
- **Trade offer card** (`components/detail/TradeOfferCard.tsx`) on fencing
  listings and the claim page. Disclosed as the operator's own offer; links to
  the clipgun product + store with UTM `trade_cta`.
- **One-click claim-invite email** in the outreach workspace ("Send invite
  email"): Resend from the Connections address, reply-to help@, 14-day
  cooldown per business, logged as `emailed` / `invite_sent`. Copy in
  `lib/claim-invite-email.ts` includes a reply-"remove" opt-out.
- **Empty verticals hidden**: Jobs/Freight nav links and sitemap entries only
  when they have live rows; honest "nothing listed yet" states; home freight
  card becomes "Post freight" while empty.
- **Analytics**: `lib/analytics.ts` flags crawlers and sets a daily
  pseudonymous `session_id` (hash of ip + UA + date, no cookie); analytics
  page shows the traction gate week by week.
- **Directory expiry digest**: renewal cron emails `NOTIFICATION_TO` once per
  row, 7 days before a scraped entry expires (owners still get their 3-day
  renewal mail; scraped rows are excluded from that loop now).
- **Account deletions** now write the `account_deletions` audit row.
- **Prisma removed** (schema, client, deps, postinstall).
- **CI** (`.github/workflows/ci.yml`: tsc, lint, build, migration-name check),
  `AGENTS.md` (rules for every agent/person), PR template, README rewrite.
- Old-slug 301s on the services detail page via `canonical_listing_id`.
- **CSV upload** on the bulk import page (spreadsheet headers like name / town /
  postcode / found_on / phone / email accepted; rows with problems listed and
  skipped). `lib/directory-records.ts` is the one definition of a staff entry,
  shared by quick-add, CSV and the tests.
- **Regional landing pages** `/services/[category]/[region]` (e.g.
  `/services/fencing-contractor/orange-nsw`) from the `regions` table; "By
  region" chips on category pages; sitemap emits them.
- **Tests**: vitest, 17 unit tests over the pure libs; `npm test` in CI.
- **Farmer enquiries ("Get a quote")** on every service listing, no account
  needed: honeypot, 5/hour per IP, consent recorded, farmer PII admin-only and
  purged after 12 months. Team emailed on every enquiry; a claimed business
  with a confirmed email is emailed directly; unclaimed rows are forwarded by
  a person from `/dashboard/admin/enquiries` (shows the contractor's private
  contact, admin only). The contractor's contact never goes to the farmer.
  Enquiries count in the gate metrics. Privacy notice updated.
- **Claim polish**: on approval the claimant's rows become
  `data_source='claimed'` (with the consent version they accepted at signup)
  and the "UNCLAIMED directory listing" boilerplate is stripped.
- **Home page FencingFinder**: postcode box straight to the fencing
  directory plus the regions that actually have contractors, and "Post the
  fencing job" for farmers who don't want to pick. Category label is now
  "Fencing contractor".
- **Job requests without the wait**: `/post/service/request` (demand side)
  skips the 24h account-age rule; `?category=fencing-contractor` preselects
  with farmer copy. After posting, claimed businesses with a confirmed email
  in the same region (then state) are emailed, capped at 20. Unclaimed rows
  are never auto-emailed.
- **Staff role for Ali** (`user_profiles.is_staff`, migration 20260906090000):
  outreach workspace, enquiry queue, directory add, bulk import, analytics and
  demand reports. Not moderation, lockdown, flags, duplicate accounts,
  incidents or claim approval (those stay admin, checked directly in SQL and
  the app). Ali's account is switched on. She signs in with her existing
  account and sees "Staff" tools on the dashboard.
- **Trust badges** ("Claimed", "ABN verified") on cards and the detail page;
  footer no longer links to empty verticals.
- **Facebook kit** (`docs/FACEBOOK-KIT.md`): post templates + UTM links for
  advertising the contractors by region, the "post a fencing job" door, and a
  contractor-facing claim post.
- **Reputation loop** (migration 20260906100000): a week after a forwarded
  enquiry the farmer gets one email with three signed one-click answers
  (`/enquiries/outcome`); listings show "Responded to N of M quote requests
  farmers told us about" via `business_response_stats()` (aggregate only,
  anon-callable by design). No free-text reviews. Needs `URL_SIGNING_SECRET`
  in Vercel (the renewal cron already uses it).
- **Monday digest** (`/api/cron/weekly-digest`, Sunday 21:00 UTC = Monday 7am
  AEST, to `NOTIFICATION_TO`): gate numbers, last-7-days deltas, the enquiry
  queue with anything waiting over 48 hours, directory health, and the demand
  gaps. `?dry=1&k=CRON_SECRET` previews it. Formatter in `lib/weekly-digest.ts`
  (tested).
- **For sale vertical** (migration 20260906110000): listing kind `for_sale`,
  vertical `sale`, categories pillar `sale` (livestock, hay & fodder, grain &
  stock feed, machinery, vehicles & trailers, fencing & steel, water &
  irrigation, other), `sale_details` (price in cents + price type, quantity +
  unit, condition, pickup/delivery, sold_at). `/post/sale`, `/sale` browse
  with category filter, `/sale/[slug]` detail, owner edit, header/footer/
  sitemap wiring (hidden while empty), post hub card, home hero link. First
  party only; no payment, no commission; contact details sign-in gated like
  everything else. `lib/sale.ts` price helpers are tested.
- **Forecasting join** (migration 20260906120000): `sales_by_postcode_monthly`
  (aggregate orders + revenue per postcode per month, staff read) fed by
  `/dashboard/admin/sales-upload`, which takes the raw Shopify "Export
  orders" CSV or an aggregated sheet and collapses it in the browser (no
  names, emails or order ids are sent). The demand report now shows sales
  next to demand by region and by month, with green rows where farmers ask
  but nothing has sold. Shopify's own analytics can produce the same numbers
  (ShopifyQL: `FROM sales SHOW orders, net_sales GROUP BY shipping_postal_code
  TIMESERIES month`). **Sync cron built** (`/api/cron/shopify-sales-sync`,
  Sunday 20:00 UTC, before the digest): env-gated on `SHOPIFY_STORE_DOMAIN`
  + `SHOPIFY_ADMIN_TOKEN` (Admin API token with `read_reports`); returns
  `not_configured` until set; `?dry=1&k=CRON_SECRET` fetches and parses
  without writing. Untested against a real token: run the dry mode first.
- **Code review pass (evening):** ten-angle review of the day's diff found
  and fixed: `events`/`search_queries` vertical checks rejected `sale` (all
  for-sale analytics were silently dropped); follow-up email timed from
  submission instead of forwarding, now its own cron
  (`/api/cron/enquiry-followups`, daily) with a consent cut-off; one-click
  outcome links now land on a confirm page so mail scanners can't answer;
  cron routes fail closed in production without `CRON_SECRET`
  (`lib/cron-auth.ts`); PostgREST 1000-row caps replaced with counts;
  legal-concern links know `/sale`; sale price capped at $20M (int4);
  Shopify CSV zips with a leading apostrophe; demand months bucketed in
  Australia/Sydney with grouped joins; digest gap labels sanitised; shared
  `escapeHtml`, `listingHref`, `formatAud`, `upsertSalesRows`. Skipped on
  purpose: consolidating the nine inline staff gates onto
  `getStaffAccess()` (safe as-is; do it when PR #17's access model lands).
- **Local defect review (evening):** ran the production build locally
  (`.claude/launch.json` → `prod-build` on :3100; needs the public
  Supabase URL + anon key in `.env.local`, no service role) and curled all
  21 public/guarded pages: every one answered as designed. Fixed what the
  pass found: category page `<title>` was the raw slug ("fencing
  contractor"), now the pluralised label ("Fencing contractors") with a real
  description; no page emitted `<link rel="canonical">`, so
  `?postcode=` filters were duplicate URLs to crawlers, now every public
  page has one; empty-state grammar on /sale and /jobs. Smoke suite 7/7 on
  the local build. Note for anyone running it locally: the legacy-slug
  redirect and the admin pages need `SUPABASE_SERVICE_ROLE_KEY`, which
  stays off this machine.
- **Smoke tests on every deploy** (`tests/e2e/smoke.spec.ts`, Playwright):
  read-only checks of the farmer path on a real URL: home finder, category
  page, region chip, listing detail with the quote door, unclaimed honesty
  (notice shown, no contact block, operator offer disclosed), empty verticals
  not broken, staff/admin pages bounce to sign-in, robots + sitemap, old-slug
  redirect. `.github/workflows/smoke.yml` runs it against each Vercel
  deployment URL (`deployment_status` event) and on demand; locally
  `npm run test:e2e` (optionally `SMOKE_BASE_URL=…`). Never submits a form.
  Its user agent says HeadlessChrome so analytics counts it as a crawler.
- **Demand by region** (`/dashboard/admin/demand`, `admin_demand_by_region()`):
  quote requests + job requests + located human searches per region and
  category against live supply, monthly totals, and the gaps (demand, no
  supply). This is the planning view Josh asked for; it fills as enquiries
  and requests arrive.

Gate at end of session: `npm test` (28 unit tests), `npx tsc --noEmit`,
`npm run lint` 0 errors, `npm run build` all pass. The smoke suite passed
against production except for the two pages that don't exist there until
the next push (`/sale`, `/dashboard/admin/sales-upload`), which is expected.

## Josh's actions, in order

1. **Push** (`git push origin main`), watch the Vercel build go READY.
2. **Claim Outback Fencing** through the real UI: sign in as admin →
   `/services/rural-supplies` → the Outback Fencing listing → "Claim it" →
   `/dashboard/admin/claims` → approve. Screenshot each step: that's the
   invite-campaign how-to asset. Register the free `ABR_GUID` the same
   afternoon and run ABN verification on it.
3. **Supabase Auth dashboard:** turn on leaked-password protection (still the
   only WARN the advisors can't clear from SQL).
4. **Vercel env:** `FROM_EMAIL=Outback Connections <help@outbackconnections.com.au>`
   (Resend DNS was verified 4 Jul). Redeploy.
5. **Vercel Web Analytics:** enable it on the project (it's off, so UTM
   attribution for Jess's Facebook push has nowhere to land).
5b. **Shopify token (optional, replaces the monthly CSV upload):** in Shopify
   admin create a custom app with the `read_reports` scope, then set
   `SHOPIFY_STORE_DOMAIN` (the myshopify.com domain) and
   `SHOPIFY_ADMIN_TOKEN` in Vercel and hit
   `/api/cron/shopify-sales-sync?dry=1&k=CRON_SECRET` to check it parses.
6. **Decide PR #17** (who does outreach: Ali only via admin, or Jess + Daryl
   with scoped access). If yes, its release gate is a disposable Supabase
   branch run of the SQL suite, then apply, merge, deploy, grant.
7. Tell Ali: use **Add a directory entry** (dashboard card), never "Post a
   listing", for businesses that aren't ours. See `docs/OUTREACH-RUNBOOK.md`.
8. **Ali owns the enquiry queue and outreach** (she has staff access now).
   Walk her through `docs/OUTREACH-RUNBOOK.md` once; the queue is
   `/dashboard/admin/enquiries`, mirrored to the help@ inbox.
9. **Jess posts from `docs/FACEBOOK-KIT.md`**, one region at a time, only
   regions with contractors listed, always with the UTM link.

## Decisions locked 4 Jul 2026 (Josh, binding, unchanged)

1. Traction gate = 25 organic human searches/week + 5 claim submissions +
   10 first-party posts within 30 days of Jess's FB push. Now readable at
   `/dashboard/admin/analytics`. Diagnosis on a miss: searches-without-claims
   = claim-flow problem; claims-without-posts = posting friction; nothing =
   distribution didn't land.
2. UTM discipline: every link Jess posts carries
   `utm_source=facebook&utm_medium=jess_organic`.
3. Syndicated ratio (Adzuna) < 4× first-party jobs, enforced in code. Moot
   while Jobs is empty.
4. First-touch rule for the NSW list: stores get the clip-gun pitch first;
   contractors/services/farms get the claim invite; nobody gets two cold asks.
5. Directory freshness = calendar, not code: first Monday monthly, re-run the
   ingest (idempotent). No automated re-sighting. The new 7-day expiry digest
   is a reminder, not automation.
6. JSON-LD rule: JobPosting only on first-party job ads.
7. Claim Outback Fencing as listing #1 (entry now exists; claim is yours).

## The long game (Josh, 6 Sep): useful for thousands, then worldwide, 10k daily users

Farmers stay free forever and the "no lead fees" promise on the home page is
kept. Revenue comes from businesses and aggregate data, in this order:
Outback Fencing's own supply sales via the disclosed trade offer (now);
featured/boosted business listings once a region + category has competition;
a paid verified/pro business profile (ABN badge, photos, service area,
enquiry routing, their own enquiry stats); aggregate demand data, never PII.
Growth is region by region, category by category, seeding before promoting.
Every enquiry on an unclaimed row is a claim pitch; every claimed business
shares its own page. Country packs (`country_code`, `regions`) make NZ/US
config, not rewrites. The demand-by-region report is the forecasting tool;
next step is correlating it with Shopify orders by postcode.

## Next sprint candidates (not started)

- Scrape more fencing contractors across NSW with `scripts/scrape-rural-directory.mjs`
  + `scripts/filter-scraped-types.mjs` (spends Outscraper credits; confirm budget),
  then CSV/JSON import. Regional pages fill themselves as rows arrive.
- Tests for `lib/adzuna.ts` ratio logic and `lib/signed-tokens.ts` (need env
  stubs); a Playwright smoke test of the claim flow once the first claim exists.
- Branch protection on `main` requiring the CI check (GitHub settings).
- Vercel Web Analytics events for `trade_cta` clicks once analytics is enabled.
- The outback-ops frozen branch `cba4056` is still waiting for its
  independent review (other repo).

## Email sender

Transactional mail still sends from `support@outbackfencingsupplies.com.au`
until `FROM_EMAIL` is switched (action 4). Reply-to and site copy already say
`help@outbackconnections.com.au`.

## Resume order

1. `AGENTS.md` — the rules.
2. `SPINE-BUILD.md` — architecture + gate status.
3. This file.
4. `docs/OUTREACH-RUNBOOK.md` — how staff use the directory + outreach tools.

`PLAN-MARKETPLACE.md`, `PLAN.md`, `docs/JOBS-INGESTION-PLAN.md` are historical.
