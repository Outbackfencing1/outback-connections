import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { enquiryNoticeFrom, enquiryRedirectPath, enquiryReturnPath } from "@/lib/enquiry-fallback";

const submitEnquiry = vi.fn();
vi.mock("@/app/listings/enquiry-actions", () => ({
  submitEnquiry: (fd: FormData) => submitEnquiry(fd),
}));

const LISTING = "/services/listing/smith-fencing-orange-2800";
const PII = ["Sam Farmer", "0427123456", "sam@example.com", "boundary fence", "2800"];

function farmerForm(extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("listing_id", "11111111-2222-3333-4444-555555555555");
  fd.set("return_to", LISTING);
  fd.set("name", "Sam Farmer");
  fd.set("phone", "0427123456");
  fd.set("email", "sam@example.com");
  fd.set("postcode", "2800");
  fd.set("message", "About 2km of boundary fence near Cargo.");
  fd.set("consent", "on");
  fd.set("website", "");
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return fd;
}

async function post(fd: FormData, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/enquiries/route");
  const req = new NextRequest("https://www.outbackconnections.com.au/api/enquiries", {
    method: "POST",
    body: fd,
    headers: { host: "www.outbackconnections.com.au", ...headers },
  });
  return POST(req);
}

describe("enquiry no-JS fallback route", () => {
  beforeEach(() => submitEnquiry.mockReset());

  it("saves through the server action and 303s back with only the reference", async () => {
    submitEnquiry.mockResolvedValue({ ok: true, reference: "ENQ-7K2P9", direct: false });
    const res = await post(farmerForm());

    expect(submitEnquiry).toHaveBeenCalledTimes(1);
    const sent = submitEnquiry.mock.calls[0][0] as FormData;
    expect(sent.get("name")).toBe("Sam Farmer");
    expect(sent.get("consent")).toBe("on");

    expect(res.status).toBe(303);
    const loc = res.headers.get("location")!;
    expect(loc).toBe(
      `https://www.outbackconnections.com.au${LISTING}?enquiry=sent&ref=ENQ-7K2P9#get-a-quote`
    );
    for (const p of PII.slice(0, 4)) expect(decodeURIComponent(loc)).not.toContain(p);
  });

  it("on a validation failure returns a code, not what the farmer typed", async () => {
    submitEnquiry.mockResolvedValue({ ok: false, errors: { name: "x" }, code: "invalid" });
    const res = await post(farmerForm());
    const loc = res.headers.get("location")!;
    expect(res.status).toBe(303);
    expect(new URL(loc).searchParams.get("enquiry")).toBe("invalid");
    expect([...new URL(loc).searchParams.keys()]).toEqual(["enquiry"]);
    for (const p of PII.slice(0, 4)) expect(decodeURIComponent(loc)).not.toContain(p);
  });

  it("refuses a cross-site post without saving", async () => {
    const res = await post(farmerForm(), { origin: "https://evil.example" });
    expect(submitEnquiry).not.toHaveBeenCalled();
    expect(new URL(res.headers.get("location")!).searchParams.get("enquiry")).toBe("bad");
  });

  it("never redirects off the listing pages", async () => {
    submitEnquiry.mockResolvedValue({ ok: true, reference: "ENQ-1", direct: true });
    const res = await post(farmerForm({ return_to: "//evil.example/x" }));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.host).toBe("www.outbackconnections.com.au");
    expect(loc.pathname).toBe("/");
  });
});

describe("enquiry fallback helpers", () => {
  it("only returns to a service listing path", () => {
    expect(enquiryReturnPath(LISTING)).toBe(LISTING);
    expect(enquiryReturnPath("/dashboard")).toBe("/");
    expect(enquiryReturnPath("/services/listing/../../dashboard")).toBe("/");
    expect(enquiryReturnPath("https://evil.example")).toBe("/");
    expect(enquiryReturnPath(null)).toBe("/");
  });

  it("round-trips a sent notice and an error notice", () => {
    const sent = new URL(enquiryRedirectPath(LISTING, { ok: true, reference: "ENQ-AB12", direct: true }), "https://x");
    expect(enquiryNoticeFrom(Object.fromEntries(sent.searchParams))).toEqual({
      kind: "sent",
      reference: "ENQ-AB12",
      direct: true,
    });
    const err = new URL(enquiryRedirectPath(LISTING, { ok: false, code: "rate" }), "https://x");
    const n = enquiryNoticeFrom(Object.fromEntries(err.searchParams));
    expect(n?.kind).toBe("error");
  });

  it("ignores junk in the query", () => {
    expect(enquiryNoticeFrom({ enquiry: "sent", ref: "<script>" })).toBeNull();
    expect(enquiryNoticeFrom({ enquiry: "toString" })).toBeNull();
    expect(enquiryNoticeFrom({})).toBeNull();
  });
});
