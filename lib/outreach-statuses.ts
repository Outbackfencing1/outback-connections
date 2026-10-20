// lib/outreach-statuses.ts
// Directory outreach statuses, hub task states, channel eligibility rules,
// and separate Daryl product-handoff states.
//
// Core audit rules enforced here:
// 1. Directory participation (`joined` = profile claimed) is NEVER mapped to a
//    product sale (`Won` / `order_placed` / `paid`).
// 2. Research/discovery (`directory_research_only`) and claim help (`claim_support_only`)
//    are NOT marketing opt-in clearance.
// 3. Adding an ordinary note NEVER erases existing task, consent, or handoff state
//    (`mergeDurableOutreachMeta` / `parseSalesMetaFromNote`).

export const OUTREACH_STATUSES = [
  { value: "not_contacted", label: "Not contacted (Directory record)" },
  { value: "attempted", label: "Attempted (left message)" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested (Claim or enquiry)" },
  { value: "invite_sent", label: "Claim invite sent" },
  { value: "follow_up", label: "Follow-up due" },
  { value: "joined", label: "Profile claimed (Directory member)" },
  { value: "not_interested", label: "Closed — Not interested" },
  { value: "invalid_duplicate", label: "Invalid / duplicate" },
  { value: "do_not_contact", label: "Do not contact" },
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]["value"];

/** Outreach templates: default is always directory_only (no unsolicited product pitch). */
export const OUTREACH_TEMPLATES = [
  {
    id: "directory_only",
    label: "1. Free Hub Profile Claim Invite (No Product Pitch — Default)",
  },
  {
    id: "clipgun_focus",
    label: "2. Claim Profile + 18V Clip Gun Note (When Relevant)",
  },
  {
    id: "mesh_picket_focus",
    label: "3. Claim Profile + Orange NSW Mesh & Pickets Note (When Relevant)",
  },
] as const;

/** Separate workflow states for Ali's hub tasks (never conflated with listing publication or sales). */
export const HUB_TASK_STATES = [
  "Ready",
  "In progress",
  "Needs review",
  "Blocked",
  "Completed",
  "Cancelled",
] as const;
export type HubTaskState = (typeof HUB_TASK_STATES)[number];

/**
 * Separate stages for directory/relationship vs product handoff.
 * Note: `joined` maps to `"Profile claimed"` (directory participation), NEVER `"Won"`.
 */
export const SALES_STAGES = [
  { value: "Research", dbStatus: "not_contacted" as OutreachStatus, needsDaryl: false },
  { value: "Ready for outreach", dbStatus: "not_contacted" as OutreachStatus, needsDaryl: false },
  { value: "Contacted", dbStatus: "contacted" as OutreachStatus, needsDaryl: false },
  { value: "Interested", dbStatus: "interested" as OutreachStatus, needsDaryl: false },
  { value: "Profile claimed", dbStatus: "joined" as OutreachStatus, needsDaryl: false },
  { value: "Quote needed", dbStatus: "interested" as OutreachStatus, needsDaryl: true },
  { value: "Quoted", dbStatus: "follow_up" as OutreachStatus, needsDaryl: false },
  { value: "Follow-up due", dbStatus: "follow_up" as OutreachStatus, needsDaryl: false },
  { value: "Closed", dbStatus: "not_interested" as OutreachStatus, needsDaryl: false },
] as const;

export type SalesStage = (typeof SALES_STAGES)[number]["value"];

/** Explicit, separate product handoff lifecycle owned by Daryl / Sales (never inferred from profile claim). */
export const DARYL_HANDOFF_STATES = [
  { value: "none", label: "No product enquiry" },
  { value: "handed_to_daryl", label: "Product enquiry handed to Daryl" },
  { value: "quoted_by_sales", label: "Quote sent by Daryl / Joshua" },
  { value: "order_placed", label: "Order placed (awaiting payment)" },
  { value: "paid", label: "Order paid" },
  { value: "fulfilled", label: "Order fulfilled / dispatched" },
] as const;
export type DarylHandoffState = (typeof DARYL_HANDOFF_STATES)[number]["value"];

export const CUSTOMER_FIT_OPTIONS = [
  "Rural Hub Service Provider (Directory Listing)",
  "Rural Hub Employer / Job Vacancy Poster",
  "Rural Freight / Livestock Carrier",
  "Fencing Contractor (Hub Provider + Potential Trade Buyer)",
  "Rural Store / Trade Supplier",
  "Landholder / Direct Product Enquirer",
] as const;

export const RELEVANT_PRODUCT_OPTIONS = [
  "None — Free Rural Hub Listing Only",
  "Outback 18V Cordless Clip Gun & C24 Stainless Clips",
  "Hinged Joint Mesh (Orange NSW Factory)",
  "Fixed Knot 16/180/15 Exclusion Mesh (Orange NSW Factory)",
  "Outback Pickets (Bitumen / Gal / Jumbo)",
  "N-Brace Farm Gates & Strainer Assemblies",
  "Whole-Fence Material Quote (Hand to Daryl)",
] as const;

/**
 * ACMA-aligned separation between directory discovery, claim support, inbound enquiry replies,
 * and explicit marketing consent. A public/scraped email or personalised draft is NOT marketing clearance.
 */
export const MARKETING_CONSENT_OPTIONS = [
  {
    value: "directory_research_only",
    label: "Directory research record only (No marketing clearance)",
    shortBadge: "Directory Only",
  },
  {
    value: "prospective_1to1",
    label: "Claim / listing verification only (No unsolicited product marketing)",
    shortBadge: "Claim Support Only",
  },
  {
    value: "enquired_transactional",
    label: "Inbound enquiry / quote request (Transactional reply permitted)",
    shortBadge: "Inbound Enquiry",
  },
  {
    value: "opted_in_marketing",
    label: "Explicit marketing opt-in confirmed",
    shortBadge: "Marketing Opt-In",
  },
  {
    value: "do_not_contact",
    label: "Do Not Contact / Suppressed",
    shortBadge: "Do Not Contact",
  },
] as const;

export type MarketingConsentStatus = (typeof MARKETING_CONSENT_OPTIONS)[number]["value"];

export type ParsedSalesMeta = {
  stage: SalesStage | null;
  taskState: HubTaskState;
  darylHandoff: DarylHandoffState;
  customerFit: string | null;
  relevantProduct: string | null;
  consent: MarketingConsentStatus;
  nextAction: string | null;
  cleanNote: string;
  needsJoshua: boolean;
};

const META_PREFIX_RE = /^\[(?:Sales Queue|Hub Meta):([^\]]+)\]\s*/i;
const META_ANYWHERE_RE = /\[(?:Sales Queue|Hub Meta):([^\]]+)\]/i;

export function defaultStageForStatus(status: OutreachStatus | null): SalesStage {
  switch (status) {
    case "contacted":
    case "attempted":
    case "invite_sent":
      return "Contacted";
    case "interested":
      return "Interested";
    case "follow_up":
      return "Follow-up due";
    case "joined":
      // CRITICAL: A claimed profile (`joined`) is "Profile claimed", NEVER a product sale ("Won").
      return "Profile claimed";
    case "not_interested":
    case "invalid_duplicate":
    case "do_not_contact":
      return "Closed";
    default:
      return "Ready for outreach";
  }
}

export const outreachStatusToSalesStage = defaultStageForStatus;

/**
 * Parses structured metadata from a single note, multi-part note string (`\n---\n`),
 * or an array of historical notes (newest first). If the latest note is an ordinary
 * plain-text note without a metadata header, it preserves the most recent durable
 * metadata from earlier notes rather than resetting state to defaults.
 */
export function parseSalesMetaFromNote(
  noteOrNotes: string | Array<string | null | undefined> | null | undefined,
  status?: OutreachStatus | null
): ParsedSalesMeta {
  const rawArray = Array.isArray(noteOrNotes)
    ? noteOrNotes.map((n) => (n ?? "").trim()).filter(Boolean)
    : [(noteOrNotes ?? "").trim()].filter(Boolean);

  // Also split any note that contains `\n---\n` history blocks (newest or oldest)
  const notesList: string[] = [];
  for (const item of rawArray) {
    if (item.includes("\n---\n")) {
      const segments = item
        .split(/\n---\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      notesList.push(...segments);
    } else {
      notesList.push(item);
    }
  }

  const fallbackStage = defaultStageForStatus(status ?? null);
  const fallbackConsent: MarketingConsentStatus =
    status === "do_not_contact" ? "do_not_contact" : "directory_research_only";

  const latestRaw = notesList[0] ?? "";
  const latestMatch = latestRaw.match(META_PREFIX_RE);
  const cleanNote = latestMatch ? latestRaw.slice(latestMatch[0].length).trim() : latestRaw;

  // Find the newest note in history that carries durable metadata
  let headerSource: string | null = latestMatch ? (latestMatch[1] ?? null) : null;
  if (!headerSource) {
    for (const entry of notesList) {
      const m = entry.match(META_PREFIX_RE) ?? entry.match(META_ANYWHERE_RE);
      if (m) {
        headerSource = m[1] ?? null;
        break;
      }
    }
  }

  if (!headerSource) {
    const needsJoshua =
      /\b(quote needed|needs quote|hand to daryl|daryl|freight quote|bulk price)\b/i.test(
        latestRaw
      );
    return {
      stage: fallbackStage,
      taskState: status === "joined" ? "Completed" : "Ready",
      darylHandoff: "none",
      customerFit: null,
      relevantProduct: null,
      consent: fallbackConsent,
      nextAction: null,
      cleanNote,
      needsJoshua,
    };
  }

  const kv = new Map<string, string>();
  for (const part of headerSource.split("|")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim().toLowerCase();
      const v = part.slice(idx + 1).trim();
      if (v) kv.set(k, v);
    }
  }

  const rawStage = kv.get("stage");
  // Never map "Won" or "joined" to a sale if it came from directory claim
  const mappedStageCandidate =
    rawStage === "Won" ? "Profile claimed" : (rawStage as SalesStage | undefined);
  const stage =
    mappedStageCandidate && SALES_STAGES.some((s) => s.value === mappedStageCandidate)
      ? mappedStageCandidate
      : fallbackStage;

  const taskCandidate = kv.get("task") as HubTaskState | undefined;
  const taskState =
    taskCandidate && (HUB_TASK_STATES as readonly string[]).includes(taskCandidate)
      ? taskCandidate
      : stage === "Profile claimed"
        ? "Completed"
        : "Ready";

  const handoffCandidate = kv.get("handoff") as DarylHandoffState | undefined;
  const darylHandoff =
    handoffCandidate && DARYL_HANDOFF_STATES.some((h) => h.value === handoffCandidate)
      ? handoffCandidate
      : stage === "Quote needed"
        ? "handed_to_daryl"
        : "none";

  const consentCandidate = kv.get("consent") as MarketingConsentStatus | undefined;
  const consent =
    consentCandidate && MARKETING_CONSENT_OPTIONS.some((c) => c.value === consentCandidate)
      ? consentCandidate
      : fallbackConsent;

  const customerFit = kv.get("fit") ?? null;
  const relevantProduct = kv.get("product") ?? null;
  const nextAction = kv.get("next") ?? null;
  const needsJoshua =
    stage === "Quote needed" ||
    darylHandoff === "handed_to_daryl" ||
    /\b(quote needed|needs quote|joshua|daryl|freight quote)\b/i.test(cleanNote);

  return {
    stage,
    taskState,
    darylHandoff,
    customerFit,
    relevantProduct,
    consent,
    nextAction,
    cleanNote,
    needsJoshua,
  };
}

/**
 * Formats structured metadata into the outreach note prefix.
 */
export function formatSalesMetaNote(input: {
  stage?: SalesStage | null;
  taskState?: HubTaskState | null;
  darylHandoff?: DarylHandoffState | null;
  customerFit?: string | null;
  relevantProduct?: string | null;
  consent?: MarketingConsentStatus | null;
  nextAction?: string | null;
  note?: string | null;
}): string {
  const parts: string[] = [];
  if (input.stage) parts.push(`stage=${input.stage.replace(/[|\]]/g, "/")}`);
  if (input.taskState) parts.push(`task=${input.taskState.replace(/[|\]]/g, "/")}`);
  if (input.darylHandoff && input.darylHandoff !== "none") {
    parts.push(`handoff=${input.darylHandoff}`);
  }
  if (input.customerFit) parts.push(`fit=${input.customerFit.replace(/[|\]]/g, "/")}`);
  if (input.relevantProduct) parts.push(`product=${input.relevantProduct.replace(/[|\]]/g, "/")}`);
  if (input.consent) parts.push(`consent=${input.consent}`);
  if (input.nextAction?.trim()) {
    parts.push(`next=${input.nextAction.trim().replace(/[|\]]/g, "/")}`);
  }
  const body = (input.note ?? "").trim();
  if (parts.length === 0) return body;
  const prefix = `[Hub Meta: ${parts.join(" | ")}]`;
  return body ? `${prefix} ${body}` : prefix;
}

/**
 * Merges a new note or partial metadata update with the previous note's durable
 * metadata so that adding an ordinary note NEVER erases task, consent, or
 * Daryl handoff state.
 */
export function mergeDurableOutreachMeta(
  previousNoteOrHistory: string | Array<string | null | undefined> | null | undefined,
  updates: {
    stage?: SalesStage | null;
    taskState?: HubTaskState | null;
    darylHandoff?: DarylHandoffState | null;
    customerFit?: string | null;
    relevantProduct?: string | null;
    consent?: MarketingConsentStatus | null;
    nextAction?: string | null;
    note?: string | null;
  },
  currentStatus?: OutreachStatus | null
): string {
  const prev = parseSalesMetaFromNote(previousNoteOrHistory, currentStatus);
  return formatSalesMetaNote({
    stage: updates.stage !== undefined ? updates.stage : prev.stage,
    taskState: updates.taskState !== undefined ? updates.taskState : prev.taskState,
    darylHandoff: updates.darylHandoff !== undefined ? updates.darylHandoff : prev.darylHandoff,
    customerFit: updates.customerFit !== undefined ? updates.customerFit : prev.customerFit,
    relevantProduct:
      updates.relevantProduct !== undefined ? updates.relevantProduct : prev.relevantProduct,
    consent: updates.consent !== undefined ? updates.consent : prev.consent,
    nextAction: updates.nextAction !== undefined ? updates.nextAction : prev.nextAction,
    note: updates.note !== undefined ? updates.note : prev.cleanNote,
  });
}
