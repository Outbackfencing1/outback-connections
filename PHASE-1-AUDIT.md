# PHASE-1-AUDIT.md

**Version:** 1.0 · **Date:** 2026-04-25
**Subject:** Outback Connections marketplace, Phase 1 MVP, live at https://www.outbackconnections.com.au
**Mood:** Pre-launch. Honest. Not polite.

---

## 1. Schema & data capture

### (a) What's there
- `listings` master with kind / status / category / user / slug / postcode / contact / flag_count / policy_version_id, plus `created_at`, `updated_at`, `expires_at`.
- Three detail tables (`job_details`, `freight_details`, `service_details`) with kind-specific typed enums.
- `listing_flags` with reason + note + UNIQUE (listing_id, flagged_by).
- `user_profiles` extending `auth.users` (1:1, ON DELETE CASCADE), with `is_admin`, `flag_count`, plus latent `phone_verified_at`, `abn`, `abn_verified_at`, `abn_entity_name` columns waiting for Phase 2.
- `categories` with pillar + 37 active rows. `policy_versions` for consent stamping. `regions` table exists.
- Indexes: `(kind, status, postcode, created_at desc)`, `(kind, status, category_id, created_at desc)`, `(user_id)`, `(status, expires_at)`, plus PKs and unique constraints on slug and anonymised_id. Reasonable for V1 scale.
- RLS: anon reads active+unexpired, owners read/write own, service-role all. Detail tables gate on parent listing readability via EXISTS.

### (b) What's missing or weak
- **No `time_to_fill` / `closed_at` / `closed_reason`.** A listing goes from `active` → `expired` (cron) or → `deleted_by_user`. We capture neither "got matched" vs "ran out of time" nor "the poster actively closed it because they filled it." This is THE most important data point for forecasting and you have zero of it. Cheap to add now (one column + a "Mark as filled" button), expensive to retrofit because users won't go back and tell us.
- **No `view_count` / `contact_reveal_count`.** When someone signs in to see contact details, that's a high-intent event. We don't log it. Without it, you can't tell which categories convert.
- **No user role / poster type.** The schema treats every user as identical. Nothing distinguishes "this person mostly posts jobs" from "this person mostly offers services." A `primary_role` field on `user_profiles` (job_poster / service_provider / freight_user / mixed) populated on first post would save a lot of analytics later.
- **No seasonal markers.** Harvest season, shearing season, mustering windows, fire/spray windows — this data is the entire point of the Outback Ops forecasting bet. A `season_hint` enum or even just `posted_in_month` (derivable but indexable) is missing. Add one column now: `season_hint text` populated from the posting form via a "When does this run?" question.
- **No `material_type`.** Was on `help_requests`, dropped for marketplace. For services like fencing or building, knowing "treated pine vs steel vs steel post + ringlock" matters for OF inventory forecasting. Add to `service_details` as nullable text.
- **No `repeat_use` signal.** First post / 5th post / 50th post isn't trivially queryable without a count. `user_profiles.listings_posted` integer maintained by a trigger would speed up the admin queue and the future Established badge.
- **`regions` table is empty.** Every public listing renders "Postcode 2800" instead of "2800 NSW". State filtering can't work. Populating with a public AU postcode dataset is one Saturday.
- **`contact_email` / `contact_phone` aren't normalised.** Phone is `max(40)` text — accepts "abc def" and "+61 4 0000 0000". No E.164 format. Email isn't lowered. Going to be hell when we want to detect "the same scammer posting 30 listings with the same phone".
- **Description has no separate "what" / "where" / "when" structure.** It's free text. Search and analytics on it will be limited. Phase 2 problem; flag now.
- **No `parent_listing_id`** for renewals. When listings auto-expire and someone re-posts, we lose the link. Adding a nullable `renewed_from_id` column would let us answer "how often do listings actually fill?" — see point #1.
- **`user_profiles_public` view has `security_invoker = false`.** Anon can read display_name+user_id for any profile. Mostly fine but enables user_id enumeration. Low-impact for now; flag for Phase 2.

### (c) What's risky
- The biggest risk is **strategic, not technical**: you're shipping the system you'll build the rural-data product on, and the system doesn't capture outcomes. Six months in, you'll have 5,000 listings and zero way to say "39% of fencing requests in the Riverina filled within 14 days."
- Email/phone format laxity is a moderation risk. A scammer ring rotating spaces and unicode lookalikes in their phone number defeats simple equality joins.
- No FK from `listings.policy_version_id` to anything immutable — `policy_versions` rows can theoretically be updated by service-role. They shouldn't be. Lock them down or add a check.

### (d) What I'd do — TOP 3 RECOMMENDATIONS
1. **Add outcome capture.** New columns on `listings`: `closed_at timestamptz`, `closed_reason text check in ('filled_via_platform','filled_elsewhere','no_longer_needed','expired','withdrawn','admin_hidden')`. A "Mark this as filled" button on `/dashboard/listings` dropping a small modal asking which reason. Without this you have a marketplace that can't measure itself.
2. **Populate `regions` from an AU postcode dataset.** It's a one-shot CSV import, ~16,000 rows. Unlocks state display, state filtering, and any future "demand by state" reporting. Today this is invisibly broken.
3. **Add `season_hint` + `view_count` + `contact_reveal_count` columns now while listings table is small.** Adding columns later when there are 10,000 rows + active users is fine technically but a pain to backfill semantically.

---

## 2. Auth & account management

### (a) What's there
- Supabase Auth, magic-link email OTP via `@supabase/ssr`. PKCE flow, server-rendered.
- Server-side session refresh via `middleware.ts → updateSession`.
- `handle_new_user` trigger auto-creates `user_profiles` row on `auth.users` insert. No orphan-profile state possible.
- Account deletion: `supabase.auth.admin.deleteUser()` then FK cascade through user_profiles → listings → detail tables → listing_flags. Phrase-confirmation gate ("delete my account") on `/dashboard/settings`.
- 7-day account-age guard in `lib/posting.checkPostingGuard`. Email-verified guard too.

### (b) What's missing or weak
- **Magic-link only is a real friction problem.** 60+ year-old farmer on patchy 3G needs to: (1) type email on phone, (2) wait for email, (3) leave the browser tab open, (4) go to email app, (5) tap link, (6) trust the link redirects back. Five friction points. Industry standard for similar audiences (Gumtree, eBay, AgGate) is password + magic link + social. You're at 1 of 3.
- **No password fallback path.** When you add it: `supabase.auth.updateUser({ password })` from the dashboard works. Don't rebuild — just add. Schema supports it via `auth.users.encrypted_password`. Plan this now; don't write it now.
- **No SMS OTP path.** Same — Supabase Auth supports it, just needs Twilio or similar SMS provider configured in dashboard. Phase 2.
- **The 7-day age guard is unusual.** hipages doesn't do it. Airtasker doesn't do it. It WILL filter out 30-50% of legitimate signups who land + try to post immediately. Worth A/B-testing at lower thresholds. Industry common: phone-verify or paid trust signal. The age gate alone is unusual and may cost real users.
- **No password reset flow** — moot for OTP-only but becomes relevant the moment passwords are added.
- **No "didn't get the magic link?" recovery surface.** If Supabase Auth rate-limits the user (3 OTPs in 5 min), they hit a wall and may bounce. The signin page doesn't explain this.
- **Unverified-but-signed-up users sit forever** in `auth.users` with `email_confirmed_at` null. They never sign in (can't), never post (gated). No cleanup job. Will accumulate.
- **No email change flow.** A user who joined with their old email has no way to change it without deleting and re-creating (and losing their listings).
- **`is_admin` lives on `user_profiles` — fine — but there's no UI to grant or revoke it.** You flip your own via direct SQL. If you ever onboard Jess as admin, same path. Acceptable for V1.

### (c) What's risky
- Magic-link rate-limiting (Supabase default: 3 per 5 min, 30 per hour) interacts badly with shared inboxes and forwarding. Some rural couples share an email; both signing up at once could lock the other out for hours.
- The `getUser()` call in middleware refreshes tokens server-side, which is correct, but every request hits Supabase Auth API. At 50k visits in a Jess-promo-spike, that's 50k auth API calls. Supabase Free Tier limits will bite. Already on paid tier so probably fine, but worth knowing.

### (d) TOP 3 RECOMMENDATIONS
1. **Add password fallback before public launch.** Half a day of work. Two extra inputs on /signup, one on /signin. Rural-skewed users won't tolerate magic-link-only.
2. **Reduce account age guard from 7 days to either 24 hours OR replace with phone verification.** Default 7 is friction with no proven payoff. Test one of: (a) drop to 1 day, (b) drop to 0 + add phone OTP, (c) keep but add an "exception via support email" path.
3. **Build an /unverified-cleanup cron** that deletes auth.users where `email_confirmed_at` is null and `created_at < now() - interval '14 days'`. Stops accumulation, costs nothing.

---

## 3. Posting flows

### (a) What's there
- Four flows: `/post/job`, `/post/freight`, `/post/service/offering`, `/post/service/request`.
- Server actions with Zod validation; ActionResult pattern returns errors map per field; client form scrolls to first error.
- Honeypot: `website` hidden field with off-screen styling, server checks via `honeypotTripped()`. Tested and working.
- Rate limit: per-user 5 posts in 24 hours via `checkPostingRateLimit` — uses `listings.user_id` count, no separate counter table.
- Posting guard: checks signed-in + email verified + account age ≥ 7 days. Re-checked server-side in actions (not just at page render).
- Edit reuses the same form components with `defaults` prop. `editListing` action is polymorphic on `listing.kind`. Slug, anonymised_id, created_at, and expires_at are not modified by edits. ✓
- Insert is two-step (listings, then detail) with rollback-on-failure (delete the orphan listing). Not a real transaction — documented.

### (b) What's missing or weak
- **Postcode validation is regex-only (`\d{4}`).** Doesn't reject 0000 or 9999 (not real AU postcodes). With `regions` populated, a quick existence check catches typos. Tiny win, big UX uplift.
- **Phone is unvalidated text up to 40 chars.** Anything goes. Should at minimum strip non-digits and check length 8-12 for AU. Better: use a proper E.164 normaliser (libphonenumber-js, ~50kB but worth it).
- **Email isn't lowered or trimmed.** `Bob@Example.COM` and `bob@example.com` are different in our DB. Normalise on insert.
- **Pay/rate caps at $99,999.** Real services can hit $200k+ (helicopter contracts, contract croppers). Bump to `999,999.99` minimum.
- **No draft-saving.** A user types a long description, accidentally navigates away, comes back to a blank form. No `status='draft'` flow exists despite the column being in the enum. For mobile users on patchy signal this is a real loss.
- **No "renewed from" link.** When someone reposts an expired listing manually, history disconnects.
- **Edit doesn't extend expiry.** This is intentional but undocumented to the user. If they edit on day 28, they still expire on day 30. They might expect "edit = refresh."
- **Honeypot is a single field.** Sophisticated bots might learn the pattern. Adding a min-time check (form rendered → submitted < 2 sec is suspicious) would be cheap.
- **Rate limit only on listings table.** A user could spam-edit (UPDATE) the same listing 1000 times — no rate limit on edit.

### (c) What's risky
- **The 5-posts-per-24-hour limit doesn't apply to admin or service-role.** That's correct, but if `is_admin` is ever flipped wrong, an admin account could mass-post.
- **Slug collisions are statistically unlikely but possible.** `gen_short_id` produces 40 bits of entropy → birthday collision at ~1M listings. With slug = title-postcode-shortid, the title/postcode reduces collision risk further. Fine for V1, watch at scale.
- **`policy_version_id` is hardcoded to "latest combined or privacy" at post time.** If that policy is later updated and the user's listing remains, the listing's stamped version is correct (immutable record) — good. Just confirm `policy_versions` rows are never UPDATEd in operations.

### (d) TOP 3 RECOMMENDATIONS
1. **Add postcode existence check** (after `regions` is populated). Server action validates that `regions.postcode = data.postcode` exists and surfaces "we don't recognise that postcode — double-check?" Fast, prevents typos from going public.
2. **Normalise email + phone on insert.** Lower-case email, strip-and-format phone to "0X XXXX XXXX" or "+61 X XXXX XXXX". One regex each. Pays off massively for moderation later.
3. **Bump pay/rate cap to 999,999.99.** Five-second migration. Avoids losing real listings later.

---

## 4. Browse & discovery

### (a) What's there
- `/jobs`, `/freight`, `/services` (landing + category grid + 5 most recent), `/services/[category-slug]`.
- Filters: postcode prefix (LIKE 'X%'), category, pay_type (jobs), direction (freight, services), vehicle_type (freight).
- Pagination 20/page.
- Listing cards with title, kind badge, category, postcode, relative time, 160-char teaser. Contact info gated.
- `metadataBase` set in layout so OpenGraph URLs resolve correctly.
- Sitemap + robots present.

### (b) What's missing or weak
- **Postcode prefix is the wrong UX for the cross-region case.** "I'm in 2800, I'd take work in 2870" — the user has to know to type "2" or "28" and broaden. They won't. Either offer "nearby postcodes (within Xkm)" using a postcode→lat/lon table, or at minimum "search by state" as a top-level option.
- **State derivation is broken.** `regions` is empty. Every listing shows "Postcode 2800" with no state. State filter would also be useful but isn't even an option.
- **No structured data (JSON-LD).** Job listings should emit `JobPosting` schema. Service listings should emit `LocalBusiness` or `Service` schema. Without this, Google rich results never trigger and you compete on plain HTML against sites that emit them. Big SEO miss for a marketplace.
- **Detail page `<title>` uses the slug, not the listing's actual title.** `station-hand-mudgee-2850-LSTABCD — Jobs — Outback Connections` is what's in `<title>` because `generateMetadata` only has `params.slug`. To fix, fetch the listing in `generateMetadata` and use `listing.title`.
- **No meta descriptions on detail pages.** Just the title. Search results will look bare.
- **No OG images.** Social sharing renders without preview.
- **No canonical URLs.** If you ever add filter-state in URL, search engines see "/jobs?postcode=2800" and "/jobs" as separate pages.
- **No "nearby" or "expanding radius" search.** Without this, a search in low-volume postcode returns "no results" and the user bounces. They should see "no results in 2800 — 4 listings within 100km".
- **Empty state on filtered browse is good** ("No jobs match the filters") but doesn't suggest broadening (e.g. "remove the category filter to see X more").
- **No pagination meta tags** (`<link rel="prev" / "next">`) — minor SEO miss.

### (c) What's risky
- **SEO is the long-term moat for a marketplace** and you're shipping with about 60% of the basic boxes ticked. The first 6 months of listings will not be indexed well. Compound interest goes the wrong way.
- **The "search a postcode in 2800, get 0 results, leave" path** is the single biggest browse-side conversion killer. Without nearby-search or state-broadening, the empty-postcode-result will be the most-hit error in your funnel.

### (d) TOP 3 RECOMMENDATIONS
1. **Fix detail-page title tags + add JSON-LD JobPosting / Service / LocalBusiness schema.** Half a day of work, compounds for months. SEO is one place where you build more equity by month than you can spend.
2. **Populate `regions` from a postcode CSV** (Australia Post has free downloads, or use a community CSV). Unlocks state display, state filter, and the next item.
3. **Add postcode-radius search** — even a crude "first two digits match" expansion would help. If you have lat/lon in regions, even better. The "0 results" wall is the conversion killer.

---

## 5. Moderation & safety

### (a) What's there
- Flag button on detail pages, signed-in non-owners only, 5 reasons + optional note.
- `listing_flags` table with UNIQUE (listing_id, flagged_by) — one flag per user per listing.
- Trigger bumps `listings.flag_count` on insert.
- Admin queue at `/dashboard/admin/flags`, gated on `user_profiles.is_admin`.
- Admin actions via SECURITY DEFINER RPCs (`admin_hide_listing`, `admin_clear_flags`) that re-check is_admin server-side.
- `status='hidden_flagged'` removes from public browse via the existing RLS (which only matches `status='active'`).

### (b) What's missing or weak
- **Sock-puppet flagging is unmitigated.** Email-verify is the only signup gate. A competitor with 10 throwaway emails can stack 10 flags on a rival listing. Each flag is from a different `flagged_by` so the UNIQUE constraint doesn't help.
- **No flag rate limit per user.** A user could submit 50 flags in a minute, harassing every listing in a category.
- **No cooldown between flagging.** Same.
- **No profanity / abuse filter on listing text.** Title, description, contact_best_time are all free text. A user could post a listing called "F\*\*\* the [ethnic slur] tradies" and it would render publicly. No safety net before a flag arrives.
- **No detection of unflagged scams.** Same phone number across 5 listings posted within 24h is not detected. No alert.
- **No detection of email/phone reuse from flagged users.** When you ban a user, their listings cascade-delete, but a new account with the same phone number can immediately repost. No deny-list.
- **No image moderation** because there are no images yet — but Phase 2 photos = a whole new attack surface.
- **No appeal flow.** If you hide a listing wrongly, the owner sees `hidden_flagged` in their dashboard but no way to dispute it. They'd email support — which works, but ad-hoc.
- **Flag retention.** When a listing is deleted, flags cascade-delete. When an account is deleted, flags they submitted cascade-delete. Good. But "this guy is a known scammer" institutional memory dies with the account. A sanitised `incidents`-style log of past hidden listings (just kind, postcode, category, hide reason — no PII) would help future moderation.
- **No public stats** — even a "X listings active, Y posted this month" footer would build trust and isn't anywhere.

### (c) What's risky
- **Sock-puppet flagging is the realistic harassment vector.** Every marketplace gets it. Not implementing protection now is a launch risk.
- **Defamation exposure on flag reasons.** "scam" or "offensive" attached to a real ABN-holder's business name, stored even just internally, could surface in discovery if you ever get sued by a ban-listed business. Retention policy + a "flags are reviewed and may be deleted if unsubstantiated" clause in Terms would help.
- **No abuse pipeline for the contact-on-listing channel.** Once a user signs in, sees contact, harasses the lister off-platform — we have no record, no way to help.

### (d) TOP 3 RECOMMENDATIONS
1. **Add per-user flag rate limit (e.g. 5 flags / 24 hours).** Same pattern as posting rate limit. One small migration, blocks the most basic harassment vector.
2. **Add a daily-cron job that detects "same phone or email across N+ active listings"** and surfaces them in the admin queue. Phase 2 candidate but easy.
3. **Add a basic profanity filter (server-side word list)** rejecting submissions with hate speech / explicit terms. Not perfect but cheap and signals seriousness. There are free Australian English word lists.

---

## 6. Mobile experience

### (a) What's there
- Mobile-first Tailwind, server-rendered pages, no hamburger (always-visible stacked nav for zero-JS).
- ~96-98 kB First Load JS shared. ~64 kB middleware. No images on listings (no img bloat).
- No client-side routing for browse/detail (all server-rendered).
- Form inputs use `inputMode` and `type="tel" | "email" | "number"` for the right mobile keyboard.

### (b) What's missing or weak
- **Tap-target sizes on filter form labels** look small (`px-3 py-1.5` ≈ 28px tall). Apple HIG and WCAG suggest 44×44 minimum. The "Filter" submit button is fine, the dropdowns are fine, the text inputs are fine — labels themselves aren't tap targets so OK. Likely passes audit but worth measuring.
- **No actual Lighthouse audit in this report.** I'd want one against the live URL. Best guess: Performance ~85-95 on 3G (no images is huge), Accessibility ~90 (server-rendered forms have proper labels), SEO ~70-80 (missing JSON-LD, missing meta descriptions on detail pages), Best Practices ~95.
- **Mobile nav is "always visible stacked"** which is fine on a single-row narrow nav but starts wrapping awkwardly when signed in (Services / Jobs / Freight / Post / Dashboard / Sign out → wraps to 2 lines on 360px screens). A hamburger or grouped "Account" dropdown would clean this up. Ironic given I built it as no-JS deliberately.
- **No skeleton or loading states.** Server-rendered means usually fine, but submitting a post form on slow 3G shows a spinning button text ("Posting...") with no other feedback. Fine.
- **No image optimisation infrastructure.** When Phase 2 adds listing photos, you'll need `next/image` + Supabase Storage + automatic resize. Not built; flag.
- **No PWA / installability.** A "Save to home screen" button on mobile would help repeat visits. Phase 2.
- **Touch handling on the OwnerActions delete confirm uses `window.confirm()`** — works on iOS and Android but feels jank. A better confirmation modal is Phase 2.

### (c) What's risky
- **The cumulative mobile experience hasn't been smoke-tested under throttled 3G**. Build size suggests it'll work but I haven't measured.
- **The bundle size of `@supabase/ssr` is the biggest cost** in the middleware (~62 kB). Every request runs middleware. On 3G first contact, that's ~1.5s of cold middleware download. Fine on subsequent visits (cached) but the first load matters.

### (d) TOP 3 RECOMMENDATIONS
1. **Run a real Lighthouse mobile audit** at https://pagespeed.web.dev/?url=https://www.outbackconnections.com.au and fix anything with score <80. I haven't run it because I don't have the tool — you should.
2. **Re-design mobile nav** when signed in. 5+ items in a flex-wrap row on 360px is messy. Either group "Account" into a popover (needs JS) or accept the wrap and be deliberate about order (most-used first).
3. **Add `loading="lazy"` to any future images and decide a Supabase-Storage + `next/image` pattern now** before the first listing photo lands.

---

## 7. Legal & compliance

### (a) What's there
- `/privacy` and `/terms`, version-stamped `v2-2026-04-23-marketplace-draft`, working-draft banner pointing to support email.
- COI disclosure on homepage hero, every footer, /about page.
- Account deletion is immediate cascade; clearly stated in ToS.
- Consent stamping: `policy_versions.id` recorded on every `listings` row.
- APP-aware language ("we don't sell data", retention periods, deletion path) but not certified.

### (b) What's missing or weak
- **Privacy/ToS need a real lawyer pass.** Specific items:
  - **Limitation of liability** clause is loosely worded ("to the extent the law allows"). A lawyer will tighten this against ACL and Trade Practices Act exclusions.
  - **User-content licence.** When someone posts a listing, do you have a perpetual licence to display it after they delete their account? After expiry? Currently silent. Default in AU = no licence beyond the immediate purpose, so you have to delete on request — which you do, but there's no carve-out for moderation records. Add one.
  - **Third-party content/UGC immunity.** Australia's Voller line of cases makes platforms liable for user content unless protected by a clear ToS structure + active moderation policy. Lawyer needs to draft the safe-harbour positioning.
  - **Defamation indemnity from posters to platform.** If a poster names a contractor in a description that turns out to be defamatory, the platform is downstream-liable. Indemnity clauses are standard but need a lawyer.
  - **Jurisdiction + dispute resolution** ("NSW law") is fine; ACL non-derogation works but should be more explicit.
- **APP "right to access" not implemented.** A user can see their own listings and profile in `/dashboard`, but can't request a data export. Privacy Act doesn't mandate self-serve UI but does mandate response-on-request — currently handled by support email which is fine if the SLA is real.
- **No documented response time for privacy requests.** The Privacy Act expects "reasonable" — typically 30 days. Privacy notice doesn't commit to one. Lawyer will add.
- **No breach response plan** documented anywhere. If Supabase has an incident, what do you do? Notifiable Data Breaches scheme requires notification within 72 hours. No runbook exists.
- **Spam Act readiness for future emails:**
  - You're not sending any user emails right now (good, no exposure).
  - When you do (renewal reminders, flag notifications), you'll need: (a) consent at signup, (b) accurate sender ID, (c) functional unsubscribe in every commercial email. Privacy notice covers (a) implicitly. Sender ID is fine. Unsubscribe — not built.
  - Magic-link emails are transactional, not commercial — Spam Act exempts them. Don't conflate.
- **Defamation exposure on flag data.**
  - Flag with reason='scam' attached to a real ABN holder's listing IS a record of a defamatory imputation, even if private. In discovery, that record is evidence.
  - Mitigation: retain flags only as long as needed, document a clear deletion policy, keep moderation records sanitised.
  - Currently flags persist until parent listing or flagger account is deleted. No periodic flush.

### (c) What's risky
- **Going live with unreviewed legal pages is the main legal risk.** "Working draft" banner is a holding pattern, not a defence.
- **Defamation. Always defamation.** Every flag with `reason='scam'` is a candidate.

### (d) TOP 3 RECOMMENDATIONS
1. **Get the lawyer pass before public launch (Jess's Facebook post).** Specifically need: liability limitation tightening, user-content licence + indemnity, UGC immunity / safe-harbour, defamation provisions, breach-response acknowledgement.
2. **Document the data-request flow.** Add a section to the privacy page: "Email support@..., we respond within 30 days. We can supply: a copy of your account data, a list of your active and past listings, a list of flags submitted by you. We cannot supply: flag data submitted about your listings (privacy of the flagger)."
3. **Add a flag-retention policy.** 12 months from listing deletion, then anonymised aggregate only. Bake into a cron job.

---

## 8. Strategic & growth blockers

### (a) The single biggest reason this could fail after launch
**Cold-start liquidity, full stop.** Day 1: empty marketplace. Day 7: 12 listings (Jess's mates). Day 30: 80 listings, 4 of them filled. Day 90: still mostly empty in most postcodes. Anyone landing from Jess's Facebook post sees a ghost town in their region (because Australia is huge and 5,000 listings spread across 16,000 postcodes is 0.3 per postcode on average).

The pattern that kills rural marketplaces specifically: posters post once, see no responses, don't come back. Browsers visit once, see nothing in their region, don't come back. Both sides quit before there's enough density to form a useful match.

The countermeasures that actually work:
1. **Pick a single region and saturate it** (e.g. Central West NSW, where Outback Fencing has the densest customer relationships). Don't try to cover Australia from day 1.
2. **Manually onboard 50-100 quality service-side listings** before the public-facing launch. "We launched and there's already 80 specialists" is much stickier than "we launched and the page is empty."
3. **Email-notify nearby service providers when a new request lands in their region.** Phase 2; currently you can't because there's no notification system.

### (b) What would surprise me to know about my own product
- **`regions` is empty in production.** Every listing displays as postcode-only. State filtering doesn't work. Audit-reading-Josh might want to look at this today.
- **Detail-page `<title>` tags are slugs**, not listing titles. Search results will display "station-hand-mudgee-2850-lstabcd — Jobs — Outback Connections" not "Station hand wanted, Mudgee — Outback Connections."
- **The 7-day account-age guard is unusual** and probably costs you 30%+ of legitimate would-be posters.
- **Pay rate is capped at $99,999** — real services will breach this.
- **There's no `closed_at` / outcome capture**, so the entire Phase 3 "data products" plan is built on data you're not collecting.
- **`@supabase/ssr` middleware runs on every non-static request** — that's more Supabase Auth API calls than you might expect at scale.
- **Listing edit doesn't extend expiry.** If you edit on day 28, it still expires on day 30. Users won't intuit this.

### (c) Easiest weakness for a competitor to attack
- **Trust signals.** hipages would say: "we verify ABNs, we have reviews, we screen tradies — Outback Connections is wide-open." Without your Verified badge launched, you can't counter this.
- **SEO.** A competitor with proper JSON-LD JobPosting schema will rank above your job listings on Google for "station hand mudgee" within a year.
- **Region density.** A competitor focusing on one state and saturating it would win that state's specific searches.
- **Operational maturity.** "We have a phone number, they have an email" — Outback Fencing's existing phone presence is an asset; the marketplace doesn't surface it.

### (d) What I'd want to add that I haven't thought to add
- **A public stats footer.** "X active listings, Y posters this month" builds trust on day 1 if you start with 50 manually-onboarded service listings.
- **An RSS feed per category.** `/services/bore-pump-water/rss.xml` — niche professionals subscribe in Outlook and get notified. Zero-effort retention for the rural specialist audience.
- **A "near you" badge on the homepage.** Geolocate by IP, "X new listings near 2800 this week." Even crude IP-based geolocation is enough.
- **Browser bookmarks + share links.** Every listing should have OG image + Twitter card meta so when someone WhatsApps a listing to their mate, the preview looks professional.
- **A simple analytics signal.** Even just "this week 12 listings posted, 3 service requests, 4 freight needs" emailed to you weekly. Without anything you're flying blind.
- **An auto-suggest postcode field** that hits `regions` and suggests the LGA. "2800 → Orange (Central West NSW)". Friction reducer.

---

## BIG PICTURE

### 5 things to fix BEFORE public launch (Jess's Facebook post)

1. **Lawyer pass on /privacy and /terms** — non-negotiable. Without this, Jess's post is a defamation-exposure event waiting to happen.
2. **Populate `regions`** from an AU postcode dataset. Unlocks state display + nearby search + better SEO. One Saturday.
3. **Fix detail-page SEO** — title tags using listing.title, meta descriptions, JSON-LD schema for jobs and services. SEO compound interest starts the day you're indexed.
4. **Manually seed 50-100 quality service listings** in the Central West NSW region you'll target first. Empty marketplaces don't convert. This is the single highest-impact pre-launch action.
5. **Reduce 7-day age guard to 1 day OR add password sign-in** — the auth friction will block 30%+ of would-be first posters.

### 5 things to build in Phase 2 (post-launch, based on real usage)

1. **Outcome capture** — `closed_at` + `closed_reason` + a "Mark as filled" button on the dashboard. Without this you can't measure liquidity, can't claim success, can't sell data downstream.
2. **Phone verification** + Verified badge — the trust signal that closes the gap with hipages without copying their lead-fee model.
3. **Renewal flow** — email 5 days before expiry, one-click renew. Stops listing churn from day-30 expiry.
4. **Notification system** — email matching service providers when a relevant request is posted in their region. Drives provider engagement, the long-term moat.
5. **Postcode-radius search + state filter** — kills the "no results in my postcode" bounce.

### 5 things NOT to build, even though they'll be tempting

1. **A messaging system.** You'll be tempted because every other marketplace has one. It's also how every other marketplace started extracting tolls. Stay direct-contact. The friction IS the product.
2. **Reviews / star ratings.** Defamation, fake-review wars, and a trust-and-safety team you don't have. A binary "Verified or not" badge does 80% of the trust work at 5% of the moderation cost.
3. **A native mobile app.** Web-first works for rural users on mixed devices. An app costs months and adds an app-store dependency. Stay PWA at most.
4. **AI-powered matching / auto-categorisation.** Looks cool in demos, drains time, fails on rural edge cases ("station hand wanted, must know cattle and a bit of fencing" doesn't fit one category). Let users pick categories themselves.
5. **A pay-to-feature listing tier.** Even "$2 to bump my listing to top" violates the pay-to-play promise. It's a slippery slope to hipages-lite. If revenue ever matters, charge contractors a flat annual verification fee instead — same money, no algorithmic distortion.

---

*End of audit. Drafted plain, drafted blunt. Find the holes now, not after Jess hits 50k people.*
