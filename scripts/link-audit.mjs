#!/usr/bin/env node
// Static link audit. Walks app/ and components/, extracts every Link href and
// <a href>, classifies them, and reports anything that points at a route we
// don't ship. Outputs LINK-AUDIT.md.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib"];
const APP_DIR = join(ROOT, "app");

// ----- 1. Build the route inventory ---------------------------------------

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // skip private folders (_archive, _archive_help, _components, etc.)
      if (entry.startsWith("_")) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function appPathFromFile(filePath) {
  // Convert .../app/foo/[bar]/page.tsx -> /foo/[bar]
  let rel = relative(APP_DIR, filePath).split(sep).join("/");
  rel = rel.replace(/\/page\.tsx$/, "").replace(/\/route\.ts$/, "");
  if (rel === "page.tsx" || rel === "route.ts") return "/";
  return "/" + rel;
}

const appFiles = walk(APP_DIR).filter((f) =>
  f.endsWith("/page.tsx") || f.endsWith("\\page.tsx") ||
  f.endsWith("/route.ts") || f.endsWith("\\route.ts")
);

const routes = appFiles.map((f) => {
  const path = appPathFromFile(f);
  const isRoute = f.endsWith("route.ts");
  return {
    file: relative(ROOT, f),
    path,
    isRoute,
    isDynamic: /\[[^\]]+\]/.test(path),
  };
});

// Helper: does an internal href match a known route?
function matchRoute(href) {
  if (!href.startsWith("/")) return null;
  const cleanHref = href.split(/[?#]/)[0]; // strip query and hash
  // Try exact static
  const staticHit = routes.find((r) => !r.isDynamic && r.path === cleanHref);
  if (staticHit) return staticHit;
  // Try dynamic pattern match
  const dynHit = routes.find((r) => {
    if (!r.isDynamic) return false;
    const pattern = "^" + r.path.replace(/\[[^\]]+\]/g, "[^/]+") + "$";
    return new RegExp(pattern).test(cleanHref);
  });
  return dynHit ?? null;
}

// ----- 2. Extract every link ----------------------------------------------

const LINK_RE = /<Link[^>]*\bhref=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/g;
const A_RE = /<a[^>]*\bhref=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/g;
const REDIRECT_RE = /\bredirect\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

function extractLinks(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  for (const re of [LINK_RE, A_RE, REDIRECT_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const raw = m[1] ?? m[2] ?? m[3] ?? "";
      const value = raw.trim();
      if (!value) continue;
      // Compute line
      const upto = src.slice(0, m.index);
      const line = upto.split("\n").length;
      out.push({
        file: relative(ROOT, file),
        line,
        kind:
          re === LINK_RE
            ? "Link"
            : re === A_RE
              ? "a"
              : "redirect",
        href: value,
      });
    }
  }
  return out;
}

const sourceFiles = SOURCE_DIRS.flatMap((d) => {
  try {
    return walk(join(ROOT, d));
  } catch {
    return [];
  }
}).filter((f) => /\.(tsx?|jsx?)$/.test(f));

const allLinks = sourceFiles.flatMap(extractLinks);

// ----- 3. Classify --------------------------------------------------------

function classify(href) {
  if (href.startsWith("mailto:")) return "mailto";
  if (href.startsWith("tel:")) return "tel";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("http://") || href.startsWith("https://")) return "external";
  if (href.startsWith("/")) return "internal";
  // Probably a JS expression we couldn't statically evaluate
  return "dynamic";
}

const buckets = {
  internal: [],
  external: [],
  mailto: [],
  tel: [],
  anchor: [],
  dynamic: [],
};
for (const link of allLinks) {
  buckets[classify(link.href)].push(link);
}

// ----- 4. Validate internal --------------------------------------------------

const internalIssues = [];
const internalOk = [];
for (const link of buckets.internal) {
  // Skip template-literal hrefs that include JS interpolation; we can't validate them statically.
  // We at least try to validate the prefix.
  const cleanHref = link.href.split(/[?#]/)[0];
  // Strip trailing slash for comparison except root
  const norm = cleanHref === "/" ? "/" : cleanHref.replace(/\/$/, "");
  // Try to match by walking known routes
  const m = matchRoute(norm);
  if (m) {
    internalOk.push({ ...link, route: m });
  } else {
    // Some are intermediate prefixes that don't have a page.tsx but lead to valid pages
    // (e.g. /post/service is a parent of /post/service/offering with no own page).
    // Still flag those because they 404.
    internalIssues.push({ ...link, reason: "no matching page or route" });
  }
}

// ----- 5. Domain audit -----------------------------------------------------

const externalDomains = new Map();
for (const link of buckets.external) {
  try {
    const u = new URL(link.href);
    const host = u.host;
    if (!externalDomains.has(host)) externalDomains.set(host, []);
    externalDomains.get(host).push(link);
  } catch {
    internalIssues.push({ ...link, reason: "malformed external URL" });
  }
}

// ----- 6. Output -----------------------------------------------------------

function md(s) {
  return s
    .replace(/\|/g, "\\|");
}

const lines = [];
lines.push("# Link audit");
lines.push("");
lines.push(`Generated by \`scripts/link-audit.mjs\` on ${new Date().toISOString().slice(0, 10)}.`);
lines.push("");
lines.push("Static analysis of `app/`, `components/`, and `lib/`. Extracts every `<Link href>`, `<a href>`, and server-side `redirect()`. Excludes private `_*` folders.");
lines.push("");

lines.push("## Totals");
lines.push("");
lines.push("| Category | Count |");
lines.push("|----------|-------|");
for (const k of ["internal", "external", "mailto", "tel", "anchor", "dynamic"]) {
  lines.push(`| ${k} | ${buckets[k].length} |`);
}
lines.push(`| **All references** | **${allLinks.length}** |`);
lines.push("");

lines.push("## Routes the codebase ships");
lines.push("");
lines.push("| Path | Type | File |");
lines.push("|------|------|------|");
for (const r of routes.sort((a, b) => a.path.localeCompare(b.path))) {
  lines.push(`| \`${r.path}\` | ${r.isRoute ? "route handler" : "page"}${r.isDynamic ? " (dynamic)" : ""} | \`${r.file}\` |`);
}
lines.push("");

lines.push("## Internal links — broken / unmatched");
lines.push("");
if (internalIssues.length === 0) {
  lines.push("**None.** All internal `<Link>` and `<a>` href values resolve to a known page or route handler.");
} else {
  lines.push("| Source | Line | Href | Reason |");
  lines.push("|--------|------|------|--------|");
  for (const i of internalIssues) {
    lines.push(`| \`${i.file}\` | ${i.line} | \`${md(i.href)}\` | ${i.reason} |`);
  }
}
lines.push("");

lines.push("## External domains referenced");
lines.push("");
lines.push("| Domain | Count | Sample source |");
lines.push("|--------|-------|---------------|");
for (const [host, items] of [...externalDomains.entries()].sort()) {
  lines.push(`| \`${host}\` | ${items.length} | \`${items[0].file}:${items[0].line}\` |`);
}
lines.push("");

lines.push("## All internal links (resolved)");
lines.push("");
lines.push("| Source | Line | Href | Resolves to |");
lines.push("|--------|------|------|-------------|");
for (const i of internalOk.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  lines.push(`| \`${i.file}\` | ${i.line} | \`${md(i.href)}\` | \`${i.route.path}\` |`);
}
lines.push("");

lines.push("## Notes on dynamic hrefs");
lines.push("");
lines.push("Hrefs that are JavaScript expressions (template literals with variables, or pure identifiers) can't be validated statically. They appear in the `dynamic` bucket above. The most common pattern is `listingHref(kind, slug)` from `lib/format.ts`, which constructs `/jobs/SLUG`, `/freight/SLUG`, or `/services/listing/SLUG` — all of those routes ship.");
lines.push("");
if (buckets.dynamic.length > 0) {
  lines.push("| Source | Line | Expression |");
  lines.push("|--------|------|------------|");
  for (const d of buckets.dynamic) {
    lines.push(`| \`${d.file}\` | ${d.line} | \`${md(d.href)}\` |`);
  }
}

writeFileSync(join(ROOT, "LINK-AUDIT.md"), lines.join("\n"));
console.log(`LINK-AUDIT.md written. ${allLinks.length} links, ${routes.length} routes, ${internalIssues.length} unresolved.`);
if (internalIssues.length > 0) {
  for (const i of internalIssues) {
    console.log(`  ! ${i.file}:${i.line} ${i.href} (${i.reason})`);
  }
}
