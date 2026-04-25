import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContactBlock from "@/components/detail/ContactBlock";
import FlagForm from "@/components/detail/FlagForm";
import OwnerActions from "@/components/detail/OwnerActions";
import { kindLabel, relativeTime } from "@/lib/format";
import { buildDescription, buildTitle, jobPostingJsonLd, jsonLdScript } from "@/lib/seo";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("listings")
    .select(`
      title, description, postcode, status, expires_at,
      category:categories(label)
    `)
    .eq("slug", params.slug)
    .eq("kind", "job")
    .maybeSingle();

  if (!data) {
    return { title: "Job not found — Outback Connections" };
  }
  const cat = Array.isArray(data.category) ? data.category[0] : data.category;
  const title = buildTitle({
    listingTitle: data.title,
    categoryLabel: cat?.label ?? "Jobs",
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

export default async function JobDetailPage({
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
      job_details(work_type, pay_type, pay_amount, start_date, duration_text, accommodation_provided)
    `
    )
    .eq("slug", params.slug)
    .eq("kind", "job")
    .maybeSingle();

  if (!listing) notFound();

  const isOwner = viewer?.id === listing.user_id;
  if (!isOwner && (listing.status !== "active" || new Date(listing.expires_at) <= new Date())) {
    notFound();
  }

  const detail = Array.isArray(listing.job_details)
    ? listing.job_details[0]
    : listing.job_details;
  const cat = Array.isArray(listing.category) ? listing.category[0] : listing.category;

  const jsonLd = jobPostingJsonLd({
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <p className="text-sm">
        <Link href="/jobs" className="text-neutral-600 underline">
          ← All jobs
        </Link>
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {listing.title}
        </h1>
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
        <p className="mt-2 whitespace-pre-line text-neutral-800">
          {listing.description}
        </p>
      </section>

      {detail && <JobDetails detail={detail} />}

      <section className="mt-8">
        <ContactBlock
          signedIn={!!viewer}
          contactEmail={listing.contact_email}
          contactPhone={listing.contact_phone}
          contactBestTime={listing.contact_best_time}
          signInRedirect={`/jobs/${listing.slug}`}
        />
      </section>

      {!isOwner && (
        <div className="mt-8">
          <FlagForm
            listingId={listing.id}
            signedIn={!!viewer}
            signInRedirect={`/jobs/${listing.slug}`}
          />
        </div>
      )}
    </div>
  );
}

function JobDetails({
  detail,
}: {
  detail: {
    work_type: string | null;
    pay_type: string | null;
    pay_amount: number | null;
    start_date: string | null;
    duration_text: string | null;
    accommodation_provided: boolean;
  };
}) {
  const rows: Array<{ label: string; value: string }> = [];
  if (detail.work_type) rows.push({ label: "Work type", value: humanise(detail.work_type) });
  if (detail.pay_type)
    rows.push({
      label: "Pay",
      value:
        detail.pay_amount !== null
          ? `$${detail.pay_amount.toLocaleString("en-AU")} ${humanise(detail.pay_type).toLowerCase()}`
          : humanise(detail.pay_type),
    });
  if (detail.start_date) rows.push({ label: "Start date", value: detail.start_date });
  if (detail.duration_text) rows.push({ label: "Duration", value: detail.duration_text });
  if (detail.accommodation_provided)
    rows.push({ label: "Accommodation", value: "Provided" });

  if (rows.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700">
        Job details
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
