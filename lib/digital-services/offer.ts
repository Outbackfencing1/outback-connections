// lib/digital-services/offer.ts
// The launch offer (master plan, "Current launch decision"). Prices are AUD,
// before any applicable tax. Do not add products or change prices here
// without Josh: the A$790 one-page site is a downsell only after the main
// offer is declined and is deliberately not listed; post-sale add-ons stay
// parked.
export type Offer = {
  key: "website" | "quote_form" | "care";
  name: string;
  price: string;
  scope: string[];
  note?: string;
};

export const OFFERS: Offer[] = [
  {
    key: "website",
    name: "Business website",
    price: "A$1,990",
    scope: [
      "Up to five pages built on our tested template",
      "Checked on phones and desktops",
      "One guided quote form, so you know the job before you call back",
      "Two rounds of changes, each collected into one list",
    ],
    note: "The guided quote form is included; it is not charged again.",
  },
  {
    key: "quote_form",
    name: "Guided quote form for your existing website",
    price: "A$490",
    scope: [
      "One guided quote flow added to a website you already have",
      "Works with a supported website platform",
      "Tested end to end: enquiries are saved and delivered to you",
    ],
    note: "For businesses whose current website already works well.",
  },
  {
    key: "care",
    name: "Managed care",
    price: "A$149 a month",
    scope: [
      "We host and look after the site or form we built for you",
      "Agreed limits on hosting, usage and support, set out in writing",
    ],
  },
];

export const INTERESTS = [
  { value: "website", label: "A new business website" },
  { value: "quote_form", label: "A guided quote form for my existing site" },
  { value: "care", label: "Managed care for a site you built" },
  { value: "not_sure", label: "Not sure yet" },
] as const;

export type Interest = (typeof INTERESTS)[number]["value"];
