import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostJobForm from "@/components/posting/PostJobForm";
import PostFreightForm from "@/components/posting/PostFreightForm";
import PostServiceForm from "@/components/posting/PostServiceForm";
import { editListing } from "./actions";

export const metadata = {
  title: "Edit listing — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditListingPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(`/signin?next=/dashboard/listings/${params.id}/edit`);

  // Load listing + the right detail row depending on kind. We fetch
  // everything in two queries: listings first to get kind, then detail.
  const { data: listing } = await supabase
    .from("listings")
    .select(`
      id, kind, user_id, status,
      category_id, title, description, postcode,
      contact_email, contact_phone, contact_best_time
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (!listing) notFound();
  if (listing.user_id !== userData.user.id) {
    // Don't reveal existence; treat as not found
    notFound();
  }

  // Categories for the right pillar
  const pillar =
    listing.kind === "job"
      ? "jobs"
      : listing.kind === "freight"
        ? "freight"
        : "services";

  const { data: cats } = await supabase
    .from("categories")
    .select("id, slug, label")
    .eq("pillar", pillar)
    .eq("active", true)
    .order("sort_order");

  // Base defaults shared across kinds
  const baseDefaults: Record<string, string> = {
    category_id: listing.category_id,
    title: listing.title,
    description: listing.description,
    postcode: listing.postcode,
    contact_email: listing.contact_email ?? "",
    contact_phone: listing.contact_phone ?? "",
    contact_best_time: listing.contact_best_time ?? "",
  };

  let body: React.ReactNode = null;
  if (listing.kind === "job") {
    const { data: jd } = await supabase
      .from("job_details")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const defaults: Record<string, string> = {
      ...baseDefaults,
      work_type: jd?.work_type ?? "",
      pay_type: jd?.pay_type ?? "",
      pay_amount: jd?.pay_amount?.toString() ?? "",
      start_date: jd?.start_date ?? "",
      duration_text: jd?.duration_text ?? "",
      accommodation_provided: jd?.accommodation_provided ? "true" : "false",
    };
    body = (
      <PostJobForm
        categories={cats ?? []}
        action={editListing}
        listingId={listing.id}
        defaults={defaults}
        submitLabel="Save changes"
      />
    );
  } else if (listing.kind === "freight") {
    const { data: fd } = await supabase
      .from("freight_details")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const defaults: Record<string, string> = {
      ...baseDefaults,
      direction: fd?.direction ?? "",
      origin_postcode: fd?.origin_postcode ?? "",
      destination_postcode: fd?.destination_postcode ?? "",
      vehicle_type: fd?.vehicle_type ?? "",
      cargo_type: fd?.cargo_type ?? "",
      weight_kg: fd?.weight_kg?.toString() ?? "",
      pickup_from_date: fd?.pickup_from_date ?? "",
      pickup_by_date: fd?.pickup_by_date ?? "",
      budget_bracket: fd?.budget_bracket ?? "",
    };
    body = (
      <PostFreightForm
        categories={cats ?? []}
        action={editListing}
        listingId={listing.id}
        defaults={defaults}
        submitLabel="Save changes"
      />
    );
  } else {
    // service_offering or service_request
    const { data: sd } = await supabase
      .from("service_details")
      .select("*")
      .eq("listing_id", listing.id)
      .maybeSingle();
    const defaults: Record<string, string> = {
      ...baseDefaults,
      rate_type: sd?.rate_type ?? "",
      rate_amount: sd?.rate_amount?.toString() ?? "",
      travel_willingness: sd?.travel_willingness ?? "",
    };
    body = (
      <PostServiceForm
        categories={cats ?? []}
        action={editListing}
        listingId={listing.id}
        defaults={defaults}
        mode={listing.kind === "service_offering" ? "offering" : "requesting"}
        submitLabel="Save changes"
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Edit listing</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Save changes to update the listing. Existing slug + posted date are kept.
      </p>

      <div className="mt-8">{body}</div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard/listings" className="underline">
          ← Back to my listings
        </Link>
      </p>
    </div>
  );
}
