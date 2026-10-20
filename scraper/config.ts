// scraper/config.ts
// Configuration, source registry, supplier artifact blocklists, and policy guardrails.

export const FENCING_CONTRACTOR_CATEGORY = {
  id: "bb33b79d-d274-4e55-9eb6-f16badb5ec1a",
  slug: "fencing-contractor",
  label: "Fencing contractor",
  pillar: "services",
} as const;

export interface SupplierArtifactBlocklist {
  supplierNames: string[];
  supplierPhonesDigits: string[];
  supplierAbnsDigits: string[];
  supplierEmailsLower: string[];
  supplierDomainsLower: string[];
  supplierAddressSubstringsLower: string[];
}

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  canonicalUrl?: string;
  enabled: boolean;
  policyStatus: "permitted_public_directory" | "blocked_by_policy";
  robotsTxtUrl: string;
  termsOrPrivacyUrl: string;
  reuseConditionsSummary: string;
  requiresPlaywright: boolean;
  supplierBlocklist: SupplierArtifactBlocklist;
}

export const PILOT_SOURCES: SourceConfig[] = [
  {
    id: "westonfence",
    name: "Westonfence Accredited Installers",
    url: "https://westonfence.com.au/accredited-installers/",
    canonicalUrl: "https://westonfence.com.au/contractors/",
    enabled: true,
    policyStatus: "permitted_public_directory",
    robotsTxtUrl: "https://westonfence.com.au/robots.txt",
    termsOrPrivacyUrl: "https://westonfence.com.au/privacy-policy/",
    reuseConditionsSummary:
      "robots.txt allows User-agent: * (Disallow: empty). Public directory published to connect graziers with independent electric & exclusion fencing installers. Obfuscated data-enc-email / *protected email* placeholders are not decoded or stored.",
    requiresPlaywright: false,
    supplierBlocklist: {
      supplierNames: ["Westonfence", "Westonfence Pty Ltd"],
      supplierPhonesDigits: ["1800133623"],
      supplierAbnsDigits: ["50094058821"],
      supplierEmailsLower: ["info@westonfence.com.au", "sales@westonfence.com.au", "admin@westonfence.com.au"],
      supplierDomainsLower: ["westonfence.com.au", "facebook.com/westonfence"],
      supplierAddressSubstringsLower: ["6 langlands street", "langlands street parkes"],
    },
  },
  {
    id: "rotech_rural",
    name: "Rotech Rural Fencing Contractors",
    url: "https://rotechrural.com.au/fencing-contractors/",
    enabled: true,
    policyStatus: "permitted_public_directory",
    robotsTxtUrl: "https://rotechrural.com.au/robots.txt",
    termsOrPrivacyUrl: "https://rotechrural.com.au/terms/",
    reuseConditionsSummary:
      "robots.txt allows /fencing-contractors/ for User-agent: *. Public directory published so landowners can find Rotech Rural fencing contractors. Cloudflare /cdn-cgi/l/email-protection ([email protected]) placeholders are not decoded or stored.",
    requiresPlaywright: false,
    supplierBlocklist: {
      supplierNames: ["Rotech Rural", "Rotech Rural Pty Ltd"],
      supplierPhonesDigits: ["0267720400", "61267720400", "0357533115", "61357533115", "1800004940"],
      supplierAbnsDigits: [],
      supplierEmailsLower: ["sales@rotechrural.com.au", "info@rotechrural.com.au"],
      supplierDomainsLower: [
        "rotechrural.com.au",
        "facebook.com/rotechrural",
        "instagram.com/rotechrural",
        "linkedin.com/company/rotechrural",
      ],
      supplierAddressSubstringsLower: [],
    },
  },
  {
    id: "google_maps",
    name: "Google Maps / Places API",
    url: "https://maps.google.com/",
    enabled: false,
    policyStatus: "blocked_by_policy",
    robotsTxtUrl: "https://www.google.com/robots.txt",
    termsOrPrivacyUrl: "https://cloud.google.com/maps-platform/terms",
    reuseConditionsSummary:
      "Explicitly disabled: Google Maps scraping and exporting Places business details into permanent seed files are prohibited by project policy.",
    requiresPlaywright: false,
    supplierBlocklist: {
      supplierNames: [],
      supplierPhonesDigits: [],
      supplierAbnsDigits: [],
      supplierEmailsLower: [],
      supplierDomainsLower: [],
      supplierAddressSubstringsLower: [],
    },
  },
  {
    id: "yellow_pages",
    name: "Yellow Pages Australia",
    url: "https://www.yellowpages.com.au/",
    enabled: false,
    policyStatus: "blocked_by_policy",
    robotsTxtUrl: "https://www.yellowpages.com.au/robots.txt",
    termsOrPrivacyUrl: "https://www.yellowpages.com.au/terms-of-use",
    reuseConditionsSummary:
      "Explicitly disabled: Yellow Pages expansion is prohibited by project policy; existing database provenance issues are audited separately.",
    requiresPlaywright: false,
    supplierBlocklist: {
      supplierNames: [],
      supplierPhonesDigits: [],
      supplierAbnsDigits: [],
      supplierEmailsLower: [],
      supplierDomainsLower: [],
      supplierAddressSubstringsLower: [],
    },
  },
];

export const PIPELINE_SETTINGS = {
  maxPilotCandidates: 100,
  httpTimeoutMs: 12000,
  requestDelayMs: 600,
  maxRetries: 2,
  userAgent:
    "OutbackConnectionsDirectoryBot/1.0 (+https://www.outbackconnections.com.au; rural-fencing-pilot)",
  defaultGeminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
} as const;
