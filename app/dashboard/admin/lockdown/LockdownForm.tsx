"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLockdown } from "./actions";

export default function LockdownForm({
  currentlyActive,
}: {
  currentlyActive: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  function activate() {
    setMessage(null);
    start(async () => {
      const r = await setLockdown({ active: true, reason });
      if (r.ok) {
        setMessage({ ok: true, text: "Lockdown activated." });
        setReason("");
        router.refresh();
      } else {
        setMessage({ ok: false, text: r.message });
      }
    });
  }

  function deactivate() {
    setMessage(null);
    if (!confirm("Turn off lockdown? Signups and posting will resume.")) return;
    start(async () => {
      const r = await setLockdown({ active: false, reason: "" });
      if (r.ok) {
        setMessage({ ok: true, text: "Lockdown deactivated." });
        router.refresh();
      } else {
        setMessage({ ok: false, text: r.message });
      }
    });
  }

  return (
    <div>
      {currentlyActive ? (
        <button
          type="button"
          onClick={deactivate}
          disabled={pending}
          className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
        >
          {pending ? "Working…" : "Deactivate lockdown"}
        </button>
      ) : (
        <div>
          <label
            htmlFor="reason"
            className="block text-sm font-medium text-neutral-800"
          >
            Reason (shown in the banner)
          </label>
          <input
            id="reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Investigating a security incident"
            maxLength={200}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={activate}
            disabled={pending || reason.trim().length < 3}
            className="mt-3 rounded-xl bg-red-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-60"
          >
            {pending ? "Activating…" : "Activate lockdown"}
          </button>
        </div>
      )}
      {message && (
        <p
          role="status"
          className={`mt-3 text-sm ${
            message.ok ? "text-green-800" : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
