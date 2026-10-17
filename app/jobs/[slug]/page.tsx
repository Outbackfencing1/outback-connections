import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactBlock from "@/components/detail/ContactBlock";
import ScrapedNotice from "@/components/detail/ScrapedNotice";
import SyndicatedNotice from "@/components/detail/SyndicatedNotice";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import EnquiryForm from "@/components/detail/EnquiryForm";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import { kindLabel, relativeTime } from "@/lib/format";
import {
  buildDescription,
  buildTitle,
  jobPostingJsonLd,
  localBusinessJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
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
  const { data } = await supabase
    .from("listings")
    .select(`
      title, description, postcode, status, expires_at,
      category:categories(label)
    `)
    .eq("slug", slug)
    .eq("kind", "job")
    .maybeSingle();

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

  let { data: listing, error: queryErr } = await supabase
    .from("listings")
    .select(
      `
      id, anonymised_id, slug, kind, title, description, postcode, state,
      created_at, expires_at, user_id, status,
      data_source, source_platform, source_url, business_id, metadata,
      category:categories(slug, label),
      business:businesses(claim_status, geo_lat, geo_lng),
      job_details(direction, work_type, pay_type, pay_amount, start_date, duration_text, accommodation_provided, tickets, travel_willingness, experience_years)
    `
    )
    .eq("slug", slug)
    .eq("kind", "job")
    .maybeSingle();

  if (queryErr) {
    const fb = await supabase
      .from("listings")
      .select(
        `
        id, anonymised_id, slug, kind, title, description, postcode, state,
        created_at, expires_at, user_id, status,
        data_source, source_platform, source_url, business_id, metadata,
        category:categories(slug, label),
        business:businesses(claim_status, geo_lat, geo_lng),
        job_details(work_type, pay_type, pay_amount, start_date, duration_text, accommodation_provided)
      `
      )
      .eq("slug", slug)
      .eq("kind", "job")
      .maybeSingle();
    listing = fb.data as typeof listing;
  }

  if (!listing) notFound();

  const { data: contact } = viewer
    ? await supabase
        .from("listings")
        .select("contact_email, contact_phone, contact_best_time")
        .eq("id", listing.id)
        .maybeSingle()
    : { data: null };

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    notFound();
  }

  const detail = (Array.isArray(listing.job_details)
    ? listing.job_details[0]
    : listing.job_details) as JobDetail | null;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;

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
    },
  });
  if (viewer && listing.data_source !== "scraped" && (contact?.contact_email || contact?.contact_phone)) {
    await logEvent({
      eventType: "contact_reveal",
      entityType: "listing",
      entityId: listing.id,
      vertical: "job",
      userId: viewer.id,
    });
  }

  // Real job ads (direction !== 'available_for_work') -> JobPosting (Google-for-Jobs eligible).
  // Worker/operator skill profiles are supply listings, NOT job vacancies, so they never emit JobPosting.
  // Scraped directory rows also never emit JobPosting — they get LocalBusiness instead.
  const isScraped = listing.data_source === "scraped";
  const isSyndicated = isScraped && listing.source_platform === "adzuna";
  const isWorkerProfile = detail?.direction === "available_for_work";
  const biz = Array.isArray(listing.business) ? listing.business[0] : listing.business;
  const isUnclaimedScraped =
    isScraped && !isSyndicated && (!biz || biz.claim_status === "unclaimed");
  const pageUrl = `${BASE_URL}/jobs/${listing.slug}`;
  const primaryLd = isSyndicated || isWorkerProfile
    ? null
    : isScraped
    ? localBusinessJsonLd({
        name: listing.title,
        postcode: listing.postcode,
        state: listing.state,
        geoLat: biz?.geo_lat ?? null,
        geoLng: biz?.geo_lng ?? null,
        category: cat?.label ?? null,
        url: pageUrl,
      })
    : jobPostingJsonLd({
        title: listing.title,
        description: listing.description,
        postcode: listing.postcode,
        state: listing.state,
        createdAt: listing.created_at,
        expiresAt: listing.expires_at,
        workType: detail?.work_type ?? null,
        payType: detail?.pay_type ?? null,
        payAmount: detail?.pay_amount ?? null,
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
      {jsonLdBlocks.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
        />
      ))}
      <p className="text-sm">
        <Link href="/jobs" className="text-neutral-600 underline">
          ← All work &amp; skills
        </Link>
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {listing.title}
        </h1>
        {badge ? (
          <span
            className={`shrink-0 rounded px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
              badge.isWorker
                ? "bg-emerald-100 text-emerald-900"
                : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {badge.label}
          </span>
        ) : (
          <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {kindLabel(listing.kind)}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-neutral-600">
        {cat?.label ?? "—"} ·{" "}
        {listing.state ? `${listing.postcode} ${listing.state}` : `Postcode ${listing.postcode}`}{" "}
        · Posted {relativeTime(listing.created_at)} ·{" "}
        Expires {new Date(listing.expires_at).toLocaleDateString("en-AU")}
      </p>

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
          {listing.description}
        </p>
      </section>

      {detail && <JobDetails detail={detail} />}

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
          />
        ) : (
          <ContactBlock
            signedIn={!!viewer}
            contactEmail={contact?.contact_email ?? null}
            contactPhone={contact?.contact_phone ?? null}
            contactBestTime={contact?.contact_best_time ?? null}
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
