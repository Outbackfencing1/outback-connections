// lib/visit-sources.ts
// Pure, importable anywhere. Builds (in the browser) and re-checks (on the
// server) the small payload components/HumanPing.tsx sends to /api/visit:
// where the visitor came from, recorded once, on the landing page.
//
// Privacy: only the referring site's host name is kept (a full referrer URL
// can carry search terms or an email address), and only the three utm_ tags,
// cleaned. Nothing is read from or written to a cookie or browser storage.

export type VisitEntry = {
  /** The first page of a visit from outside the site (or typed in). */
  entry: true;
  /** Host of the referring site, e.g. "google.com". Absent = direct or hidden. */
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** First path segment of the landing page only, e.g. "/services". */
  landing: string;
};

export type VisitPayload = VisitEntry | Record<string, never>;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** The referring site's host, or null if there isn't one, it's us, or it's malformed. */
export function referrerHost(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = bareHost(new URL(referrer).hostname);
  } catch {
    return null;
  }
  if (!/^[a-z0-9.-]{1,100}$/.test(host) || !host.includes(".")) return null;
  if (host === bareHost(ownHost)) return null;
  return host;
}

/**
 * A campaign tag as we store it: lower case, letters, digits and . _ + - and
 * spaces only, 64 characters at most. Anything that looks like an email
 * address or a phone number is dropped, not trimmed.
 */
export function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v || v.includes("@") || /[0-9][0-9 ]{7,}[0-9]/.test(v)) return null;
  const cleaned = v
    .replace(/[^a-z0-9 ._+-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  return cleaned || null;
}

/** "/services/fencing-contractor/dubbo" -> "/services". */
export function landingSection(pathname: string | null | undefined): string {
  const first = (pathname ?? "").split("/").filter(Boolean)[0] ?? "";
  return /^[a-z0-9-]{1,40}$/.test(first) ? `/${first}` : "/";
}

/**
 * Browser side. An entry payload when this page load came from outside the
 * site (or was typed in / bookmarked); {} when it came from our own pages
 * or the visitor asked not to be tracked (Global Privacy Control / DNT).
 */
export function buildVisitPayload(args: {
  href: string;
  referrer: string;
  privacySignal: boolean;
}): VisitPayload {
  if (args.privacySignal) return {};
  let url: URL;
  try {
    url = new URL(args.href);
  } catch {
    return {};
  }
  if (args.referrer) {
    try {
      if (bareHost(new URL(args.referrer).hostname) === bareHost(url.hostname)) return {};
    } catch {
      // unreadable referrer: treat as no referrer
    }
  }
  const out: VisitEntry = { entry: true, landing: landingSection(url.pathname) };
  const ref = referrerHost(args.referrer, url.hostname);
  if (ref) out.referrer = ref;
  for (const k of UTM_KEYS) {
    const v = cleanTag(url.searchParams.get(k));
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Server side. Never trust the browser: keep only known keys, re-clean every
 * value, and drop the lot unless it is marked as an entry.
 */
export function parseVisitPayload(raw: string, ownHost: string): VisitPayload {
  if (!raw || raw.length > 2000) return {};
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!body || typeof body !== "object" || (body as { entry?: unknown }).entry !== true) return {};
  const b = body as Record<string, unknown>;
  const out: VisitEntry = {
    entry: true,
    landing: landingSection(typeof b.landing === "string" ? b.landing : "/"),
  };
  // The browser sends a bare host; give it a scheme so it parses the same way.
  const ref = typeof b.referrer === "string" ? referrerHost(`https://${b.referrer}`, ownHost) : null;
  if (ref) out.referrer = ref;
  for (const k of UTM_KEYS) {
    const v = cleanTag(b[k]);
    if (v) out[k] = v;
  }
  return out;
}
