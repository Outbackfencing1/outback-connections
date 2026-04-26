"use client";
import { useState, useTransition } from "react";
import { revokeMarketingConsent } from "./actions";

export default function RevokeMarketingForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const result = await revokeMarketingConsent();
      setMessage({
        ok: result.ok,
        text: result.ok
          ? result.message ?? "Done."
          : result.message,
      });
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-60"
      >
        {pending ? "Revoking…" : "Turn off marketing emails"}
      </button>
      {message && (
        <p
          role="status"
          className={`mt-2 text-sm ${
            message.ok ? "text-green-800" : "text-red-700"
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
