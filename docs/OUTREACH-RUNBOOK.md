# Outreach runbook — rural hub growth, directory & contractor outreach

For Ali, Daryl, Jess and Josh. How the tools fit together and what not to do.
See **`docs/ALI-SALES-OPERATING-SYSTEM.md`** for Ali's full daily playbook, 5-day starter queue (`A01`–`A06`), Central West coverage matrix, and approved source register.

**Access:** Staff accounts (Ali) see a "Staff" strip at the top of every admin page with:
- **Hub queue (Ali)** (`/dashboard/admin/hub-queue`) — **Start here every shift**
- **Daily report** (`/dashboard/admin/daily-report`)
- **Contractor outreach** (`/dashboard/admin/contractor-outreach`)
- **Enquiries** (`/dashboard/admin/enquiries`)
- **Add directory entry** (`/dashboard/directory/add`)
- **Import** (`/dashboard/admin/import`)
- **Analytics** (`/dashboard/admin/analytics`)
- **Demand by region** (`/dashboard/admin/demand`)
- **Sales upload** (`/dashboard/admin/sales-upload`)

**Admin-only pages (Josh):** **Claims approval** (`/dashboard/admin/claims`), **Flags** (`/dashboard/admin/flags`), **Moderation** (`/dashboard/admin/moderation`), **Lockdown** (`/dashboard/admin/lockdown`), and **Duplicate accounts** (`/dashboard/admin/duplicate-accounts`) require an Admin account. When Ali spots a pending claim or moderation item, he marks the task `Needs review` for Josh.

## The loop (across all 24 service categories, 8 freight categories & rural jobs)

1. **Find & verify** a genuine rural business (fencing contractor, mobile diesel mechanic, bore/water specialist, rural electrician, rural plumber, earthmover, welder, shearer, or freight carrier) from an **approved source** (their official website, Westonfence/Rotech directory, or ABR ABN Lookup).
2. **Add** it at **Dashboard → Add a directory entry** (`/dashboard/directory/add`). It goes in as an *unclaimed* listing with a business record, records the exact `source_url` where you found it, and keeps discovered phone/email **strictly private** inside internal fields. Adding the same name + postcode again updates it instead of duplicating.
3. **Work the queue** at **Admin → Hub queue** (`/dashboard/admin/hub-queue`) and **Admin → Contractor outreach** (`/dashboard/admin/contractor-outreach`): filter by town/state/category/status, track task states (`Ready`, `In progress`, `Needs review`, `Blocked`, `Completed`), and log calls, SMS, emails, notes, and follow-up dates.
4. **Invite them to claim (Free Hub First):** Use the default **`Free Hub Profile Claim Invite (No Product Pitch)`** (`directory_only` template). Click **Send invite email** (from `help@outbackconnections.com.au`, logged automatically with a durable pre-send lock, max one per 14 days) or use Copy invitation / Open email / Open SMS for a personal 1-to-1 message linking to `/claim/<business>`.
5. **They claim** → the claim lands in **Admin → Claims** (`/dashboard/admin/claims`) for **Josh** to approve → once approved, the listing shows their owner-confirmed details and the Unclaimed notice disappears.
6. **Supporting product path & Daryl handoff:** Fencing listings and the claim page carry the disclosed Outback Fencing trade card (`/go/trade`). If any contractor, rural store, or farmer asks about Clip Guns, C24 clips, mesh, pickets, or gates, click **Hand Product Enquiry to Daryl** on their row in `/dashboard/admin/contractor-outreach` (`handed_to_daryl`).

## Quote requests (enquiries)

Farmers can ask any service listing for a quote without an account (**Get a quote** on the listing). Requests land in **Admin → Enquiries** (`/dashboard/admin/enquiries`), **Admin → Daily report** (`/dashboard/admin/daily-report`), and the `help@` inbox.

- **Unclaimed listing**: a person forwards it. The business's private phone and email are shown on the admin queue row only (never on the public listing page). Call, text, or email the business, then **Mark forwarded**. This is also the most helpful claim invite possible: *"A local landholder near you requested a quote; claim your free listing so future requests come straight to you."*
- **Claimed listing**: the business is emailed automatically; the row arrives as *forwarded*. Nothing to do unless they don't reply.
- The farmer's details go to that one business only, and are deleted after 12 months.
- **A week later** the farmer gets one email asking if the business responded. When the farmer clicks yes (`outcome = responded`), the daily report records **"Enquirer reported response received (not job completion)"**. Mark rows **forwarded** honestly: the follow-up only goes out for forwarded rows.

## Never do this

- **Never** add someone else's business through public **Post a listing** (`/post`). That form is for your own business: it publishes contact details and marks the listing as posted by you. Always use `/dashboard/directory/add`.
- **Never** paste a scraped phone number or email into a public description or title field. Unclaimed scraped listings must never expose discovered phone numbers or email addresses on public pages.
- **Never** reject or deprioritise a genuine rural business (e.g. bore driller, mobile diesel mechanic, rural plumber, electrician, shearer, carrier) just because they don't buy fencing supplies.
- **Never** bundle an unsolicited fencing sales pitch into a first-touch directory claim invite, and never send a second cold ask to the same business.
- **Never** scrape Google Maps, Seek/Indeed/Jora, or bulk Yellow Pages listings, and never invent synthetic `https://www.google.com/search?q=...` URLs to disguise where a record came from.
- **Never** overwrite or re-seed `claimed`, `deleted_by_admin`, `hidden_flagged`, or `do_not_contact` records.

## Statuses (outreach workspace)

- **Outreach status (`business_outreach.status`):** `not_contacted → attempted → contacted → interested → invite_sent → follow_up → joined` (*Profile claimed — directory participation, never a product sale*), plus `not_interested`, `invalid_duplicate`, `do_not_contact` (these three disable all contact buttons). Someone who says "remove me" = `do_not_contact` and close the listing.
- **Hub task state (preserved durably across notes):** `Ready`, `In progress`, `Needs review`, `Blocked`, `Completed`, `Cancelled`.
- **Daryl product handoff state (tracked separately from directory claims):** `none → handed_to_daryl → quoted_by_sales → order_placed → paid → fulfilled`.

## Monthly refresh (first Monday)

Unclaimed entries expire 60 days after they were added or last re-added. The team gets one email per entry 7 days before it expires. To keep an entry: verify its website is still active and re-add it (same name + postcode) via `/dashboard/directory/add`, or get it claimed by the owner so it never expires as an unclaimed listing.

## Monday email & Friday 20-minute review

Every Monday morning the team inbox gets the week's numbers: the traction gate, quote requests waiting (especially any waiting `>48h`), claims waiting for Josh's approval, rows about to expire, and regional demand gaps. Every Friday afternoon, Ali submits the 5-bullet Weekly Hub Scorecard from `/dashboard/admin/hub-queue`.

## Monthly: upload the sales export

First Monday, alongside the directory refresh: Shopify → Orders → Export → All orders (CSV) → **Admin → Sales upload** (`/dashboard/admin/sales-upload`). The browser reduces it to orders and revenue per postcode per month; nothing personal is uploaded. The demand report (`/dashboard/admin/demand`) then compares where farmers search versus where Outback Fencing sells.

## Links shared in community groups

Only share regional directory packs after the category + town page passes the **Promotion Readiness Gate** (`>=3` verified current options, verified source URLs, refreshed within 60 days). Always include UTM tags (`?utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub` or `jess_organic`) and get Josh/Jess sign-off before posting externally.
