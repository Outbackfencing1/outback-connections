// scraper/sources/http.ts
// Bounded HTTP retrieval with timeouts, restrained request rate, retries, and robots.txt verification.

import { PIPELINE_SETTINGS } from "../config.ts";

export interface HttpFetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  delayMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  options?: HttpFetchOptions
): Promise<{ ok: boolean; status: number; text: string; error: string | null }> {
  const timeoutMs = options?.timeoutMs ?? PIPELINE_SETTINGS.httpTimeoutMs;
  const maxRetries = options?.maxRetries ?? PIPELINE_SETTINGS.maxRetries;
  const delayMs = options?.delayMs ?? PIPELINE_SETTINGS.requestDelayMs;
  const userAgent = options?.userAgent ?? PIPELINE_SETTINGS.userAgent;
  const fetchFn = options?.fetchImpl ?? fetch;

  let lastError: string | null = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0 && delayMs > 0) {
      await sleep(delayMs * attempt);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
      });
      lastStatus = res.status;
      if (!res.ok) {
        lastError = `HTTP ${res.status} ${res.statusText}`;
        // Do not retry 401/403/404 client errors
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, status: res.status, text: "", error: lastError };
        }
        continue;
      }
      const text = await res.text();
      return { ok: true, status: res.status, text, error: null };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    text: "",
    error: lastError ?? "Unknown HTTP fetch failure",
  };
}

/**
 * Simple robots.txt check for User-agent: * disallow rules against a target pathname.
 */
export function isPathAllowedByRobotsTxt(robotsTxt: string, targetPathname: string): boolean {
  if (!robotsTxt.trim()) return true;
  const lines = robotsTxt.split(/\r?\n/);
  let inStarGroup = false;
  const disallows: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [directiveRaw, ...rest] = line.split(":");
    const directive = directiveRaw.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (directive === "user-agent") {
      inStarGroup = value === "*";
    } else if (inStarGroup && directive === "disallow") {
      if (value) disallows.push(value);
    }
  }

  for (const rule of disallows) {
    if (rule === "/") return false;
    if (targetPathname.startsWith(rule)) return false;
  }
  return true;
}
