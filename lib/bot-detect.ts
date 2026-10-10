// lib/bot-detect.ts
// Pure, importable anywhere (no server-only). Mirrored in SQL by
// public.is_bot_user_agent() (migration 20261010120000_human_traffic_definition),
// which re-flags stored rows; tests/bot-detect.test.ts fails if the two drift.
// Crawlers are still logged (useful for SEO debugging) but flagged so the
// traction-gate numbers count humans.
//
// Every pattern here must also be a valid Postgres regex: no \b or \d.
export const BOT_UA =
  /(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl[/]|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java[/]|wget|vercel mcp|claude[/-]|googleother|google-inspectiontool|nexus 5x build[/]mmb29p|gecko[/](19[0-9]{6}|200[0-9]{5}))/i;
// "vercel mcp" and "claude/" are our own agents (Vercel MCP fetches, the
// Claude desktop browser pane). The Nexus 5X build is Google's crawler
// phone. Gecko/2003xxxx is a pre-2010 Mozilla build string. Every desktop
// Firefox since version 4 sends Gecko/20100101, so a dated one is a script.

/**
 * Oldest Chrome or Firefox major version we count as a person on a desktop.
 * Both browsers update themselves and ship a new major about every four
 * weeks, and their numbers now run within a few of each other. In October
 * 2026 stable is about 153 to 155, and 140 is over a year old (Chrome 140
 * came out in September 2025; Firefox 140 is the June 2025 long-support
 * release that companies pin to). Desktop agents far behind that are almost
 * always scrapers with a frozen string, not farmers. The cost: someone on a Mac too
 * old for current Chrome (macOS 11 stops at 138), or on Windows 7, is not
 * counted. For a go/no-go gate that is the right direction to be wrong in.
 * Phones are exempt (see VERSION_EXEMPT_UA).
 *
 * Bump by about 13 a year. When you do, add a migration that updates the
 * number in public.is_bot_user_agent() and re-runs its backfill.
 */
export const MIN_CURRENT_BROWSER_MAJOR = 140;

/**
 * Not version-checked. Android 8 and 9 phones stop at Chrome 138, and
 * Samsung Internet and in-app browsers run on an older Chromium. Rural
 * phones are often old, so the version rule only applies to desktops.
 */
export const VERSION_EXEMPT_UA = /(mobile|android|iphone|ipad|ipod|samsungbrowser)/i;

/** First Chrome/ or Firefox/ major version in the string. Edge, Opera and Brave carry Chrome/. */
export const BROWSER_MAJOR_UA = /(?:chrome|firefox)[/]([0-9]{1,6})/i;

export function isOutdatedDesktopBrowser(ua: string): boolean {
  if (VERSION_EXEMPT_UA.test(ua)) return false;
  const m = BROWSER_MAJOR_UA.exec(ua);
  return !!m && Number(m[1]) < MIN_CURRENT_BROWSER_MAJOR;
}

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // no UA at all is never a browser
  return BOT_UA.test(ua) || isOutdatedDesktopBrowser(ua);
}
