"use client";

import { useState } from "react";
import { approveClaim, rejectClaim } from "./actions";

export default function ClaimRowActions({ claimId }: { claimId: string }) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function run(kind: "approve" | "reject") {
    if (kind === "reject" && !window.confirm("Reject this claim?")) return;
    setState("working");
    setMsg(null);
    const res = kind === "approve" ? await approveClaim(claimId) : await rejectClaim(claimId);
    if (res.ok) {
      setState("done");
      setMsg(res.message);
    } else {
      setState("idle");
      setMsg(res.message);
    }
  }

  if (state === "done") {
    return <span className="text-sm font-medium text-green-800">{msg}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => run("approve")}
        disabled={state === "working"}
        className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        type="button"
        onClick={() => run("reject")}
        disabled={state === "working"}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        Reject
      </button>
      {msg && <span className="text-xs text-red-700">{msg}</span>}
    </div>
  );
}
