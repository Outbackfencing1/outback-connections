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

export function jsonLdScript(data: unknown): string {
  // Escape closing-tag sequences inside the JSON, per OWASP advice.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
