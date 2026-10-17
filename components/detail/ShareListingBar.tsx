"use client";

import { useState } from "react";

type Props = {
  title: string;
  url?: string;
  path?: string;
  postcode?: string | null;
  state?: string | null;
  summaryLine?: string | null;
  badgeText?: string | null;
  badge?: string | null;
};

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export default function ShareListingBar({
  title,
  url,
  path,
  postcode,
  state,
  summaryLine,
  badgeText,
  badge,
}: Props) {
  const [copiedPost, setCopiedPost] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const resolvedUrl = url ?? (path ? `${BASE_URL}${path}` : BASE_URL);
  const resolvedBadge = badgeText ?? badge ?? null;

  const shareUrl = resolvedUrl.includes("?")
    ? `${resolvedUrl}&utm_source=facebook&utm_medium=share`
    : `${resolvedUrl}?utm_source=facebook&utm_medium=share`;

  const loc = postcode ? `${postcode}${state ? ` ${state}` : ""}` : "Rural Australia";
  const fbText = [
    resolvedBadge ? `[${resolvedBadge}] ${title}` : title,
    `📍 Location: ${loc}`,
    summaryLine ? `📋 ${summaryLine}` : null,
    `👉 View details & contact direct on Outback Connections: ${shareUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  async function copyFacebookPost() {
    try {
      await navigator.clipboard.writeText(fbText);
      setCopiedPost(true);
      setTimeout(() => setCopiedPost(false), 3000);
    } catch {
      // Fallback
    }
  }

  async function copyDirectLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  }

  const fbShareHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl
  )}&quote=${encodeURIComponent(fbText)}`;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50/80 px-3.5 py-2.5 text-xs">
      <span className="font-medium text-neutral-700">
        Know someone chasing this? Share to a local Facebook group or mate:
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyFacebookPost}
          className="rounded-lg border border-green-700 bg-white px-3 py-1.5 font-semibold text-green-900 hover:bg-green-50"
        >
          {copiedPost ? "✓ Copied Facebook post!" : "Copy Facebook post"}
        </button>
        <a
          href={fbShareHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[#1877F2] px-3 py-1.5 font-semibold text-white hover:opacity-90"
        >
          Share on Facebook
        </a>
        <button
          type="button"
          onClick={copyDirectLink}
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 font-medium text-neutral-700 hover:border-neutral-400"
        >
          {copiedLink ? "✓ Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
