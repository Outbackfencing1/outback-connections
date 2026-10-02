import { describe, expect, it } from "vitest";
import { buildDirectoryRecord } from "@/lib/directory-records";
import { parseFoundOn, screenStaffPost, type StaffPostRow } from "@/lib/staff-post-adoption";

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
