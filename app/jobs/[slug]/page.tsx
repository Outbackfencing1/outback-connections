import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ContactBlock from "@/components/detail/ContactBlock";
import ScrapedNotice from "@/components/detail/ScrapedNotice";
import SyndicatedNotice from "@/components/detail/SyndicatedNotice";
import ExpiredListingBanner from "@/components/detail/ExpiredListingBanner";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import EnquiryForm from "@/components/detail/EnquiryForm";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import ShareListingBar from "@/components/detail/ShareListingBar";
import TradeOfferCard from "@/components/detail/TradeOfferCard";
import JsonLd from "@/components/seo/JsonLd";
import { kindLabel, relativeTime } from "@/lib/format";
import {
  buildDescription,
  buildTitle,
  formatListingDescription,
  jobPostingJsonLd,
  localBusinessJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import { logEvent } from "@/lib/analytics";
import { enquiryNoticeFrom } from "@/lib/enquiry-fallback";
import { jobDirectionBadge, ticketLabel, travelRadiusLabel } from "@/lib/work-board";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createClient();
  let { data } = await supabase
    .from("listings")
    .select(
      `
      title, description, postcode, status, expires_at,
      category:categories(label)
    `
    )
    .eq("slug", slug)
    .eq("kind", "job")
    .maybeSingle();

  if (!data) {
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(`title, description, postcode, status, expires_at, category:categories(label)`)
        .eq("slug", slug)
        .eq("kind", "job")
        .in("status", ["active", "expired", "closed"])
        .maybeSingle();
      data = fb.data as typeof data;
    }
  }

  if (!data) {
    return { title: "Listing not found — Outback Connections" };
  }
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const title = buildTitle({
    listingTitle: data.title,
    categoryLabel: cat?.label ?? "Work & Skills",
    postcode: data.postcode,
  });
  const description = buildDescription(data.description);
  return {
    title,
    description,
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

type JobDetail = {
  direction?: string | null;
  work_type: string | null;
  pay_type: string | null;
  pay_amount: number | null;
  start_date: string | null;
  duration_text: string | null;
  accommodation_provided: boolean;
  tickets?: string[] | null;
  travel_willingness?: string | null;
  experience_years?: number | null;
};

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const enquiryNotice = enquiryNoticeFrom(await searchParams);
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;

  const fullCols = `
      id, anonymised_id, slug, kind, title, description, postcode, state,
      created_at, expires_at, user_id, status, category_id,
      data_source, source_platform, source_url, business_id, metadata,
      contact_email, contact_phone, contact_best_time,
      category:categories(slug, label),
      business:businesses(claim_status, geo_lat, geo_lng, contact_phone, contact_email, website_url, suburb, outback_verified),
      job_details(direction, work_type, pay_type, pay_amount, start_date, duration_text, accommodation_provided, tickets, travel_willingness, experience_years)
    `;

  let { data: listing, error: queryErr } = await supabase
    .from("listings")
    .select(fullCols)
    .eq("slug", slug)
    .eq("kind", "job")
    .maybeSingle();

  if (queryErr) {
    const fb = await supabase
      .from("listings")
      .select(
        `
        id, anonymised_id, slug, kind, title, description, postcode, state,
        created_at, expires_at, user_id, status, category_id,
        data_source, source_platform, source_url, business_id, metadata,
        contact_email, contact_phone, contact_best_time,
        category:categories(slug, label),
        business:businesses(claim_status, geo_lat, geo_lng, contact_phone, contact_email, website_url, suburb, outback_verified),
        job_details(work_type, pay_type, pay_amount, start_date, duration_text, accommodation_provided)
      `
      )
      .eq("slug", slug)
      .eq("kind", "job")
      .maybeSingle();
    listing = fb.data as typeof listing;
  }

  if (!listing) {
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(fullCols)
        .eq("slug", slug)
        .eq("kind", "job")
        .in("status", ["active", "expired", "closed"])
        .maybeSingle();
      listing = fb.data as typeof listing;
    }
  }

  if (!listing) notFound();

  const isOwner = viewer?.id === listing.user_id;
  const isExpiredOrFilled =
    listing.status === "expired" ||
    listing.status === "closed" ||
    (listing.status === "active" && new Date(listing.expires_at) <= new Date());
  const isPubliclyVisible =
    (listing.status === "active" && new Date(listing.expires_at) > new Date()) ||
    isExpiredOrFilled;

  if (!isOwner && !isPubliclyVisible) {
    notFound();
  }

  const detail = (Array.isArray(listing.job_details)
    ? listing.job_details[0]
    : listing.job_details) as JobDetail | null;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;
  const biz = Array.isArray(listing.business) ? listing.business[0] : listing.business;
  const publicBusinessPhone = biz?.contact_phone ?? null;
  const publicBusinessEmail = biz?.contact_email ?? null;
  const resolvedPhone = viewer
    ? listing.contact_phone || publicBusinessPhone
    : publicBusinessPhone;
  const resolvedEmail = viewer
    ? listing.contact_email || publicBusinessEmail
    : publicBusinessEmail;
  const resolvedWebsite = biz?.website_url || null;
  const resolvedSuburb = biz?.suburb || null;
  const phoneDigits = resolvedPhone ? resolvedPhone.replace(/[^\d+]/g, "") : null;

  const isScraped = listing.data_source === "scraped";
  const isSyndicated = isScraped && listing.source_platform === "adzuna";
  const isWorkerProfile = detail?.direction === "available_for_work";
  const isUnclaimedScraped =
    isScraped && !isSyndicated && (!biz || biz.claim_status === "unclaimed");

  const displayDescription = formatListingDescription({
    description: listing.description,
    businessName: listing.title,
    categoryName: cat?.label,
    suburb: resolvedSuburb,
    postcode: listing.postcode,
    state: listing.state,
    unclaimed: isUnclaimedScraped,
  });

  await logEvent({
    eventType: "listing_view",
    entityType: "listing",
    entityId: listing.id,
    vertical: "job",
    userId: viewer?.id ?? null,
    properties: {
      slug: listing.slug,
      data_source: listing.data_source,
      direction: detail?.direction ?? "hiring",
      expired: isExpiredOrFilled,
    },
  });
  if (viewer && listing.data_source !== "scraped" && !isExpiredOrFilled && (resolvedEmail || resolvedPhone)) {
    await logEvent({
      eventType: "contact_reveal",
      entityType: "listing",
      entityId: listing.id,
      vertical: "job",
      userId: viewer.id,
    });
  }

  // Real active job ads (direction !== 'available_for_work') -> JobPosting (Google-for-Jobs eligible).
  // Worker/operator skill profiles are supply listings, NOT job vacancies, so they never emit JobPosting.
  // Scraped directory rows also never emit JobPosting — they get LocalBusiness instead.
  const pageUrl = `${BASE_URL}/jobs/${listing.slug}`;
  const companyName = (listing.metadata as { company?: string } | null)?.company ?? null;
  const primaryLd = isSyndicated || isWorkerProfile
    ? null
    : isScraped
    ? localBusinessJsonLd({
        name: listing.title,
        postcode: listing.postcode,
        suburb: resolvedSuburb,
        state: listing.state,
        telephone: !isExpiredOrFilled ? publicBusinessPhone : null,
        geoLat: biz?.geo_lat ?? null,
        geoLng: biz?.geo_lng ?? null,
        category: cat?.label ?? null,
        categorySlug: cat?.slug ?? null,
        url: pageUrl,
      })
    : isExpiredOrFilled
    ? null
    : jobPostingJsonLd({
        title: listing.title,
        description: displayDescription,
        postcode: listing.postcode,
        suburb: resolvedSuburb,
        state: listing.state,
        createdAt: listing.created_at,
        expiresAt: listing.expires_at,
        workType: detail?.work_type ?? null,
        payType: detail?.pay_type ?? null,
        payAmount: detail?.pay_amount ?? null,
        hiringOrganizationName: companyName,
        baseUrl: BASE_URL,
        slug: listing.slug,
      });

  const jsonLdBlocks = [
    ...(primaryLd ? [primaryLd] : []),
    breadcrumbJsonLd([
      { name: "Home", url: BASE_URL },
      { name: "Work & Skills", url: `${BASE_URL}/jobs` },
      { name: listing.title, url: pageUrl },
    ]),
  ];

  const badge = detail?.direction ? jobDirectionBadge(detail.direction) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={jsonLdBlocks} />
      <p className="text-sm">
        <Link href="/jobs" className="text-neutral-600 underline">
          ← All work &amp; skills
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {listing.title}
        </h1>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {isExpiredOrFilled && (
            <span className="rounded-full bg-amber-900 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Archived / Expired
            </span>
          )}
          {biz?.outback_verified && (
            <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
              ★ Outback Verified
            </span>
          )}
          {badge ? (
            <span
              className={`rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                badge.isWorker
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {badge.label}
            </span>
          ) : (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {kindLabel(listing.kind)}
            </span>
          )}
        </span>
      </div>

      <p className="mt-2 text-sm text-neutral-600">
        {cat?.label ?? "—"} ·{" "}
        {resolvedSuburb ? `${resolvedSuburb}, ` : ""}
        {listing.state ? `${listing.postcode} ${listing.state}` : `Postcode ${listing.postcode}`}{" "}
        · Posted {relativeTime(listing.created_at)} ·{" "}
        {isExpiredOrFilled
          ? `Expired ${new Date(listing.expires_at).toLocaleDateString("en-AU")}`
          : `Expires ${new Date(listing.expires_at).toLocaleDateString("en-AU")}`}
      </p>

      {isExpiredOrFilled ? (
        <ExpiredListingBanner
          listingId={listing.id}
          kind={listing.kind}
          categoryId={listing.category_id}
          categoryName={cat?.label ?? "Work & Skills"}
          suburb={resolvedSuburb}
          postcode={listing.postcode}
          state={listing.state}
          browseHref="/jobs"
        />
      ) : (
        !isSyndicated &&
        (phoneDigits || resolvedEmail || resolvedWebsite) && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-green-300 bg-green-50/70 p-3.5 shadow-sm">
            {phoneDigits && (
              <a
                href={`tel:${phoneDigits}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-green-800"
              >
                📞 Call {resolvedPhone}
              </a>
            )}
            {phoneDigits && /^(\+?614|04)\d{8}$/.test(phoneDigits) && (
              <a
                href={`sms:${phoneDigits}?body=${encodeURIComponent(
                  `Hi ${listing.title}, saw your listing on Outback Connections (${listing.postcode}) — are you available?`
                )}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-700 bg-white px-3.5 py-2 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
              >
                💬 SMS
              </a>
            )}
            {resolvedEmail && (
              <a
                href={`mailto:${resolvedEmail}?subject=${encodeURIComponent(
                  `Work Enquiry via Outback Connections: ${listing.title}`
                )}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700"
              >
                ✉️ Email
              </a>
            )}
            {resolvedWebsite && (
              <a
                href={resolvedWebsite}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700"
              >
                🌐 Website →
              </a>
            )}
          </div>
        )
      )}

      {!isExpiredOrFilled && (
        <ShareListingBar
          title={listing.title}
          url={pageUrl}
          postcode={listing.postcode}
          state={listing.state}
          badgeText={isWorkerProfile ? "AVAILABLE FOR WORK" : "HIRING"}
          summaryLine={cat?.label ?? null}
        />
      )}

      {isOwner && (
        <div className="mt-4">
          <OwnerActions listingId={listing.id} listingTitle={listing.title} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          {isWorkerProfile ? "About & experience" : "Description"}
        </h2>
        <p className="mt-2 whitespace-pre-line text-neutral-800">
          {displayDescription}
        </p>
      </section>

      {detail && <JobDetails detail={detail} />}

      {!isExpiredOrFilled ? (
        <>
          <section className="mt-8">
            {isSyndicated ? (
              <SyndicatedNotice
                company={(listing.metadata as { company?: string } | null)?.company ?? null}
                locationDisplay={(listing.metadata as { location_display?: string } | null)?.location_display ?? null}
                sourceUrl={listing.source_url}
                listingId={listing.id}
              />
            ) : isUnclaimedScraped ? (
              <ScrapedNotice
                title={listing.title}
                sourcePlatform={listing.source_platform}
                sourceUrl={listing.source_url}
                businessId={listing.business_id}
                signedIn={!!viewer}
                signInRedirect={`/jobs/${listing.slug}`}
                listingId={listing.id}
                contactPhone={resolvedPhone}
                contactEmail={resolvedEmail}
                websiteUrl={resolvedWebsite}
              />
            ) : (
              <ContactBlock
                signedIn={!!viewer}
                contactEmail={resolvedEmail}
                contactPhone={resolvedPhone}
                contactBestTime={listing.contact_best_time ?? null}
                websiteUrl={resolvedWebsite}
                signInRedirect={`/jobs/${listing.slug}`}
              />
            )}
          </section>

          {!isOwner && !isSyndicated && (
            <section className="mt-6">
              <EnquiryForm
                listingId={listing.id}
                businessName={listing.title}
                claimed={!isUnclaimedScraped}
                returnTo={`/jobs/${listing.slug}`}
                notice={enquiryNotice}
                heading={
                  isWorkerProfile
                    ? `Message ${listing.title} about work`
                    : `Apply or enquire about ${listing.title}`
                }
                ctaLabel={isWorkerProfile ? "Send work enquiry" : "Apply / Send message"}
                promptLabel={
                  isWorkerProfile
                    ? "What's the job, location & start date?"
                    : "Your experience, tickets & availability"
                }
                postcodeLabel={isWorkerProfile ? "Postcode of the job" : "Your postcode"}
                placeholder={
                  isWorkerProfile
                    ? "e.g. Chasing a header operator / MC driver near Forbes for 3 weeks starting mid-November, accommodation included."
                    : "e.g. Hold MC licence + 10 yrs header/GPS tractor experience, based in Dubbo, available immediately."
                }
              />
            </section>
          )}
        </>
      ) : (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-100 p-4">
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-600"
          >
            Application &amp; Contact Disabled — Position Expired or Filled
          </button>
        </section>
      )}

      {!isSyndicated && (
        <VendorTrustSection
          userId={listing.user_id}
          businessId={listing.business_id}
          listingId={listing.id}
          fallbackTitle={listing.title}
          returnPath={`/jobs/${listing.slug}`}
          defaultDealType={isWorkerProfile ? "hired_worker" : "worked_for"}
          viewerId={viewer?.id ?? null}
        />
      )}

      <TradeOfferCard
        categorySlug={
          cat?.slug ||
          (Array.isArray(detail?.tickets) && detail.tickets.includes("fencing_exclusion")
            ? "fencing-labour"
            : null)
        }
        placement="listing"
      />

      {!isOwner && (
        <div className="mt-8 space-y-3">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/jobs/${listing.slug}`}
          />
          <LegalConcernForm listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

function JobDetails({ detail }: { detail: JobDetail }) {
  const isWorker = detail.direction === "available_for_work";
  const rows: Array<{ label: string; value: string }> = [];
  if (detail.work_type) {
    rows.push({
      label: isWorker ? "Preferred work type" : "Work type",
      value: humanise(detail.work_type),
    });
  }
  if (detail.pay_type) {
    rows.push({
      label: isWorker ? "Rate" : "Pay",
      value:
        detail.pay_amount !== null
          ? `$${detail.pay_amount.toLocaleString("en-AU")} ${humanise(detail.pay_type).toLowerCase()}`
          : humanise(detail.pay_type),
    });
  }
  const radius = travelRadiusLabel(detail.travel_willingness);
  if (radius) {
    rows.push({
      label: isWorker ? "Willing to travel" : "Location flexibility",
      value: radius,
    });
  }
  if (detail.experience_years !== null && detail.experience_years !== undefined) {
    rows.push({
      label: isWorker ? "Experience" : "Min. experience",
      value: `${detail.experience_years} year${detail.experience_years === 1 ? "" : "s"}`,
    });
  }
  if (detail.start_date) {
    rows.push({
      label: isWorker ? "Available from" : "Start date",
      value: detail.start_date,
    });
  }
  if (detail.duration_text) {
    rows.push({
      label: isWorker ? "Availability window" : "Duration",
      value: detail.duration_text,
    });
  }
  if (detail.accommodation_provided) {
    rows.push({
      label: "Accommodation",
      value: isWorker ? "Needed on-farm" : "Provided",
    });
  }

  const tickets = Array.isArray(detail.tickets) ? detail.tickets : [];

  if (rows.length === 0 && tickets.length === 0) return null;

  return (
    <section className="mt-6 space-y-4">
      {tickets.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            {isWorker ? "Tickets, licences & skills" : "Tickets & skills wanted"}
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {tickets.map((t) => (
              <span
                key={t}
                className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-900"
              >
                {ticketLabel(t)}
              </span>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
            {isWorker ? "Availability & rate" : "Job details"}
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-neutral-600">{r.label}</dt>
                <dd className="text-neutral-900">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
