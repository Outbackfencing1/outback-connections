# Ali Operating System — Rural Hub Growth Coordinator (`outbackconnections.com.au`)

**Owner:** Joshua Crawford (Outback Connections & Outback Fencing & Steel Supplies — 76 Astill Drive, Orange NSW 2800)  
**Coordinator:** Ali (**Rural Hub Growth Coordinator**)  
**Sales & Quote Handoff Partner:** Daryl Kennewell (`0421 572 245` · `sales@outbackfencingsupplies.com.au`)  
**Primary Starting Screen:** `/dashboard/admin/hub-queue`  
**Last Reconciled:** 20 October 2026 (`Australia/Sydney`)

---

## 1. One-Page Role Charter & Core Mission

### What Outback Connections Is
Outback Connections (`https://outbackconnections.com.au`) is **rural Australia's free hub for rural work, jobs, freight, and services**. Farmers, station managers, contractors, carriers, and rural workers use it to find genuine, available people who answer the phone and do the job.

### Your Job Title & Mission
You are the **Rural Hub Growth Coordinator**. Your job is to continuously **grow, verify, maintain, and help promote the free hub** across:
- **All 24 rural service categories** (fencing contractors, earthmoving/dams, bore/pump/stock water, mobile diesel mechanics, rural electricians, rural plumbers, mobile welders, sheds/stockyards, shearing/crutching, agronomy, rural supplies, etc.).
- **All 8 rural freight & carrier categories** (livestock carriers, hay/grain tippers, machinery float/heavy haulage, general rural backloads).
- **The Rural Work & Skills Board** (`/jobs` — station hands, fencers, machinery/header operators, MC/HC truck drivers, shearing shed staff).

### How Outback Fencing & Steel Supplies Fits In
Outback Connections is operated by **Outback Fencing & Steel Supplies Pty Ltd** (`https://outbackfencingsupplies.com.au/`). Our fencing products have a **clear, modest, disclosed supporting place**:
1. Disclosed operator trade cards appear automatically on fencing category pages (`/go/trade`).
2. A modest disclosed link (`Fencing supplies (Outback) ↗`) sits in the site header and footer.
3. When a fencing contractor, rural store, or landholder asks about Clip Guns, C24 clips, Hinge Joint, Fixed Knot, Pickets, or N-Brace gates, you share the verified product page or click **Hand Product Enquiry to Daryl** in `/dashboard/admin/contractor-outreach`.

### Three Independent Decisions for Every Candidate Business
Never confuse directory eligibility with product sales. Evaluate every business or listing using three separate questions:
1. **`hubBelongs` (Does it belong in the free hub?):** Is this a genuine rural service provider, freight carrier, rural employer, or worker serving regional Australia? *(A mobile diesel mechanic, bore driller, shearer, or rural plumber is a high-priority **YES**, even though they will never buy fencing materials.)*
2. **`evidenceSufficient` (Is evidence sufficient to publish?):** Do we have a verified official website or approved directory source, a confirmed rural base postcode (or verified rural service area for a metro-office operator), and private contacts stored only in internal fields?
3. **`productOpportunity` (Is there a supporting product opportunity?):**
   - `none`: Non-fencing rural services, freight carriers, and general farm jobs. Never pitch fencing products to them.
   - `disclosed_listing_card_only`: Standard unclaimed/claimed fencing contractors. Send a 100% free directory claim invite first; let the on-page disclosed card do the work unless they ask.
   - `handoff_to_daryl`: The contractor or farmer explicitly asks for trade pricing, Clip Guns, mesh rolls, picket slings, or a freight quote. Click **Hand Product Enquiry to Daryl**.

---

## 2. Verified Baseline (20 October 2026) — Why Your Role Matters

Always work from the real database numbers, never inflated assumptions:
- **Active listings (`424` total across `564` business rows):**
  - `fencing-contractor`: **325** active listings (76.7% of the entire site).
  - **Other 23 service categories combined:** **80** active listings (`earthmoving` 8, `rural supplies` 8, `welding` 6, `bore/pump/water` 5, `sheds` 5, `shearing` 5, `mobile diesel mechanic` 3, `rural electrical` 2, `rural plumbing` 2).
  - **Freight & carriers (`8` categories):** **13** active listings.
  - **Work & Skills jobs:** **4** active listings.
  - **Livestock, Harvest & Gear for sale:** **2** active listings.
- **Engagement & hygiene baseline:**
  - `1` approved business claim; `1` saved listing enquiry (`spam`); `1` `joined` outreach event (`Profile claimed`, not a product sale); `8` raw trade CTA clicks; `211` existing web fencing rows where an earlier migration overwrote Yellow Pages URLs with synthetic `google.com/search` URLs; and `23` existing fencing rows flagged for hygiene review (`rural_fencers_review.csv`).

**What this means for your daily work:** We already have 325 fencing contractor rows (which need verification and claim support), while critical farmer-needed categories like **mobile diesel mechanics (3), rural electricians (2), rural plumbers (2), bore/water (5), freight (13), and rural jobs (4)** are thin. Building genuine depth across those categories in **Central West NSW** first is your highest-leverage hub job.

---

## 3. First-Day Checklist & Daily 6-Hour Operating Rhythm

### First-Day Checklist (Start Here)
1. Sign in at `/signin` and open **`/dashboard/admin/hub-queue`** (your primary starting screen).
2. Open **`/dashboard/admin/daily-report`** and confirm the database query health banner is green and there are `0` real farmer enquiries waiting `>48h`.
3. Open **`/dashboard/admin/contractor-outreach`**, review the filter bar, and verify that the default email/SMS/copy template is **`Free Hub Profile Claim Invite (No Product Pitch)`** (`directory_only`).
4. Review the **Five-Day Starter Queue (`A01`–`A06`)** in Section 4 below and begin **`A01`**.

### Daily 6-Hour Operating Schedule (5 Time-Boxed Blocks)

| Block | Time | Focus | Primary Route | Done When |
|---|---|---|---|---|
| **Block 01** | 45 mins | **Enquiries, Flags & Quote Forwarding (SLA First):** Forward any genuine farmer quote request on an unclaimed listing to that specific business and mark `forwarded`. Hand any warm Outback Fencing material enquiry to Daryl. | `/dashboard/admin/daily-report` & `/dashboard/admin/enquiries` | `0` real enquiries waiting `>24h`; `0` unreviewed flags. |
| **Block 02** | 90 mins | **Directory Hygiene & Review Queue Triage:** Work `rural_fencers_review.csv` and thin category rows. Fix misclassified businesses, check broken websites, and verify rural postcodes/service areas. | `/dashboard/admin/contractor-outreach` | `8–12` existing or staged review rows verified with official source URLs. |
| **Block 03** | 120 mins | **New Rural Coverage (Services, Freight & Jobs):** Research and add verified Central West businesses in thin categories (diesel mechanics, bore/water, electrical, plumbing, earthworks, carriers) and genuine rural jobs. | `/dashboard/directory/add` & `/jobs` | `4–6` verified rural business listings + `1–2` verified job roles added. |
| **Block 04** | 60 mins | **Helpful Claim Invites & Due Follow-Ups:** Send `3–5` helpful `Free Hub Profile Claim Invite` messages to verified businesses. Complete due follow-ups. Respect the 1-touch rule. | `/dashboard/admin/contractor-outreach` | Every outreach action logged with status, consent (`prospective_1to1`), and next follow-up date. |
| **Block 05** | 45 mins | **Promotion Readiness & Daily Log Update:** Check which Central West town × category cells have reached `>=3` verified options. Update task states (`Ready`, `In progress`, `Needs review`, `Blocked`, `Completed`). | `/dashboard/admin/hub-queue` | All task states updated; any admin/sales handoffs flagged for Josh or Daryl. |

### Fallback Ladder (Never Stall When Waiting on Someone Else)
- **Waiting on a business owner or employer to reply?** Do not send repeat cold messages. Log status + follow-up date (`+7 days`) and switch immediately to **Block 03** (adding verified Central West non-fencing services via `/dashboard/directory/add`).
- **Waiting on Josh to approve a claim (`/dashboard/admin/claims`) or moderation item?** Note that `/dashboard/admin/claims` is Admin-only. Set the row's task state to `Needs review` with a 1-line note for Josh, then switch to **`A02`** (`rural_fencers_review.csv` website verification).
- **Waiting on Daryl to price a whole-fence, Fixed Knot, or freight quote?** Click **Hand Product Enquiry to Daryl** (`daryl_handoff=handed_to_daryl`), never invent a price, and return to hub coverage work.
- **A candidate business has a broken or parked website?** Check ABR ABN Lookup (`abr.business.gov.au`). If rural service scope or contact still cannot be verified, mark `Needs review` and move to the next town/category gap.

---

## 4. Five-Day Starter Work Queue (`A01`–`A06`) & Two-Week Plan

### Week 1: Five-Day Starter Queue (`A01`–`A06`)

| Task ID | Day | Priority | Category & Region | Action & Source | Expected Result |
|---|---|---|---|---|---|
| **`A01`** (`HUB-A01`) | Day 1 | **P0** | All categories · Central West NSW (`2800`, `2795`, `2830`, `2870`, `2871`, `2794`, `2850`) | Clear `/dashboard/admin/daily-report`. Audit the 80 non-fencing service rows and 13 freight rows. Record active counts per Central West spotlight town across priority categories. | `0` overdue enquiries; completed Central West town × category gap checklist. |
| **`A02`** (`HUB-A02`) | Day 1–2 | **P0** | `fencing-contractor` · Regional NSW/VIC/QLD/SA/WA | Triage all 32 rows in `rural_fencers_review.csv`: flag non-rural rows (`Beehive Mountain Foods`, `Coffs Coast Pool Fencing`, balustrade/security rows, materials warehouses) for reclassification/archiving, and verify official websites for the 9 Westonfence/Rotech pilot review rows. | All 32 review rows annotated with verified official-website evidence and recommended action. |
| **`A03`** (`HUB-A03`) | Day 2–3 | **P1** | Diesel mechanics, bore/water, rural electrical, rural plumbing, welding, freight · Central West NSW | Verify and add **15–20 genuine non-fencing rural businesses** from their official websites + ABR ABN Lookup using `/dashboard/directory/add` (unclaimed, private contacts). | `15–20` new verified unclaimed listings live in thin Central West categories with `0` public contact leaks. |
| **`A04`** (`HUB-A04`) | Day 3–4 | **P1** | `jobs` (Work & Skills Board) · Central West, Riverina & New England | Source **5–10 genuine rural job roles** (station hands, fencers, machinery operators, MC/HC drivers) from official station/employer career pages or direct employer permission. Never scrape Seek/Indeed/Jora. | `5–10` verified rural job posts or employer invites logged with clear location, pay/accommodation summary, and 30-day expiry. |
| **`A05`** (`HUB-A05`) | Day 4–5 | **P1** | Central West spotlight categories | Send **10–15 helpful `Free Hub Profile Claim Invite`** messages (`directory_only` template) to verified businesses. Check the Central West Promotion Readiness Gate (`>=3` verified options per town) and prepare the community promotion pack for Josh/Jess approval. | `10–15` claim invites logged (`consent=prospective_1to1`); Central West promotion pack ready for review. |
| **`A06`** (`HUB-A06`) | Day 5 | **P1** | Outback Fencing supporting path & Weekly Scorecard | Confirm all product links use `lib/outback-products.ts` and respect the 3 live caveats (`$40` vs `$45` adaptor check, Fixed Knot `16/180/15` quote via Daryl, Reserve Picket Sling preorder check). Route any warm product enquiries to Daryl and submit the Friday 5-bullet scorecard. | `100%` accurate product references; warm product leads handed to Daryl; Week 1 scorecard delivered. |

### Week 2 Operating Plan (Days 6–10)
- **Days 6–7 (Central West Depth Completion):** Bring every Central West spotlight town (`Orange 2800`, `Bathurst 2795`, `Dubbo 2830`, `Parkes 2870`, `Forbes 2871`, `Cowra 2794`, `Mudgee 2850`) to at least **3 verified options** across top farmer-needed categories (fencing, earthmoving/dams, bore/water, mobile diesel mechanics, rural carriers).
- **Day 8 (Provenance Cleanup Batch):** Replace synthetic `google.com/search` URLs on priority NSW fencing listings with each business's verified official website URL (or mark `Needs review` if no official website exists).
- **Day 9 (Claim Follow-Up & Employer Outreach):** Follow up once (`+7 days`) on Week 1 claim invites where appropriate; invite 5 more regional employers or contractors to post free work/skill listings.
- **Day 10 (Approved Regional Promotion & Week 2 Review):** With Josh/Jess sign-off, publish the Central West directory pack in 2–3 approved local groups with UTM tracking (`?utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub`) and run the Friday 20-minute review.

---

## 5. Approved Source Register & Privacy Guardrails

### Source Register Summary

| Source | Status | Allowed Method & Rule |
|---|---|---|
| **Individual Business Official Websites (`*.com.au`)** | **APPROVED** | First-party source of truth. Record exact URL in `source_url`; store phone/email in private fields only. |
| **Westonfence Accredited Installers** | **APPROVED** | Bounded pilot adapter (`scraper/sources/westonfence.ts`). Cross-check official website and rural postcode before seeding. |
| **Rotech Rural Fencing Contractors** | **APPROVED** | Bounded pilot adapter (`scraper/sources/rotech-rural.ts`). Validate locality/state/postcode before seeding. |
| **ABR ABN Lookup (`abr.business.gov.au`)** | **APPROVED** | Official entity name, ABN status, GST registration, and postcode verification. Never treat API timeout as business closure. |
| **Direct Employer / Station / Council Career Pages** | **APPROVED** | Record factual job summary + direct link to employer's own application page, or post with direct employer permission. |
| **Rural Community Facebook Groups** | **REVIEW REQUIRED** | Human participation and direct permission only. Never scrape Facebook groups or repost without permission. |
| **Yellow Pages / TrueLocal** | **PROHIBITED (Bulk Scrape)** | Do **not** expand bulk Yellow Pages scraping. Never invent synthetic `google.com/search` URLs. Use only for manual lookup to find a business's own website. |
| **Google Maps / Google Places** | **PROHIBITED** | Never scrape Google Maps or export Places business details into permanent seed files. |
| **Seek / Indeed / Jora** | **PROHIBITED** | Never scrape or copy job-board ads. Always go to the employer's own website or contact the employer directly. |

### Strict Privacy & Safety Rules (`AGENTS.md` Compliance)
1. **Unclaimed Discovered Contacts Are Private:** Never paste a scraped phone number or email address into a public `description` or `title`, and never add someone else's business through public **Post a listing** (`/post`). Always use **Add a directory entry** (`/dashboard/directory/add`) or the privacy-safe import payload (`buildPrivacySafeImportPayload`).
2. **Base Office vs Service Area Honesty:** If a rural contractor has an administrative office in a metro postcode (e.g. Camden `2570` or Penrith `2750`) but genuinely services rural properties (e.g. Moss Vale `2577` or Central Tablelands), enter both `postcode` (office) and `service_postcode` (rural service area) in `/dashboard/directory/add`. The system preserves the office postcode in `raw_payload.office_postcode` without falsifying their address.
3. **Never Overwrite Protected Records:** Never overwrite or re-seed listings that are `claimed`, `deleted_by_admin`, `hidden_flagged`, or marked `do_not_contact`.
4. **Separate Directory Participation from Sales:** When a business claims its free profile (`joined`), that is **Profile claimed** (directory participation) — never report it as a product sale (`Won`).

---

## 6. Outback Fencing Product Reference & Daryl Handoff Path

All product facts are centralised in [`lib/outback-products.ts`](../lib/outback-products.ts) (`lastCheckedDate: 2026-10-20`, all prices **AUD including GST**).

### Australia Clip Gun Merchandising Hierarchy (Strict Compliance)
1. **18V Cordless Clip Gun — Full Kit (`$1,699` AUD inc GST):** *Lead offer.* Includes `1 × 18V Clipgun` + `1 × 18V 4.0Ah Battery` + `240V Charger` + `Carry Bag` + `Belt Clip` + `Manual`. (Fits Makita 18V directly; runs Milwaukee M18 via adaptor).
2. **Ready to Work Bundle (`$1,879` AUD inc GST):** Everything in Full Kit + `10,000 C24 Stainless Clips (1 box)`.
3. **Contractor Kit (`$2,699` AUD inc GST):** Everything in Full Kit + `2 Extra 18V 4.0Ah Batteries (3 batteries total)` + `40,000 C24 Stainless Clips (4 boxes)`.
4. **Milwaukee Crew Kit (`$1,749` AUD inc GST):** `1 × Tool / Skin` + `Milwaukee M18 Adaptor INCLUDED` + `20,000 C24 Stainless Clips (2 boxes)` (no battery, charger, or carry bag).
5. **Skin Only (`$1,499` AUD inc GST):** *Always place LAST.* `1 × Tool Only` (no battery, charger, clips, adaptor, or carry bag).

### Mandatory Live Storefront Caveats (Never Guess or Over-Promise)
- **Milwaukee M18 Adaptor (`Task A06`):** Workspace rule specifies `$40` add-on while the live Shopify product page (`/products/battery-adapter`) displayed `$45` on 20 Oct 2026. Link to the live product page rather than hardcoding the standalone dollar figure until Josh confirms.
- **Fixed Knot Exclusion Mesh (`16/180/15` — 100m, 200m, 250m):** Featured on the Field Days page (`$500`–`$1,100`), while underlying Shopify product rows were `DRAFT` on 20 Oct 2026. Always hand Fixed Knot enquiries to Daryl for a confirmed quote and lead time.
- **Outback Pickets (`1.65m`, `1.80m`, `2.10m`, `2.40m` Bitumen, Galvanised, Jumbo) & Reserve Picket Slings:** Always call posts **Pickets**. Reserve Picket Slings carry preorder/quote flags — hand bulk sling enquiries to Daryl.
- **Hinge Joint Mesh (`7/90/30`, `8/90/30`, `8/90/15`, `8/115/15`, `8/115/30`, `11/142/15`, `11/142/30`, `6/70/30`, `6/90/30`, `5/51/30`):** Never quote `8/80/15` (never made), 15cm-pocket 500m rolls, or 1.57mm barbed wire.

### How to Hand a Product Enquiry to Daryl
When any contractor, store, or farmer asks for a quote, bulk pricing, or freight on fencing gear:
1. Open the business row in **`/dashboard/admin/contractor-outreach`**.
2. Type the customer's exact request (product, roll/sling quantity, town/postcode) into the note box.
3. Click the green **`Hand Product Enquiry to Daryl (Assigns Daryl & Marks Handed Off)`** button.
4. This durably records `daryl_handoff: handed_to_daryl` and assigns `Daryl` without erasing your task or consent metadata. Daryl then progresses the status through `quoted_by_sales → order_placed → paid → fulfilled`.

---

## 7. Three Corrected ChatGPT Prompts for Ali

Use these exact prompts when using ChatGPT to assist your daily work. They contain **zero hardcoded promotional prices** and enforce strict anti-hallucination rules.

### Prompt 1: Rural Hub Candidate & Category Verification
```text
You are helping me verify candidate businesses for Outback Connections (outbackconnections.com.au), a free Australian directory for rural services, rural freight carriers, and rural jobs.

Evaluate the pasted website text for [Business Name] using three independent decisions:
1. hub_belongs: Does this business genuinely provide a rural service, rural freight/transport service, or rural employment in regional Australia? (Note: Non-fencing rural services like mobile diesel mechanics, bore drillers, rural electricians, rural plumbers, welders, shearers, and earthmovers are HIGH PRIORITY for the hub even though they have zero fencing product overlap.)
2. evidence_sufficient: Extract ONLY facts explicitly stated in the pasted text:
   - Trading name & ABN (if shown)
   - Base town/suburb, state, and 4-digit postcode (keep leading zeroes like 0800/0870; never guess a postcode if only a region is named)
   - Published service areas (keep separate from base town)
   - Specific rural services or equipment mentioned verbatim
   - Official website URL and public contact channels (for internal private verification only — never put phone numbers or emails into the public description)
3. Write a 2-sentence plain-English, factual unclaimed listing description ending with: "Unclaimed directory listing — not posted by the business." Do not use hype words or invent capabilities.
```

### Prompt 2: Helpful Free Hub Profile Claim or Job Invite (1-to-1, No Unsolicited Product Pitch)
```text
Draft a short, plain-Australian-English 1-to-1 message from Ali at Outback Connections (76 Astill Drive, Orange NSW) inviting [Business Name] in [Town, State] to check or claim their free profile at [Claim URL].

Rules:
- Keep it under 90 words, warm, practical, and zero-pressure.
- Explain clearly that local farmers and property owners use Outback Connections to find [Category, e.g. mobile diesel mechanics / bore water specialists / rural fencing contractors] around [Town], and claiming lets them control their contact details, service area, and availability badge for free.
- Include a clear 1-sentence opt-out ("If you'd ever like your listing updated or removed, just reply and we'll sort it straight away.").
- Do NOT include any sales pitch or pricing for fencing products unless I explicitly tell you this business asked for fencing material quotes.
```

### Prompt 3: Friday 20-Minute Weekly Hub Scorecard Summary
```text
Summarise my week's Outback Connections hub growth log into a concise 5-bullet Friday scorecard for Josh using only the exact numbers I provide below (never combine directory claims with product sales, and never estimate missing numbers):

1. SLA & Enquiries: [X] real farmer enquiries received, [Y] forwarded within 24h, [Z] waiting >48h.
2. Hub Coverage Added & Cleaned: [A] new verified non-fencing service listings, [B] new freight listings, [C] new rural job listings, and [D] existing rows cleaned/reclassified.
3. Central West Readiness: Which town × category cells in Orange, Bathurst, Dubbo, Parkes, Forbes, Cowra, and Mudgee now have >=3 verified current options.
4. Directory Participation (Claims & Outreach): [E] 1-to-1 claim invites sent, [F] replies received, [G] profiles claimed (`joined`).
5. Supporting Product Handoffs to Daryl (Tracked Separately): [H] warm product/quote enquiries handed to Daryl (`handed_to_daryl`), [I] quotes sent by Daryl, [J] paid orders confirmed.
6. Top 2 blockers or decisions needed from Josh (max 2 lines).
```

---

## 8. 5-Year Hyper-Growth Velocity Targets, 6 National Conquest Waves & Live Automated Coaching

### Aggressive Daily & Weekly Hyper-Growth Velocity Targets
Your performance is continuously monitored on `/dashboard` and `/dashboard/admin/hub-queue` via the **Live Velocity Score (`/100`) & Automated Daily Coach**:
- **SLA First:** `100%` of genuine farmer enquiries forwarded within 24 hours (`<4h` target; `0` waiting `>48h`).
- **New Verified Rural Listings (`15/day` · `75+/week`):** Add `15+` verified rural listings per day via `/dashboard/directory/add` with **`>=70%` in non-fencing services and freight** (`>=52/week`) until every category has real depth.
- **1-to-1 Claim & Availability Outreach (`20/day` · `100+/week`):** Log `20+` personalised 1-to-1 `Free Hub Profile Claim Invites` or availability check-ins per day in `/dashboard/admin/contractor-outreach`.
- **Active Rural Jobs Board (`15+` live at all times):** Add `3–5` genuine rural job opportunities per day (`10–15/week`) from direct station/employer career pages or direct employer permission.
- **Daryl Product Handoffs:** Tracked honestly as a supporting metric (`handed_to_daryl → quoted_by_sales → paid`), never forced onto cold contacts.

### The 6 National Regional Conquest Waves (Auto-Refilling 5-Year Pipeline)
Whenever a town × category cell reaches `>=3` verified options in Wave 1, immediately advance to the next gap in the wave, and then to the next Conquest Wave:
1. **`WAVE-1` (Months 1–2 — ACTIVE NOW): Central West, Orana & Tablelands NSW** (`Orange 2800`, `Bathurst 2795`, `Dubbo 2830`, `Parkes 2870`, `Forbes 2871`, `Cowra 2794`, `Mudgee 2850`, `Molong 2866`, `Wellington 2820`, `Nyngan 2825`, `Coonamble 2829`, `condobolin 2877`).Target: `350+` verified listings, `75+` claimed profiles, `25+` active jobs.
2. **`WAVE-2` (Months 3–4): Riverina, South West Slopes & Southern Tablelands NSW** (`Wagga Wagga 2650`, `Goulburn 2580`, `Young 2594`, `Cootamundra 2590`, `Griffith 2680`, `Leeton 2705`, `Albury 2640`, `Deniliquin 2710`, `Hay 2711`, `Yass 2582`). Target: `450+` verified listings, `100+` claimed profiles, `30+` active jobs.
3. **`WAVE-3` (Months 5–6): New England, North West Slopes & Hunter Valley NSW** (`Tamworth 2340`, `Armidale 2350`, `Moree 2400`, `Narrabri 2390`, `Gunnedah 2380`, `Inverell 2360`, `Glen Innes 2370`, `Scone 2337`, `Singleton 2330`, `Taree 2430`). Target: `450+` verified listings, `100+` claimed profiles, `30+` active jobs.
4. **`WAVE-4` (Months 7–12): Regional Victoria (Goulburn Valley, Western District, Mallee & Gippsland)** (`Bendigo 3550`, `Shepparton 3630`, `Ballarat 3350`, `Warrnambool 3280`, `Hamilton 3300`, `Horsham 3400`, `Mildura 3500`, `Wangaratta 3677`, `Sale 3850`, `Bairnsdale 3875`). Target: `1,200+` verified listings, `300+` claimed profiles, `60+` active jobs.
5. **`WAVE-5` (Year 2): Regional Queensland (Darling Downs, Maranoa, Central & North QLD)** (`Toowoomba 4350`, `Dalby 4405`, `Roma 4455`, `Goondiwindi 4390`, `Warwick 4370`, `Emerald 4720`, `Rockhampton 4700`, `Longreach 4730`, `Charleville 4470`, `Townsville Rural 4814`). Target: `2,000+` verified listings, `500+` claimed profiles, `100+` active jobs.
6. **`WAVE-6` (Years 3–5): National Expansion — Regional SA, WA Wheatbelt, Tasmania & NT** (`Mt Gambier 5290`, `Naracoorte 5271`, `Port Augusta 5700`, `Northam 6401`, `Narrogin 6312`, `Albany 6330`, `Geraldton 6530`, `Kalgoorlie 6430`, `Launceston Rural 7250`, `Katherine 0850`, `Alice Springs 0870`). Target: `3,500+` verified listings, `1,000+` claimed profiles, `150+` active jobs.

### 5-Year Tech-Scale Roadmap (Year 1 → Year 5)
- **Year 1 (`NSW & VIC Regional Dominance`):** `3,500+` verified rural listings · `600+` owner-claimed profiles (`Taking bookings` live badges) · `100+` active rural jobs · `250+` warm fencing/steel quote handoffs to Daryl.
- **Year 2 (`East Coast Standard — NSW, VIC & QLD`):** `12,000+` verified listings · `2,500+` claimed profiles · `350+` active rural jobs · Automated 30-day availability check-in loop across all claimed contractors.
- **Year 3 (`National Rural Operating Network — All 6 States + NT`):** `25,000+` verified listings · `7,500+` claimed profiles · `1,000+` active rural jobs · Live regional freight backload board (`Loadshift` alternative for local carriers).
- **Year 4 (`Repeat Property Maintenance & Seasonal Crew Engine`):** `45,000+` verified listings · `15,000+` claimed profiles · `2,500+` seasonal & permanent rural jobs · Automated seasonal fencing/water/harvest readiness reminders.
- **Year 5 (`Australia's #1 Rural Infrastructure Utility`):** `75,000+` verified listings · `25,000+` claimed profiles · `10,000+` daily active farmers, contractors, carriers, and workers connecting commission-free, with Outback Fencing & Steel Supplies as the trusted national trade supplier.
