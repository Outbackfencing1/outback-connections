// app/api/enquiries/route.ts
// No-JavaScript fallback for the "Get a quote" form. The form's native
// submit is a POST here (never a GET, so a farmer's name, phone and message
// never land in a URL, browser history or access logs). Same save, rate
// limit and emails as the in-page path: it calls the same server action.
// Then a 303 back to the listing with a status code and the reference only.
import { NextResponse, type NextRequest } from "next/server";
import { submitEnquiry } from "@/app/listings/enquiry-actions";
import { enquiryRedirectPath } from "@/lib/enquiry-fallback";

export const dynamic = "force-dynamic";

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  // Old browsers and some privacy settings omit it; the form is public anyway.
  if (!origin) return true;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.redirect(new URL(enquiryRedirectPath(null, { ok: false, code: "bad" }), req.url), 303);
  }
  const returnTo = typeof fd.get("return_to") === "string" ? (fd.get("return_to") as string) : null;

  if (!sameOrigin(req)) {
    return NextResponse.redirect(new URL(enquiryRedirectPath(returnTo, { ok: false, code: "bad" }), req.url), 303);
  }

  const res = await submitEnquiry(fd);
  const outcome = res.ok
    ? { ok: true as const, reference: res.reference, direct: res.direct }
    : { ok: false as const, code: res.code };
  return NextResponse.redirect(new URL(enquiryRedirectPath(returnTo, outcome), req.url), 303);
}

// A stray GET (an old cached form, a crawler) saves nothing and carries
// nothing forward.
export function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/", req.url), 303);
}
