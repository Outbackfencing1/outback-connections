import { describe, expect, it } from "vitest";
import {
  formatJobRate,
  jobDirectionBadge,
  parseWorkerTickets,
  ticketLabel,
  travelRadiusLabel,
} from "@/lib/work-board";

describe("parseWorkerTickets", () => {
  it("parses arrays, comma-separated strings, and drops unknown/duplicate values", () => {
    expect(parseWorkerTickets(["mc_licence", "header_operator", "mc_licence", "not_a_ticket"])).toEqual([
      "mc_licence",
      "header_operator",
    ]);
    expect(parseWorkerTickets("hc_licence, fencing, own_ute_tools")).toEqual([
      "hc_licence",
      "fencing",
      "own_ute_tools",
    ]);
    expect(parseWorkerTickets("")).toEqual([]);
    expect(parseWorkerTickets(undefined)).toEqual([]);
  });
});

describe("jobDirectionBadge", () => {
  it("distinguishes worker skill listings from hiring ads", () => {
    expect(jobDirectionBadge("available_for_work")).toEqual({
      label: "Available for work",
      isWorker: true,
    });
    expect(jobDirectionBadge("hiring")).toEqual({
      label: "Hiring",
      isWorker: false,
    });
    expect(jobDirectionBadge(null)).toEqual({
      label: "Hiring",
      isWorker: false,
    });
  });
});

describe("formatJobRate", () => {
  it("formats hourly, daily, weekly and negotiable rates cleanly", () => {
    expect(formatJobRate({ pay_type: "hourly", pay_amount: 45 })).toBe("$45/hr");
    expect(formatJobRate({ pay_type: "daily", pay_amount: 350 })).toBe("$350/day");
    expect(formatJobRate({ pay_type: "weekly", pay_amount: 1800 })).toBe("$1,800/wk");
    expect(formatJobRate({ pay_type: "negotiable", pay_amount: null })).toBe("Rate negotiable");
    expect(formatJobRate({ pay_type: "not_specified", pay_amount: null })).toBeNull();
  });
});

describe("ticketLabel & travelRadiusLabel", () => {
  it("returns readable Australian labels", () => {
    expect(ticketLabel("mc_licence")).toBe("MC Truck Licence");
    expect(ticketLabel("header_operator")).toBe("Header / Harvester Operator");
    expect(travelRadiusLabel("within_200km")).toBe("Within 200 km");
    expect(travelRadiusLabel(null)).toBeNull();
  });
});
