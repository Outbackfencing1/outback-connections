// components/detail/VendorTrustSection.tsx — Server component that renders the
// Vendor / Worker / Business Trust Scorecard, verification badges, vouched
// qualities, and community reviews on any listing detail page or profile page.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import { responseLine } from "@/lib/enquiry-outcome";
import {
  dealTypeLabel,
  formatAbn,
  insuranceBadgeLabel,
  roleTagLabel,
  trustTagLabel,
  type VendorTrustSummary,
} from "@/lib/trust";
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

export default async function VendorTrustSection({
  userId,
  businessId,
  listingId,
  fallbackTitle,
  returnPath,
  defaultDealType = "general",
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
          .select("display_name, trading_name, postcode")
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
  const profileId = resolvedUserId ?? resolvedBusinessId;
  const vendorName =
    summary.trading_name ||
    summary.display_name ||
    summary.abn_entity_name ||
    fallbackTitle;

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
  const topTags = Array.isArray(summary.top_tags) ? summary.top_tags : [];
  const reviews = Array.isArray(summary.recent_reviews)
    ? summary.recent_reviews
    : [];

  const viewerDefaultName =
    viewerProfileRes.data?.trading_name ||
    viewerProfileRes.data?.display_name ||
    null;
  const viewerDefaultPostcode = viewerProfileRes.data?.postcode || null;

  return (
    <section
      aria-label="Vendor trust and reviews"
      className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {/* Header: Name, Profile Link & Star Rating Summary */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Trust, Verification &amp; Community Feedback
          </p>
          <h2 className="mt-1 text-xl font-bold text-neutral-900">
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
          <p className="mt-1 text-xs text-neutral-600">
            {summary.postcode
              ? `${summary.postcode}${summary.state ? ` ${summary.state}` : ""}`
              : "Regional Australia"}
            {memberSinceText ? ` · Member since ${memberSinceText}` : ""}
            {summary.years_in_district
              ? ` · ${summary.years_in_district}+ yrs in district`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {summary.review_count > 0 && summary.avg_rating !== null ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-right">
              <div className="flex items-center gap-1.5 text-base font-bold text-amber-900">
                <span>★ {Number(summary.avg_rating).toFixed(1)}</span>
                <span className="text-xs font-medium text-amber-800">
                  ({summary.review_count} review{summary.review_count === 1 ? "" : "s"})
                </span>
              </div>
              {summary.recommend_pct !== null && (
                <p className="text-[11px] font-medium text-amber-900">
                  {summary.recommend_pct}% would deal with again
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-600">
              No reviews yet — be the first to vouch
            </div>
          )}

          {showProfileLink && profileId && (
            <Link
              href={`/profile/${profileId}`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:border-green-700 hover:text-green-800"
            >
              View full profile →
            </Link>
          )}
        </div>
      </div>

      {/* Verification & Trust Badges */}
      <div className="mt-4 flex flex-wrap gap-2">
        {summary.abn_verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-900">
            ✓ ABN Verified{formattedAbn ? ` (${formattedAbn})` : ""}
          </span>
        )}
        {!summary.abn_verified && formattedAbn && (
          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-800">
            ABN: {formattedAbn}
          </span>
        )}
        {summary.claim_status === "claimed" ||
        summary.claim_status === "abn_verified" ||
        summary.claim_status === "trusted" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-semibold text-green-900">
            ✓ Claimed Business
          </span>
        ) : null}
        {summary.email_verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
            ✓ Verified Email
          </span>
        )}
        {summary.phone_verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
            ✓ Verified Phone
          </span>
        )}
        {insurances.map((ins) => (
          <span
            key={ins}
            className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900"
          >
            🛡 {insuranceBadgeLabel(ins)}
          </span>
        ))}
        {roles.map((r) => (
          <span
            key={r}
            className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
          >
            {roleTagLabel(r)}
          </span>
        ))}
      </div>

      {/* Bio if present */}
      {summary.bio && (
        <p className="mt-3 text-sm text-neutral-700 whitespace-pre-line">
          {summary.bio}
        </p>
      )}

      {/* Track record counters */}
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-neutral-50 p-3 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Active listings
          </p>
          <p className="mt-0.5 text-base font-bold text-neutral-900">
            {summary.active_listings_count}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Completed deals / jobs
          </p>
          <p className="mt-0.5 text-base font-bold text-neutral-900">
            {summary.completed_deals_count}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Community reviews
          </p>
          <p className="mt-0.5 text-base font-bold text-neutral-900">
            {summary.review_count}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            Quote responsiveness
          </p>
          <p className="mt-0.5 text-xs font-semibold text-neutral-900">
            {quoteResponse
              ? `${summary.enquiry_responded}/${summary.enquiry_answered} replied`
              : summary.enquiry_forwarded > 0
                ? `${summary.enquiry_forwarded} sent`
                : "Direct contact"}
          </p>
        </div>
      </div>

      {/* Top Vouched Tags */}
      {topTags.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
            What locals vouch for
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topTags.map((t) => (
              <span
                key={t.tag}
                className="rounded-full border border-green-200 bg-green-50/80 px-3 py-1 text-xs font-medium text-green-900"
              >
                ✓ {trustTagLabel(t.tag)}{" "}
                <strong className="ml-0.5 font-bold">({t.count})</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Owner prompt to enrich their trust profile */}
      {isOwner && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50/60 p-3 text-xs text-green-950 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>This is your trust profile.</strong> Add your ABN, trading name, insurance badges, and bio in Settings so farmers and contractors know who they&apos;re dealing with.
          </span>
          <Link
            href="/dashboard/settings"
            className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
          >
            Edit trust profile
          </Link>
        </div>
      )}

      {/* Leave Review Form (for non-owners) */}
      {!isOwner && (
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
      )}

      {/* Published Reviews List */}
      {reviews.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-neutral-100 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Recent feedback &amp; vouches ({summary.review_count})
          </h3>
          {reviews.map((rev) => (
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
                  <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700 border border-neutral-200">
                    {dealTypeLabel(rev.deal_type)}
                  </span>
                  {rev.would_recommend && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-900">
                      ✓ Recommends
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500">
                  {relativeTime(rev.created_at)}
                </span>
              </div>

              {Array.isArray(rev.tags) && rev.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rev.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-green-200 bg-white px-2.5 py-0.5 text-xs text-green-900"
                    >
                      ✓ {trustTagLabel(tag)}
                    </span>
                  ))}
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
    </section>
  );
}
