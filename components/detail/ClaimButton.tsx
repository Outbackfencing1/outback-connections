"use client";

import { useState } from "react";
import Link from "next/link";
import { submitClaim } from "@/app/listings/actions";

// Inline "claim this business" control used inside ScrapedNotice. Signed-out
// users get a sign-in link; signed-in users submit a claim request that an
// admin reviews. Renders nothing extra if there's no linked business.
export default function ClaimButton({
  businessId,
  signedIn,
  signInRedirect,
}: {
  businessId: string;
  signedIn: boolean;
  signInRedirect: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        href={`/signin?next=${encodeURIComponent(signInRedirect)}`}
        className="font-medium underline"
      >
        Sign in to claim it
      </Link>
    );
  }

  if (state === "done") {
    return <span className="font-medium text-green-800">Claim submitted — we&apos;ll review it shortly.</span>;
  }

  async function go() {
    setState("sending");
    setMsg(null);
    const res = await submitClaim(businessId);
    if (res.ok) setState("done");
    else {
      setState("error");
      setMsg(res.message);
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={go}
        disabled={state === "sending"}
        className="font-medium underline disabled:opacity-50"
      >
        {state === "sending" ? "Submitting…" : "Claim this business"}
      </button>
      {msg && <span className="ml-2 text-amber-900">{msg}</span>}
    </span>
  );
}
