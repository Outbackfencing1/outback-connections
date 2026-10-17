// components/detail/VendorTrustSection.tsx — Server component that renders the
// Professional Vendor / Contractor / Customer Trust Profile, 1-click direct
// contact bar, verification badges, two-sided vouches (Vendor & Customer/Employer),
// and organic referral share links on any listing detail page or profile page.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import { responseLine } from "@/lib/enquiry-outcome";
import {
  CUSTOMER_QUICK_VOUCH_TAGS,
  VENDOR_QUICK_VOUCH_TAGS,
  availabilityStatusInfo,
  dealTypeLabel,
  formatAbn,
  formatPhoneHref,
  insuranceBadgeLabel,
  isAustralianMobile,
  isCustomerTrustTag,
  roleTagLabel,
  trustTagLabel,
  type VendorTrustSummary,
} from "@/lib/trust";
import { submitQuickVouch, toggleOutbackVerified } from "@/app/reviews/actions";
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
  const photos = Array.isArray(summary.photo_urls)
    ? summary.photo_urls
    : [];
  const topTags = Array.isArray(summary.top_tags) ? summary.top_tags : [];
  const reviews = Array.isArray(summary.recent_reviews)
    ? summary.recent_reviews
    : [];
  const availInfo = availabilityStatusInfo(summary.availability_status);

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
  const vouchSmsBody = `G'day, we've got our profile up on Outback Connections (${vendorName}). If you've got 20 seconds, could you tap a quick vouch or review for us here? ${profileShareUrl}`;

  return (
    <section
      aria-label="Vendor trust and reviews"
      className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      {/* Top Banner Accent */}
      <div className="bg-gradient-to-r from-green-900 via-green-800 to-emerald-800 px-5 py-3 text-white sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-emerald-100">
            Verified Rural Profile · Two-Sided Reputation &amp; Direct Contact
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {summary.outback_verified && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-400 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950 shadow-sm">
                ★ Outback Verified
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
              <span className={`h-2 w-2 rounded-full ${availInfo.dotClass}`} />
              {availInfo.shortLabel}
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
                {summary.abn_verified && (
                  <span className="rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-900">
                    ✓ ABN Verified
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

          {/* Right Scorecard */}
          <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
            {summary.review_count > 0 && summary.avg_rating !== null ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-right shadow-sm">
                <div className="flex items-center gap-1.5 text-lg font-extrabold text-amber-950">
                  <span>★ {Number(summary.avg_rating).toFixed(1)}</span>
                  <span className="text-xs font-semibold text-amber-800">
                    ({summary.review_count} review{summary.review_count === 1 ? "" : "s"})
                  </span>
                </div>
                {summary.recommend_pct !== null && (
                  <p className="text-[11px] font-semibold text-amber-900">
                    ✓ {summary.recommend_pct}% would deal with again
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-xs font-medium text-neutral-600">
                No reviews yet — be the first to vouch below
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

        {/* Owner Claim Callout for Unclaimed Profiles */}
        {summary.claim_status === "unclaimed" && resolvedBusinessId && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-950">
            <div>
              <p className="font-bold">Is {vendorName} your business?</p>
              <p className="mt-0.5 text-amber-900">
                Claim your free profile to update your details, set live availability, upload photos of your work/rigs, and reply to reviews.
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

        {/* Bio & Services / Specialties */}
        {summary.bio && (
          <p className="mt-4 text-sm leading-relaxed text-neutral-800 whitespace-pre-line">
            {summary.bio}
          </p>
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
                🛡 {insuranceBadgeLabel(ins)}
              </span>
            ))}
          </div>
        )}

        {/* Work, Fleet, Fencing & Livestock Photo Gallery */}
        {photos.length > 0 ? (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-700">
                📷 Work, Fleet &amp; Property Photos ({photos.length})
              </p>
              {isOwner && (
                <Link
                  href="/dashboard/settings"
                  className="text-xs font-semibold text-green-800 underline"
                >
                  Manage photos →
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
              <strong>📷 Show your gear &amp; workmanship:</strong> Add photos of your fencing jobs, trucks, machinery, or stock so customers can see your work.
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
              Active listings
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {summary.active_listings_count}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Completed deals / jobs
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {summary.completed_deals_count}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Community vouches
            </p>
            <p className="mt-0.5 text-lg font-extrabold text-neutral-900">
              {summary.review_count}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              Contact status
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

        {/* Two-Sided Vouched Qualities: Vendor/Contractor & Customer/Employer */}
        {(vendorVouchTags.length > 0 || customerVouchTags.length > 0) && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {vendorVouchTags.length > 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50/40 p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-green-900">
                  Contractor / Vendor Vouches
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
                  Customer / Property / Employer Rating
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
              <strong>This is your trust profile.</strong> Add your ABN, trading name, insurance badges, and availability in Settings so farmers, contractors, and workers know who they&apos;re dealing with.
            </span>
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
            >
              Edit trust profile
            </Link>
          </div>
        )}

        {/* Two-Sided 1-Click Quick Vouches (Contractor/Vendor + Customer/Property/Employer) */}
        {!isOwner && (
          <>
            {viewerId ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-green-200 bg-green-50/40 p-3.5">
                  <p className="text-xs font-bold text-green-950">
                    Used {vendorName} for work, freight or stock? 1-click vouch:
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
                    Worked for or delivered to {vendorName}? Rate them as a customer / property:
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

        {/* Organic Growth Bar: Request a Vouch via SMS / WhatsApp / Facebook */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs">
          <div>
            <p className="font-bold text-neutral-900">
              🌱 Build rural word-of-mouth — ask a customer, boss or neighbour for a quick vouch
            </p>
            <p className="text-neutral-600">
              Send this profile link by SMS or WhatsApp so locals you&apos;ve worked with can back your name.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`sms:?body=${encodeURIComponent(vouchSmsBody)}`}
              className="rounded-lg border border-green-700 bg-white px-3 py-1.5 font-bold text-green-900 hover:bg-green-50"
            >
              💬 Text for a Vouch (SMS)
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

        {/* Published Reviews List */}
        {reviews.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-neutral-100 pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">
              Verified community reviews &amp; vouches ({summary.review_count})
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
                    <span className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-700">
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
      </div>
    </section>
  );
}

