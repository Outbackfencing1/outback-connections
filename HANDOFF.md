# HANDOFF

Date: 2026-09-06 (previous: 2026-07-04)
Branch: `main`. Live: https://www.outbackconnections.com.au

**Local-only / UNPUSHED commits awaiting Josh's push** (his global Claude
setting `Bash(git push *)` deny blocks agent pushes): everything after
`49eb53d` (PR #16). Push = Vercel production deploy. After pushing, confirm the
build goes READY and spot-check `/services`, one fencing listing, and
`/dashboard/admin/analytics`.

```bash
git push origin main
```

All database migrations from this session are ALREADY APPLIED to the live
project. The code that uses them is what's waiting on the push. Until pushed,
the live site runs PR #16 code against the new schema, which is compatible
(new columns have defaults; new functions are unused by old code).

---

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
- **Tests**: vitest, 13 unit tests over the pure libs; `npm test` in CI.

Gate at end of session: `npx tsc --noEmit` clean, `npm run lint` 0 errors,
`npm run build` passes (see the commit log for the exact run).

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
6. **Decide PR #17** (who does outreach: Ali only via admin, or Jess + Daryl
   with scoped access). If yes, its release gate is a disposable Supabase
   branch run of the SQL suite, then apply, merge, deploy, grant.
7. Tell Ali: use **Add a directory entry** (dashboard card), never "Post a
   listing", for businesses that aren't ours. See `docs/OUTREACH-RUNBOOK.md`.

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
