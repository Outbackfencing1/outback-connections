"use client";

import { useState } from "react";

export default function CopyTextButton({
  text,
  label = "Copy Facebook Call-Out Post",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-lg border border-green-700 bg-green-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-900"
    >
      {copied ? "✓ Copied for Facebook!" : label}
    </button>
  );
}
