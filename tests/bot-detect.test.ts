import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BOT_UA,
  BROWSER_MAJOR_UA,
  MIN_CURRENT_BROWSER_MAJOR,
  VERSION_EXEMPT_UA,
  isBotUserAgent,
  isOutdatedDesktopBrowser,
} from "@/lib/bot-detect";

// Real user agents from rows the old rule counted as human (10 Oct 2026 check).
const SEEN_NOT_HUMAN = {
  "crawler walking every category (Mac Chrome 120)":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "our own agents": "Vercel MCP Fetch",
  "Claude desktop browser pane":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Claude/2.31226.1 Chrome/152.0.7977.130 Safari/537.36 MSIX",
  "2003 Gecko build (Linux)": "Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.4) Gecko/20030624",
  "2003 Gecko build (PPC Mac)": "Mozilla/5.0 (Macintosh; U; PPC Mac OS X Mach-O; en-US; rv:1.4a) Gecko/20030401",
  "Google crawler phone (Nexus 5X)":
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.8010.52 Mobile Safari/537.36 (compatible; GoogleOther)",
  "Mac Firefox 132": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:132.0) Gecko/20100101 Firefox/132.0",
  "Ubuntu Firefox 121": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/121.0",
  "Windows Chrome 91":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Windows Chrome 124":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Windows Edge 135":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36 Edg/135.0.0.0",
  "Linux Chrome 130":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mac WebKit with a Chrome 139 token":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/605.1.15",
  "Windows Firefox 138": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0",
};

// Current, real browsers. These must stay human.
const PEOPLE = {
  "iPhone Safari":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  "iPhone Chrome":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/153.0.7987.40 Mobile/15E148 Safari/604.1",
  "iPad Safari":
    "Mozilla/5.0 (iPad; CPU OS 17_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.7 Mobile/15E148 Safari/604.1",
  "Android Chrome":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36",
  "old Android phone stuck on Chrome 138":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  "Samsung Internet (older Chromium)":
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  "Facebook in-app browser on Android":
    "Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.40.109;]",
  "Windows Chrome":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36",
  "Windows Edge":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0",
  "Mac Chrome":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  "Mac Safari":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  "Windows Firefox": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0",
  "Firefox ESR 140": "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0",
};

describe("isBotUserAgent", () => {
  it.each(Object.entries(SEEN_NOT_HUMAN))("flags %s", (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each(Object.entries(PEOPLE))("passes %s", (_label, ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });

  it("still flags missing agents, named crawlers and our smoke test", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("OutbackConnectionsSmoke/1.0 (+https://www.outbackconnections.com.au) HeadlessChrome")).toBe(true);
  });
});

describe("isOutdatedDesktopBrowser", () => {
  const desktopChrome = (major: number) =>
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

  it("cuts off just below MIN_CURRENT_BROWSER_MAJOR", () => {
    expect(isOutdatedDesktopBrowser(desktopChrome(MIN_CURRENT_BROWSER_MAJOR - 1))).toBe(true);
    expect(isOutdatedDesktopBrowser(desktopChrome(MIN_CURRENT_BROWSER_MAJOR))).toBe(false);
  });

  it("never version-checks phones", () => {
    expect(isOutdatedDesktopBrowser(PEOPLE["old Android phone stuck on Chrome 138"])).toBe(false);
  });

  it("ignores agents with no Chrome or Firefox version, and absurd ones", () => {
    expect(isOutdatedDesktopBrowser(PEOPLE["Mac Safari"])).toBe(false);
    expect(isOutdatedDesktopBrowser(desktopChrome(99999999))).toBe(false);
  });
});

describe("public.is_bot_user_agent() mirrors lib/bot-detect.ts", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const latest = readdirSync(dir)
    .filter((f) => /^[0-9]{14}_.*\.sql$/.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((sql) => sql.includes("function public.is_bot_user_agent("))
    .pop();

  it("uses the same patterns and the same version cutoff", () => {
    expect(latest).toBeDefined();
    const sql = latest!;
    expect(sql).toContain(`p_ua ~* '${BOT_UA.source}'`);
    expect(sql).toContain(`p_ua !~* '${VERSION_EXEMPT_UA.source}'`);
    expect(sql).toContain(`from '${BROWSER_MAJOR_UA.source}'`);
    expect(sql).toContain(`< ${MIN_CURRENT_BROWSER_MAJOR});`);
  });

  it("keeps every pattern valid in Postgres (no \\b or \\d)", () => {
    for (const re of [BOT_UA, VERSION_EXEMPT_UA, BROWSER_MAJOR_UA]) {
      expect(re.source).not.toMatch(/\\[bdBDwWsS]/);
      expect(re.source).not.toContain("'");
    }
  });
});
