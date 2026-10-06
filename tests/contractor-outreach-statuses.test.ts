// The outreach statuses are used at runtime by the server page (filters,
// labels). A server component only gets a client reference for a value
// exported from a "use client" module, so the list must live in a plain
// module: on main the page threw "OUTREACH_STATUSES.some is not a function"
// for every staff/admin visit.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { OUTREACH_STATUSES } from "@/app/dashboard/admin/contractor-outreach/statuses";

const dir = path.join(__dirname, "..", "app", "dashboard", "admin", "contractor-outreach");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8");

describe("contractor outreach statuses", () => {
  it("live in a plain module, not a client module", () => {
    expect(read("statuses.ts")).not.toMatch(/^\s*["']use client["']/m);
    expect(OUTREACH_STATUSES.map((s) => s.value)).toContain("do_not_contact");
    expect(new Set(OUTREACH_STATUSES.map((s) => s.value)).size).toBe(OUTREACH_STATUSES.length);
  });

  it("the server page and client actions import them from that module", () => {
    expect(read("page.tsx")).toMatch(/import \{ OUTREACH_STATUSES[^}]*\} from "\.\/statuses"/);
    expect(read("OutreachRowActions.tsx")).toMatch(/import \{ OUTREACH_STATUSES[^}]*\} from "\.\/statuses"/);
    expect(read("OutreachRowActions.tsx")).not.toMatch(/export const OUTREACH_STATUSES/);
  });
});
