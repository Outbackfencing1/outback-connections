// lib/enquiry-fallback.ts
// The "Get a quote" form posts to /api/enquiries when JavaScript isn't
// running (slow rural connections, a failed bundle, old phones). The route
// saves the enquiry and redirects back to the listing. These helpers build
// and read that redirect. Rule: the URL carries a status code and the
// enquiry reference only, never anything the farmer typed.
//
// Pure: no server imports, so the rules run in tests.

export type EnquiryFailureCode = "bad" | "invalid" | "rate" | "gone" | "config" | "failed";

export type EnquiryNotice =
  | { kind: "sent"; reference: string; direct: boolean }
  | { kind: "error"; message: string };

const LISTING_PREFIX = "/services/listing/";
const SLUG = /^[a-z0-9-]{1,200}$/;
const REFERENCE = /^[A-Za-z0-9-]{3,40}$/;
export const ENQUIRY_ANCHOR = "get-a-quote";

const MESSAGES: Record<EnquiryFailureCode, string> = {
  bad: "Something went wrong sending that. Please try again.",
  invalid:
    "Some details were missing or didn't look right. Fill the form in again: your name, a phone or email, what needs doing, and tick the box.",
  rate: "That's a few enquiries in a short time. Try again in an hour, or email help@outbackconnections.com.au.",
  gone: "That listing isn't live any more.",
  config: "Enquiries aren't configured on this environment.",
  failed: "Couldn't send that. Please try again, or email help@outbackconnections.com.au.",
};

function isCode(v: string): v is EnquiryFailureCode {
  return Object.prototype.hasOwnProperty.call(MESSAGES, v);
}

/** Only a service listing path on this site. Anything else goes home. */
export function enquiryReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith(LISTING_PREFIX)) return "/";
  const slug = value.slice(LISTING_PREFIX.length);
  return SLUG.test(slug) ? value : "/";
}

export type EnquiryOutcome =
  | { ok: true; reference: string; direct: boolean }
  | { ok: false; code?: EnquiryFailureCode };

/** Where the no-JS form lands after a submit. Path + status only. */
export function enquiryRedirectPath(returnTo: string | null | undefined, outcome: EnquiryOutcome): string {
  const path = enquiryReturnPath(returnTo);
  const q = new URLSearchParams();
  if (outcome.ok) {
    q.set("enquiry", "sent");
    if (REFERENCE.test(outcome.reference)) q.set("ref", outcome.reference);
    if (outcome.direct) q.set("direct", "1");
  } else {
    q.set("enquiry", outcome.code ?? "failed");
  }
  return `${path}?${q.toString()}#${ENQUIRY_ANCHOR}`;
}

/** Read the redirect's query back on the listing page. */
export function enquiryNoticeFrom(
  sp: Record<string, string | string[] | undefined>
): EnquiryNotice | null {
  const status = typeof sp.enquiry === "string" ? sp.enquiry : "";
  if (status === "sent") {
    const ref = typeof sp.ref === "string" && REFERENCE.test(sp.ref) ? sp.ref : null;
    if (!ref) return null;
    return { kind: "sent", reference: ref, direct: sp.direct === "1" };
  }
  if (isCode(status)) return { kind: "error", message: MESSAGES[status] };
  return null;
}
