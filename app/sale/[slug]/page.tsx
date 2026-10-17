import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactBlock from "@/components/detail/ContactBlock";
import FlagForm from "@/components/detail/FlagForm";
import LegalConcernForm from "@/components/detail/LegalConcernForm";
import OwnerActions from "@/components/detail/OwnerActions";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import { relativeTime } from "@/lib/format";
import { buildDescription, buildTitle, breadcrumbJsonLd, jsonLdScript } from "@/lib/seo";
import { logEvent } from "@/lib/analytics";
import {
  CONDITION_LABELS,
  DELIVERY_LABELS,
  commodityLabel,
  priceLine,
  quantityLine,
  type Condition,
  type Delivery,
} from "@/lib/sale";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createClient();
  const { data } = await supabase
    .from("listings")
    .select(`title, description, postcode, category:categories(label)`)
    .eq("slug", slug)
    .eq("kind", "for_sale")
    .maybeSingle();
  if (!data) return { title: "Listing not found — Outback Connections" };
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const title = buildTitle({ listingTitle: data.title, categoryLabel: cat?.label ?? "For sale", postcode: data.postcode });
  const description = buildDescription(data.description);
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary", title, description } };
}

type SaleDetail = {
  price_cents: number | null;
  price_type: string;
  quantity: number | null;
  unit: string | null;
  condition: string;
  delivery: string;
  sold_at: string | null;
  sub_category?: string | null;
  harvest_season?: string | null;
};

export default async function SaleDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const viewer = userData.user;

  let { data: listing, error: queryErr } = await supabase
    .from("listings")
    .select(
      `
      id, anonymised_id, slug, kind, side, title, description, postcode, state,
      created_at, expires_at, user_id, status,
      category:categories(slug, label),
      sale_details(price_cents, price_type, quantity, unit, condition, delivery, sold_at, sub_category, harvest_season)
    `
    )
    .eq("slug", slug)
    .eq("kind", "for_sale")
    .maybeSingle();

  if (queryErr) {
    const fb = await supabase
      .from("listings")
      .select(
        `
        id, anonymised_id, slug, kind, side, title, description, postcode, state,
        created_at, expires_at, user_id, status,
        category:categories(slug, label),
        sale_details(price_cents, price_type, quantity, unit, condition, delivery, sold_at)
      `
      )
      .eq("slug", slug)
      .eq("kind", "for_sale")
      .maybeSingle();
    listing = fb.data as typeof listing;
  }

  if (!listing) notFound();

  const { data: contact } = viewer
    ? await supabase.from("listings").select("contact_email, contact_phone, contact_best_time").eq("id", listing.id).maybeSingle()
    : { data: null };

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    notFound();
  }

  const d = (Array.isArray(listing.sale_details)
    ? listing.sale_details[0]
    : listing.sale_details) as SaleDetail | null;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;
  const pageUrl = `${BASE_URL}/sale/${listing.slug}`;
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", url: BASE_URL },
    { name: "For sale", url: `${BASE_URL}/sale` },
    { name: listing.title, url: pageUrl },
  ]);

  await logEvent({
    eventType: "listing_view",
    entityType: "listing",
    entityId: listing.id,
    vertical: "sale",
    userId: viewer?.id ?? null,
    properties: { slug: listing.slug, sub_category: d?.sub_category ?? null },
  });
  if (viewer && (contact?.contact_email || contact?.contact_phone)) {
    await logEvent({ eventType: "contact_reveal", entityType: "listing", entityId: listing.id, vertical: "sale", userId: viewer.id });
  }

  const isWanted = (listing as { side?: string | null }).side === "demand";
  const rows: Array<{ label: string; value: string }> = [];
  if (d) {
    rows.push({ label: "Listing type", value: isWanted ? "Wanted to Buy (Chasing)" : "For Sale (Available)" });
    const sub = commodityLabel(d.sub_category);
    if (sub) rows.push({ label: "Type", value: sub });
    if (d.harvest_season) rows.push({ label: "Season / specs", value: d.harvest_season });
    rows.push({ label: isWanted ? "Target price" : "Price", value: priceLine({ price_cents: d.price_cents, price_type: d.price_type, unit: d.unit }) });
    const qty = quantityLine({ quantity: d.quantity, unit: d.unit });
    if (qty) rows.push({ label: "Quantity", value: qty });
    if (d.condition && d.condition !== "na") rows.push({ label: "Condition", value: CONDITION_LABELS[d.condition as Condition] ?? d.condition });
    if (d.delivery) rows.push({ label: "Pickup / delivery", value: DELIVERY_LABELS[d.delivery as Delivery] ?? d.delivery });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }} />
      <p className="text-sm">
        <Link href="/sale" className="text-neutral-600 underline">
          ← All livestock, harvest &amp; gear
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
            isWanted ? "bg-amber-100 text-amber-950" : "bg-green-100 text-green-900"
          }`}
        >
          {isWanted ? "Wanted to Buy" : "For Sale"}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{listing.title}</h1>
        {d && (
          <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-base font-semibold text-green-900">
            {priceLine({ price_cents: d.price_cents, price_type: d.price_type, unit: d.unit })}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-neutral-600">
        {commodityLabel(d?.sub_category) ?? cat?.label ?? "—"} ·{" "}
        {listing.state ? `${listing.postcode} ${listing.state}` : `Postcode ${listing.postcode}`} · Posted{" "}
        {relativeTime(listing.created_at)} · Expires {new Date(listing.expires_at).toLocaleDateString("en-AU")}
      </p>

      {d?.sold_at && (
        <p className="mt-3 inline-block rounded-lg bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">Sold</p>
      )}

      {isOwner && (
        <div className="mt-4">
          <OwnerActions listingId={listing.id} listingTitle={listing.title} />
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">Description</h2>
        <p className="mt-2 whitespace-pre-line text-neutral-800">{listing.description}</p>
      </section>

      {rows.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">Details</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-neutral-600">{r.label}</dt>
                <dd className="text-neutral-900">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-8">
        <ContactBlock
          signedIn={!!viewer}
          contactEmail={contact?.contact_email ?? null}
          contactPhone={contact?.contact_phone ?? null}
          contactBestTime={contact?.contact_best_time ?? null}
          signInRedirect={`/sale/${listing.slug}`}
        />
        <p className="mt-3 text-xs text-neutral-500">
          Private sale between you and the seller. Outback Connections doesn&apos;t handle payment,
          inspect goods, or take a commission. Inspect before you pay.
        </p>
      </section>

      <VendorTrustSection
        userId={listing.user_id}
        listingId={listing.id}
        fallbackTitle={listing.title}
        returnPath={`/sale/${listing.slug}`}
        defaultDealType={isWanted ? "sold_item" : "bought_item"}
        viewerId={viewer?.id ?? null}
      />

      {!isOwner && (
        <div className="mt-8 space-y-3">
          <FlagForm listingId={listing.id} signedIn={!!viewer} signInRedirect={`/sale/${listing.slug}`} />
          <LegalConcernForm listingId={listing.id} />
        </div>
      )}
    </div>
  );
}
