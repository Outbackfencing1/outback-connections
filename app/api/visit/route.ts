// /api/visit — the "a person is here" ping from components/HumanPing.tsx.
// Logs one human_ping event (same ip / user agent / daily session hash as
// every other event, nothing new about the visitor) plus, on a landing page,
// the referring site and utm_ tags (lib/visit-sources.ts).
//
// Staff and admins: a ping from a signed-in staff or admin account is
// marked internal, and the browser gets an `oc_internal` cookie so its later
// visits stay internal after signing out. Only staff browsers ever get it.
// admin_gate_metrics() leaves internal sessions out of the human numbers.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/analytics";
import { parseVisitPayload } from "@/lib/visit-sources";

export const dynamic = "force-dynamic";

const INTERNAL_COOKIE = "oc_internal";

// Only our own pages send this. Browsers that predate Sec-Fetch-Site (old
// iPhones) may send neither header and are let through.
function fromOurPages(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!fromOurPages(req)) return new NextResponse(null, { status: 403 });

  const payload = parseVisitPayload(await req.text(), req.nextUrl.hostname);

  let userId: string | null = null;
  let internal = req.cookies.get(INTERNAL_COOKIE)?.value === "1";
  let markBrowser = false;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      userId = data.user.id;
      if (!internal) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("is_admin, is_staff")
          .eq("user_id", userId)
          .maybeSingle();
        internal = markBrowser = !!(profile?.is_admin || profile?.is_staff);
      }
    }
  } catch {
    // Not signed in, or auth unreachable: an ordinary visitor ping.
  }

  await logEvent({
    eventType: "human_ping",
    userId,
    properties: internal ? { ...payload, internal: true } : payload,
  });

  const res = new NextResponse(null, { status: 204 });
  if (markBrowser) {
    res.cookies.set(INTERNAL_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  return res;
}
