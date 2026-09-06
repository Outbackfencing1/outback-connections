import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingHref } from "@/lib/format";
import ContactBlock from "@/components/detail/ContactBlock";
import ScrapedNotice from "@/components/detail/ScrapedNotice";
import TradeOfferCard from "@/components/detail/TradeOfferCard";
import EnquiryForm from "@/components/detail/EnquiryForm";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import { kindLabel, relativeTime } from "@/lib/format";
import {
  buildDescription,
  buildTitle,
  jsonLdScript,
  serviceJsonLd,
  localBusinessJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import { logEvent } from "@/lib/analytics";
import { responseLine } from "@/lib/enquiry-outcome";

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
    .select(`title, description, postcode, category:categories(label)`)
    .eq("slug", slug)
    .in("kind", ["service_offering", "service_request"])
    .maybeSingle();

  if (!data) {
    return { title: "Service listing not found — Outback Connections" };
  }
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const title = buildTitle({
    listingTitle: data.title,
    categoryLabel: cat?.label ?? "Services",
    postcode: data.postcode,
  });
  const description = buildDescription(data.description);
  return {
    title,
    description,
    alternates: { canonical: `/services/listing/${slug}` },
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `
      id, anonymised_id, slug, kind, title, description, postcode, state,
      created_at, expires_at, user_id, status,
      data_source, source_platform, source_url, business_id, metadata,
      category:categories(slug, label),
      business:businesses(claim_status, geo_lat, geo_lng),
      service_details(direction, rate_type, rate_amount, travel_willingness)
    `
    )
    .eq("slug", slug)
    .in("kind", ["service_offering", "service_request"])
    .maybeSingle();

  if (!listing) {
    await redirectToCanonical(slug);
    notFound();
  }

  const [{ data: contact }, { data: responseStats }] = await Promise.all([
    viewer
      ? supabase
          .from("listings")
          .select("contact_email, contact_phone, contact_best_time")
          .eq("id", listing.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    listing.kind === "service_offering"
      ? supabase.rpc("business_response_stats", { p_listing_id: listing.id })
      : Promise.resolve({ data: null }),
  ]);

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    await redirectToCanonical(slug);
    notFound();
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

  await logEvent({
    eventType: "listing_view",
    entityType: "listing",
    entityId: listing.id,
    vertical: "service",
    userId: viewer?.id ?? null,
    properties: { slug: listing.slug },
  });
  if (viewer && !isUnclaimedScraped && (contact?.contact_email || contact?.contact_phone)) {
    await logEvent({
      eventType: "contact_reveal",
      entityType: "listing",
      entityId: listing.id,
      vertical: "service",
      userId: viewer.id,
    });
  }

  // Offerings -> Service + LocalBusiness (a real provider). Requests are
  // demand-side and get neither (no clean schema mapping). Breadcrumb always.
  const pageUrl = `${BASE_URL}/services/listing/${listing.slug}`;
  const jsonLdBlocks: Record<string, unknown>[] = [];
  if (listing.kind === "service_offering") {
    jsonLdBlocks.push(
      serviceJsonLd({
        title: listing.title,
        description: listing.description,
        postcode: listing.postcode,
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
        state: listing.state,
        geoLat: business?.geo_lat ?? null,
        geoLng: business?.geo_lng ?? null,
        category: cat?.label ?? null,
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
      {jsonLdBlocks.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
        />
      ))}
      <p className="text-sm">
        <Link
          href={cat ? `/services/${cat.slug}` : "/services"}
          className="text-neutral-600 underline"
        >
          ← {cat?.label ?? "All services"}
        </Link>
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{listing.title}</h1>
        <span className="flex shrink-0 items-center gap-2">
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
        {listing.state ? `${listing.postcode} ${listing.state}` : `Postcode ${listing.postcode}`}{" "}
        · Posted {relativeTime(listing.created_at)} ·{" "}
        Expires {new Date(listing.expires_at).toLocaleDateString("en-AU")}
      </p>
      {responded && (
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
        <p className="mt-2 whitespace-pre-line text-neutral-800">{listing.description}</p>
      </section>

      {detail && <ServiceDetails detail={detail} />}

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
          />
        ) : (
          <ContactBlock
            signedIn={!!viewer}
            contactEmail={contact?.contact_email ?? null}
            contactPhone={contact?.contact_phone ?? null}
            contactBestTime={contact?.contact_best_time ?? null}
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
          />
        </section>
      )}

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
