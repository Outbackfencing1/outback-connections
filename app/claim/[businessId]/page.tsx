import Link from "next/link";
import { notFound } from "next/navigation";
import ClaimButton from "@/components/detail/ClaimButton";
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
        "id, trading_name, legal_name, postcode, state_code, claim_status, source_platform, source_url, status"
      )
      .eq("id", businessId)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (!business) notFound();

  const name = business.trading_name || business.legal_name || "This business";
  const location = [business.state_code, business.postcode].filter(Boolean).join(" ");
  const returnPath = `/claim/${business.id}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/services" className="text-sm text-neutral-600 underline">
        ← Outback Connections services
      </Link>

      <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
          Free contractor profile
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{name}</h1>
        {location && <p className="mt-2 text-sm text-neutral-600">{location}</p>}

        {business.claim_status === "unclaimed" ? (
          <>
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <p className="font-semibold">Is this your business?</p>
              <p className="mt-2">
                Claim the profile to confirm the details, manage what customers
                see, and list your fencing services. Joining is free and there
                are no lead fees.
              </p>
              <p className="mt-4">
                <ClaimButton
                  businessId={business.id}
                  signedIn={!!userData.user}
                  signInRedirect={returnPath}
                />
              </p>
            </div>
            <p className="mt-5 text-xs text-neutral-600">
              Claims are reviewed before control is transferred. This prevents
              someone else from taking over your profile.
            </p>
          </>
        ) : (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-950">
            <p className="font-semibold">This profile has already been claimed.</p>
            <p className="mt-2">
              If you manage this business, sign in to update your listings. If
              the ownership is wrong, contact support.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/signin?next=/dashboard/listings" className="font-medium underline">
                Sign in
              </Link>
              <a href="mailto:help@outbackconnections.com.au" className="font-medium underline">
                Contact support
              </a>
            </div>
          </div>
        )}

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
  if (!value) return "a public directory";
  return value.replace(/_/g, " ");
}
