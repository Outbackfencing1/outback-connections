import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactBlock from "@/components/detail/ContactBlock";
import FlagForm from "@/components/detail/FlagForm";
import OwnerActions from "@/components/detail/OwnerActions";
import { kindLabel, relativeTime } from "@/lib/format";
import { buildDescription, buildTitle, jsonLdScript, serviceJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("listings")
    .select(`title, description, postcode, category:categories(label)`)
    .eq("slug", params.slug)
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
    openGraph: { title, description, type: "article" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ServiceDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;

  const { data: listing } = await supabase
    .from("listings")
    .select(
      `
      id, anonymised_id, slug, kind, title, description, postcode, state,
      contact_email, contact_phone, contact_best_time,
      created_at, expires_at, user_id, status,
      category:categories(slug, label),
      service_details(direction, rate_type, rate_amount, travel_willingness)
    `
    )
    .eq("slug", params.slug)
    .in("kind", ["service_offering", "service_request"])
    .maybeSingle();

  if (!listing) notFound();

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    notFound();
  }

  const detail = Array.isArray(listing.service_details)
    ? listing.service_details[0]
    : listing.service_details;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;

  // JSON-LD only emitted for offerings (a real Service in schema.org sense).
  // Service requests are demand-side and don't have a clean schema mapping.
  const jsonLd =
    listing.kind === "service_offering"
      ? serviceJsonLd({
          title: listing.title,
          description: listing.description,
          postcode: listing.postcode,
          state: listing.state,
          category: cat?.label ?? "Service",
          rateType: detail?.rate_type ?? null,
          rateAmount: detail?.rate_amount ?? null,
          baseUrl: BASE_URL,
          slug: listing.slug,
        })
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
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
        <span className="shrink-0 rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
          {kindLabel(listing.kind)}
        </span>
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
          Description
        </h2>
        <p className="mt-2 whitespace-pre-line text-neutral-800">{listing.description}</p>
      </section>

      {detail && <ServiceDetails detail={detail} />}

      <section className="mt-8">
        <ContactBlock
          signedIn={!!viewer}
          contactEmail={listing.contact_email}
          contactPhone={listing.contact_phone}
          contactBestTime={listing.contact_best_time}
          signInRedirect={`/services/listing/${listing.slug}`}
        />
      </section>

      {!isOwner && (
        <div className="mt-8">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/services/listing/${listing.slug}`}
          />
        </div>
      )}
    </div>
  );
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
