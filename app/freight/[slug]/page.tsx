import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactBlock from "@/components/detail/ContactBlock";
import FlagForm from "@/components/detail/FlagForm";
import OwnerActions from "@/components/detail/OwnerActions";
import { kindLabel, relativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `${params.slug.replace(/-/g, " ")} — Freight — Outback Connections` };
}

export default async function FreightDetailPage({
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
      freight_details(direction, origin_postcode, destination_postcode,
        vehicle_type, cargo_type, weight_kg,
        pickup_from_date, pickup_by_date, budget_bracket)
    `
    )
    .eq("slug", params.slug)
    .eq("kind", "freight")
    .maybeSingle();

  if (!listing) notFound();

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    notFound();
  }

  const detail = Array.isArray(listing.freight_details)
    ? listing.freight_details[0]
    : listing.freight_details;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/freight" className="text-neutral-600 underline">
          ← All freight
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

      {detail && <FreightDetails detail={detail} />}

      <section className="mt-8">
        <ContactBlock
          signedIn={!!viewer}
          contactEmail={listing.contact_email}
          contactPhone={listing.contact_phone}
          contactBestTime={listing.contact_best_time}
          signInRedirect={`/freight/${listing.slug}`}
        />
      </section>

      {!isOwner && (
        <div className="mt-8">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/freight/${listing.slug}`}
          />
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
