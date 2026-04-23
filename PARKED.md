# PARKED.md

**Status:** Paused 2026-04-23.
**Return trigger:** Josh has hired or contracted someone who will run this day-to-day.
**Do not** cherry-pick old code, pivot, or re-architect until that person exists.

---

## Why we paused

Outback Connections needs a dedicated operator. Neither direction attempted this year works without one:

- **Help service:** requires daily triage of submissions and a 48h SLA we promised on the form. Fine in principle, not sustainable solo alongside everything else.
- **Marketplace:** requires active moderation, anti-scam vigilance, and 6–12 months of cold-start shepherding. Running it half-arsed means the site fills up with dodgy listings and quietly dies — the exact outcome we're trying not to build.

Real priorities for the next month:
- R&D Tax Incentive deadline (Apr 30)
- Pederick Statement of Claim
- Thailand prep
- Outback Fencing & Steel Supplies day-to-day

Best move right now is to park everything cleanly, not let a half-built site accumulate either false promises or scam posts, and come back when there's a real person to hand it to.

---

## What's live and in what state

**Production:** https://www.outbackconnections.com.au (also `outbackconnections.com.au` and `outback-connections.vercel.app`)
**Deployed commit:** `9893a682` — "feat: pivot to rural consumer help service"

What works:
- `/`, `/about`, `/privacy`, `/terms` — all render correctly with no DB dependency.

What's soft-broken:
- `/help` renders the form shell, but Vercel env vars for the new Supabase project were never set, so the categories dropdown is empty and the "dev mode" banner shows. Submissions fall through to a fake `HR-DEVMODE` thanks page without storing anything or sending emails.
- Net effect: looks like a site mid-construction. **No false 48h promises go out**, which is actually the right failure mode while parked.

**If you want `/help` to actually accept submissions** (and commit to reading the inbox daily), the Vercel env vars to set are listed at the end of this file. Do not set them if you're not going to read the inbox.

---

## Infra + costs accruing while parked

| Thing | Status | Cost/month |
|---|---|---|
| Supabase project `outback-connections` (`csisezoohgfrpjrhkmls`, Sydney) | Active, ~0 rows of real data | **$10** |
| Vercel project `outback-connections` | Active, last build READY | $0 (within free tier) |
| Resend account | Active; `outbackfencingsupplies.com.au` already verified | $0 (free tier) |
| Domain `outbackconnections.com.au` | Held | annual renewal only |

**To kill the Supabase $10/month while parked:**
Supabase Dashboard → project `outback-connections` → Settings → General → Pause Project.
Paused projects hold schema + data for 90 days at $0; resume in ~2 minutes.
After 90 days paused, they auto-archive and require manual restore.

---

## What's in the codebase (map for future-self / coordinator)

Branch `main` at `9893a682`. Clean working tree.

- `PLAN.md` — strategic doc for the help-service version. Historical; will be superseded when a direction is re-locked.
- `supabase-setup.sql` + `supabase-v2.sql` — migrations that have been applied. Schema partially repurposable for either help-service or marketplace direction.
- `app/help/` — help-service form, server action, thanks page. Live (soft-broken per above).
- `app/about/`, `app/privacy/`, `app/terms/` — help-service-worded policy pages. Version-stamped `v1-2026-04-22-draft`.
- `app/_archive/` — first-generation job-board routes (dashboard, post-a-job, opportunities, pricing, contractor, c/[handle], choose-role, login). Not routed.
- `lib/email.ts`, `lib/rate-limit.ts`, `lib/supabase.ts` — reusable regardless of direction.
- `.env.local` (gitignored) — real secrets for local dev only. **Never commit.**

Marketplace-era work (freight pages, jobs detail, contractors directory, fencing calculator, Outback Ops dashboard) was force-pushed over earlier in this session. It is **not on `main`** but is recoverable from:
- Git reflog on any clone that fetched before 2026-04-23
- Vercel's deployment history (inspector URLs preserved)
- The commit SHAs listed below

Old marketplace commits for future cherry-picking:
```
a4a9174  polish — favicon, footer, pricing tiers, nav cleanup
651d796  feat: freight page + post-freight dashboard form
44769e2  fix: opportunity detail, API jobs, dashboard stats, new-tables SQL
b26fd6f  feat: rebrand to jobs + freight + opportunities platform
e36c565  fix: opportunities + contractors pages wired to live Supabase
93d6bb5  fix: live stats, profiles table, no fake data
13a8fed  feat: pro homepage redesign + Outback Ops dashboard + fencing calculator
5d967ba  UI cleanup, fencing-only content, DB schema fix
```

---

## Decisions outstanding (marketplace restart)

If restarting as a marketplace, these three decisions must be answered **before any code is written**. Failing to lock them is what killed the last four attempts.

### 1. Cold-start liquidity — what fills the site on day 1?
- Seed from Outback Fencing's existing customer DB (opt-in campaign; APP compliance needed)
- Partner with rural media (The Land / Country Leader / Ripple Rural)
- Accept a 6–12 month ghost-town phase
- **Reject**: fake seed listings (violates the "no fakes ever" rule)

### 2. Anti-scam — how do we not become Craigslist?
Candidate levers (likely want several, not just one):
- Account-age + phone verification gating on posting
- Free ABN verification via `abn.business.gov.au` API → "Verified" badge
- Passive user-report queue (>2 flags hides a listing pending review)
- Auto-expire listings after 30 days unless renewed
- **Sub-decision:** reviews/ratings in V1 — yes or no? Strong default recommendation: **no** (defamation + moderation burden is Airtasker-scale work).

### 3. SERVICES — how does the niche-skill rural search actually work?
- Requesters-post / providers-respond (job-board pattern)
- Providers-list / requesters-browse (directory pattern)
- Both sharing a unified listings pool
- **Sub-decision:** posting gating — signed-in-required / email-verify / anonymous?

---

## Return checklist

Before re-opening this codebase:

- [ ] Josh has hired or contracted someone who will operate the platform day-to-day
- [ ] That person has realistic capacity for 30–60 min/day of moderation, support, and triage
- [ ] The three decisions above are answered in writing
- [ ] A decision on whether to resume the Supabase project or spin up fresh

Until those are true, this repo stays parked.

---

## Context: this is pivot #5

Git history and force-pushed commits show this codebase has been:
1. Fencing-only job board (early)
2. Jobs / Freight / Opportunities marketplace (broader rebrand)
3. Professional fencing-first with Outback Ops dashboard + calculator
4. Rural consumer help service (this most recent session)
5. Parked before a fifth iteration

Every prior iteration stopped because nothing shipped with enough operational plan to survive contact with reality. The next attempt should flip the order: **hire the operator first, then build to what they can actually sustain.**

---

## Vercel env vars (reference only — do not set unless committed to triage)

If someone later decides to bring `/help` live as an interim, these go in
Vercel Settings → Environment Variables (tick Production, Preview, Development on each):

```
NEXT_PUBLIC_SUPABASE_URL        https://csisezoohgfrpjrhkmls.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   <legacy JWT anon key — Supabase Settings → API>
SUPABASE_SERVICE_ROLE_KEY       <service_role JWT — same page>
RESEND_API_KEY                  <Resend dashboard → API Keys>
FROM_EMAIL                      Outback Connections <support@outbackfencingsupplies.com.au>
NOTIFICATION_EMAIL              support@outbackfencingsupplies.com.au
NEXT_PUBLIC_BASE_URL            https://www.outbackconnections.com.au
```

Then Redeploy the latest deployment with **"Use existing Build Cache" unticked** so the `NEXT_PUBLIC_*` values are re-baked into the client bundle.
