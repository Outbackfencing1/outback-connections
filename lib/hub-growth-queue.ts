// lib/hub-growth-queue.ts
// Ali's Rural Hub Growth Coordinator Operating Queue, 5-Year Hyper-Growth Engine,
// National Regional Conquest Waves, Live Performance Telemetry, and Automated Coaching Feedback.

import type { HubTaskState } from "./outreach-statuses";

export interface SourceRegisterEntry {
  id: string;
  sourceName: string;
  domainOrScope: string;
  contentTypes: ("service" | "freight" | "job" | "community" | "verification")[];
  allowedMethod:
    | "bounded_adapter"
    | "manual_official_website"
    | "direct_owner_or_employer_permission"
    | "api_or_lookup_verification"
    | "prohibited_bulk_scrape";
  reuseAndRobotsBasis: string;
  rateLimitAndVolumeRule: string;
  status: "approved" | "review_required" | "prohibited";
}

export const HUB_SOURCE_REGISTER: readonly SourceRegisterEntry[] = [
  {
    id: "official-business-websites",
    sourceName: "Individual Business Official Websites & Public Contact Pages",
    domainOrScope: "*.com.au / *.net.au (first-party contractor, carrier & supplier sites)",
    contentTypes: ["service", "freight", "job"],
    allowedMethod: "manual_official_website",
    reuseAndRobotsBasis:
      "First-party published business facts. Store exact URL in source_url; keep discovered phone/email private until claimed.",
    rateLimitAndVolumeRule: "Manual verification or bounded 1 req / 2s with cache.",
    status: "approved",
  },
  {
    id: "westonfence-installers",
    sourceName: "Westonfence Accredited Installers Directory",
    domainOrScope: "westonfence.com.au/accredited-installers/",
    contentTypes: ["service"],
    allowedMethod: "bounded_adapter",
    reuseAndRobotsBasis:
      "Public manufacturer installer locator; robots.txt allows path. Must cross-check official website and never overwrite claimed/deleted rows.",
    rateLimitAndVolumeRule: "Bounded pilot adapter (cached HTML; max 1 run/week).",
    status: "approved",
  },
  {
    id: "rotech-rural-contractors",
    sourceName: "Rotech Rural Fencing Contractors Directory",
    domainOrScope: "rotechrural.com.au/fencing-contractors/",
    contentTypes: ["service"],
    allowedMethod: "bounded_adapter",
    reuseAndRobotsBasis:
      "Public manufacturer contractor referral page; robots.txt allows path. Requires rural locality validation before seeding.",
    rateLimitAndVolumeRule: "Bounded pilot adapter (cached HTML; max 1 run/week).",
    status: "approved",
  },
  {
    id: "abr-abn-lookup",
    sourceName: "Australian Business Register (ABR) ABN Lookup",
    domainOrScope: "abr.business.gov.au",
    contentTypes: ["verification"],
    allowedMethod: "api_or_lookup_verification",
    reuseAndRobotsBasis:
      "Official Commonwealth register for verifying ABN status, entity name, GST registration, and state/postcode.",
    rateLimitAndVolumeRule: "Lookup verification per candidate.",
    status: "approved",
  },
  {
    id: "employer-station-council-careers",
    sourceName: "Direct Station, Farm, Council & Rural Employer Career Pages",
    domainOrScope: "Official employer websites & direct employer submissions",
    contentTypes: ["job"],
    allowedMethod: "direct_owner_or_employer_permission",
    reuseAndRobotsBasis:
      "Record factual role title, town/postcode, pay/accommodation summary, and link directly to employer's application page or direct permission record.",
    rateLimitAndVolumeRule: "Manual verification; mandatory expiry date (max 30 days unless renewed).",
    status: "approved",
  },
  {
    id: "rural-community-facebook-groups",
    sourceName: "Regional Farming, Noticeboard & Rural Trade Facebook Groups",
    domainOrScope: "facebook.com/groups/* (Central West, Riverina, New England, etc.)",
    contentTypes: ["community", "service", "job"],
    allowedMethod: "direct_owner_or_employer_permission",
    reuseAndRobotsBasis:
      "Human participation and direct permission only. Never run automated scrapers against Facebook or copy private group posts without permission.",
    rateLimitAndVolumeRule:
      "Max 1 helpful regional pack post per group per fortnight, following group admin rules.",
    status: "review_required",
  },
  {
    id: "yellow-pages-truelocal",
    sourceName: "Yellow Pages / TrueLocal / Third-Party Directories",
    domainOrScope: "yellowpages.com.au / truelocal.com.au",
    contentTypes: ["verification"],
    allowedMethod: "prohibited_bulk_scrape",
    reuseAndRobotsBasis:
      "Do NOT expand bulk Yellow Pages scraping. Never fabricate synthetic google.com/search URLs to disguise provenance. Use only to locate a business's own official website.",
    rateLimitAndVolumeRule: "Zero bulk scraping.",
    status: "prohibited",
  },
  {
    id: "google-maps-places",
    sourceName: "Google Maps / Google Places API",
    domainOrScope: "google.com/maps",
    contentTypes: ["verification"],
    allowedMethod: "prohibited_bulk_scrape",
    reuseAndRobotsBasis:
      "Google Maps Terms of Service prohibit exporting or scraping Places business details into permanent third-party directory seed files.",
    rateLimitAndVolumeRule: "Zero bulk scraping or permanent seed export.",
    status: "prohibited",
  },
  {
    id: "major-job-boards",
    sourceName: "Seek / Indeed / Jora / Commercial Job Boards",
    domainOrScope: "seek.com.au / au.indeed.com / jora.com",
    contentTypes: ["job"],
    allowedMethod: "prohibited_bulk_scrape",
    reuseAndRobotsBasis:
      "Never scrape or republish third-party job-board ad copy. If a role is spotted on a job board, go to the employer's own website or contact the employer directly for permission.",
    rateLimitAndVolumeRule: "Zero job-board scraping.",
    status: "prohibited",
  },
] as const;

export interface CentralWestTownTarget {
  town: string;
  postcode: string;
  state: "NSW";
  subregion: string;
  minimumFencingOptions: number;
  minimumNonFencingServices: number;
  minimumFreightOptions: number;
}

export const CENTRAL_WEST_TOWNS: readonly CentralWestTownTarget[] = [
  {
    town: "Orange",
    postcode: "2800",
    state: "NSW",
    subregion: "Central Tablelands (Hub Base)",
    minimumFencingOptions: 5,
    minimumNonFencingServices: 8,
    minimumFreightOptions: 3,
  },
  {
    town: "Bathurst",
    postcode: "2795",
    state: "NSW",
    subregion: "Central Tablelands",
    minimumFencingOptions: 4,
    minimumNonFencingServices: 6,
    minimumFreightOptions: 2,
  },
  {
    town: "Dubbo",
    postcode: "2830",
    state: "NSW",
    subregion: "Orana / Western Plains",
    minimumFencingOptions: 5,
    minimumNonFencingServices: 8,
    minimumFreightOptions: 3,
  },
  {
    town: "Parkes",
    postcode: "2870",
    state: "NSW",
    subregion: "Central West Lachlan",
    minimumFencingOptions: 3,
    minimumNonFencingServices: 5,
    minimumFreightOptions: 2,
  },
  {
    town: "Forbes",
    postcode: "2871",
    state: "NSW",
    subregion: "Central West Lachlan",
    minimumFencingOptions: 3,
    minimumNonFencingServices: 5,
    minimumFreightOptions: 2,
  },
  {
    town: "Cowra",
    postcode: "2794",
    state: "NSW",
    subregion: "Central West Slopes",
    minimumFencingOptions: 3,
    minimumNonFencingServices: 5,
    minimumFreightOptions: 2,
  },
  {
    town: "Mudgee",
    postcode: "2850",
    state: "NSW",
    subregion: "Mid-Western Regional",
    minimumFencingOptions: 4,
    minimumNonFencingServices: 6,
    minimumFreightOptions: 2,
  },
] as const;

export interface PriorityHubCategory {
  slug: string;
  label: string;
  pillar: "service" | "freight" | "job";
  auditBaselineCount: number;
  thirtyDayTargetCount: number;
  yearOneTargetCount: number;
  whyFarmersAndWorkersNeedIt: string;
  productRelationshipNote: string;
}

export const PRIORITY_HUB_CATEGORIES: readonly PriorityHubCategory[] = [
  {
    slug: "fencing-contractor",
    label: "Fencing Contractors",
    pillar: "service",
    auditBaselineCount: 325,
    thirtyDayTargetCount: 360,
    yearOneTargetCount: 1200,
    whyFarmersAndWorkersNeedIt:
      "Core property infrastructure: boundary, exclusion (16/180/15), subdivision, cattle/sheep yards, and post-flood repairs.",
    productRelationshipNote:
      "Disclosed TradeOfferCard shown on listing; contractors may also be buyers or installation partners, but listing is 100% free.",
  },
  {
    slug: "earthmoving-and-dams",
    label: "Earthmoving, Dams & Clearing",
    pillar: "service",
    auditBaselineCount: 8,
    thirtyDayTargetCount: 35,
    yearOneTargetCount: 400,
    whyFarmersAndWorkersNeedIt:
      "Fence-line clearing, dam desilting, contour banks, road grading, and pad prep.",
    productRelationshipNote: "Pure hub utility — no product pitch required.",
  },
  {
    slug: "fencing-and-yard-supplies",
    label: "Rural & Fencing Supplies",
    pillar: "service",
    auditBaselineCount: 8,
    thirtyDayTargetCount: 30,
    yearOneTargetCount: 300,
    whyFarmersAndWorkersNeedIt:
      "Local independent rural stores, timber/strainer yards, and ag merchandise.",
    productRelationshipNote:
      "Keep installer vs supplier classification clean; potential trade/wholesale contact only if relevant.",
  },
  {
    slug: "welding-and-fabrication",
    label: "Mobile Welding & Fabrication",
    pillar: "service",
    auditBaselineCount: 6,
    thirtyDayTargetCount: 30,
    yearOneTargetCount: 350,
    whyFarmersAndWorkersNeedIt:
      "On-farm machinery repairs, custom gateways, cattle grids, and stock crate repairs.",
    productRelationshipNote: "Pure hub utility — no product pitch required.",
  },
  {
    slug: "bore-water-and-pumps",
    label: "Bore Drilling, Solar Pumps & Stock Water",
    pillar: "service",
    auditBaselineCount: 5,
    thirtyDayTargetCount: 30,
    yearOneTargetCount: 350,
    whyFarmersAndWorkersNeedIt:
      "Trough lines, bore drilling, solar pump installs, and poly pipe trenching.",
    productRelationshipNote: "Pure hub utility — no product pitch required.",
  },
  {
    slug: "rural-sheds-and-yards",
    label: "Rural Sheds, Silos & Stockyards",
    pillar: "service",
    auditBaselineCount: 5,
    thirtyDayTargetCount: 25,
    yearOneTargetCount: 300,
    whyFarmersAndWorkersNeedIt:
      "Hay/machinery sheds, sheep/cattle yard builds, and grain storage.",
    productRelationshipNote: "Pure hub utility (occasional gate/picket overlap only if asked).",
  },
  {
    slug: "shearing-and-crutching",
    label: "Shearing, Crutching & Livestock Contractors",
    pillar: "service",
    auditBaselineCount: 5,
    thirtyDayTargetCount: 30,
    yearOneTargetCount: 350,
    whyFarmersAndWorkersNeedIt:
      "Contract shearing teams, crutching cradles, lamb marking, and pregnancy scanning.",
    productRelationshipNote: "Pure hub utility — never pitch fencing gear.",
  },
  {
    slug: "mobile-diesel-mechanic",
    label: "Mobile Diesel & Ag Mechanics",
    pillar: "service",
    auditBaselineCount: 3,
    thirtyDayTargetCount: 35,
    yearOneTargetCount: 450,
    whyFarmersAndWorkersNeedIt:
      "Urgent paddock breakdown response for tractors, headers, trucks, and post drivers.",
    productRelationshipNote: "Pure hub utility — high farmer repeat visits.",
  },
  {
    slug: "rural-electrical",
    label: "Rural & Off-Grid Electricians",
    pillar: "service",
    auditBaselineCount: 2,
    thirtyDayTargetCount: 25,
    yearOneTargetCount: 300,
    whyFarmersAndWorkersNeedIt:
      "Shed/pump wiring, stand-alone solar, workshops, and grain-dryer power.",
    productRelationshipNote: "Pure hub utility — never pitch fencing gear.",
  },
  {
    slug: "rural-plumbing",
    label: "Rural Plumbers, Tanks & Septic",
    pillar: "service",
    auditBaselineCount: 2,
    thirtyDayTargetCount: 25,
    yearOneTargetCount: 300,
    whyFarmersAndWorkersNeedIt:
      "Rainwater tanks, homestead plumbing, septic systems, and stock reticulation.",
    productRelationshipNote: "Pure hub utility — never pitch fencing gear.",
  },
  {
    slug: "freight-all",
    label: "Rural Freight, Livestock, Hay & Machinery Carriers (8 categories)",
    pillar: "freight",
    auditBaselineCount: 13,
    thirtyDayTargetCount: 60,
    yearOneTargetCount: 600,
    whyFarmersAndWorkersNeedIt:
      "Livestock decks, hay/grain tippers, low-loader machinery floats, and general rural backloads.",
    productRelationshipNote:
      "Helps farmers move stock/gear and also builds backload carrier contacts for Orange dispatch.",
  },
  {
    slug: "jobs-all",
    label: "Rural Work & Skills Board (Station Hands, Fencers, Operators, Drivers)",
    pillar: "job",
    auditBaselineCount: 4,
    thirtyDayTargetCount: 45,
    yearOneTargetCount: 500,
    whyFarmersAndWorkersNeedIt:
      "Connects stations, farms, and contractors with genuine workers holding tickets, licences, and references.",
    productRelationshipNote: "Core free hub driver — zero commercial friction.",
  },
] as const;

export interface StarterQueueTask {
  id: string;
  code: "A01" | "A02" | "A03" | "A04" | "A05" | "A06";
  day: "Day 1" | "Day 2" | "Day 3" | "Day 4" | "Day 5";
  owner: "Ali" | "Ali (escalate to Josh)" | "Ali (handoff to Daryl)";
  priority: "P0" | "P1" | "P2";
  categorySlug: string;
  region: string;
  sourceReference: string;
  title: string;
  description: string;
  expectedResult: string;
  defaultStatus: HubTaskState;
  nextAction: string;
  dueDate: string;
  fallbackWhenBlocked: string;
  workspaceHref: string;
}

export const ALI_STARTER_QUEUE: readonly StarterQueueTask[] = [
  {
    id: "HUB-A01",
    code: "A01",
    day: "Day 1",
    owner: "Ali",
    priority: "P0",
    categorySlug: "all-categories",
    region: "Central West NSW (Orange, Bathurst, Dubbo, Parkes, Forbes, Cowra, Mudgee)",
    sourceReference: "/dashboard/admin/daily-report + /dashboard/admin/demand + live category pages",
    title: "Baseline Hub Audit, SLA Inbox Triage & Central West Coverage Map",
    description:
      "1) Clear any overdue enquiries or flags in /dashboard/admin/daily-report. 2) Audit the 80 non-fencing service rows and 13 freight rows for thin descriptions or wrong categories. 3) Record exact active counts per Central West town (Orange 2800, Bathurst 2795, Dubbo 2830, Parkes 2870, Forbes 2871, Cowra 2794, Mudgee 2850) across priority categories.",
    expectedResult:
      "0 unanswered real enquiries >24h; completed Central West town × category coverage checklist identifying every cell with <3 verified listings.",
    defaultStatus: "Ready",
    nextAction:
      "Open /dashboard/admin/daily-report, verify query status banner is green, then check each Central West town in /services and /freight.",
    dueDate: "Day 1 (17:00 AEDT)",
    fallbackWhenBlocked:
      "If any admin analytics query errors, switch immediately to A02 CSV hygiene review using rural_fencers_review.csv.",
    workspaceHref: "/dashboard/admin/daily-report",
  },
  {
    id: "HUB-A02",
    code: "A02",
    day: "Day 1",
    owner: "Ali (escalate to Josh)",
    priority: "P0",
    categorySlug: "fencing-contractor",
    region: "NSW / VIC / QLD / SA / WA (Regional)",
    sourceReference: "rural_fencers_review.csv (23 existing-DB hygiene rows + 9 pilot review rows)",
    title: "Triage Existing-DB Misclassifications, Duplicates & Pilot Review Rows",
    description:
      "Work through rural_fencers_review.csv: (a) Flag non-rural/unrelated rows in fencing-contractor (Beehive Mountain Foods, Coffs Coast Pool Fencing, balustrade/temporary security rows, materials warehouses) for reclassification or archiving. (b) Resolve the 9 Westonfence/Rotech pilot review rows by checking their official websites for missing base postcodes or phone conflicts. (c) Never overwrite deleted_by_admin or claimed records.",
    expectedResult:
      "All 32 rows in rural_fencers_review.csv annotated with verified official-website evidence and recommended action (keep/reclassify/archive/seed).",
    defaultStatus: "Ready",
    nextAction:
      "Inspect the 6 non-rural/supplier rows and 5 duplicate-active pairs in rural_fencers_review.csv and log notes in /dashboard/admin/contractor-outreach.",
    dueDate: "Day 2 (13:00 AEDT)",
    fallbackWhenBlocked:
      "If a contractor website is offline or parked, mark 'Needs review' with the exact HTTP/DNS note and move to the next row.",
    workspaceHref: "/dashboard/admin/contractor-outreach",
  },
  {
    id: "HUB-A03",
    code: "A03",
    day: "Day 2",
    owner: "Ali",
    priority: "P1",
    categorySlug: "mobile-diesel-mechanic, bore-water-and-pumps, rural-electrical, rural-plumbing, welding-and-fabrication, freight",
    region: "Central West NSW (2800, 2795, 2830, 2870, 2871, 2794, 2850)",
    sourceReference: "Approved Source Register (Official Business Websites + ABR ABN Lookup)",
    title: "Hyper-Growth Supply Blitz: Add 25–40 Verified Non-Fencing Services & Carriers in Central West NSW",
    description:
      "Research and add 25–40 genuine, rural-serving businesses in thin categories: mobile diesel mechanics (currently 3), rural electricians (2), rural plumbers (2), bore/pump/water specialists (5), mobile welders (6), earthmovers (8), and livestock/hay/machinery carriers (13). Use /dashboard/directory/add so every entry is created as unclaimed with source_url recorded and phone/email kept private.",
    expectedResult:
      "25–40 new verified unclaimed listings added via /dashboard/directory/add with official website URL, accurate base suburb/postcode, service area notes, and 0 public phone/email leaks.",
    defaultStatus: "Ready",
    nextAction:
      "Open /dashboard/directory/add and add 15–20 verified Central West businesses per shift from their official websites.",
    dueDate: "Day 3 (17:00 AEDT)",
    fallbackWhenBlocked:
      "If a town has fewer businesses with standalone websites, verify ABN + public council/trade association listing and record exact provenance URL.",
    workspaceHref: "/dashboard/directory/add",
  },
  {
    id: "HUB-A04",
    code: "A04",
    day: "Day 3",
    owner: "Ali",
    priority: "P1",
    categorySlug: "jobs-all",
    region: "Central West, Riverina & New England NSW",
    sourceReference: "Approved Source Register (Official Station/Farm/Employer Career Pages & Direct Permission)",
    title: "Curate 10–15 Genuine Rural Work & Skills Opportunities (Hiring & Available Workers)",
    description:
      "Grow the Work & Skills Board from 4 active rows by sourcing 10–15 real rural roles (station hands, contract fencers, machinery/header operators, MC/HC truck drivers, shearers) from official employer pages or direct outreach permission. Never scrape Seek/Indeed/Jora ad text. Ensure every role states location, work type, pay/accommodation summary (or TBC), start window, and a 30-day expiry date.",
    expectedResult:
      "10–15 verified rural job listings or worker availability invitations staged/live with clean expiry dates and direct application paths.",
    defaultStatus: "Ready",
    nextAction:
      "Review current /jobs board, contact 10 regional employers/contractors with active hiring needs, and invite them to post free at /post/job.",
    dueDate: "Day 4 (17:00 AEDT)",
    fallbackWhenBlocked:
      "While waiting for employer replies, return to A03 to add 5 more verified Central West freight or bore-water businesses.",
    workspaceHref: "/jobs",
  },
  {
    id: "HUB-A05",
    code: "A05",
    day: "Day 4",
    owner: "Ali",
    priority: "P1",
    categorySlug: "fencing-contractor, earthmoving-and-dams, mobile-diesel-mechanic",
    region: "Central West NSW (Orange, Bathurst, Dubbo, Mudgee)",
    sourceReference: "/dashboard/admin/contractor-outreach (Free Hub Profile Claim Invite template)",
    title: "Send 25–40 Helpful Directory-Only Claim Invites & Unlock Central West Promotion Pack",
    description:
      "1) Select 25–40 verified businesses in /dashboard/admin/contractor-outreach with complete profiles and working contacts. 2) Send the default 'Free Hub Profile Claim Invite' (directory_only template — zero unsolicited product pitch). 3) Verify that Central West Fencing & Rural Services meets the Promotion Readiness Gate (>=3 verified current options per spotlight town) and prepare the community promotion pack for Josh/Jess approval.",
    expectedResult:
      "25–40 claim invites logged with consent=prospective_1to1 and task=In progress; Central West promotion pack ready for review.",
    defaultStatus: "Ready",
    nextAction:
      "Filter /dashboard/admin/contractor-outreach to NSW Central West postcodes (2800, 2795, 2830, 2850) and send 1-click claim invites using the default Free Hub template.",
    dueDate: "Day 5 (14:00 AEDT)",
    fallbackWhenBlocked:
      "If daily email cap is reached or a business lacks email, log a personal phone/SMS claim note and advance follow-up date +7 days.",
    workspaceHref: "/dashboard/admin/contractor-outreach",
  },
  {
    id: "HUB-A06",
    code: "A06",
    day: "Day 5",
    owner: "Ali (handoff to Daryl)",
    priority: "P1",
    categorySlug: "fencing-contractor, fencing-and-yard-supplies",
    region: "Central West NSW & Australia-wide",
    sourceReference: "lib/outback-products.ts + /dashboard/admin/contractor-outreach (Daryl Handoff)",
    title: "Product Reference Reconciliation, Daryl Handoff Verification & Friday Velocity Review",
    description:
      "1) Confirm all product references use lib/outback-products.ts (Full Kit $1,699 first, Skin Only $1,499 last) and respect the 3 live caveats (Milwaukee M18 Adaptor $40 vs $45 check, Fixed Knot 16/180/15 quote via Daryl, Reserve Picket Sling preorder check). 2) Route any warm contractor or farmer material enquiries to Daryl using the 1-click 'Hand Product Enquiry to Daryl' button. 3) Submit the Friday Weekly Velocity Scorecard and advance immediately into Wave 2 (Riverina NSW) once Central West hits >=3 per cell.",
    expectedResult:
      "Zero unverified product prices in outreach; warm product enquiries assigned to Daryl with handed_to_daryl status; Friday Weekly Scorecard submitted.",
    defaultStatus: "Ready",
    nextAction:
      "Check /dashboard/admin/contractor-outreach for any contractor who replied asking about Clip Guns, mesh, or pickets, click 'Hand Product Enquiry to Daryl', and complete the Friday scorecard.",
    dueDate: "Day 5 (17:00 AEDT)",
    fallbackWhenBlocked:
      "If zero product enquiries arrived this week, report 0 honestly (never force product pitches onto cold directory contacts) and immediately begin Wave 2 supply building.",
    workspaceHref: "/dashboard/admin/contractor-outreach",
  },
] as const;

export interface DailyScheduleBlock {
  blockNumber: string;
  timeAllocation: string;
  title: string;
  description: string;
  primaryRoute: string;
  completionStandard: string;
}

export const ALI_DAILY_SCHEDULE: readonly DailyScheduleBlock[] = [
  {
    blockNumber: "01",
    timeAllocation: "45 mins (Start of shift)",
    title: "Enquiries, Flags & Unclaimed Quote Forwarding (SLA <4h)",
    description:
      "Check /dashboard/admin/daily-report and /dashboard/admin/enquiries. Forward any genuine farmer quote request on an unclaimed listing to that specific business and mark forwarded. Flag spam. Check if any contractor asked for Outback Fencing materials and hand those to Daryl.",
    primaryRoute: "/dashboard/admin/daily-report",
    completionStandard: "0 real farmer enquiries waiting >24h; 0 unreviewed public flags.",
  },
  {
    blockNumber: "02",
    timeAllocation: "75 mins",
    title: "Directory Hygiene, Deduplication & Review Queue Triage",
    description:
      "Verify existing rows in thin categories or rural_fencers_review.csv. Fix wrong categories, check broken websites, confirm rural postcodes/service areas, and never overwrite claimed or deleted_by_admin rows.",
    primaryRoute: "/dashboard/admin/contractor-outreach",
    completionStandard: "10–15 existing or staged review rows verified with official source URLs.",
  },
  {
    blockNumber: "03",
    timeAllocation: "150 mins",
    title: "Hyper-Growth Supply Blitz: Add 15–25 Verified Rural Services, Carriers & Jobs",
    description:
      "Work the active Regional Conquest Wave to find and verify real rural businesses (mechanics, bore/water, electrical, plumbing, earthworks, carriers) and genuine rural jobs from approved first-party websites. Add via /dashboard/directory/add with private contacts.",
    primaryRoute: "/dashboard/directory/add",
    completionStandard: "15–25 new verified rural listings + 3–5 verified job opportunities added per day.",
  },
  {
    blockNumber: "04",
    timeAllocation: "60 mins",
    title: "Claim Conversion Blitz & Due Follow-Ups (20–30 1-to-1 Actions)",
    description:
      "Send 20–30 helpful 1-to-1 'Free Hub Profile Claim Invite' messages (email/phone/SMS) to verified businesses and complete due follow-ups. Keep directory claim help separate from product sales; hand warm material requests to Daryl.",
    primaryRoute: "/dashboard/admin/contractor-outreach",
    completionStandard: "20–30 outreach actions logged with accurate status, consent level, and next follow-up date.",
  },
  {
    blockNumber: "05",
    timeAllocation: "30 mins (End of shift)",
    title: "Promotion Gate Check, Wave Progression & Daily Telemetry Check",
    description:
      "Check which town × category pages just passed the Promotion Readiness Gate (>=3 verified current options). Prepare 1 community/employer share snippet when ready and check your Live Velocity Score on /dashboard/admin/hub-queue.",
    primaryRoute: "/dashboard/admin/hub-queue",
    completionStandard: "Daily KPI targets hit; next morning's town/category target queued.",
  },
] as const;

export const ALI_FALLBACK_LADDER: readonly {
  whenBlockedBy: string;
  switchImmediatelyTo: string;
}[] = [
  {
    whenBlockedBy: "Waiting on a business owner or employer to reply to an email/call",
    switchImmediatelyTo:
      "Do NOT wait or send repeat messages. Log status + follow-up date (+7 days) and switch to Block 03 (adding 15–25 verified rural services in the current Regional Conquest Wave via /dashboard/directory/add).",
  },
  {
    whenBlockedBy: "Waiting on Josh to approve a claim (/dashboard/admin/claims) or policy decision",
    switchImmediatelyTo:
      "Set task state to 'Needs review' with a 1-line note for Josh, then work A02 (verifying official websites in rural_fencers_review.csv).",
  },
  {
    whenBlockedBy: "Waiting on Daryl to price a whole-fence, Fixed Knot, or freight quote",
    switchImmediatelyTo:
      "Click 'Hand Product Enquiry to Daryl' (sets daryl_handoff=handed_to_daryl), never invent a price, and return to hub directory verification.",
  },
  {
    whenBlockedBy: "Current town × category cell has reached >=3 verified options",
    switchImmediatelyTo:
      "Do NOT stop! Advance immediately to the next thin category in that town, or the next Regional Conquest Wave (Wave 1 Central West -> Wave 2 Riverina -> Wave 3 New England -> Wave 4 VIC -> Wave 5 QLD -> Wave 6 SA/WA/TAS/NT).",
  },
] as const;

/**
 * Ali's Daily & Weekly Hyper-Growth Velocity Targets.
 * Used by the live automated monitoring & coaching engine on /dashboard and /dashboard/admin/hub-queue.
 */
export const ALI_HYPERGROWTH_KPI_TARGETS = {
  dailyNewVerifiedListingsTarget: 15,
  weeklyNewVerifiedListingsTarget: 75,
  dailyOutreachActionsTarget: 20,
  weeklyOutreachActionsTarget: 100,
  weeklyNewJobsTarget: 15,
  targetNonFencingSharePercent: 70,
  maxEnquirySlaHours: 24,
} as const;

export interface RegionalConquestWave {
  waveId: string;
  waveTitle: string;
  timeframe: string;
  stateScope: string;
  targetTowns: string[];
  targetNewVerifiedListings: number;
  targetClaimedProfiles: number;
  targetActiveJobs: number;
  unlockCriteria: string;
}

/**
 * Auto-refilling 12-Month Regional Conquest Waves so Ali never runs out of structured
 * town × category expansion work once Central West NSW is complete.
 */
export const NATIONAL_CONQUEST_WAVES: readonly RegionalConquestWave[] = [
  {
    waveId: "WAVE-1",
    waveTitle: "Wave 1: Central West & Orana NSW (Home Base Dominance)",
    timeframe: "Weeks 1–4",
    stateScope: "NSW",
    targetTowns: [
      "Orange (2800)",
      "Bathurst (2795)",
      "Dubbo (2830)",
      "Parkes (2870)",
      "Forbes (2871)",
      "Cowra (2794)",
      "Mudgee (2850)",
      "Molong (2866)",
      "Wellington (2820)",
      "Nyngan (2825)",
      "Coonamble (2829)",
    ],
    targetNewVerifiedListings: 250,
    targetClaimedProfiles: 25,
    targetActiveJobs: 30,
    unlockCriteria: "Active now — complete >=3 verified options across top 10 categories per spotlight town.",
  },
  {
    waveId: "WAVE-2",
    waveTitle: "Wave 2: Riverina & South West Slopes NSW",
    timeframe: "Weeks 5–8",
    stateScope: "NSW",
    targetTowns: [
      "Wagga Wagga (2650)",
      "Griffith (2680)",
      "Albury (2640)",
      "Young (2594)",
      "Cootamundra (2590)",
      "Narrandera (2700)",
      "Deniliquin (2710)",
      "Hay (2711)",
      "West Wyalong (2671)",
    ],
    targetNewVerifiedListings: 300,
    targetClaimedProfiles: 35,
    targetActiveJobs: 40,
    unlockCriteria: "Auto-unlocks as soon as Orange, Bathurst & Dubbo reach >=3 verified options in top 6 categories.",
  },
  {
    waveId: "WAVE-3",
    waveTitle: "Wave 3: New England, North West Slopes, Hunter & Southern Tablelands NSW",
    timeframe: "Weeks 9–12",
    stateScope: "NSW",
    targetTowns: [
      "Tamworth (2340)",
      "Armidale (2350)",
      "Moree (2400)",
      "Narrabri (2390)",
      "Gunnedah (2380)",
      "Inverell (2360)",
      "Glen Innes (2370)",
      "Scone (2337)",
      "Goulburn (2580)",
      "Yass (2582)",
      "Cooma (2630)",
    ],
    targetNewVerifiedListings: 350,
    targetClaimedProfiles: 45,
    targetActiveJobs: 50,
    unlockCriteria: "Auto-unlocks after Wave 2 reaches >=50% town × category density.",
  },
  {
    waveId: "WAVE-4",
    waveTitle: "Wave 4: Regional Victoria (Goulburn Valley, Wimmera, Mallee, Western District & Gippsland)",
    timeframe: "Quarter 2 (Months 4–6)",
    stateScope: "VIC",
    targetTowns: [
      "Bendigo (3550)",
      "Ballarat (3350)",
      "Shepparton (3630)",
      "Echuca (3564)",
      "Horsham (3400)",
      "Hamilton (3300)",
      "Warrnambool (3280)",
      "Mildura (3500)",
      "Swan Hill (3585)",
      "Sale (3850)",
      "Bairnsdale (3875)",
    ],
    targetNewVerifiedListings: 800,
    targetClaimedProfiles: 100,
    targetActiveJobs: 100,
    unlockCriteria: "Full NSW corridor coverage complete.",
  },
  {
    waveId: "WAVE-5",
    waveTitle: "Wave 5: Regional Queensland (Darling Downs, Maranoa, Central Highlands & Western Downs)",
    timeframe: "Quarter 3 (Months 7–9)",
    stateScope: "QLD",
    targetTowns: [
      "Toowoomba (4350)",
      "Dalby (4405)",
      "Goondiwindi (4390)",
      "Roma (4455)",
      "St George (4487)",
      "Warwick (4370)",
      "Emerald (4720)",
      "Rockhampton (4700)",
      "Longreach (4730)",
      "Charleville (4470)",
    ],
    targetNewVerifiedListings: 800,
    targetClaimedProfiles: 100,
    targetActiveJobs: 100,
    unlockCriteria: "Wave 4 Victoria underway.",
  },
  {
    waveId: "WAVE-6",
    waveTitle: "Wave 6: Regional SA, WA, Tasmania & Northern Territory Pastoral Districts",
    timeframe: "Quarter 4 (Months 10–12)",
    stateScope: "SA / WA / TAS / NT",
    targetTowns: [
      "Mount Gambier (5290)",
      "Naracoorte (5271)",
      "Murray Bridge (5253)",
      "Port Lincoln (5606)",
      "Northam (6401)",
      "Katanning (6317)",
      "Geraldton (6530)",
      "Esperance (6450)",
      "Launceston / Midlands (7250)",
      "Alice Springs (0870)",
      "Katherine (0850)",
    ],
    targetNewVerifiedListings: 900,
    targetClaimedProfiles: 120,
    targetActiveJobs: 120,
    unlockCriteria: "Completes Year 1 National Rural Footprint across all 8 states & territories.",
  },
] as const;

export interface FiveYearRoadmapStage {
  year: "Year 1" | "Year 2" | "Year 3" | "Year 4" | "Year 5";
  headline: string;
  northStarMetric: string;
  verifiedActiveListingsTarget: string;
  claimedProfilesTarget: string;
  activeJobsAndWorkersTarget: string;
  aliOperatingFocus: string;
  outbackFencingSynergy: string;
}

/**
 * 5-Year Hyper-Growth Operating Plan for Outback Connections & Ali's Role Evolution.
 */
export const FIVE_YEAR_HYPERGROWTH_ROADMAP: readonly FiveYearRoadmapStage[] = [
  {
    year: "Year 1",
    headline: "National Rural Supply Density & NSW/VIC/QLD Corridor Liquidity",
    northStarMetric: "3,500+ verified active rural listings & 400+ owner-claimed profiles",
    verifiedActiveListingsTarget: "3,500+ across all 24 service & 8 freight categories",
    claimedProfilesTarget: "400+ owner-claimed & availability-confirmed profiles",
    activeJobsAndWorkersTarget: "300+ active monthly rural job & skill listings",
    aliOperatingFocus:
      "Execute Waves 1–6 systematically: add 75–125 verified rural businesses/week, send 100–150 1-to-1 claim invites/week, maintain <4h enquiry forwarding SLA, and unlock weekly town × category Facebook promotion packs.",
    outbackFencingSynergy:
      "Every fencing contractor and rural store in NSW/VIC/QLD knows Outback Connections; steady weekly warm quote handoffs to Daryl.",
  },
  {
    year: "Year 2",
    headline: "Repeat Liquidity, Live Availability Pulse & Seasonal Surge Dominance",
    northStarMetric: "10,000+ verified listings · 1,500+ claimed profiles · 1,000+ monthly enquiries/matches",
    verifiedActiveListingsTarget: "10,000+ nationwide (every rural postcode with >=3 options per core trade)",
    claimedProfilesTarget: "1,500+ claimed profiles updating availability every 45 days",
    activeJobsAndWorkersTarget: "1,000+ active seasonal workers & station/harvest roles",
    aliOperatingFocus:
      "Run seasonal campaign surges (pre-harvest header/MC drivers, winter/spring fencing & lamb-marking, summer bore/pump & diesel breakdowns), manage automated 45-day availability check-ins, and onboard regional co-ops/stations.",
    outbackFencingSynergy:
      "Claimed fencing contractors reorder C24 clips, 18V Clip Guns, Hinge Joint, Fixed Knot, and Pickets as repeat trade partners.",
  },
  {
    year: "Year 3",
    headline: "Australia's Default Rural Contracting, Freight Backload & Ag-Work Network",
    northStarMetric: "25,000+ active profiles · 2,500+ daily active users · 80% direct owner-managed",
    verifiedActiveListingsTarget: "25,000+ verified businesses, carriers & contractors",
    claimedProfilesTarget: "5,000+ verified profiles with ABN, insurance expiry & completed-work reviews",
    activeJobsAndWorkersTarget: "2,500+ live ticketed workers & rural job openings",
    aliOperatingFocus:
      "Move from cold seeding toinbound moderation, verified completed-work review curation, regional ambassador partnerships, and freight backload corridor matching.",
    outbackFencingSynergy:
      "Outback Fencing & Steel Supplies has nationwide freight backload density and preferred-supplier reach across every state.",
  },
  {
    year: "Year 4",
    headline: "National Farm Maintenance, Project & Workforce Operating System",
    northStarMetric: "50,000+ profiles · 5,000+ daily active rural users",
    verifiedActiveListingsTarget: "50,000+ rural service, freight, livestock/harvest & ag-supply listings",
    claimedProfilesTarget: "12,000+ active self-managing rural businesses",
    activeJobsAndWorkersTarget: "5,000+ active rural workforce & contracting crew profiles",
    aliOperatingFocus:
      "Lead category quality ops, multi-trade property project matching (clearing + earthworks + fencing + water + freight), and enterprise pastoral-company accounts.",
    outbackFencingSynergy:
      "Whole-property fencing & steel packages quoted directly from multi-trade project briefs.",
  },
  {
    year: "Year 5",
    headline: "10,000+ Daily Active Users — Rural Australia's Essential Free Infrastructure",
    northStarMetric: "10,000+ daily active users across Australia (& international rural expansion ready)",
    verifiedActiveListingsTarget: "75,000+ verified listings with real-time availability & trust badges",
    claimedProfilesTarget: "25,000+ owner-confirmed rural businesses & carriers",
    activeJobsAndWorkersTarget: "10,000+ active rural workers, shearers, drivers & station crew",
    aliOperatingFocus:
      "Head of Rural Hub Growth & Community Operations — overseeing automated freshness, regional community ambassadors, and international rural corridor replication.",
    outbackFencingSynergy:
      "Supports the long-term 40 Clip Guns/day global vision and nationwide steel/mesh leadership.",
  },
] as const;

export interface AliLiveTelemetryInput {
  listingsAddedLast24h: number;
  listingsAddedLast7d: number;
  nonFencingAddedLast7d: number;
  outreachEventsLast24h: number;
  outreachEventsLast7d: number;
  activeJobsCount: number;
  unansweredEnquiriesOver24h: number;
  pendingClaimsCount: number;
  centralWestFencingCount: number;
  totalNonFencingServiceCount: number;
  totalFreightCount: number;
}

export interface AliCoachingFeedbackReport {
  overallPaceStatus: "HYPERGROWTH_ON_TRACK" | "NEEDS_DAILY_ACCELERATION" | "SLA_URGENT_FIRST";
  velocityScoreOutOf100: number;
  headlineVerdict: string;
  winsSummary: string[];
  gapsToFixToday: string[];
  nextThreeDirectivesForAli: string[];
  copyPasteFeedbackForJoshToSendAli: string;
}

/**
 * Pure, deterministic coaching & monitoring engine.
 * Reads Ali's live database activity (24h and 7d) and generates immediate,
 * concrete performance feedback + a copy-paste message Josh can send Ali in 5 seconds.
 */
export function evaluateAliPerformanceAndFeedback(
  input: AliLiveTelemetryInput
): AliCoachingFeedbackReport {
  const t = ALI_HYPERGROWTH_KPI_TARGETS;

  const listing7dPct = Math.min(
    100,
    Math.round((input.listingsAddedLast7d / t.weeklyNewVerifiedListingsTarget) * 100)
  );
  const outreach7dPct = Math.min(
    100,
    Math.round((input.outreachEventsLast7d / t.weeklyOutreachActionsTarget) * 100)
  );
  const jobsPct = Math.min(100, Math.round((input.activeJobsCount / t.weeklyNewJobsTarget) * 100));
  const slaPenalty = input.unansweredEnquiriesOver24h > 0 ? 25 : 0;

  const velocityScoreOutOf100 = Math.max(
    0,
    Math.min(100, Math.round(listing7dPct * 0.45 + outreach7dPct * 0.35 + jobsPct * 0.2) - slaPenalty)
  );

  const nonFencingShare7d =
    input.listingsAddedLast7d > 0
      ? Math.round((input.nonFencingAddedLast7d / input.listingsAddedLast7d) * 100)
      : 0;

  let overallPaceStatus: AliCoachingFeedbackReport["overallPaceStatus"] =
    "NEEDS_DAILY_ACCELERATION";
  if (input.unansweredEnquiriesOver24h > 0) {
    overallPaceStatus = "SLA_URGENT_FIRST";
  } else if (velocityScoreOutOf100 >= 75) {
    overallPaceStatus = "HYPERGROWTH_ON_TRACK";
  }

  const winsSummary: string[] = [];
  const gapsToFixToday: string[] = [];
  const nextThreeDirectivesForAli: string[] = [];

  if (input.unansweredEnquiriesOver24h === 0) {
    winsSummary.push("Inbox SLA is clean (0 farmer enquiries waiting >24 hours).");
  } else {
    gapsToFixToday.push(
      `${input.unansweredEnquiriesOver24h} real farmer enquiry(s) waiting >24h — forward these before doing anything else.`
    );
    nextThreeDirectivesForAli.push(
      `1. URGENT SLA: Open /dashboard/admin/enquiries and forward the ${input.unansweredEnquiriesOver24h} waiting farmer enquiry(s) immediately.`
    );
  }

  if (input.listingsAddedLast24h >= t.dailyNewVerifiedListingsTarget) {
    winsSummary.push(
      `Hit daily supply target (${input.listingsAddedLast24h} verified listings added in the last 24h vs ${t.dailyNewVerifiedListingsTarget} target).`
    );
  } else {
    const neededToday = Math.max(0, t.dailyNewVerifiedListingsTarget - input.listingsAddedLast24h);
    gapsToFixToday.push(
      `New listings added in last 24h: ${input.listingsAddedLast24h} / ${t.dailyNewVerifiedListingsTarget} target (${input.listingsAddedLast7d} / ${t.weeklyNewVerifiedListingsTarget} in last 7 days). Need +${neededToday} more verified entries today.`
    );
  }

  if (input.outreachEventsLast24h >= t.dailyOutreachActionsTarget) {
    winsSummary.push(
      `Hit daily outreach target (${input.outreachEventsLast24h} 1-to-1 claim actions logged in last 24h).`
    );
  } else {
    const neededOutreach = Math.max(0, t.dailyOutreachActionsTarget - input.outreachEventsLast24h);
    gapsToFixToday.push(
      `Outreach actions logged in last 24h: ${input.outreachEventsLast24h} / ${t.dailyOutreachActionsTarget} target (${input.outreachEventsLast7d} / ${t.weeklyOutreachActionsTarget} in last 7 days). Log +${neededOutreach} 1-to-1 claim invites today.`
    );
  }

  if (input.listingsAddedLast7d > 0 && nonFencingShare7d < t.targetNonFencingSharePercent) {
    gapsToFixToday.push(
      `Only ${nonFencingShare7d}% of new listings this week were non-fencing (target >=${t.targetNonFencingSharePercent}%). Do not keep adding fencing contractors while mechanics (${input.totalNonFencingServiceCount} total non-fencing services) and freight (${input.totalFreightCount}) are thin.`
    );
  }

  if (nextThreeDirectivesForAli.length < 3) {
    nextThreeDirectivesForAli.push(
      `${nextThreeDirectivesForAli.length + 1}. SUPPLY BLITZ (Wave 1 Central West): Add 15–20 verified non-fencing businesses today via /dashboard/directory/add focusing on Mobile Diesel Mechanics, Bore/Water, Rural Electrical/Plumbing, and Livestock/Hay Carriers in Orange (2800), Bathurst (2795), Dubbo (2830), Parkes (2870), Forbes (2871), Cowra (2794), and Mudgee (2850).`
    );
  }
  if (nextThreeDirectivesForAli.length < 3) {
    nextThreeDirectivesForAli.push(
      `${nextThreeDirectivesForAli.length + 1}. CLAIM CONVERSION BLITZ: Send 20 personalised 1-to-1 'Free Hub Profile Claim Invites' (directory_only template) in /dashboard/admin/contractor-outreach and log every call/SMS/email so the weekly counter moves from ${input.outreachEventsLast7d} toward ${t.weeklyOutreachActionsTarget}.`
    );
  }
  if (nextThreeDirectivesForAli.length < 3) {
    nextThreeDirectivesForAli.push(
      `${nextThreeDirectivesForAli.length + 1}. WORK & SKILLS BOARD: Source 3–5 genuine rural jobs (station hands, fencers, header/machinery operators, MC/HC drivers) from official employer pages or direct permission so active jobs grow from ${input.activeJobsCount} to ${t.weeklyNewJobsTarget}+.`
    );
  }

  const headlineVerdict =
    overallPaceStatus === "HYPERGROWTH_ON_TRACK"
      ? `Hyper-growth pace on track (${velocityScoreOutOf100}/100 velocity score). Keep pushing Wave 1 -> Wave 2.`
      : overallPaceStatus === "SLA_URGENT_FIRST"
        ? `Action required: ${input.unansweredEnquiriesOver24h} overdue enquiry(s) waiting >24h. Clear SLA first, then hit daily supply & outreach targets.`
        : `Acceleration needed (${velocityScoreOutOf100}/100 velocity score): step up daily verified additions (${input.listingsAddedLast24h}/${t.dailyNewVerifiedListingsTarget} today) and logged claim invites (${input.outreachEventsLast24h}/${t.dailyOutreachActionsTarget} today).`;

  const copyPasteFeedbackForJoshToSendAli = [
    `G'day Ali — quick check-in from the live Hub Queue tracker:`,
    ``,
    `• Last 24h output: ${input.listingsAddedLast24h} new listings added (target: ${t.dailyNewVerifiedListingsTarget}/day) | ${input.outreachEventsLast24h} outreach actions logged (target: ${t.dailyOutreachActionsTarget}/day).`,
    `• Last 7d output: ${input.listingsAddedLast7d}/${t.weeklyNewVerifiedListingsTarget} listings added | ${input.outreachEventsLast7d}/${t.weeklyOutreachActionsTarget} outreach actions logged | ${input.activeJobsCount} active jobs live (target: ${t.weeklyNewJobsTarget}+).`,
    `• Non-fencing services & freight currently live: ${input.totalNonFencingServiceCount} services + ${input.totalFreightCount} freight carriers.`,
    ``,
    `Your top 3 priorities for today's shift:`,
    ...nextThreeDirectivesForAli.map((d) => `  ${d}`),
    ``,
    `Make sure every listing addition is entered through /dashboard/directory/add and every call/SMS/email is logged on the row in /dashboard/admin/contractor-outreach so your dashboard velocity score updates in real time. Let me know if anything blocks you.`,
  ].join("\n");

  return {
    overallPaceStatus,
    velocityScoreOutOf100,
    headlineVerdict,
    winsSummary,
    gapsToFixToday,
    nextThreeDirectivesForAli,
    copyPasteFeedbackForJoshToSendAli,
  };
}

export interface PromotionReadinessInput {
  categorySlug: string;
  regionLabel: string;
  activeVerifiedListingsCount: number;
  allHaveVerifiedSourceOrClaim: boolean;
  allRefreshedWithin60Days: boolean;
  mobileAndEnquiryFlowChecked: boolean;
}

export interface PromotionReadinessResult {
  readyToPromote: boolean;
  minimumRequired: number;
  passedChecks: string[];
  blockingGaps: string[];
}

/**
 * Evaluates whether a category + region page is genuinely useful enough to promote
 * externally in rural community groups or partner channels.
 */
export function evaluateCategoryTownReadiness(
  input: PromotionReadinessInput
): PromotionReadinessResult {
  const minimumRequired = 3;
  const passedChecks: string[] = [];
  const blockingGaps: string[] = [];

  if (input.activeVerifiedListingsCount >= minimumRequired) {
    passedChecks.push(
      `Has ${input.activeVerifiedListingsCount} active verified options (minimum ${minimumRequired} met).`
    );
  } else {
    blockingGaps.push(
      `Only ${input.activeVerifiedListingsCount} active verified listings in ${input.regionLabel} for ${input.categorySlug} (need at least ${minimumRequired} before promoting).`
    );
  }

  if (input.allHaveVerifiedSourceOrClaim) {
    passedChecks.push("All spotlighted listings have a verified official source URL or approved owner claim.");
  } else {
    blockingGaps.push("One or more listings still have unverified or synthetic source URLs.");
  }

  if (input.allRefreshedWithin60Days) {
    passedChecks.push("All listings were verified or refreshed within the last 60 days.");
  } else {
    blockingGaps.push("Stale listings (>60 days since verification) must be refreshed before promotion.");
  }

  if (input.mobileAndEnquiryFlowChecked) {
    passedChecks.push("Mobile layout and quote-forwarding / claim links tested.");
  } else {
    blockingGaps.push("Mobile page view and enquiry/claim link check not yet marked complete.");
  }

  return {
    readyToPromote: blockingGaps.length === 0,
    minimumRequired,
    passedChecks,
    blockingGaps,
  };
}

export const CENTRAL_WEST_PROMOTION_PACK = {
  packId: "central-west-fencing-and-rural-services-2026-10",
  title: "Central West NSW Rural Fencing, Earthworks & Property Services Directory Pack",
  targetRegion: "Orange (2800), Bathurst (2795), Dubbo (2830), Parkes (2870), Forbes (2871), Cowra (2794), Mudgee (2850)",
  landingUrlWithUtm:
    "https://outbackconnections.com.au/services/fencing-contractor?state=NSW&utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub",
  claimAndPostUrlWithUtm:
    "https://outbackconnections.com.au/post?utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub",
  communityGroupDraftCopy: `G'day everyone — we've put together a free local directory of rural fencing contractors, earthmovers, mobile diesel mechanics, bore/water specialists, and livestock/hay carriers working across the Central West (Orange, Bathurst, Dubbo, Molong, Parkes, Forbes, Cowra & Mudgee).

• Looking for someone to quote a boundary/exclusion fence, dam job, or paddock breakdown? Browse local operators by town and postcode (free, no account needed):
https://outbackconnections.com.au/services?state=NSW&utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub

• Run a rural contracting business, truck, or looking for station/fencing work? Check if your business is already listed to claim your free profile, or add your services/skills for free:
https://outbackconnections.com.au/post?utm_source=facebook&utm_medium=ali_community_pack&utm_campaign=central_west_hub

(Run by Josh & the team at Outback Fencing & Steel Supplies in Orange NSW — listings and enquiries are 100% free with zero commission.)`,
  contractorDirectInviteSnippet: `G'day [Name], Ali here from Outback Connections in Orange NSW. We've listed [Business Name] in our free Central West rural services directory so local landholders around [Town] can find your work and request quotes directly. You can check or claim your free profile anytime here: [Claim URL] — let me know if you'd like any service areas or specialties updated.`,
} as const;
