import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ContactBlock from "@/components/detail/ContactBlock";
import ScrapedNotice from "@/components/detail/ScrapedNotice";
import ExpiredListingBanner from "@/components/detail/ExpiredListingBanner";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import EnquiryForm from "@/components/detail/EnquiryForm";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import ShareListingBar from "@/components/detail/ShareListingBar";
import JsonLd from "@/components/seo/JsonLd";
import { kindLabel, relativeTime } from "@/lib/format";
import {
  buildDescription,
  buildTitle,
  formatListingDescription,
  localBusinessJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import { logEvent } from "@/lib/analytics";
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
    .select(`title, description, postcode, status, category:categories(label)`)
    .eq("slug", slug)
    .eq("kind", "freight")
    .maybeSingle();

  if (!data) {
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(`title, description, postcode, status, category:categories(label)`)
        .eq("slug", slug)
        .eq("kind", "freight")
        .in("status", ["active", "expired", "closed"])
        .maybeSingle();
      data = fb.data as typeof data;
    }
  }

  if (!data) {
    return { title: "Freight listing not found — Outback Connections" };
  }
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const title = buildTitle({
    listingTitle: data.title,
    categoryLabel: cat?.label ?? "Freight",
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

export default async function FreightDetailPage({
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
      data_source, source_platform, source_url, business_id,
      contact_email, contact_phone, contact_best_time,
      category:categories(slug, label),
      business:businesses(claim_status, geo_lat, geo_lng, contact_phone, contact_email, website_url, suburb, outback_verified),
      freight_details(direction, origin_postcode, destination_postcode,
        vehicle_type, cargo_type, weight_kg,
        pickup_from_date, pickup_by_date, budget_bracket)
    `;

  let { data: listing } = await supabase
    .from("listings")
    .select(selectCols)
    .eq("slug", slug)
    .eq("kind", "freight")
    .maybeSingle();

  if (!listing) {
    const admin = createAdminClient();
    if (admin) {
      const fb = await admin
        .from("listings")
        .select(selectCols)
        .eq("slug", slug)
        .eq("kind", "freight")
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

  const detail = Array.isArray(listing.freight_details)
    ? listing.freight_details[0]
    : listing.freight_details;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;

  const isScraped = listing.data_source === "scraped";
  const biz = Array.isArray(listing.business) ? listing.business[0] : listing.business;
  const isUnclaimedScraped =
    isScraped && (!biz || biz.claim_status === "unclaimed");
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

  const displayDescription = formatListingDescription({
    description: listing.description,
    businessName: listing.title,
    categoryName: cat?.label,
    suburb: resolvedSuburb,
    postcode: listing.postcode,
    state: listing.state,
    unclaimed: isUnclaimedScraped,
  });

  const pageUrl = `${BASE_URL}/freight/${listing.slug}`;
  const jsonLdBlocks: Record<string, unknown>[] = [];
  if (isScraped) {
    jsonLdBlocks.push(
      localBusinessJsonLd({
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
    );
  }
  jsonLdBlocks.push(
    breadcrumbJsonLd([
      { name: "Home", url: BASE_URL },
      { name: "Freight", url: `${BASE_URL}/freight` },
      { name: listing.title, url: pageUrl },
    ])
  );

  await logEvent({
    eventType: "listing_view",
    entityType: "listing",
    entityId: listing.id,
    vertical: "freight",
    userId: viewer?.id ?? null,
    properties: { slug: listing.slug, data_source: listing.data_source, expired: isExpiredOrFilled },
  });
  if (viewer && listing.data_source !== "scraped" && !isExpiredOrFilled && (resolvedEmail || resolvedPhone)) {
    await logEvent({
      eventType: "contact_reveal",
      entityType: "listing",
      entityId: listing.id,
      vertical: "freight",
      userId: viewer.id,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={jsonLdBlocks} />
      <p className="text-sm">
        <Link href="/freight" className="text-neutral-600 underline">
          ← All freight
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
          {biz?.outback_verified && (
            <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
              ★ Outback Verified
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
          categoryName={cat?.label ?? "Freight"}
          suburb={resolvedSuburb}
          postcode={listing.postcode}
          state={listing.state}
          browseHref="/freight"
        />
      ) : (
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
                  `Hi ${listing.title}, saw your freight listing on Outback Connections (${listing.postcode}) — do you have deck space / availability?`
                )}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-700 bg-white px-3.5 py-2 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
              >
                💬 SMS
              </a>
            )}
            {resolvedEmail && (
              <a
                href={`mailto:${resolvedEmail}?subject=${encodeURIComponent(
                  `Freight Enquiry via Outback Connections: ${listing.title}`
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

      {detail && <FreightDetails detail={detail} />}

      {!isExpiredOrFilled ? (
        <>
          <ShareListingBar
            title={listing.title}
            path={`/freight/${listing.slug}`}
            postcode={listing.postcode}
            state={listing.state}
            badge={
              detail?.direction === "need_freight"
                ? "Freight load needing a truck"
                : "Truck with deck space available"
            }
          />

          <section className="mt-8">
            {isUnclaimedScraped ? (
              <ScrapedNotice
                title={listing.title}
                sourcePlatform={listing.source_platform}
                sourceUrl={listing.source_url}
                businessId={listing.business_id}
                signedIn={!!viewer}
                signInRedirect={`/freight/${listing.slug}`}
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
                signInRedirect={`/freight/${listing.slug}`}
              />
            )}
          </section>

          {!isOwner && (
            <section className="mt-6">
              <EnquiryForm
                listingId={listing.id}
                businessName={listing.title}
                claimed={!isUnclaimedScraped}
                returnTo={`/freight/${listing.slug}`}
                notice={enquiryNotice}
                heading={`Message ${listing.title} about this freight run`}
                ctaLabel="Message carrier / shipper"
                promptLabel="Route, dates, deck space or load details"
                postcodeLabel="Pickup / delivery postcode"
                placeholder="e.g. Have 28 round bales of lucerne near Orange needing a drop deck heading to Wagga next week."
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
            Freight Contact Disabled — Listing Expired or Filled
          </button>
        </section>
      )}

      <VendorTrustSection
        userId={listing.user_id}
        businessId={listing.business_id}
        listingId={listing.id}
        fallbackTitle={listing.title}
        returnPath={`/freight/${listing.slug}`}
        defaultDealType="freight_load"
        viewerId={viewer?.id ?? null}
      />

      {!isOwner && (
        <div className="mt-8 space-y-3">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/freight/${listing.slug}`}
          />
          <LegalConcernForm listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

function FreightDetails({
  detail,
}: {
  detail: {
    direction: string;
    origin_postcode: string | null;
    destination_postcode: string | null;
    vehicle_type: string | null;
    cargo_type: string | null;
    weight_kg: number | null;
    pickup_from_date: string | null;
    pickup_by_date: string | null;
    budget_bracket: string | null;
  };
}) {
  const directionLabel =
    detail.direction === "need_freight" ? "Needs freight moved" : "Truck with space";

  const rows: Array<{ label: string; value: string }> = [
    { label: "Type", value: directionLabel },
  ];
  if (detail.origin_postcode) rows.push({ label: "From postcode", value: detail.origin_postcode });
  if (detail.destination_postcode) rows.push({ label: "To postcode", value: detail.destination_postcode });
  if (detail.vehicle_type) rows.push({ label: "Vehicle", value: humanise(detail.vehicle_type) });
  if (detail.cargo_type) rows.push({ label: "Cargo", value: humanise(detail.cargo_type) });
  if (detail.weight_kg !== null)
    rows.push({ label: "Weight", value: `${detail.weight_kg.toLocaleString("en-AU")} kg` });
  if (detail.pickup_from_date) rows.push({ label: "Pickup from", value: detail.pickup_from_date });
  if (detail.pickup_by_date) rows.push({ label: "Pickup by", value: detail.pickup_by_date });
  if (detail.budget_bracket) rows.push({ label: "Budget", value: humaniseBudget(detail.budget_bracket) });

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
        Freight details
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

function humanise(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humaniseBudget(s: string): string {
  switch (s) {
    case "under_1k":
      return "Under $1,000";
    case "1k_5k":
      return "$1,000 – $5,000";
    case "5k_20k":
      return "$5,000 – $20,000";
    case "20k_50k":
      return "$20,000 – $50,000";
    case "over_50k":
      return "$50,000+";
    case "unknown":
      return "Not sure";
    default:
      return s;
  }
}
