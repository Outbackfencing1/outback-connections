// lib/work-board.ts
// Pure helpers and taxonomy constants for the two-sided Rural Work & Skills Board
// (employers hiring vs. workers, drivers & machine operators listing their skills).
// No server imports so this module can be imported in both client and server components.

export const JOB_DIRECTIONS = ["hiring", "available_for_work"] as const;
export type JobDirection = (typeof JOB_DIRECTIONS)[number];

export const JOB_DIRECTION_LABELS: Record<JobDirection, string> = {
  hiring: "Hiring (Job available)",
  available_for_work: "Available for work (Worker / Operator)",
};

export const WORKER_TICKETS = [
  "mc_licence",
  "hc_licence",
  "hr_licence",
  "header_operator",
  "tractor_gps",
  "excavator_dozer",
  "telehandler_loader",
  "chemcert_spraying",
  "livestock_dogs",
  "fencing",
  "shearing_crutching",
  "welding_mechanic",
  "white_card",
  "own_ute_tools",
  "own_camp_accommodation",
] as const;

export type WorkerTicket = (typeof WORKER_TICKETS)[number];

export const WORKER_TICKET_LABELS: Record<WorkerTicket, string> = {
  mc_licence: "MC Truck Licence",
  hc_licence: "HC Truck Licence",
  hr_licence: "HR Truck Licence",
  header_operator: "Header / Harvester Operator",
  tractor_gps: "Tractor / Airseeder / GPS",
  excavator_dozer: "Excavator / Dozer / Grader",
  telehandler_loader: "Loader / Telehandler / Forklift",
  chemcert_spraying: "ChemCert / Spray Rig",
  livestock_dogs: "Livestock Handling / Working Dogs",
  fencing: "Rural Fencing",
  shearing_crutching: "Shearing / Crutching / Woolhandling",
  welding_mechanic: "Welding / Fabrication / Diesel Mechanic",
  white_card: "White Card",
  own_ute_tools: "Own Ute & Tools",
  own_camp_accommodation: "Self-Contained (Swag / Caravan)",
};

export const TRAVEL_RADII = [
  "postcode_only",
  "within_50km",
  "within_200km",
  "state_wide",
  "national",
] as const;

export type TravelRadius = (typeof TRAVEL_RADII)[number];

export const TRAVEL_RADIUS_LABELS: Record<TravelRadius, string> = {
  postcode_only: "Local area only",
  within_50km: "Within 50 km",
  within_200km: "Within 200 km",
  state_wide: "Anywhere in state",
  national: "Australia-wide",
};

const VALID_TICKET_SET = new Set<string>(WORKER_TICKETS);

/**
 * Safely parses worker tickets from FormData values, comma-separated strings,
 * or string arrays into a deduplicated array of known `WorkerTicket` slugs.
 */
export function parseWorkerTickets(input: unknown): WorkerTicket[] {
  const rawList: string[] = [];
  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        for (const part of item.split(",")) {
          rawList.push(part.trim());
        }
      }
    }
  } else if (typeof input === "string" && input.trim() !== "") {
    for (const part of input.split(",")) {
      rawList.push(part.trim());
    }
  }

  const seen = new Set<WorkerTicket>();
  const out: WorkerTicket[] = [];
  for (const candidate of rawList) {
    if (VALID_TICKET_SET.has(candidate) && !seen.has(candidate as WorkerTicket)) {
      seen.add(candidate as WorkerTicket);
      out.push(candidate as WorkerTicket);
    }
  }
  return out;
}

export function ticketLabel(ticket: string): string {
  return WORKER_TICKET_LABELS[ticket as WorkerTicket] ?? ticket.replace(/_/g, " ");
}

export function travelRadiusLabel(radius: string | null | undefined): string | null {
  if (!radius) return null;
  return TRAVEL_RADIUS_LABELS[radius as TravelRadius] ?? radius.replace(/_/g, " ");
}

export function jobDirectionBadge(direction: string | null | undefined): {
  label: string;
  isWorker: boolean;
} {
  if (direction === "available_for_work") {
    return { label: "Available for work", isWorker: true };
  }
  return { label: "Hiring", isWorker: false };
}

export function formatJobRate(detail: {
  pay_type?: string | null;
  pay_amount?: number | null;
}): string | null {
  if (!detail.pay_type || detail.pay_type === "not_specified") return null;
  if (detail.pay_type === "negotiable" && (detail.pay_amount === null || detail.pay_amount === undefined)) {
    return "Rate negotiable";
  }
  if (detail.pay_amount !== null && detail.pay_amount !== undefined) {
    const num = Number(detail.pay_amount);
    if (Number.isFinite(num) && num > 0) {
      const formatted = num % 1 === 0
        ? `$${num.toLocaleString("en-AU")}`
        : `$${num.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      switch (detail.pay_type) {
        case "hourly":
          return `${formatted}/hr`;
        case "daily":
          return `${formatted}/day`;
        case "weekly":
          return `${formatted}/wk`;
        case "negotiable":
          return `${formatted} neg.`;
        default:
          return formatted;
      }
    }
  }
  return detail.pay_type.replace(/_/g, " ");
}
