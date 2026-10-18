// lib/seo.ts — small helpers for detail-page metadata + JSON-LD.
import type { Metadata } from "next";

export function buildTitle(args: {
  listingTitle: string;
  categoryLabel: string;
  postcode: string;
  state?: string | null;
}): string {
  const parts = [
    args.listingTitle,
    args.categoryLabel,
    args.state ? `${args.state} ${args.postcode}` : `Postcode ${args.postcode}`,
    "Outback Connections",
  ];
  return parts.filter(Boolean).join(" · ");
}

/**
 * Meta description for a directory row. Scraped rows carry boilerplate in
 * `description` ("… we found listed on …"), which reads badly in a search
 * snippet; say what the business is and where, and be honest about the
 * unclaimed state.
 */
export function buildDirectoryDescription(args: {
  businessName?: string | null;
  categoryLabel: string;
  regionName?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode: string;
  unclaimed: boolean;
}): string {
  if (args.unclaimed && args.businessName) {
    return buildUnclaimedListingCopy({
      businessName: args.businessName,
      categoryName: args.categoryLabel,
      suburb: args.suburb || args.regionName,
      postcode: args.postcode,
      state: args.state,
    });
  }
  const cat = args.categoryLabel.replace(/\s*\(.*\)\s*$/, "").trim();
  const where = args.regionName
    ? `${args.regionName}, ${args.state ?? ""}`.replace(/, $/, "")
    : args.state
      ? `${args.state} ${args.postcode}`
      : `postcode ${args.postcode}`;
  return args.unclaimed
    ? `${cat} in ${where}. Direct regional contact and quote requests on Outback Connections.`
    : `${cat} in ${where}. On Outback Connections, the free rural directory: no lead fees, contact them direct.`;
}

/**
 * Dynamic, non-repetitive copy for unclaimed regional contractor listings.
 * Deterministically picks between 2 variations based on businessName + postcode
 * so each card reads naturally and uniquely without boilerplate.
 */
export function buildUnclaimedListingCopy(args: {
  businessName: string;
  categoryName?: string | null;
  suburb?: string | null;
  postcode: string;
  state?: string | null;
}): string {
  const businessName = args.businessName.trim() || "Local Contractor";
  const rawCat = (args.categoryName || "rural contractor")
    .replace(/\s*\(.*\)\s*$/, "")
    .trim()
    .toLowerCase();
  const categoryName = rawCat || "rural contractor";
  const postcode = (args.postcode || "").trim();
  const state = (args.state || "NSW").trim() || "NSW";
  const suburb = (args.suburb || "").trim() || `Postcode ${postcode}`;

  // Simple deterministic hash from businessName + postcode
  let hash = 0;
  const key = `${businessName.toLowerCase()}:${postcode}`;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  if (hash % 2 === 0) {
    return `${businessName} operates as a local ${categoryName} servicing ${suburb} (${postcode}) and surrounding regional properties in ${state}. Request a direct quote or claim this business profile to update service details.`;
  }
  return `Regional ${categoryName} based in ${suburb}, ${state} ${postcode}. Connect directly with ${businessName} for rural property work, contracting, and local quotes with zero lead fees.`;
}

export function isBoilerplateUnclaimedDescription(desc: string | null | undefined): boolean {
  if (!desc) return true;
  const s = desc.trim();
  if (!s) return true;
  return (
    /unclaimed directory (listing|entry)/i.test(s) ||
    /yellow\s*pages/i.test(s) ||
    /wasn['’]t posted by the business/i.test(s) ||
    /we found listed on/i.test(s)
  );
}

export function formatListingDescription(args: {
  description: string | null | undefined;
  businessName: string;
  categoryName?: string | null;
  suburb?: string | null;
  postcode: string;
  state?: string | null;
  unclaimed?: boolean;
}): string {
  const raw = (args.description ?? "").trim();
  if (args.unclaimed && isBoilerplateUnclaimedDescription(raw)) {
    return buildUnclaimedListingCopy({
      businessName: args.businessName,
      categoryName: args.categoryName,
      suburb: args.suburb,
      postcode: args.postcode,
      state: args.state,
    });
  }
  if (/yellow\s*pages/i.test(raw)) {
    return buildUnclaimedListingCopy({
      businessName: args.businessName,
      categoryName: args.categoryName,
      suburb: args.suburb,
      postcode: args.postcode,
      state: args.state,
    });
  }
  return raw;
}

/** "Fencing contractor (construction)" -> "Fencing contractors" */
export function humanCategory(label: string): string {
  const base = label.replace(/\s*\(.*\)\s*$/, "").trim();
  // "Bore / pump / water" and "Truck tyre & specialty repair" read badly
  // with an s on the end; leave compound labels alone.
  if (/[/&]/.test(base)) return base;
  return /s$/i.test(base) ? base : `${base}s`;
}

export const SOCIAL_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Outback Connections: find a fencing contractor near you",
};

/**
 * Open Graph + Twitter card for a page, so a link shared on Facebook (or
 * used in an ad) shows the page's own title and description with the site
 * card image, instead of a bare URL.
 */
export function socialMeta(args: {
  title: string;
  description: string;
  path: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: "website",
      siteName: "Outback Connections",
      locale: "en_AU",
      title: args.title,
      description: args.description,
      url: args.path,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: args.title,
      description: args.description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}

export function buildDescription(rawDescription: string): string {
  const cleaned = rawDescription.replace(/\s+/g, " ").trim();
  const trimmed = cleaned.length <= 150 ? cleaned : cleaned.slice(0, 150).trimEnd() + "…";
  return `${trimmed} — see contact details on Outback Connections`;
}

const WORK_TYPE_TO_EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME",
  casual: "TEMPORARY",
  contract: "CONTRACTOR",
  seasonal: "TEMPORARY",
  day_rate: "PER_DIEM",
};

export function jobPostingJsonLd(args: {
  title: string;
  description: string;
  postcode: string;
  suburb?: string | null;
  state: string | null;
  createdAt: string;
  expiresAt: string;
  workType?: string | null;
  payType?: string | null;
  payAmount?: number | null;
  hiringOrganizationName?: string | null;
  baseUrl: string;
  slug: string;
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: args.title,
    description: args.description,
    datePosted: args.createdAt,
    validThrough: args.expiresAt,
    hiringOrganization: {
      "@type": "Organization",
      name: args.hiringOrganizationName?.trim() || "Posted via Outback Connections",
      sameAs: "https://www.outbackconnections.com.au",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(args.suburb ? { addressLocality: args.suburb } : {}),
        postalCode: args.postcode,
        addressRegion: args.state ?? undefined,
        addressCountry: "AU",
      },
    },
    url: `${args.baseUrl}/jobs/${args.slug}`,
  };

  if (args.workType && WORK_TYPE_TO_EMPLOYMENT[args.workType]) {
    ld.employmentType = WORK_TYPE_TO_EMPLOYMENT[args.workType];
  }

  if (args.payAmount !== null && args.payAmount !== undefined && args.payType) {
    const unit =
      args.payType === "hourly"
        ? "HOUR"
        : args.payType === "daily"
          ? "DAY"
          : args.payType === "weekly"
            ? "WEEK"
            : null;
    if (unit) {
      ld.baseSalary = {
        "@type": "MonetaryAmount",
        currency: "AUD",
        value: {
          "@type": "QuantitativeValue",
          value: args.payAmount,
          unitText: unit,
        },
      };
    }
  }

  return ld;
}

export function serviceJsonLd(args: {
  title: string;
  description: string;
  postcode: string;
  suburb?: string | null;
  state: string | null;
  category: string;
  rateType?: string | null;
  rateAmount?: number | null;
  baseUrl: string;
  slug: string;
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "Service",
    name: args.title,
    description: args.description,
    serviceType: args.category,
    provider: {
      "@type": "LocalBusiness",
      name: args.title,
    },
    areaServed: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        ...(args.suburb ? { addressLocality: args.suburb } : {}),
        postalCode: args.postcode,
        addressRegion: args.state ?? undefined,
        addressCountry: "AU",
      },
    },
    url: `${args.baseUrl}/services/listing/${args.slug}`,
  };

  if (args.rateAmount !== null && args.rateAmount !== undefined) {
    ld.offers = {
      "@type": "Offer",
      priceCurrency: "AUD",
      price: args.rateAmount,
    };
  }

  return ld;
}

export function organizationJsonLd(baseUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Outback Connections",
    url: baseUrl,
    description:
      "Free rural directory for Australia, starting with fencing contractors in NSW. Ask for a quote without an account.",
    parentOrganization: {
      "@type": "Organization",
      name: "Outback Fencing & Steel Supplies Pty Ltd",
      identifier: {
        "@type": "PropertyValue",
        propertyID: "ABN",
        value: "76 674 671 820",
      },
      address: {
        "@type": "PostalAddress",
        streetAddress: "76 Astill Drive",
        addressLocality: "Orange",
        addressRegion: "NSW",
        postalCode: "2800",
        addressCountry: "AU",
      },
    },
  };
}

export function localBusinessJsonLd(args: {
  name: string;
  postcode: string;
  suburb?: string | null;
  state: string | null;
  telephone?: string | null;
  areaServed?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  category?: string | null;
  categoryLabel?: string | null;
  categorySlug?: string | null;
  url?: string;
}): Record<string, unknown> {
  const resolvedCategory = args.category ?? args.categoryLabel ?? null;
  const catText = `${args.categorySlug ?? ""} ${resolvedCategory ?? ""}`.toLowerCase();
  const isConstruction =
    /fenc|earthwork|shed|yard|bore|pump|water|welding|fabricat|concret|slash|clearing/.test(
      catText
    );
  const schemaType = isConstruction ? "HomeAndConstructionBusiness" : "LocalBusiness";
  const suburb = args.suburb?.trim() || null;
  const state = args.state?.trim() || "NSW";
  const areaServedText =
    args.areaServed?.trim() ||
    (suburb
      ? `${suburb} (${args.postcode}) and surrounding regional ${state}`
      : `Regional ${state} (${args.postcode})`);

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: args.name,
    address: {
      "@type": "PostalAddress",
      ...(suburb ? { addressLocality: suburb } : {}),
      addressRegion: state,
      postalCode: args.postcode,
      addressCountry: "AU",
    },
    areaServed: {
      "@type": "AdministrativeArea",
      name: areaServedText,
    },
    url: args.url,
  };
  if (args.telephone && args.telephone.trim()) {
    ld.telephone = args.telephone.trim();
  }
  if (args.category) ld.description = `${args.category} — listed on Outback Connections`;
  if (
    args.geoLat !== null &&
    args.geoLat !== undefined &&
    args.geoLng !== null &&
    args.geoLng !== undefined
  ) {
    ld.geo = {
      "@type": "GeoCoordinates",
      latitude: args.geoLat,
      longitude: args.geoLng,
    };
  }
  return ld;
}

export function itemListJsonLd(args: {
  name: string;
  url: string;
  items: Array<{ name: string; url: string; position?: number }>;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: args.name,
    url: args.url,
    numberOfItems: args.items.length,
    itemListElement: args.items.map((it, idx) => ({
      "@type": "ListItem",
      position: it.position ?? idx + 1,
      name: it.name,
      url: it.url,
    })),
  };
}

export function faqPageJsonLd(
  faqs: Array<{ question: string; answer: string }>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  // Escape closing-tag sequences inside the JSON, per OWASP advice.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

type SearchParamsLike = Record<string, string | string[] | undefined>;

/** True when any search param other than those in `ignore` has a value. */
export function hasFilterParams(params: SearchParamsLike, ignore: string[] = ["page"]): boolean {
  return Object.entries(params).some(([key, v]) => {
    if (ignore.includes(key)) return false;
    const value = Array.isArray(v) ? v[0] : v;
    return typeof value === "string" && value.trim() !== "";
  });
}

/**
 * Robots for a browse page:
 * - If `liveCount === 0` or a filter is applied: `{ index: false, follow: true }` (`noindex, follow`)
 * - If `liveCount >= 1` and unfiltered: `{ index: true, follow: true }` (`index, follow`)
 * - If `liveCount === null` (unknown count / database blip): `undefined`
 */
export function browseRobots(args: {
  liveCount: number | null;
  filtered?: boolean;
}): { index: boolean; follow: true } | undefined {
  if (args.filtered || args.liveCount === 0) return { index: false, follow: true };
  if (typeof args.liveCount === "number" && args.liveCount >= 1) {
    return { index: true, follow: true };
  }
  return undefined;
}
