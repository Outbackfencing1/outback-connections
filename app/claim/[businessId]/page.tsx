import Link from "next/link";
import { notFound } from "next/navigation";
import ClaimButton from "@/components/detail/ClaimButton";
import TradeOfferCard from "@/components/detail/TradeOfferCard";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Claim your business profile — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ClaimBusinessPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) notFound();

  const supabase = createClient();
  const [{ data: userData }, { data: business }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("businesses")
      .select(
        "id, trading_name, legal_name, suburb, postcode, state_code, contact_phone, contact_email, website_url, abn, claim_status, claimed_by, source_platform, source_url, status"
      )
      .eq("id", businessId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!business) notFound();

  // The business's live directory listing decides whether the fencing trade
  // offer is relevant here.
  const { data: liveListing } = await supabase
    .from("listings")
    .select("category:categories(slug)")
    .eq("business_id", business.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const liveCategory = Array.isArray(liveListing?.category)
    ? liveListing?.category[0]
    : liveListing?.category;
  const categorySlug = (liveCategory as { slug?: string } | null | undefined)?.slug ?? null;

  const name = business.trading_name || business.legal_name || "This business";
  const location = [business.suburb, business.state_code, business.postcode]
    .filter(Boolean)
    .join(", ");
  const returnPath = `/claim/${business.id}`;
  const isAlreadyOwner =
    Boolean(userData.user?.id && business.claimed_by === userData.user.id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href={`/profile/${business.id}`} className="text-neutral-600 underline hover:text-green-800">
          ← Back to {name} profile
        </Link>
        <Link href="/profiles" className="text-neutral-600 underline hover:text-green-800">
          All profiles
        </Link>
      </div>

      <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-green-800">
          Free Owner Verification &amp; Profile Claim
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">{name}</h1>
        {location && <p className="mt-1 text-sm font-medium text-neutral-600">📍 {location}</p>}

        {business.claim_status === "unclaimed" ? (
          <>
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-950">
              <p className="text-base font-bold">Is this your business?</p>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
                Claim your profile for free (0 commission, no lead fees) to take full control of how farmers, property owners, and clients find and contact you:
              </p>
              <ul className="mt-3 grid gap-2 text-xs font-medium text-amber-950 sm:grid-cols-2">
                <li className="flex items-start gap-1.5">
                  <span className="font-bold text-green-800">✓</span>
                  <span>Upload photos of your work, rigs, fencing &amp; gear</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="font-bold text-green-800">✓</span>
                  <span>Update your phone, email, website &amp; service areas</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="font-bold text-green-800">✓</span>
                  <span>Set live availability (Available Now / Booked 2–4 Wks)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="font-bold text-green-800">✓</span>
                  <span>Add your ABN &amp; insurance badges + reply to reviews</span>
                </li>
              </ul>

              <ClaimButton
                businessId={business.id}
                signedIn={!!userData.user}
                signInRedirect={returnPath}
                variant="full"
                defaultPhone={business.contact_phone}
                defaultAbn={business.abn}
              />
            </div>

            <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-700">
              <p className="font-bold text-neutral-900">
                🔒 How we verify you are the genuine business owner:
              </p>
              <ol className="mt-1.5 list-inside list-decimal space-y-1">
                <li>
                  <strong>Instant Auto-Verification:</strong> If your account email matches the business email/website domain on file, OR you enter your active <strong>11-digit ABN</strong> matching the Australian Business Register (ABR) / registered phone number, your profile unlocks immediately.
                </li>
                <li>
                  <strong>Admin Phone Check:</strong> If you sign up with a personal email and don&apos;t have your ABN handy, our team cross-checks your phone number against the business phone on file before transferring control.
                </li>
              </ol>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-green-300 bg-green-50 p-5 text-sm text-green-950">
            <p className="font-bold">
              {isAlreadyOwner
                ? "✓ You own and manage this business profile."
                : "This profile has already been claimed."}
            </p>
            <p className="mt-2 text-xs leading-relaxed">
              {isAlreadyOwner
                ? "Head to your Settings & Trust Profile page to edit your contact details, availability, specialties, and upload work photos."
                : "If you manage this business, sign in to update your profile, photos, and listings. If the ownership is wrong, contact support."}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {isAlreadyOwner ? (
                <>
                  <Link
                    href="/dashboard/settings"
                    className="rounded-lg bg-green-700 px-4 py-2 text-xs font-bold text-white hover:bg-green-800"
                  >
                    Edit profile &amp; upload photos →
                  </Link>
                  <Link
                    href={`/profile/${business.id}`}
                    className="rounded-lg border border-green-700 bg-white px-4 py-2 text-xs font-semibold text-green-900 hover:bg-green-100"
                  >
                    View public profile →
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signin?next=/dashboard/settings" className="font-semibold underline">
                    Sign in to manage profile
                  </Link>
                  <a href="mailto:help@outbackconnections.com.au" className="font-semibold underline">
                    Contact support
                  </a>
                </>
              )}
            </div>
          </div>
        )}

        <TradeOfferCard categorySlug={categorySlug} placement="claim" />

        {business.source_url && (
          <p className="mt-6 text-xs text-neutral-500">
            This profile was initially discovered via {prettySource(business.source_platform)}. Source
            information is retained for transparency.
          </p>
        )}
      </div>
    </main>
  );
}

function prettySource(value: string | null): string {
  if (value === "google_maps") return "Google Maps";
  if (value === "yellow_pages" || value === "web" || !value) return "public business records";
  return value.replace(/_/g, " ");
}
