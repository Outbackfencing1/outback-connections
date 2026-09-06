import { describe, expect, it } from "vitest";
import { validateEnquiry } from "@/lib/enquiries";

describe("validateEnquiry", () => {
  it("accepts a normal farmer enquiry with a phone number", () => {
    const r = validateEnquiry({
      name: "Sam Farmer",
      phone: "0427  123 456",
      postcode: "2800",
      message: "About 2km of boundary fence near Cargo, hoping for October.",
      consent: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.honeypot).toBe(false);
    expect(r.value.phone).toBe("0427 123 456");
    expect(r.value.email).toBeNull();
  });

  it("requires a way to reach them and consent", () => {
    const r = validateEnquiry({ name: "Sam", message: "Need a fence fixed on the back paddock.", consent: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.phone).toBeDefined();
    expect(r.errors.consent).toBeDefined();
  });

  it("flags the honeypot without failing validation (so bots get a fake success)", () => {
    const r = validateEnquiry({
      name: "Bot",
      email: "bot@example.com",
      message: "buy cheap stuff online now please",
      consent: true,
      website: "http://spam.example",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.honeypot).toBe(true);
  });

  it("rejects bad postcode, email and short messages", () => {
    const r = validateEnquiry({ name: "Sam", email: "nope", postcode: "28", message: "short", consent: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["email", "message", "postcode"]);
  });
});
