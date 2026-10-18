import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { regionsForPostcodes } from "@/lib/regions";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingHref } from "@/lib/format";
import ContactBlock from "@/components/detail/ContactBlock";
import ScrapedNotice from "@/components/detail/ScrapedNotice";
import TradeOfferCard from "@/components/detail/TradeOfferCard";
import EnquiryForm from "@/components/detail/EnquiryForm";
import ExpiredListingBanner from "@/components/detail/ExpiredListingBanner";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import ShareListingBar from "@/components/detail/ShareListingBar";
import JsonLd from "@/components/seo/JsonLd";
import { kindLabel, postedVerb, relativeTime } from "@/lib/format";
import {
  buildDescription,
  buildDirectoryDescription,
  buildTitle,
  formatListingDescription,
  serviceJsonLd,
  localBusinessJsonLd,
  breadcrumbJsonLd,
  socialMeta,
} from "@/lib/seo";
import { logEvent } from "@/lib/analytics";
import { responseLine } from "@/lib/enquiry-outcome";
import { enquiryNoticeFrom } from "@/lib/enquiry-fallback";

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
      `title, description, postcode, state, kind, status, data_source, category:categories(label), business:businesses(suburb, claim_status)`
    )
    .eq("slug", slug)
    .in("kind", ["service_offering", "service_request"])
    .maybeSingle();

  if (!data) {
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(
          `title, description, postcode, state, kind, status, data_source, category:categories(label), business:businesses(suburb, claim_status)`
        )
        .eq("slug", slug)
        .in("kind", ["service_offering", "service_request"])
        .in("status", ["active", "expired", "closed"])
        .maybeSingle();
      data = fb.data as typeof data;
    }
  }

  if (!data) {
    return {
      title: "Service listing not found — Outback Connections",
      robots: { index: false, follow: true },
    };
  }
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const biz = Array.isArray(data.business) ? data.business[0] : data.business;
  const title = buildTitle({
    listingTitle: data.title,
    categoryLabel: cat?.label ?? "Services",
    postcode: data.postcode,
    state: data.state,
  });
  let description: string;
  if (data.kind === "service_offering" && data.data_source !== "manual") {
    const region = (await regionsForPostcodes([data.postcode])).get(data.postcode);
    description = buildDirectoryDescription({
      businessName: data.title,
      categoryLabel: cat?.label ?? "Rural service",
      regionName: region?.region_name,
      suburb: biz?.suburb ?? null,
      state: data.state,
      postcode: data.postcode,
      unclaimed: data.data_source === "scraped" && (!biz || biz.claim_status === "unclaimed"),
    });
  } else {
    description = buildDescription(data.description);
  }
  return {
    title,
    description,
    alternates: { canonical: `/services/listing/${slug}` },
    ...socialMeta({ title, description, path: `/services/listing/${slug}` }),
  };
}

export default async function ServiceDetailPage({
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

  const selectCols = `
      id, anonymised_id, slug, kind, title, description, postcode, state,
      created_at, expires_at, user_id, status, category_id,
      data_source, source_platform, source_url, business_id, metadata,
      contact_email, contact_phone, contact_best_time,
      category:categories(slug, label),
      business:businesses(claim_status, geo_lat, geo_lng, contact_phone, contact_email, website_url, suburb, outback_verified),
      service_details(direction, rate_type, rate_amount, travel_willingness)
    `;

  let { data: listing } = await supabase
    .from("listings")
    .select(selectCols)
    .eq("slug", slug)
    .in("kind", ["service_offering", "service_request"])
    .maybeSingle();

  if (!listing) {
    await redirectToCanonical(slug);
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(selectCols)
        .eq("slug", slug)
        .in("kind", ["service_offering", "service_request"])
        .in("status", ["active", "expired", "closed"])
        .maybeSingle();
      listing = fb.data as typeof listing;
    }
  }

  if (!listing) {
    notFound();
  }

  const { data: responseStats } =
    listing.kind === "service_offering"
      ? await supabase.rpc("business_response_stats", { p_listing_id: listing.id })
      : { data: null };

  const isOwner = viewer?.id === listing.user_id;
  const isExpiredOrFilled =
    listing.status === "expired" ||
    listing.status === "closed" ||
    (listing.status === "active" && new Date(listing.expires_at) <= new Date());
  const isPubliclyVisible =
    (listing.status === "active" && new Date(listing.expires_at) > new Date()) ||
    isExpiredOrFilled;

  if (!isOwner && !isPubliclyVisible) {
    await redirectToCanonical(slug);
    notFound();
  }
  if (!isOwner && isExpiredOrFilled) {
    // Still honour a canonical 301 redirect if this row was merged into a newer active listing
    await redirectToCanonical(slug);
  }

  const sourceUrlKind =
    listing.metadata && typeof listing.metadata === "object"
      ? ((listing.metadata as Record<string, unknown>).source_url_kind as
          | "site"
          | "search"
          | undefined) ?? null
      : null;

  const detail = Array.isArray(listing.service_details)
    ? listing.service_details[0]
    : listing.service_details;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;
  const business = Array.isArray(listing.business)
    ? listing.business[0]
    : listing.business;
  const isUnclaimedScraped =
    listing.data_source === "scraped" &&
    (!business || business.claim_status === "unclaimed");
  const trustBadge =
    business?.claim_status === "abn_verified" || business?.claim_status === "trusted"
      ? "ABN verified"
      : business?.claim_status === "claimed"
        ? "Claimed by the owner"
        : null;
  const responded = responseLine(responseStats as { answered?: number; responded?: number } | null);

  const resolvedPhone = listing.contact_phone || business?.contact_phone || null;
  const resolvedEmail = listing.contact_email || business?.contact_email || null;
  const resolvedWebsite = business?.website_url || null;
  const resolvedSuburb = business?.suburb || null;
  const phoneDigits = resolvedPhone ? resolvedPhone.replace(/[^\d+]/g, "") : null;

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
    vertical: "service",
    userId: viewer?.id ?? null,
    properties: { slug: listing.slug, expired: isExpiredOrFilled },
  });
  if (viewer && !isUnclaimedScraped && !isExpiredOrFilled && (resolvedEmail || resolvedPhone)) {
    await logEvent({
      eventType: "contact_reveal",
      entityType: "listing",
      entityId: listing.id,
      vertical: "service",
      userId: viewer.id,
    });
  }

  // Offerings -> Service + LocalBusiness / HomeAndConstructionBusiness.
  const pageUrl = `${BASE_URL}/services/listing/${listing.slug}`;
  const jsonLdBlocks: Record<string, unknown>[] = [];
  if (listing.kind === "service_offering") {
    jsonLdBlocks.push(
      serviceJsonLd({
        title: listing.title,
        description: displayDescription,
        postcode: listing.postcode,
        suburb: resolvedSuburb,
        state: listing.state,
        category: cat?.label ?? "Service",
        rateType: detail?.rate_type ?? null,
        rateAmount: detail?.rate_amount ?? null,
        baseUrl: BASE_URL,
        slug: listing.slug,
      }),
      localBusinessJsonLd({
        name: listing.title,
        postcode: listing.postcode,
        suburb: resolvedSuburb,
        state: listing.state,
        telephone: !isExpiredOrFilled ? resolvedPhone : null,
        geoLat: business?.geo_lat ?? null,
        geoLng: business?.geo_lng ?? null,
        category: cat?.label ?? null,
        categorySlug: cat?.slug ?? null,
        url: pageUrl,
      })
    );
  }
  jsonLdBlocks.push(
    breadcrumbJsonLd([
      { name: "Home", url: BASE_URL },
      { name: "Services", url: `${BASE_URL}/services` },
      ...(cat ? [{ name: cat.label, url: `${BASE_URL}/services/${cat.slug}` }] : []),
      { name: listing.title, url: pageUrl },
    ])
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={jsonLdBlocks} />
      <p className="text-sm">
        <Link
          href={cat ? `/services/${cat.slug}` : "/services"}
          className="text-neutral-600 underline"
        >
          ← {cat?.label ?? "All services"}
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{listing.title}</h1>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          {isExpiredOrFilled && (
            <span className="rounded-full bg-amber-900 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
              Archived / Expired
            </span>
          )}
          {business?.outback_verified && (
            <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
              ★ Outback Verified
            </span>
          )}
          {isUnclaimedScraped && (
            <span className="rounded border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
              Unclaimed Profile — Is this your business? Claim for free
            </span>
          )}
          {trustBadge && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-green-800">
              {trustBadge}
            </span>
          )}
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {kindLabel(listing.kind)}
          </span>
        </span>
      </div>

      <p className="mt-2 text-sm text-neutral-600">
        {cat?.label ?? "—"} ·{" "}
        {resolvedSuburb ? `${resolvedSuburb}, ` : ""}
        {listing.state ? `${listing.postcode} ${listing.state}` : `Postcode ${listing.postcode}`}{" "}
        · {postedVerb(listing.data_source)} {relativeTime(listing.created_at)} ·{" "}
        {isExpiredOrFilled
          ? `Expired ${new Date(listing.expires_at).toLocaleDateString("en-AU")}`
          : `Expires ${new Date(listing.expires_at).toLocaleDateString("en-AU")}`}
      </p>

      {isExpiredOrFilled ? (
        <ExpiredListingBanner
          listingId={listing.id}
          kind={listing.kind}
          categoryId={listing.category_id}
          categoryName={cat?.label ?? "Rural service"}
          suburb={resolvedSuburb}
          postcode={listing.postcode}
          state={listing.state}
          browseHref={cat ? `/services/${cat.slug}` : "/services"}
        />
      ) : (
        /* Top 1-Click Direct Contact Bar — no scrolling needed */
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
                  `Hi ${listing.title}, saw your listing on Outback Connections (${listing.postcode}) — are you available for a quote?`
                )}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-700 bg-white px-3.5 py-2 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
              >
                💬 SMS
              </a>
            )}
            {resolvedEmail && (
              <a
                href={`mailto:${resolvedEmail}?subject=${encodeURIComponent(
                  `Enquiry via Outback Connections: ${listing.title}`
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

      {responded && !isExpiredOrFilled && (
        <p className="mt-2 inline-block rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-sm text-green-900">
          {responded}
        </p>
      )}

      {isOwner && (
        <div className="mt-4">
          <OwnerActions listingId={listing.id} listingTitle={listing.title} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
          Description
        </h2>
        <p className="mt-2 whitespace-pre-line text-neutral-800">{displayDescription}</p>
      </section>

      {detail && <ServiceDetails detail={detail} />}

      {!isExpiredOrFilled && (
        <>
          <ShareListingBar
            title={listing.title}
            path={`/services/listing/${listing.slug}`}
            postcode={listing.postcode}
            state={listing.state}
            badge={cat?.label ?? kindLabel(listing.kind)}
          />

          <section className="mt-8">
            {isUnclaimedScraped ? (
              <ScrapedNotice
                title={listing.title}
                sourcePlatform={listing.source_platform}
                sourceUrl={listing.source_url}
                businessId={listing.business_id}
                signedIn={!!viewer}
                signInRedirect={`/services/listing/${listing.slug}`}
                listingId={listing.id}
                sourceUrlKind={sourceUrlKind}
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
                signInRedirect={`/services/listing/${listing.slug}`}
              />
            )}
          </section>

          {!isOwner && listing.kind === "service_offering" && (
            <section className="mt-6">
              <EnquiryForm
                listingId={listing.id}
                businessName={listing.title}
                claimed={!isUnclaimedScraped}
                returnTo={`/services/listing/${listing.slug}`}
                notice={enquiryNotice}
              />
            </section>
          )}
        </>
      )}

      {isExpiredOrFilled && (
        <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-100 p-4">
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-xl bg-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-600"
          >
            Quote &amp; Contact Disabled — Listing Expired or Filled
          </button>
        </section>
      )}

      <VendorTrustSection
        userId={listing.user_id}
        businessId={listing.business_id}
        listingId={listing.id}
        fallbackTitle={listing.title}
        returnPath={`/services/listing/${listing.slug}`}
        defaultDealType="fencing_service"
        viewerId={viewer?.id ?? null}
      />

      <TradeOfferCard categorySlug={cat?.slug ?? null} placement="listing" />

      {!isOwner && (
        <div className="mt-8 space-y-3">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/services/listing/${listing.slug}`}
          />
          <LegalConcernForm listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

/**
 * A listing that was superseded (e.g. a staff-entered row migrated into a
 * proper directory row) carries canonical_listing_id. Old URLs 301 to the
 * replacement instead of 404ing, so indexed links and shares keep working.
 */
async function redirectToCanonical(slug: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { data: old } = await admin
    .from("listings")
    .select("canonical_listing_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!old?.canonical_listing_id) return;
  const { data: canon } = await admin
    .from("listings")
    .select("slug, kind, status, expires_at")
    .eq("id", old.canonical_listing_id)
    .maybeSingle();
  if (!canon || canon.status !== "active" || new Date(canon.expires_at) <= new Date()) return;
  permanentRedirect(listingHref(canon.kind, canon.slug));
}

function ServiceDetails({
  detail,
}: {
  detail: {
    direction: string;
    rate_type: string | null;
    rate_amount: number | null;
    travel_willingness: string | null;
  };
}) {
  const rows: Array<{ label: string; value: string }> = [
    {
      label: "Type",
      value: detail.direction === "offering" ? "Service offered" : "Service requested",
    },
  ];
  if (detail.rate_type) {
    rows.push({
      label: "Rate",
      value:
        detail.rate_amount !== null
          ? `$${detail.rate_amount.toLocaleString("en-AU")} ${humaniseRate(detail.rate_type)}`
          : humaniseRate(detail.rate_type),
    });
  }
  if (detail.travel_willingness) {
    rows.push({
      label: "Travel",
      value: humaniseTravel(detail.travel_willingness),
    });
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
        Service details
      </h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-neutral-600">{r.label}</dt>
            <dd className="text-neutral-900">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function humaniseRate(s: string): string {
  switch (s) {
    case "hourly":
      return "/ hour";
    case "daily":
      return "/ day";
    case "fixed":
      return "fixed";
    case "per_km":
      return "/ km";
    case "quote":
      return "by quote";
    case "negotiable":
      return "negotiable";
    default:
      return s;
  }
}

function humaniseTravel(s: string): string {
  switch (s) {
    case "postcode_only":
      return "Same postcode only";
    case "within_50km":
      return "Within 50 km";
    case "within_200km":
      return "Within 200 km";
    case "state_wide":
      return "State-wide";
    case "national":
      return "National";
    default:
      return s;
  }
}
