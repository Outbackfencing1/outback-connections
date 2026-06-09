// lib/seo.ts — small helpers for detail-page metadata + JSON-LD.

export function buildTitle(args: {
  listingTitle: string;
  categoryLabel: string;
  postcode: string;
}): string {
  const parts = [
    args.listingTitle,
    args.categoryLabel,
    `Postcode ${args.postcode}`,
    "Outback Connections",
  ];
  return parts.filter(Boolean).join(" · ");
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
  state: string | null;
  createdAt: string;
  expiresAt: string;
  workType?: string | null;
  payType?: string | null;
  payAmount?: number | null;
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
      name: "Posted via Outback Connections",
      sameAs: "https://www.outbackconnections.com.au",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
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
      name: "Posted via Outback Connections",
    },
    areaServed: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
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
      "Australia's free rural marketplace — jobs, freight and services across the bush.",
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

// LocalBusiness for directory (scraped) + services listing pages. Deliberately
// carries NO telephone/email: contact details are gated behind sign-in on the
// site, so they must never leak into public structured data. Location (postcode/
// region/country) and geo are public; contact is not.
export function localBusinessJsonLd(args: {
  name: string;
  postcode: string;
  state: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  category?: string | null;
  url: string;
}): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: args.name,
    address: {
      "@type": "PostalAddress",
      postalCode: args.postcode,
      addressRegion: args.state ?? undefined,
      addressCountry: "AU",
    },
    url: args.url,
  };
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
