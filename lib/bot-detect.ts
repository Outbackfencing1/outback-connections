// lib/bot-detect.ts
// Pure, importable anywhere (no server-only). Mirrors the backfill regex in
// migration 20260906050000_analytics_bot_flag_and_gate_metrics. Crawlers are
// still logged (useful for SEO debugging) but flagged so the traction-gate
// numbers count humans.
export const BOT_UA =
  /(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl[/]|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java[/]|wget)/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // no UA at all is never a browser
  return BOT_UA.test(ua);
}
