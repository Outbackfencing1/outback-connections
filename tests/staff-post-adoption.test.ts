import { describe, expect, it } from "vitest";
import { buildDirectoryRecord } from "@/lib/directory-records";
import {
  closedOriginalSourceUrl,
  parseFoundOn,
  planStaffPost,
  screenStaffPost,
  stateFromPostcode,
  type StaffPostRow,
} from "@/lib/staff-post-adoption";

const base: StaffPostRow = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "Exceptional Fencing",
  description:
    "Exceptional Fencing is a general fencing business we found listed on yellow_pages in Dalmeny, NSW. This is an UNCLAIMED directory listing.",
  postcode: "2546",
  state: "NSW",
  category_slug: "fencing-contractor",
  contact_phone: "0400 000 000",
  contact_email: "jobs@example.com",
  created_at: "2026-10-01T00:00:00Z",
  user_id: "34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93",
};

describe("parseFoundOn", () => {
  it("reads platform, town and state from the directory boilerplate", () => {
    expect(parseFoundOn(base.description)).toEqual({ platform: "yellow_pages", suburb: "Dalmeny", state: "NSW" });
    expect(
      parseFoundOn("X is a fencing business we found listed on its official website in Emu Heights, NSW. This is…")
    ).toEqual({ platform: "official_website", suburb: "Emu Heights", state: "NSW" });
  });

  it("falls back to web when the description says nothing", () => {
    expect(parseFoundOn("Great fencers")).toEqual({ platform: "web", suburb: "", state: "" });
  });
});

describe("screenStaffPost", () => {
  it("adopts a normal contractor and keeps contact private", () => {
    const s = screenStaffPost(base);
    expect(s.verdict).toBe("adopt");
    if (s.verdict !== "adopt") return;
    const built = buildDirectoryRecord(s.input, { enteredBy: base.user_id, enteredVia: "test" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.source_platform).toBe("yellow_pages");
    expect(built.record.raw_payload.phone).toBe("0400 000 000");
    expect(built.record.raw_payload.email).toBe("jobs@example.com");
    expect(built.urlKind).toBe("search");
  });

  it("holds a title that is just a place", () => {
    const s = screenStaffPost({ ...base, title: "Seven Hills NSW" });
    expect(s.verdict).toBe("hold");
  });

  it("keeps a business that happens to end in a state", () => {
    expect(screenStaffPost({ ...base, title: "Statewide Rural Fencing" }).verdict).toBe("adopt");
  });

  it("holds off-topic trades", () => {
    const s = screenStaffPost({ ...base, title: "Dubbo Scaffolding" });
    expect(s.verdict).toBe("hold");
    if (s.verdict === "hold") expect(s.reasons.join(" ")).toMatch(/scaffold/);
  });

  it("matches off-topic words whole, not inside names", () => {
    expect(screenStaffPost({ ...base, title: "EJ Douglass Contract Fencing" }).verdict).toBe("adopt");
    expect(screenStaffPost({ ...base, title: "Liverpool Rural Fencing" }).verdict).toBe("adopt");
    expect(screenStaffPost({ ...base, title: "Sydney Pool Fencing" }).verdict).toBe("hold");
  });

  it("drops a malformed phone rather than failing the record", () => {
    const s = screenStaffPost({ ...base, contact_phone: "call me" });
    expect(s.verdict).toBe("adopt");
    if (s.verdict === "adopt") expect(s.input.phone).toBe("");
  });
});

describe("planStaffPost", () => {
  const found = (on: string) => `X is a fencing business we found listed on ${on} in Orange, NSW. This is an UNCLAIMED directory listing.`;

  it("adopts every boilerplate variant seen on the live staff posts", () => {
    for (const on of ["Facebook", "yellow_pages", "its official website", "its website", "the yellow_pages", "yelow_pages", "Localsearch", "the Polo_map"]) {
      const p = planStaffPost({ ...base, description: found(on) });
      expect(p.verdict, on).toBe("adopt");
    }
    expect(planStaffPost({ ...base, description: "Great fencers" }).verdict).toBe("adopt");
  });

  it("says 'found online' when the post names a site that needs a page URL it doesn't have", () => {
    const p = planStaffPost({ ...base, description: found("its official website") });
    expect(p.verdict).toBe("adopt");
    if (p.verdict !== "adopt") return;
    expect(p.record.source_platform).toBe("web");
    expect(p.urlKind).toBe("search");
    expect(p.record.source_url).toMatch(/^https:[/][/]www[.]google[.]com[/]search/);
    expect(String(p.record.raw_payload.notes)).toMatch(/official_website/);
  });

  it("strips a leading 'the' before matching the platform", () => {
    const p = planStaffPost({ ...base, description: found("the yellow_pages") });
    if (p.verdict === "adopt") expect(p.record.source_platform).toBe("yellow_pages");
  });

  it("fills a missing or unusable state from the description, then the postcode", () => {
    const fromDesc = planStaffPost({ ...base, state: null });
    expect(fromDesc.verdict === "adopt" && fromDesc.record.state).toBe("NSW");
    const fromPostcode = planStaffPost({ ...base, state: "New South Wales", description: "Great fencers", postcode: "3350" });
    expect(fromPostcode.verdict === "adopt" && fromPostcode.record.state).toBe("VIC");
  });

  it("holds a row the record builder rejects instead of leaving it live", () => {
    const p = planStaffPost({ ...base, title: `${"Very Long Fencing Name ".repeat(6)}Pty Ltd` });
    expect(p.verdict).toBe("hold");
    if (p.verdict === "hold") expect(p.reasons.join(" ")).toMatch(/could not re-file/);
  });

  it("keeps phone and email only in the private payload", () => {
    const p = planStaffPost(base);
    expect(p.verdict).toBe("adopt");
    if (p.verdict !== "adopt") return;
    expect(p.record.raw_payload.phone).toBe("0400 000 000");
    expect(JSON.stringify({ ...p.record, raw_payload: null })).not.toMatch(/0400|example[.]com/);
  });
});

describe("stateFromPostcode", () => {
  it("maps Australian postcode ranges", () => {
    expect(stateFromPostcode("2800")).toBe("NSW");
    expect(stateFromPostcode("2600")).toBe("ACT");
    expect(stateFromPostcode("2913")).toBe("ACT");
    expect(stateFromPostcode("0870")).toBe("NT");
    expect(stateFromPostcode("4350")).toBe("QLD");
    expect(stateFromPostcode("5290")).toBe("SA");
    expect(stateFromPostcode("6430")).toBe("WA");
    expect(stateFromPostcode("7250")).toBe("TAS");
    expect(stateFromPostcode("3550")).toBe("VIC");
    expect(stateFromPostcode("abc")).toBeNull();
    expect(stateFromPostcode(null)).toBeNull();
  });
});

describe("closedOriginalSourceUrl", () => {
  it("always gives a source link so the contact columns can be cleared", () => {
    expect(closedOriginalSourceUrl({ title: "Kings Fencing & Gates", postcode: "2800", state: null })).toBe(
      "https://www.google.com/search?q=Kings+Fencing+and+Gates+2800+NSW"
    );
  });
});
