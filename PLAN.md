# Outback Connections — PLAN.md

**Version:** 1.0 · **Date:** 2026-04-22 · **Supersedes:** the job-board framing in `README.md`

---

## 1. Mission

Outback Connections is a **free rural consumer help service** with a **data intelligence layer** underneath it. Rural Australians who've been ripped off, stuck mid-project, or unsure about a quote can get honest help. Every interaction becomes structured, anonymised data we own — used to forecast rural demand, spot bad actors, and guide Outback Fencing & Steel Supplies' commercial decisions.

Three sides, in priority order:

1. **Help side** (free, customer-facing) — Phase 1
2. **Directory side** (vetted contractors only) — Phase 2
3. **Intelligence side** (our data product) — builds from day one, surfaces Phase 2+

---

## 2. Locked decisions (2026-04-22)

| Decision | Answer |
|---|---|
| Response flow | Auto-ack email + Fair Trading / Rural Financial Counselling referral. Jess or Josh reviews daily. **48h SLA** on the form. |
| Publication stance | Phase 1 publishes **nothing** about named contractors. All complaint data stays private. |
| OF lead flow | Disclosed + consented on form. **Default unticked.** Fencing-related only. |
| Email provider | Resend |
| Domain | outbackconnections.com.au |
| Data controller | Outback Fencing & Steel Supplies Pty Ltd (ABN 76 674 671 820) |
| Check-a-Quote | Skipped in Phase 1 — folded into Get Help via `request_type` |
| Supabase | Fresh project, separate from Outback Ops (create via MCP on Josh's go-ahead) |
| ToS + Privacy Policy | Claude drafts, LawPath reviews before launch |

---

## 3. Hard requirements (non-negotiable)

1. **Conflict-of-interest disclosure** prominent on homepage, footer, every form, every email. Copy template:
   > "Outback Connections is owned and operated by Outback Fencing & Steel Supplies Pty Ltd, which also offers fencing and steel products. We disclose this on every page and never surface contractor information publicly."
2. **"Information, not advice" disclaimer** on every output (auto-reply, help response email, future public pages).
3. **Aggregation threshold:** minimum 5 records per bucket before anything is shown publicly.
4. **Schema-level split:** `complaints_private` vs `reviews_public`, different RLS policies. Enforced in the DB, not just app code.
5. **Policy version at consent time:** every submission stamps the `policy_versions.version` that was current at consent.

---

## 4. Core user flows

### 4.1 Get Help (Phase 1 — live)

**Entry:** homepage hero CTA → `/help` form.

**What it captures:**
- Problem type (ripped off / stuck mid-project / quote check / general question / other)
- Postcode (required)
- Category (fencing, earthworks, bore, station work, shearing, plumbing, electrical, etc.)
- Short summary + long description
- Contractor name + ABN (optional, private — never displayed)
- Dollar value (bracketed: under $1k / $1–5k / $5–20k / $20–100k / $100k+)
- Timeline (happening now / past 30 days / past 12 months / older)
- Material type (optional — for forecasting: timber, steel, wire, concrete, etc.)
- Contact: name, email (required), phone (optional), preferred method, best time
- Consent checkboxes:
  - **Required:** agree to privacy policy + terms (stamps `policy_version_id`)
  - **Optional default-off:** allow referral to Outback Fencing for fencing-related work
  - **Optional default-off:** allow anonymised data use for research / reports

**What happens on submit:**
1. Row written to `help_requests` with anonymised case ID (`HR-XXXXXXXX`).
2. Anonymised row written to `incidents` via trigger.
3. Auto-acknowledgement email sent via Resend:
   - Case ID
   - 48h promise
   - Fair Trading contact info (state-specific by postcode)
   - NSW Rural Financial Counselling Service link
   - "Information, not advice" disclaimer
   - COI disclosure
   - Link to delete the submission
4. Internal notification email to `help@outbackconnections.com.au`.
5. Thank-you page with case ID and the same referral info as the email.

### 4.2 Report a Dodgy Operator (Phase 1 — live)

**Entry:** homepage CTA → `/report` form.

Same structure as Get Help but writes to `complaints_private` with stricter RLS (service-role only, even for aggregate queries). Auto-ack explicitly says: "This is being recorded privately. We do not publish contractor names."

**Phase 1 deliberately does not:**
- Show the complaint to the named contractor
- Display it publicly
- Aggregate it into any public count

### 4.3 Check a Quote (folded into Get Help)

Not a separate flow in Phase 1. The Get Help form has a "quote check" option in `request_type`, which routes to the same table with a slightly different auto-reply template.

### 4.4 Contractor Listing (Phase 2 — not built)

Table scaffolded (`contractors`), no write path in Phase 1. Opt-in only. Requires vetting flow.

### 4.5 Review Submission (Phase 2 — not built)

Table scaffolded (`reviews_public`), no write path in Phase 1. Requires moderation + right-of-reply + lawyer sign-off.

---

## 5. Schema changes

**New tables** (see `supabase-v2.sql`):

| Table | Purpose | RLS |
|---|---|---|
| `policy_versions` | Immutable log of privacy policy + ToS versions | Public read, service-role write |
| `categories` | Problem/job categories (fencing, earthworks, etc.) | Public read, service-role write |
| `regions` | AU postcode → state/LGA reference | Public read, service-role write |
| `help_requests` | Get Help submissions (incl. folded quote checks) | **Service-role only** |
| `complaints_private` | Report a Dodgy Operator submissions | **Service-role only** |
| `contractors` | Phase 2 — vetted contractor directory | Public read (verified only), service-role write |
| `reviews_public` | Phase 2 — published reviews of contractors | Public read, service-role write |
| `incidents` | De-identified event stream for analytics | **Service-role only** (aggregation via views) |

**Preserved from v1:** `jobs`, `profiles` — kept in place but demoted. Not linked from the new homepage. Will be archived or migrated in Phase 2.

**Required columns on every user-facing submission table:**
`created_at`, `source` (web/phone/facebook/email/other), `postcode`, `category_id`, `anonymised_id`, `policy_version_id`, `consent_*` booleans.

---

## 6. Existing code — stay, archive, replace

### Stay (as-is or with minor edits)
- `auth.ts`, `app/api/auth/[...nextauth]/route.ts` — auth still useful for Phase 2 contractor login
- `app/layout.tsx`, `components/Footer.tsx`, `components/Header.tsx` — tweak nav items only
- `app/globals.css`, `tailwind.config.cjs`, `postcss.config.cjs`
- `app/sitemap.ts`, `app/robots.ts`, `app/not-found.tsx`
- `middleware.ts` (no-op is fine for now)
- `lib/supabase.ts` (already has the null-safe pattern we want)
- `supabase-setup.sql` (v1 schema, kept for continuity)

### Replace in Phase 1
- `app/page.tsx` — new hero: "Been ripped off? Stuck on a quote? We'll help — free." Three CTAs: Get Help (primary), Report a Dodgy Operator, Directory (coming Phase 2). COI disclosure visible above fold. Old job-board value props move below fold or get cut.
- `components/Header.tsx` — nav becomes: Home / Get Help / About / Privacy
- `components/Footer.tsx` — add COI disclosure line + "information, not advice" note + ABN

### Archive in Phase 1 (move under `app/_archive/` or flag-gate; don't link from new nav)
- `app/post-a-job/`
- `app/dashboard/` (entire subtree — including post-a-job, profile, opportunities)
- `app/contractor/`
- `app/c/[handle]/`
- `app/opportunities/` (both list and detail)
- `app/pricing/` — not relevant to free service; archive until Phase 2 contractor pricing
- `app/choose-role/`

### New in Phase 1
- `app/help/page.tsx` + `app/help/help-form.tsx` + `app/help/actions.ts`
- `app/report/page.tsx` + `app/report/report-form.tsx` + `app/report/actions.ts`
- `app/help/thank-you/page.tsx`, `app/report/thank-you/page.tsx`
- `app/about/page.tsx` (mission + COI disclosure)
- `app/privacy/page.tsx` (rendered from `lib/legal/privacy-v1.md`)
- `app/terms/page.tsx` (rendered from `lib/legal/terms-v1.md`)
- `app/api/delete-submission/route.ts` — per-APP right-to-delete
- `lib/email/resend.ts` — Resend client wrapper
- `lib/email/templates/` — auto-ack templates
- `lib/referrals.ts` — postcode → state-specific Fair Trading + rural support contacts
- `lib/legal/` — versioned privacy policy + ToS as markdown
- `lib/anonymised-id.ts` — short case ID generator
- `supabase-v2.sql` — already drafted

### Cleanup (from prior audit, do during Phase 1)
- Remove unused Prisma (`prisma/`, `@prisma/client`, `prisma`, `postinstall`, `lib/prisma.ts`) — Supabase is the single source of truth
- Delete `lib/supabaseServer.ts` (dead duplicate)
- Delete `jsconfig.json` (redundant with `tsconfig.json`)
- Consolidate ESLint configs — keep `eslint.config.mjs`, delete `.eslintrc.js` and `.eslintrc.json`
- Pin `@types/react` to `^18` to match `react: 18.3.1`

---

## 7. Data capture strategy

Every interaction captures (at minimum):

| Field | Why |
|---|---|
| `postcode` | Geographic forecasting, Fair Trading routing, regional demand signal |
| `state` (derived) | Regulatory jurisdiction |
| `category` | Category-level trend analysis, OF inventory planning |
| `request_type` | Distinguish ripped-off vs stuck vs quote-check flows |
| `dollar_value_bracket` | Pricing anomaly detection without exposing raw amounts |
| `timeline_bracket` | Freshness, recency trends |
| `material_type` | OF inventory + supply signal |
| `source` | Channel attribution (web/phone/facebook/email) |
| `anonymised_id` | Internal reference without PII |
| `created_at` | Time series |
| `consent_*` + `policy_version_id` | Compliance record |

**Analytics layer (`incidents`):** on every insert into `help_requests` or `complaints_private`, a trigger writes an anonymised row to `incidents` with no PII (no name, no email, no phone, no contractor name, no free-text description). Just the categorical fields above plus the source `anonymised_id` back-reference. This is the table we slice for forecasting and the only one public aggregate views touch.

**5-record threshold:** every public view over `incidents` must filter `having count(*) >= 5`. Template view provided in `supabase-v2.sql`.

---

## 8. Privacy approach

### What's public
- Aggregate counts by (postcode, category) where N ≥ 5
- Vetted contractor directory (Phase 2)
- Published reviews (Phase 2, after moderation + right-of-reply)
- Privacy policy, ToS, COI disclosure, about page

### What's private (service-role only)
- All `help_requests` rows
- All `complaints_private` rows
- All individual `incidents` rows (only aggregates are exposed)
- Contact details — never joined to any public surface

### What's anonymised for analytics
- `incidents` table has no PII. Descriptions, names, emails, phone numbers, contractor names, and exact dollar amounts are stripped. Only categorical + geographic fields survive. Dollar value is stored as a bracket enum, not a number.

### APP compliance
- **Collection notice** at the point of form submission, linking to the full privacy policy
- **Explicit consent checkbox** (required), separate from the OF-referral consent
- **Policy version stamping** — every row records which policy version was in force at consent
- **Access + deletion path** — users can request deletion by emailing `privacy@outbackconnections.com.au` or via `/api/delete-submission?id=HR-XXXXXXXX&email=...`. Deletes the submission row and the back-linked `incidents` row.
- **Retention** — help_requests closed > 24 months auto-deleted. complaints_private retained 7 years (statutory limitation periods for consumer claims). Aggregates persist indefinitely.
- **Breach response** — plan documented before launch (who, what, when, notification threshold).

---

## 9. Revenue model

**Customers: free forever.** No paywall, no login wall on the help flow, no upsell.

**Business benefits:**
1. **Outback Fencing lead flow** — customers who tick the opt-in for fencing-related jobs get their submission routed to OF sales. Disclosed on form and in auto-reply.
2. **Proprietary rural market data** — OF uses the `incidents`-derived aggregates for inventory, pricing, expansion, and product decisions. No external data sales in Phase 1.
3. **Contractor verification fees (Phase 2)** — verified contractors on the directory pay a listing fee. Not Phase 1.
4. **Data products (Phase 3+)** — aggregated reports for insurers, Fair Trading, media, industry bodies. Only with explicit governance + aggregation thresholds.

---

## 10. Phase 1 MVP scope (2 weeks)

**Ships:**
- [ ] Fresh Supabase project (`supabase-v2.sql` applied)
- [ ] Resend account + domain verification for outbackconnections.com.au
- [ ] Privacy policy v1 + ToS v1 drafted (Claude) + LawPath reviewed
- [ ] Policy version seeded in `policy_versions`
- [ ] New home page with COI-visible hero + Get Help / Report CTAs
- [ ] `/help` form end-to-end (works without JS as fallback)
- [ ] `/report` form end-to-end (works without JS as fallback)
- [ ] Thank-you pages with referral info
- [ ] Auto-ack emails (both flows) via Resend, with postcode-aware Fair Trading referrals
- [ ] Internal notification emails to `help@outbackconnections.com.au`
- [ ] `/privacy`, `/terms`, `/about` pages
- [ ] `/api/delete-submission` endpoint
- [ ] Footer COI line + ABN on every page
- [ ] Cleanup pass (Prisma removal, ESLint consolidation, dead file deletion, type pinning)
- [ ] Deploy to Vercel, DNS cutover

**Out of scope for Phase 1 (confirmed):**
- Contractor signup / auth / dashboard
- Payments
- Messaging
- Public reviews
- Admin panel
- Public aggregate dashboards (data is captured; surfacing waits)
- Facebook / SMS intake (logged as `source='facebook'` manually for now)

---

## 11. Phase 2+ backlog (not committed)

- Admin panel for Jess + Josh to triage submissions, tag status, add internal notes
- Public aggregate dashboard (with 5-record threshold enforced)
- Contractor onboarding + vetting workflow
- Contractor directory public pages
- Public review submission flow with right-of-reply moderation
- Facebook Messenger intake → auto-populates `help_requests` with `source='facebook'`
- Phone intake form for Jess to transcribe calls with `source='phone'`
- Named-contractor flagging — only after: lawyer review, PI + cyber insurance, right-of-reply workflow, takedown process

---

## 12. Legal / compliance workstream

| Item | Who | When |
|---|---|---|
| Privacy policy v1 draft | Claude | Week 1 |
| ToS v1 draft | Claude | Week 1 |
| LawPath review | Josh | Week 2 |
| PI + cyber insurance quotes | Josh | Week 2 |
| Breach response plan doc | Claude | Week 2 |
| Data-retention schedule doc | Claude | Week 2 |
| APP privacy complaints path | Claude | Week 1 |

**Nothing that could be construed as naming a contractor in a damaging light ships before LawPath sign-off.**

---

## 13. Operational commitments

- 48h response SLA on every submission
- Daily triage window (Jess or Josh)
- `help@outbackconnections.com.au` mailbox monitored
- Monthly review: submission volume, category mix, response time, deletions honoured, any escalations
- Quarterly review: aggregate data sanity checks, retention policy execution

---

## 14. Decision log

| Date | Decision | Notes |
|---|---|---|
| 2026-04-22 | Pivot from job board to rural consumer help service | |
| 2026-04-22 | Phase 1 publishes no named-contractor data | Legal risk posture |
| 2026-04-22 | OF lead flow default-off, fencing only | COI mitigation |
| 2026-04-22 | Resend for email | Fastest path |
| 2026-04-22 | Fresh Supabase project, separate from Outback Ops | Data isolation |
| 2026-04-22 | Schema split complaints_private vs reviews_public | Different legal regimes, different RLS |
| 2026-04-22 | 5-record aggregation threshold | Re-identification mitigation |
| 2026-04-22 | Check-a-Quote folded into Get Help | Phase 1 scope discipline |
