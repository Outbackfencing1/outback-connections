// /unsubscribe?t=<signed token>
// Item 19: marketing unsubscribe via signed token. Stamps
// user_profiles.marketing_consent_revoked_at. The link (GET) shows a confirm
// button; the change happens on POST, so a mail scanner that prefetches links
// can't unsubscribe anyone.
//
// POST takes the token from the query string, so it also answers an RFC 8058
// one-click request (List-Unsubscribe-Post) sent to this URL. No email sends
// List-Unsubscribe / List-Unsubscribe-Post headers yet, and nothing issues
// unsubscribe tokens yet: add both (with DKIM covering the headers) before
// relying on one-click from mail clients.
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken, type VerifyResult } from "@/lib/signed-tokens";
import { actionPageResponse } from "@/lib/action-page";

// Marketing consent is revoked by RevokeMarketingForm on the "Your data" page.
const MARKETING_SETTINGS = { href: "/dashboard/privacy", label: "Turn off marketing emails on the Your data page" };

function invalid(v: VerifyResult | null): Response {
  const expired = v !== null && v.ok === false && v.reason === "expired";
  return actionPageResponse(
    {
      heading: expired ? "That unsubscribe link has expired" : "That unsubscribe link isn't valid",
      message: "Nothing was changed. You can turn off marketing emails yourself on the Your data page (sign in first).",
      tone: "error",
      link: MARKETING_SETTINGS,
    },
    400
  );
}

function check(token: string | null): { ok: true; userId: string } | { ok: false; res: Response } {
  if (!token) return { ok: false, res: invalid(null) };
  const v = verifyToken(token);
  if (!v.ok || v.payload.p !== "unsubscribe") return { ok: false, res: invalid(v) };
  return { ok: true, userId: v.payload.u };
}

const confirmPath = (token: string) => `/unsubscribe?t=${encodeURIComponent(token)}`;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");
  const c = check(token);
  if (!c.ok) return c.res;
  return actionPageResponse(
    {
      heading: "Unsubscribe",
      message: "Stop marketing emails from Outback Connections?",
      tone: "neutral",
      form: { action: confirmPath(token ?? ""), token: token ?? "", button: "Unsubscribe" },
    },
    200
  );
}

export async function POST(request: NextRequest) {
  // One-click clients post to the URL from the List-Unsubscribe header (token
  // in the query string). The confirm form posts to the same URL.
  const token = request.nextUrl.searchParams.get("t");
  const c = check(token);
  if (!c.ok) return c.res;

  const failed = () =>
    actionPageResponse(
      {
        heading: "We couldn't unsubscribe you",
        message: "Something went wrong on our side and nothing was changed. Try again in a few minutes.",
        tone: "error",
        form: { action: confirmPath(token ?? ""), token: token ?? "", button: "Try again" },
        link: MARKETING_SETTINGS,
      },
      500
    );

  const admin = createAdminClient();
  if (!admin) return failed();
  const { error } = await admin
    .from("user_profiles")
    .update({ marketing_consent_revoked_at: new Date().toISOString() })
    .eq("user_id", c.userId);
  if (error) return failed();

  return actionPageResponse(
    {
      heading: "Unsubscribed",
      message:
        "You're unsubscribed from marketing emails. Account and listing emails (sign-in links, renewal reminders) will still come through.",
      tone: "ok",
    },
    200
  );
}
