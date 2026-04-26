"use client";
import { useState, useTransition } from "react";
import { requestDataExport } from "./actions";

export default function RequestExportForm() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const result = await requestDataExport();
      setMessage({
        ok: result.ok,
        text: result.ok
          ? result.message ?? "Export requested."
          : result.message,
      });
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "Requesting…" : "Request my data export"}
      </button>
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
    </form>
  );
}
