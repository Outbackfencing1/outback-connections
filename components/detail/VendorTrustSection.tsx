// components/detail/VendorTrustSection.tsx — Server component that renders the
// Professional Vendor / Contractor / Customer Trust Profile, 1-click direct
// contact bar, 4-tier specific verification checks (Scamwatch aligned),
// believable availability with freshness dates, practical contractor gear/travel
// details, and separated Completed-Work Reviews vs Neighbour Vouches.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import { responseLine } from "@/lib/enquiry-outcome";
import {
  CUSTOMER_QUICK_VOUCH_TAGS,
  VENDOR_QUICK_VOUCH_TAGS,
  buildSpecificTrustChecks,
  contractorEquipmentLabel,
  dealTypeLabel,
  formatAbn,
  formatBelievableAvailability,
  formatPhoneHref,
  insuranceBadgeLabel,
  isAustralianMobile,
  isCustomerTrustTag,
  partitionReviewsAndVouches,
  preferredJobSizeLabel,
  roleTagLabel,
  trustTagLabel,
  type VendorTrustSummary,
} from "@/lib/trust";
import {
  confirmOwnerAvailabilityNow,
  submitQuickVouch,
  toggleOutbackVerified,
} from "@/app/reviews/actions";
import LeaveReviewForm from "./LeaveReviewForm";
import VendorReplyForm from "./VendorReplyForm";

type Props = {
  userId?: string | null;
  businessId?: string | null;
  listingId?: string | null;
  fallbackTitle: string;
  returnPath: string;
  defaultDealType?: string;
  viewerId?: string | null;
  showProfileLink?: boolean;
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

function getInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "OC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function VendorTrustSection({
  userId,
  businessId,
  listingId,
  fallbackTitle,
  returnPath,
  defaultDealType = "fencing_service",
  viewerId,
  showProfileLink = true,
}: Props) {
  const supabase = createClient();

  const [{ data: rawSummary }, viewerProfileRes] = await Promise.all([
    supabase.rpc("get_vendor_trust_summary", {
      p_user_id: userId ?? null,
      p_business_id: businessId ?? null,
      p_listing_id: listingId ?? null,
    }),
    viewerId
      ? supabase
          .from("user_profiles")
          .select("display_name, trading_name, postcode, is_admin, is_staff")
          .eq("user_id", viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!rawSummary || typeof rawSummary !== "object") {
    return null;
  }

  const summary = rawSummary as VendorTrustSummary;
  const resolvedUserId = summary.user_id ?? userId ?? null;
  const resolvedBusinessId = summary.business_id ?? businessId ?? null;

  if (!resolvedUserId && !resolvedBusinessId) {
    return null;
  }

  const isOwner = !!viewerId && viewerId === resolvedUserId;
  const isViewerStaff = !!(
    viewerProfileRes.data?.is_admin || viewerProfileRes.data?.is_staff
  );
  const profileId = resolvedUserId ?? resolvedBusinessId;
  const vendorName =
    summary.trading_name ||
    summary.display_name ||
    summary.abn_entity_name ||
    fallbackTitle;
  const initials = getInitials(vendorName);

  const formattedAbn = formatAbn(summary.abn);
  const memberSinceText = summary.member_since
    ? new Date(summary.member_since).toLocaleDateString("en-AU", {
        month: "short",
        year: "numeric",
      })
    : null;

  const quoteResponse = responseLine({
    answered: summary.enquiry_answered,
    responded: summary.enquiry_responded,
  });

  const insurances = Array.isArray(summary.insurances_held)
    ? summary.insurances_held
    : [];
  const roles = Array.isArray(summary.role_tags) ? summary.role_tags : [];
  const services = Array.isArray(summary.services_offered)
    ? summary.services_offered
    : [];
  const equipment = Array.isArray(summary.equipment_summary)
    ? summary.equipment_summary
    : [];
  const photos = Array.isArray(summary.photo_urls)
    ? summary.photo_urls
    : [];
  const topTags = Array.isArray(summary.top_tags) ? summary.top_tags : [];
  const reviews = Array.isArray(summary.recent_reviews)
    ? summary.recent_reviews
    : [];

  // Separate Completed-Work Reviews from 1-click Neighbour Vouches so quick vouches never inflate star ratings
  const partitioned = partitionReviewsAndVouches(reviews);
  const completedReviews = partitioned.completedReviews;
  const quickVouches = partitioned.quickVouches;
  const completedReviewCount = partitioned.completedReviewCount;
  const vouchCount = summary.vouch_count ?? partitioned.vouchCount;
  const trueAvgRating = partitioned.avgRating;
  const trueRecommendPct = partitioned.recommendPct;

  const isOwnerConfirmed = resolvedBusinessId
    ? summary.claim_status === "claimed"
    : Boolean(
        summary.claim_status === "claimed" ||
          summary.email_verified ||
          summary.phone_verified
      );

  const believableAvail = formatBelievableAvailability({
    availabilityStatus: summary.availability_status,
    availabilityNote: summary.availability_note,
    availabilityUpdatedAt:
      summary.availability_updated_at ?? summary.claimed_at ?? null,
    ownerConfirmed: isOwnerConfirmed,
  });

  const trustChecks = buildSpecificTrustChecks({
    hasBusinessRecord: Boolean(resolvedBusinessId),
    claimStatus: summary.claim_status,
    claimedAt: summary.claimed_at,
    emailVerified: summary.email_verified,
    phoneVerified: summary.phone_verified,
    abn: summary.abn,
    abnVerified: summary.abn_verified,
    abnEntityName: summary.abn_entity_name,
    abnVerifiedAt: summary.abn_verified_at,
    insurancesHeld: insurances,
    insuranceVerifiedAt: summary.insurance_verified_at,
    insuranceExpiryDate: summary.insurance_expiry_date,
  });

  const phone = summary.contact_phone || null;
  const phoneHref = formatPhoneHref(phone);
  const canSms = isAustralianMobile(phone);
  const email = summary.contact_email || null;
  const website = summary.website_url || null;
  const facebook = summary.facebook_url || null;

  const vendorVouchTags = topTags.filter((t) => !isCustomerTrustTag(t.tag));
  const customerVouchTags = topTags.filter((t) => isCustomerTrustTag(t.tag));

  const viewerDefaultName =
    viewerProfileRes.data?.trading_name ||
    viewerProfileRes.data?.display_name ||
    null;
  const viewerDefaultPostcode = viewerProfileRes.data?.postcode || null;

  const profileShareUrl = profileId
    ? `${BASE_URL}/profile/${profileId}`
    : `${BASE_URL}${returnPath}`;
  const vouchSmsBody = `G'day, we've got our profile up on Outback Connections (${vendorName}). If we've done fencing, freight or rural work together, could you leave an honest review or vouch here? ${profileShareUrl}`;

  const jobSizeText = preferredJobSizeLabel(summary.preferred_job_size);

  return (
    <section
      aria-label="Vendor trust and reviews"
      className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      {/* Top Banner Accent */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-emerald-800 px-5 py-3 text-white sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-emerald-100">
            Rural Contractor &amp; Operator Profile · Direct Contact &amp; Specific Checks
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {summary.outback_verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-400 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950 shadow-sm">
                ★ Outback Verified
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white"
              title={believableAvail.updatedText}
            >
              <span className={`h-2 w-2 rounded-full ${believableAvail.dotClass}`} />
              {believableAvail.headline}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {/* Hero Identity + Rating Scorecard */}
        <div className="flex flex-col justify-between gap-4 border-b border-neutral-100 pb-5 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-800 text-lg font-extrabold text-white shadow-sm">
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">
                  {showProfileLink && profileId ? (
                    <Link
                      href={`/profile/${profileId}`}
                      className="hover:text-green-800 hover:underline"
                    >
                      {vendorName}
                    </Link>
                  ) : (
                    vendorName
                  )}
                </h2>
                {isOwnerConfirmed ? (
                  <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-950">
                    ✓ Owner Confirmed
                  </span>
                ) : (
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    Unclaimed Directory Listing
                  </span>
                )}
                {summary.abn_verified && formattedAbn && (
                  <span className="rounded-full border border-neutral-300 bg-neutral-50 px-2.5 py-0.5 text-xs font-semibold text-neutral-800">
                    ABN Checked
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs font-medium text-neutral-600">
                📍{" "}
                {summary.suburb ? `${summary.suburb}, ` : ""}
                {summary.postcode
                  ? `${summary.postcode}${summary.state ? ` ${summary.state}` : ""}`
                  : "Regional NSW"}
                {summary.years_in_district
                  ? ` · ${summary.years_in_district}+ yrs in district`
                  : ""}
                {formattedAbn ? ` · ABN ${formattedAbn}` : ""}
                {memberSinceText ? ` · Listed ${memberSinceText}` : ""}
              </p>

              {/* Believable Availability Strip with Last Updated Date */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${believableAvail.badgeClass}`}
                >
                  <span className={`h-2 w-2 rounded-full ${believableAvail.dotClass}`} />
                  {believableAvail.headline}
                </span>
                <span className="text-xs text-neutral-500">
                  {believableAvail.updatedText}
                </span>
                {isOwner && (
                  <form action={confirmOwnerAvailabilityNow} className="inline">
                    <input type="hidden" name="return_path" value={returnPath} />
                    <input
                      type="hidden"
                      name="availability_status"
                      value={summary.availability_status ?? "available"}
                    />
                    <input
                      type="hidden"
                      name="availability_note"
                      value={summary.availability_note ?? ""}
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-green-700 bg-white px-2.5 py-0.5 text-[11px] font-bold text-green-900 hover:bg-green-50"
                    >
                      ✓ Confirm availability today
                    </button>
                  </form>
                )}
              </div>

              {/* Role Chips */}
              {roles.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {roles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center rounded-full border border-green-200 bg-green-50/80 px-2.5 py-0.5 text-xs font-semibold text-green-900"
                    >
                      {roleTagLabel(r)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Scorecard: Completed-Work Reviews strictly separated from Quick Vouches */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
            {completedReviewCount > 0 && trueAvgRating !== null ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-right shadow-sm">
                <div className="flex items-center gap-1.5 text-lg font-extrabold text-amber-950">
                  <span>★ {Number(trueAvgRating).toFixed(1)}</span>
                  <span className="text-xs font-semibold text-amber-800">
                    ({completedReviewCount} completed-work review
                    {completedReviewCount === 1 ? "" : "s"})
                  </span>
                </div>
                {trueRecommendPct !== null && (
                  <p className="text-[11px] font-semibold text-amber-900">
                    ✓ {trueRecommendPct}% would hire / deal with again
                  </p>
                )}
                {vouchCount > 0 && (
                  <p className="mt-0.5 text-[11px] text-amber-800">
                    + {vouchCount} neighbour vouch{vouchCount === 1 ? "" : "es"}
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-right text-xs font-medium text-neutral-600">
                <p className="font-semibold text-neutral-800">
                  No completed-work reviews yet
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {vouchCount > 0
                    ? `${vouchCount} neighbour vouch${vouchCount === 1 ? "" : "es"} recorded (shown separately below)`
                    : "Worked with them? Share a review after a real dealing"}
                </p>
              </div>
            )}

            {showProfileLink && profileId && (
              <Link
                href={`/profile/${profileId}`}
                className="rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-bold text-neutral-800 shadow-sm hover:border-green-700 hover:text-green-800"
              >
                Full profile &amp; reviews →
              </Link>
            )}
          </div>
        </div>

        {/* 1-Click Direct Contact Bar (Zero-Click Phone / SMS / Email / Website) */}
        {(phoneHref || email || website || facebook) && (
          <div className="mt-4 rounded-2xl border border-green-300 bg-green-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-green-900">
                  1-Click Direct Contact
                </p>
                <p className="text-xs text-neutral-700">
                  Call, text or email {vendorName} directly — no account or login required.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {phoneHref && (
                  <a
                    href={`tel:${phoneHref}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800"
                  >
                    📞 Call {phone}
                  </a>
                )}
                {phoneHref && canSms && (
                  <a
                    href={`sms:${phoneHref}?body=${encodeURIComponent(
                      `Hi ${vendorName}, found your profile on Outback Connections — are you available?`
                    )}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-green-700 bg-white px-3.5 py-2.5 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
                  >
                    💬 SMS
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email}?subject=${encodeURIComponent(
                      `Enquiry via Outback Connections: ${vendorName}`
                    )}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700"
                  >
                    ✉️ {email}
                  </a>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700"
                  >
                    🌐 Website →
                  </a>
                )}
                {facebook && (
                  <a
                    href={facebook}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700"
                  >
                    📘 Facebook
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Specific 4-Tier Verification Breakdown (Scamwatch Aligned) */}
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-800">
              🛡 Specific Trust &amp; Verification Checks
            </h3>
            <a
              href="https://www.scamwatch.gov.au/about-us/news-and-alerts/farm-businesses-warned-as-scams-targeting-agricultural-sector-grow"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-medium text-neutral-600 underline hover:text-green-800"
            >
              Why we separate ABN lookup from business ownership (Scamwatch) →
            </a>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {trustChecks.map((check) => {
              const badgeStyles =
                check.status === "verified"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : check.status === "self_declared"
                    ? "border-sky-300 bg-sky-50 text-sky-950"
                    : check.status === "expired"
                      ? "border-red-300 bg-red-50 text-red-950"
                      : "border-neutral-200 bg-white text-neutral-600";
              const statusPill =
                check.status === "verified"
                  ? "✓ Checked"
                  : check.status === "self_declared"
                    ? "Self-declared"
                    : check.status === "expired"
                      ? "⚠ Expired"
                      : "Not yet checked";

              return (
                <div
                  key={check.key}
                  className={`rounded-xl border p-3 text-xs ${badgeStyles}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{check.label}</span>
                    <span className="rounded-full border border-current/20 bg-white/80 px-2 py-0.5 text-[11px] font-semibold">
                      {statusPill}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                    {check.detail}
                  </p>
                  {check.dateText && (
                    <p className="mt-1 text-[10px] font-semibold opacity-75">
                      {check.dateText}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Owner Claim Callout for Unclaimed Profiles */}
        {summary.claim_status === "unclaimed" && resolvedBusinessId && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
            <div>
              <p className="font-bold">Is {vendorName} your business?</p>
              <p className="mt-0.5 text-amber-900">
                Claim your free profile to confirm ownership, set your live booking availability, list your fencing gear &amp; travel radius, upload work photos, or remove your listing.
              </p>
            </div>
            <Link
              href={`/claim/${resolvedBusinessId}`}
              className="shrink-0 rounded-xl bg-amber-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-950"
            >
              Claim &amp; Verify Profile Free →
            </Link>
          </div>
        )}

        {/* Staff-only 1-click Outback Verified Gold Badge toggle */}
        {isViewerStaff && (
          <form
            action={toggleOutbackVerified}
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50/70 px-3.5 py-2.5 text-xs text-amber-950"
          >
            <input type="hidden" name="target_user_id" value={resolvedUserId ?? ""} />
            <input type="hidden" name="target_business_id" value={resolvedBusinessId ?? ""} />
            <input
              type="hidden"
              name="next_value"
              value={summary.outback_verified ? "false" : "true"}
            />
            <input type="hidden" name="return_path" value={returnPath} />
            <span>
              <strong>Staff control:</strong>{" "}
              {summary.outback_verified
                ? "This profile holds the ★ Outback Verified gold badge."
                : "Award the ★ Outback Verified gold badge to trusted contractors, carriers, customers & suppliers."}
            </span>
            <button
              type="submit"
              className="rounded-lg border border-amber-500 bg-white px-3 py-1 font-bold text-amber-950 hover:bg-amber-100"
            >
              {summary.outback_verified
                ? "Remove Outback Verified"
                : "★ Grant Outback Verified"}
            </button>
          </form>
        )}

        {/* Practical Contractor Profile: Bio, Travel Area, Equipment & Preferred Job Size */}
        {summary.bio && (
          <p className="mt-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-line">
            {summary.bio}
          </p>
        )}

        {(summary.travel_area || jobSizeText || equipment.length > 0) && (
          <div className="mt-4 grid gap-2.5 rounded-xl border border-neutral-200 bg-white p-3.5 text-xs sm:grid-cols-3">
            {summary.travel_area && (
              <div>
                <p className="font-bold uppercase tracking-wide text-neutral-500">
                  🛻 Travel &amp; Service Area
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900">
                  {summary.travel_area}
                </p>
              </div>
            )}
            {jobSizeText && (
              <div>
                <p className="font-bold uppercase tracking-wide text-neutral-500">
                  📏 Preferred Job Size
                </p>
                <p className="mt-0.5 font-semibold text-neutral-900">
                  {jobSizeText}
                </p>
              </div>
            )}
            {equipment.length > 0 && (
              <div>
                <p className="font-bold uppercase tracking-wide text-neutral-500">
                  🚜 Gear &amp; Rig on Board
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {equipment.map((eq) => (
                    <span
                      key={eq}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-800"
                    >
                      {contractorEquipmentLabel(eq)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(services.length > 0 || insurances.length > 0) && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {services.map((srv) => (
              <span
                key={srv}
                className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-800"
              >
                🔧 {srv}
              </span>
            ))}
            {insurances.map((ins) => (
              <span
                key={ins}
                className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
              >
                🛡 {insuranceBadgeLabel(ins)} (Self-declared)
              </span>
            ))}
          </div>
        )}

        {/* Work, Fleet, Fencing & Livestock Photo Gallery */}
        {photos.length > 0 ? (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                📷 Actual Work, Rig &amp; Property Photos ({photos.length})
              </p>
              {isOwner && (
                <Link
                  href="/dashboard/settings"
                  className="text-xs font-semibold text-green-800 underline"
                >
                  Update photos from phone →
                </Link>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((url, idx) => (
                <a
                  key={`${url}-${idx}`}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${vendorName} work photo ${idx + 1}`}
                    className="h-40 w-full object-cover transition duration-200 group-hover:scale-105"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : isOwner ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-green-300 bg-green-50/40 px-4 py-3 text-xs text-green-950">
            <span>
              <strong>📷 Show your gear &amp; workmanship:</strong> Upload photos of your strainer assemblies, post driver, trucks, or completed fence lines straight from your phone.
            </span>
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-green-700 px-3 py-1.5 font-bold text-white hover:bg-green-800"
            >
              + Upload Photos →
            </Link>
          </div>
        ) : null}

        {/* Track record counters */}
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Completed-work reviews
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {completedReviewCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Neighbour vouches
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {vouchCount}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Completed jobs / deals
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {summary.completed_deals_count}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Contact &amp; response
            </p>
            <p className="mt-0.5 text-xs font-bold text-green-900">
              {phoneHref
                ? `✓ Direct phone (${phone})`
                : quoteResponse
                  ? `${summary.enquiry_responded}/${summary.enquiry_answered} replied`
                  : "Direct enquiry enabled"}
            </p>
          </div>
        </div>

        {/* Neighbour Recommendations / Vouched Qualities (kept separate from 5-star reviews) */}
        {(vendorVouchTags.length > 0 || customerVouchTags.length > 0) && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {vendorVouchTags.length > 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50/40 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-green-900">
                  Neighbour &amp; Customer Tag Endorsements
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-600">
                  Quick community endorsements (counted separately from star ratings):
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {vendorVouchTags.map((t) => (
                    <span
                      key={t.tag}
                      className="rounded-full border border-green-300 bg-white px-3 py-1 text-xs font-semibold text-green-900 shadow-sm"
                    >
                      ✓ {trustTagLabel(t.tag)} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
            {customerVouchTags.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-900">
                  As a Customer / Property / Employer
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-600">
                  Endorsements from contractors, carriers &amp; workers:
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customerVouchTags.map((t) => (
                    <span
                      key={t.tag}
                      className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm"
                    >
                      ✓ {trustTagLabel(t.tag)} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Owner prompt to enrich their trust profile */}
        {isOwner && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-3.5 text-xs text-green-950 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>This is your contractor profile.</strong> Update your availability, fencing specialties, travel radius, equipment, and work photos from your phone in Settings.
            </span>
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
            >
              Update profile &amp; availability
            </Link>
          </div>
        )}

        {/* Two-Sided 1-Click Quick Vouches (Explicitly labelled as Neighbour Endorsements, not Star Reviews) */}
        {!isOwner && (
          <>
            {viewerId ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-green-200 bg-green-50/40 p-3.5">
                  <p className="text-xs font-bold text-green-950">
                    Know {vendorName}&apos;s work? Add a neighbour vouch:
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    Recorded as a tag endorsement — does not alter star ratings.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {VENDOR_QUICK_VOUCH_TAGS.map((qt) => (
                      <form key={qt.slug} action={submitQuickVouch}>
                        <input type="hidden" name="target_user_id" value={resolvedUserId ?? ""} />
                        <input type="hidden" name="target_business_id" value={resolvedBusinessId ?? ""} />
                        <input type="hidden" name="listing_id" value={listingId ?? ""} />
                        <input type="hidden" name="tag" value={qt.slug} />
                        <input type="hidden" name="return_path" value={returnPath} />
                        <button
                          type="submit"
                          className="rounded-full border border-green-300 bg-white px-3 py-1 text-xs font-semibold text-green-900 shadow-sm hover:border-green-700 hover:bg-green-100"
                        >
                          + {qt.label}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-3.5">
                  <p className="text-xs font-bold text-sky-950">
                    Worked for or delivered to {vendorName}? Vouch for the property:
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    Helps contractors &amp; drivers know good properties to work for.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CUSTOMER_QUICK_VOUCH_TAGS.map((qt) => (
                      <form key={qt.slug} action={submitQuickVouch}>
                        <input type="hidden" name="target_user_id" value={resolvedUserId ?? ""} />
                        <input type="hidden" name="target_business_id" value={resolvedBusinessId ?? ""} />
                        <input type="hidden" name="listing_id" value={listingId ?? ""} />
                        <input type="hidden" name="tag" value={qt.slug} />
                        <input type="hidden" name="return_path" value={returnPath} />
                        <button
                          type="submit"
                          className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-900 shadow-sm hover:border-sky-700 hover:bg-sky-100"
                        >
                          + {qt.label}
                        </button>
                      </form>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <LeaveReviewForm
              signedIn={!!viewerId}
              signInRedirect={returnPath}
              listingId={listingId}
              targetUserId={resolvedUserId}
              targetBusinessId={resolvedBusinessId}
              vendorLabel={vendorName}
              defaultDealType={defaultDealType}
              defaultReviewerName={viewerDefaultName}
              defaultReviewerPostcode={viewerDefaultPostcode}
            />
          </>
        )}

        {/* Organic Growth Bar: Invite Customers After Real Dealings */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs">
          <div>
            <p className="font-bold text-neutral-900">
              🌱 Invite a customer or property owner to review completed work
            </p>
            <p className="text-neutral-600">
              Send this link after finishing a job so clients can write an honest review in their own words.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`sms:?body=${encodeURIComponent(vouchSmsBody)}`}
              className="rounded-lg border border-green-700 bg-white px-3 py-1.5 font-bold text-green-900 hover:bg-green-50"
            >
              💬 Text Review Link (SMS)
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(vouchSmsBody)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-semibold text-neutral-800 hover:border-green-700"
            >
              🟢 WhatsApp Link
            </a>
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileShareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 font-semibold text-neutral-800 hover:border-green-700"
            >
              📘 Share on Facebook
            </a>
          </div>
        </div>

        {/* Completed-Work Reviews List (Strictly Separated from Quick Vouches) */}
        {completedReviews.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-neutral-100 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                Completed-Work Reviews ({completedReviews.length})
              </h3>
              <span className="text-[11px] text-neutral-500">
                Written by signed-in members after a specific dealing · Business replies enabled
              </span>
            </div>
            {completedReviews.map((rev) => (
              <div
                key={rev.id}
                className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-amber-700">
                      {"★".repeat(rev.rating)}
                      {"☆".repeat(Math.max(0, 5 - rev.rating))}
                    </span>
                    <span className="font-semibold text-neutral-900">
                      {rev.reviewer_display_name}
                    </span>
                    {rev.reviewer_postcode && (
                      <span className="text-xs text-neutral-500">
                        ({rev.reviewer_postcode})
                      </span>
                    )}
                    <span className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                      {dealTypeLabel(rev.deal_type)}
                    </span>
                    {rev.would_recommend && (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-900">
                        ✓ Would deal with again
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-500">
                    {relativeTime(rev.created_at)}
                  </span>
                </div>

                {Array.isArray(rev.tags) && rev.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rev.tags.map((tag) => {
                      const isCust = isCustomerTrustTag(tag);
                      return (
                        <span
                          key={tag}
                          className={`rounded-full border bg-white px-2.5 py-0.5 text-xs font-medium ${
                            isCust
                              ? "border-sky-200 text-sky-900"
                              : "border-green-200 text-green-900"
                          }`}
                        >
                          ✓ {trustTagLabel(tag)}
                        </span>
                      );
                    })}
                  </div>
                )}

                {rev.comment && (
                  <p className="mt-2 whitespace-pre-line text-neutral-800">
                    {rev.comment}
                  </p>
                )}

                {rev.vendor_reply && (
                  <div className="mt-3 rounded-lg border-l-4 border-green-700 bg-white p-3 text-xs text-neutral-800">
                    <p className="font-semibold text-green-900">
                      Reply from {vendorName}:
                    </p>
                    <p className="mt-1 whitespace-pre-line">{rev.vendor_reply}</p>
                  </div>
                )}

                {isOwner && (
                  <VendorReplyForm
                    reviewId={rev.id}
                    returnPath={returnPath}
                    existingReply={rev.vendor_reply}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Neighbour Recommendations / Quick Vouches List (Shown Separately Without Fake 5-Star Ratings) */}
        {quickVouches.length > 0 && (
          <div className="mt-5 border-t border-neutral-100 pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-600">
              Neighbour Recommendations &amp; Quick Vouches ({quickVouches.length})
            </h3>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Community tag endorsements from locals (shown separately so they do not inflate completed-work star ratings):
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {quickVouches.map((v) => (
                <div
                  key={v.id}
                  className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-800"
                >
                  <span className="font-semibold text-neutral-900">
                    {v.reviewer_display_name}
                  </span>
                  {v.reviewer_postcode && (
                    <span className="text-neutral-500">({v.reviewer_postcode})</span>
                  )}
                  {Array.isArray(v.tags) &&
                    v.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-green-200 bg-white px-2 py-0.5 text-[11px] font-medium text-green-900"
                      >
                        ✓ {trustTagLabel(tag)}
                      </span>
                    ))}
                  {v.comment && (
                    <span className="text-neutral-600">“{v.comment}”</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}


