// /listings/[id]/renew?t=<signed token>
// Item 14: renew from the renewal-reminder email. The emailed link (GET)
// only shows a confirm page; the renew happens on its button (POST). Mail
// scanners that prefetch links therefore never renew on the owner's behalf.
// Every outcome, including a failed save, is shown on a page here: the link
// works without a session, so the dashboard can't be relied on to say what
// happened.
import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/signed-tokens";
import { actionPageResponse } from "@/lib/action-page";

const RENEW_DAYS = 30;
const DASHBOARD = { href: "/dashboard/listings", label: "Manage your listings" };

type Listing = { id: string; status: string; title: string };
type Checked = { ok: true; listing: Listing } | { ok: false; reason: Failure };
type Failure = "invalid" | "expired" | "not_yours" | "deleted" | "server_error";

async function check(id: string, token: string | null): Promise<Checked> {
  if (!token) return { ok: false, reason: "invalid" };
  const v = verifyToken(token);
  if (!v.ok) {
    if (v.reason === "expired") return { ok: false, reason: "expired" };
    if (v.reason === "no_secret") return { ok: false, reason: "server_error" };
    return { ok: false, reason: "invalid" };
  }
  if (v.payload.p !== "renew" || v.payload.l !== id) return { ok: false, reason: "invalid" };

  const admin = createAdminClient();
  if (!admin) return { ok: false, reason: "server_error" };

  // Confirm ownership matches the token's user
  const { data: listing, error } = await admin
    .from("listings")
    .select("id, user_id, status, title")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, reason: "server_error" };
  if (!listing || listing.user_id !== v.payload.u) return { ok: false, reason: "not_yours" };
  if (listing.status === "deleted_by_user" || listing.status === "deleted_by_admin") {
    return { ok: false, reason: "deleted" };
  }
  return { ok: true, listing };
}

const FAILURES: Record<Failure, { status: number; heading: string; message: string }> = {
  invalid: {
    status: 400,
    heading: "That renewal link isn't valid",
    message: "Nothing was changed. You can renew the listing from your dashboard instead.",
  },
  expired: {
    status: 400,
    heading: "That renewal link has expired",
    message: "Nothing was changed. You can renew the listing from your dashboard instead.",
  },
  not_yours: {
    status: 403,
    heading: "That link is for a different account",
    message: "Nothing was changed. Sign in with the account that posted the listing to renew it.",
  },
  deleted: {
    status: 410,
    heading: "That listing has been deleted",
    message: "Deleted listings can't be renewed. You can post it again from your dashboard.",
  },
  server_error: {
    status: 500,
    heading: "We couldn't renew it",
    message: "Something went wrong on our side and nothing was changed. Try again in a few minutes.",
  },
};

function failurePage(reason: Failure, retry?: { id: string; token: string }): Response {
  const f = FAILURES[reason];
  return actionPageResponse(
    {
      heading: f.heading,
      message: f.message,
      tone: "error",
      form: retry ? { action: renewPath(retry.id), token: retry.token, button: "Try again" } : undefined,
      link: DASHBOARD,
    },
    f.status
  );
}

const renewPath = (id: string) => `/listings/${encodeURIComponent(id)}/renew`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = request.nextUrl.searchParams.get("t");
  const c = await check(id, token);
  if (!c.ok) return failurePage(c.reason);

  return actionPageResponse(
    {
      heading: "One more click to renew",
      message: `Keep "${c.listing.title}" up for another ${RENEW_DAYS} days?`,
      tone: "neutral",
      form: { action: renewPath(id), token: token ?? "", button: `Renew for ${RENEW_DAYS} days` },
      link: DASHBOARD,
    },
    200
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const t = form?.get("t");
  const token = typeof t === "string" ? t : null;
  const c = await check(id, token);
  if (!c.ok) return failurePage(c.reason, c.reason === "server_error" && token ? { id, token } : undefined);

  const admin = createAdminClient();
  if (!admin) return failurePage("server_error", { id, token: token ?? "" });

  // Extend expires_at from now and reactivate if expired
  const expires = new Date(Date.now() + RENEW_DAYS * 24 * 60 * 60 * 1000);
  const newStatus = c.listing.status === "expired" ? "active" : c.listing.status;
  const { error } = await admin
    .from("listings")
    .update({ expires_at: expires.toISOString(), status: newStatus })
    .eq("id", id);
  if (error) return failurePage("server_error", { id, token: token ?? "" });

  const until = expires.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
  return actionPageResponse(
    {
      heading: "Renewed",
      message: `"${c.listing.title}" stays up until ${until}.`,
      tone: "ok",
      link: DASHBOARD,
    },
    200
  );
}
