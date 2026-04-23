# PLAN-MARKETPLACE.md

**Version:** 1.0 · **Date:** 2026-04-23
**Status:** Active — this is the canonical plan for the marketplace arm.
**Supersedes:** `PLAN.md` (help-service direction, now historical).
**Related:** `PARKED.md` still applies to the help-service arm (complaints / triage / 48h SLA). That remains on ice — do not resume without an operator.

---

## 1. Mission

Build a rural-first marketplace that is genuinely useful to rural Australians — the opposite of hipages.

Free to post, free to browse. No lead fees, no messaging tax, no pay-to-play, no fake reviews. Direct contact between parties. Outback Fencing & Steel Supplies funds it and discloses that openly.

**Tagline:** *"Jobs, freight, and the bloke who's handy with a bore pump."*

**One line:** The one place rural Australia finds each other.

---

## 2. Three pillars

Priority order for homepage hierarchy and marketing weighting:

### Services (the moat)
Nothing indexes rural specialists well. This is where the platform wins or becomes another hipages. Bore specialists, helicopter mustering, drone spraying, mobile diesel mechanics, contract croppers, shearing teams, welders, fabricators.

### Jobs (the volume driver)
Post rural work — station hands, fencing labour, seasonal, mustering, shearing crews, harvest. Contested by Seek / Indeed / Gumtree but differentiated by being rural-specific, free, and no-account-to-browse.

### Freight (the useful-but-commodity pillar)
Move machinery, livestock, materials, hay. Two-sided: farmers posting freight needs, truckies posting available runs.

---

## 3. Locked decisions (2026-04-23)

| Decision | Choice |
|---|---|
| Auth | Supabase Auth. Rip NextAuth. Email OTP for MVP, SMS OTP in Phase 2. |
| Contact info | Gated behind sign-in. Accept the SEO cost on listing pages. |
| ABN verification | Phase 2. Any active ABN = "Verified" badge. Copy: *"identity checked, not a guarantee of quality."* |
| Reviews / ratings | None. Not in V1. Not in Phase 2. Maybe revisit Phase 3+ only after lawyer review. |
| Messaging system | None ever. Direct email / phone contact between parties. |
| Account deletion | Immediate deletion of user's listings when account is deleted. Stated in ToS. |
| Marketing emphasis | Services > Jobs > Freight |
| Brand tagline | *"Jobs, freight, and the bloke who's handy with a bore pump."* |
| Cold-start | Organic via Jess's Facebook reach. No fake seed listings. Slow build accepted. |
| Services UX | Unified pool — providers have a directory listing AND can respond to service requests. |
| Posting gating | Signed-in required, email verified, account ≥ 7 days old before first post. Phase 2: also phone verified. |
| Domain | `outbackconnections.com.au` |
| Supabase project | `csisezoohgfrpjrhkmls` (outback-connections, Sydney). Confirmed `ACTIVE_HEALTHY` 2026-04-23. |
| Codebase | Greenfield build on current branch. No cherry-picking old marketplace commits. |
| Archive | `/help`, `/help/thanks`, `/help/actions.ts` → `app/_archive_help/`. `/about`, `/privacy`, `/terms` rewritten for marketplace (version bumped to v2). |

---

## 4. Hard requirements (non-negotiable)

1. **Free forever** to post and browse. No lead fees. No paid placement. No featured listings. No premium tiers in V1.
2. **No messaging system.** Direct contact only. Contact info gated behind sign-in to discourage scraping.
3. **No reviews, no star ratings.** Ever, in V1 and V2.
4. **Mobile-first, 3G-friendly.** Server-rendered where practical. Minimum client JS. Listings must load on patchy rural signal.
5. **Plain Australian English.** Not corporate, not chirpy. No fake stats.
6. **Postcode-based matching.** No GPS in V1.
7. **Signed-in posting only.** Email-verified. Account ≥ 7 days old before first post (anti-drive-by-scammer).
8. **Listings auto-expire at 30 days.** Phase 2 adds renewal UX; V1 posters manually repost.
9. **Flag button on every listing.** Writes to `listing_flags` table. V1: manual review by Josh. Phase 2: auto-hide on 2+ flags.
10. **COI disclosure** in footer of every page: *"Outback Connections is run by Outback Fencing & Steel Supplies Pty Ltd."*
11. **APP-compliant consent** on every submission. Policy version stamped at consent time. Deletion path.
12. **Honeypot + rate limits** on posting + signup.

---

## 5. Schema

All new tables added alongside the existing `categories`, `regions`, `policy_versions` (repurposed) and the inactive help-service tables (`help_requests`, `complaints_private`, `incidents` — left intact per the archive decision).

### Master: `listings`

```
listings
├── id                  uuid pk
├── anonymised_id       text unique   (e.g. LST-A8X2K9P3 — generated via gen_short_id)
├── created_at          timestamptz default now()
├── updated_at          timestamptz default now()
├── expires_at          timestamptz default now() + interval '30 days'
├── status              enum (draft | active | hidden_flagged | expired
│                             | deleted_by_user | deleted_by_admin)
├── kind                enum (job | freight | service_offering | service_request)
├── category_id         uuid fk → categories
├── user_id             uuid fk → auth.users
├── title               text not null
├── description         text not null
├── postcode            text not null          -- the listing's primary location
├── state               text                   -- derived from regions.postcode
├── contact_email       text                   -- gated behind sign-in in UI
├── contact_phone       text                   -- gated behind sign-in in UI
├── contact_best_time   text                   -- optional
├── flag_count          int  default 0
├── policy_version_id   uuid fk → policy_versions
└── INDEXES: (kind, status, postcode, created_at desc),
            (kind, status, category_id, created_at desc),
            (user_id), (status, expires_at)
```

### Detail tables (1:1 with `listings` via `listing_id`)

```
job_details
├── listing_id          pk/fk → listings.id   (on delete cascade)
├── work_type           enum (full_time | casual | contract | seasonal | day_rate)
├── pay_type            enum (hourly | daily | weekly | negotiable | not_specified)
├── pay_amount          numeric(10,2) nullable
├── start_date          date nullable
├── duration_text       text                   -- free-form: "ongoing", "through harvest"
└── accommodation_provided boolean default false

freight_details
├── listing_id          pk/fk → listings.id
├── direction           enum (need_freight | offering_truck)
├── origin_postcode     text
├── destination_postcode text
├── vehicle_type        enum (tipper | livestock | flatbed | b_double
│                             | refrigerated | tray | other)
├── cargo_type          enum (livestock | grain | hay_fodder | machinery
│                             | fuel_water | refrigerated | general | other)
├── weight_kg           int nullable
├── pickup_from_date    date nullable
├── pickup_by_date      date nullable
└── budget_bracket      enum (reuse from help-service schema:
                              under_1k | 1k_5k | 5k_20k | 20k_50k | over_50k | unknown)

service_details
├── listing_id          pk/fk → listings.id
├── direction           enum (offering | requesting)
├── rate_type           enum (hourly | daily | fixed | per_km | quote | negotiable)
├── rate_amount         numeric(10,2) nullable
├── travel_willingness  enum (postcode_only | within_50km | within_200km
│                             | state_wide | national)
└── service_postcodes   text[]              -- additional postcodes served
                                              -- (used Phase 2 for radius filtering)
```

### Moderation / flags

```
listing_flags
├── id                  uuid pk
├── listing_id          fk → listings.id  (on delete cascade)
├── flagged_by          uuid fk → auth.users
├── reason              enum (scam | duplicate | offensive | miscategorised | other)
├── note                text nullable
└── created_at          timestamptz default now()
UNIQUE (listing_id, flagged_by)  -- one flag per user per listing
```

### Profile extension (supabase `auth.users` is the auth table; profiles extend it)

```
user_profiles
├── user_id             pk/fk → auth.users.id  (on delete cascade)
├── display_name        text
├── postcode            text
├── email_verified_at   timestamptz nullable   -- mirrored from auth for convenience
├── phone_verified_at   timestamptz nullable   -- Phase 2
├── abn                 text nullable          -- Phase 2
├── abn_verified_at     timestamptz nullable   -- Phase 2
├── abn_entity_name     text nullable          -- from ABR lookup, Phase 2
├── flag_count          int default 0          -- summed from their listings
├── created_at, updated_at
```

Derived badge (no column, computed in the app or a view):
`established_member = phone_verified_at IS NOT NULL AND created_at < now() - interval '30 days' AND flag_count = 0` — Phase 2.

### Repurposed from v2 schema

- `categories` — expand taxonomy per §6. Add a `pillar` column (`jobs | freight | services`) so browse pages can filter the dropdown.
- `regions` — populate with AU postcode → state / LGA data (separate task, Phase 2 nice-to-have).
- `policy_versions` — keep. Bump v2 policy when marketplace-specific privacy / ToS drop.

### Help-service tables — untouched

`help_requests`, `complaints_private`, `incidents`, plus their triggers and aggregate views, remain in the DB but are inactive. Zero data loss if we ever revisit the help-service arm. See `PARKED.md`.

### Schema rationale (why not one big table with JSONB?)

JSONB works for truly variable fields but we have three well-defined shapes. Separate detail tables give type safety at the DB layer, better indexing, and easier migrations. Worth the extra code.

---

## 6. Category taxonomy

Stored in `categories` with a `pillar` column (`jobs | freight | services`).

### Jobs (8 + Other)

- Station hand / general farm labour
- Shearer / shed hand
- Mustering / stock handling
- Harvest / seasonal crop
- Fencing labour
- Earthworks operator
- Agricultural truck driver
- Dairy / feedlot
- *(Other rural work — free text)*

### Freight (7 + Other)

Categorised by cargo, not trade.

- Livestock transport
- Grain / crop haulage
- Hay & fodder
- Machinery / oversize
- Fuel / water cartage
- Refrigerated
- General rural freight
- *(Other — free text)*

### Services (20 + Other) — the moat

1. Bore / pump / water (drilling, pump repair, tanks)
2. Helicopter services (mustering, spraying, survey)
3. Fixed-wing agricultural (spraying, seeding)
4. Drone services (spraying, surveying, livestock monitoring)
5. Mobile diesel mechanic
6. Agricultural machinery repair (tractors, headers, balers)
7. Shearing team contractor
8. Contract cropping / harvest contractor
9. Earthworks (dams, roads, clearing)
10. Fencing contractor (construction)
11. Welding / fabrication (mobile)
12. Rural electrical (solar, generators, remote power)
13. Rural plumbing (septic, tanks, bore, gas)
14. Livestock specialist services (AI, preg-testing)
15. Spraying / weed / pest control (ground-based)
16. Seed / fertilizer spreading
17. Building / shed construction
18. Refrigeration (coolrooms, dairy)
19. Truck tyre & specialty repair (rural-mobile)
20. *(Other rural service — free text)*

The taxonomy will evolve in the first 6 months based on what "Other" submissions look like. Seed it as specified; expect 3-5 additions by month 3.

---

## 7. URL structure

```
/                                   Home (hero + search + recent listings preview)
/jobs                               Browse jobs (filters: postcode, category, pay_type)
/jobs/[slug]                        Single job detail
/freight                            Browse freight (filters: direction, vehicle, origin/dest)
/freight/[slug]                     Single freight detail
/services                           Services landing (category grid)
/services/[category-slug]           Browse one service category
/services/listing/[slug]            Single service listing detail
/post                               Pick what to post
/post/job
/post/freight
/post/service/offering
/post/service/request               The four posting flows
/dashboard                          My account hub
/dashboard/listings                 My listings (active / expired / hidden)
/dashboard/verification             Email / phone / ABN verification status
/dashboard/settings                 Account settings + delete account
/signin                             Sign-in (email magic-link / OTP)
/signup                             Sign-up
/verify/email, /verify/phone,
/verify/abn                         Verification flows
/about, /privacy, /terms            Legal + identity (v2 marketplace-worded)
/faq                                FAQ
```

Listing slug format: `{title-kebab}-{postcode}-{short_id}`, e.g. `/jobs/station-hand-mudgee-2850-LSJX2Q`. SEO-friendly, collision-proof, readable.

---

## 8. Phased build plan

### Phase 1 MVP — minimum shippable marketplace

Goal: sign in → post a listing → anyone can browse → poster + browser connect directly.

- Archive help-service code to `app/_archive_help/`
- Rewrite `/about`, `/privacy`, `/terms` for marketplace (policy version bumped to v2)
- New homepage around three pillars (Services > Jobs > Freight)
- Rip NextAuth, add Supabase Auth (email OTP)
- Apply marketplace schema migration (`listings` + 3 detail tables + `listing_flags` + `user_profiles`)
- Expand `categories` with the full taxonomy + `pillar` column
- Post flows for all four kinds: `/post/job`, `/post/freight`, `/post/service/offering`, `/post/service/request`
- Browse pages: `/jobs`, `/freight`, `/services` + category pages with basic filters (postcode, category)
- Listing detail page — contact info gated behind sign-in
- `/dashboard/listings` — list my listings, edit, delete
- Auto-expire at 30 days (job runs daily; stale listings flip to `expired`)
- Flag button → writes to `listing_flags` (no auto-hide in V1)
- Signup gating: email verify, account ≥ 7 days before first post
- Honeypot + IP rate limit on post + signup
- COI in footer; info-not-advice moved out (not relevant for marketplace)

**Cut from Phase 1:** phone verify, ABN verify + "Verified" badge, listing renewal UX, auto-hide on flags, service-area radius filter.

### Phase 2 — the trust layer

- Phone verification (Supabase Auth SMS OTP)
- ABN verification (`abn.business.gov.au` free API — GUID registration, HTTP client)
- "Verified" badge (any active ABN + phone verified; copy: *"identity checked, not a guarantee of quality"*)
- Listing renewal: email 5 days before expiry, one-click renew, expired listings soft-hidden 60 days then hard-deleted
- Auto-hide on 2+ flags + simple review queue page (`/dashboard/admin/flags`, protected)
- Service-area radius filtering (`within_50km` / `within_200km` / `state_wide` / `national`)
- Post-connection one-question feedback ("Did this work out?") — optional, no public effect
- Populate `regions` table with AU postcode data for state derivation

### Phase 3+ — backlog

- Saved searches + email alerts
- Expanded categories (equipment for hire, rural accommodation, livestock listings)
- SMS alerts for critical responses
- Proper admin panel
- Aggregate dashboard (non-PII rural activity stats — PR material)
- Possible paid "premium listing" tier IF there's real traction
- Apps: probably never. Web-first forever.

---

## 9. Timeline

Paced around real constraints, not ambition.

| When | What |
|---|---|
| **Apr 23 (tonight)** | This plan locked. No code. |
| **Apr 24–30** | R&D Tax Incentive deadline April 30 is the priority. If there are spare cycles, scaffold only: apply marketplace schema migration + swap NextAuth → Supabase Auth in code. **No frontend.** |
| **May 1–14** | Thailand. Zero work on this. Phone off. |
| **May 15 – mid-June** | Real build begins. Phase 1 MVP. 4 weeks to soft launch. |
| **~Mid-June** | Soft launch — a few real listings from Jess's mates. No public promotion yet. |
| **End of June / early July** | Public launch via Jess's Facebook post. |

Do **not** rush the pre-Thailand window. R&D lodgement is non-negotiable and is a bigger dollar-impact than shipping the marketplace a week earlier.

---

## 10. Out of scope for V1 (Phase 1 MVP)

Explicit list so nothing creeps in:

- Phone verification (deferred to Phase 2)
- ABN verification + "Verified" badge (deferred to Phase 2)
- Listing renewal email + one-click renew (deferred to Phase 2; V1 requires manual repost)
- Auto-hide on 2+ flags (deferred to Phase 2; V1 is manual review only)
- Service-area radius filtering (deferred to Phase 2)
- Reviews, ratings, any form of public feedback about a listing or user
- Messaging system (never)
- Payments (never in V1; considered Phase 3+ only as premium tier, TBD)
- Native apps (probably never)
- Admin panel (Phase 2 minimum: flag queue page; proper admin Phase 3)
- Cross-postcode geolocation search (Phase 3+)
- Saved searches / alerts (Phase 3+)
- SMS notifications to users (Phase 3+)
- The help-service arm (stays parked per `PARKED.md`)

---

## 11. Decision log

| Date | Decision | Context |
|---|---|---|
| 2026-04-22 | Pivot from job board to rural consumer help service | Session 1 pivot |
| 2026-04-23 | Help service paused, written up in `PARKED.md` | Session 2 park |
| 2026-04-23 | Un-park; rebuild as rural marketplace | Session 2 pivot |
| 2026-04-23 | Supabase Auth over NextAuth | Auth + email + phone simpler |
| 2026-04-23 | Contact info gated behind sign-in | Anti-harvest |
| 2026-04-23 | No reviews in V1 or V2 | Defamation + mod burden |
| 2026-04-23 | No messaging system — direct contact only | Anti-tax stance |
| 2026-04-23 | ABN verify = Phase 2, any active ABN earns badge | Simplicity |
| 2026-04-23 | Services > Jobs > Freight marketing order | Services is the moat |
| 2026-04-23 | Unified `listings` master + three detail tables | Type safety > schema simplicity |
| 2026-04-23 | Cold-start via Jess's Facebook reach, no fake seeds | Slow but honest |
| 2026-04-23 | Account deletion → immediate listing deletion | APP-clean, stated in ToS |
| 2026-04-23 | Phase 1 MVP build started | 10-step sequential build, commit per step |

---

## Cross-references

- `PLAN.md` — help-service strategic doc (historical, superseded by this file for the marketplace arm)
- `PARKED.md` — help-service arm is paused; this file does not un-park that arm
- `supabase-setup.sql` + `supabase-v2.sql` — applied migrations
- Supabase project: `csisezoohgfrpjrhkmls` (outback-connections, ap-southeast-2 Sydney, ACTIVE_HEALTHY as of 2026-04-23)
- Vercel project: `prj_XBBbQ6O7TiM0n1EOXIc6lnB5txOo` · production domain `www.outbackconnections.com.au`
