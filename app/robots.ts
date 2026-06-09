// app/robots.ts
import type { MetadataRoute } from "next";

// Private areas no crawler should index (auth, dashboard, API).
const DISALLOW = ["/api/", "/auth/", "/dashboard/", "/signin", "/signup", "/verify/"];

// AI-answer + search engines we explicitly welcome. Listing them by name makes
// the allow intent unambiguous (some default to not-crawling unless named).
const ALLOWED_BOTS = [
  // AI answer engines / training-with-permission
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  // search crawlers
  "Googlebot",
  "Bingbot",
];

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

  const rules = [
    // Everyone else: allowed, minus the private areas.
    { userAgent: "*", allow: ["/"], disallow: DISALLOW },
    // Explicitly welcome each named AI/search bot (same private exclusions).
    ...ALLOWED_BOTS.map((userAgent) => ({
      userAgent,
      allow: ["/"],
      disallow: DISALLOW,
    })),
  ];

  return {
    rules,
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
