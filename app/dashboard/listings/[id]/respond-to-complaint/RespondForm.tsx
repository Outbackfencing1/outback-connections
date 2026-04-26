"use client";
import { useState, useTransition } from "react";
import { submitOwnerResponse } from "./actions";

export default function RespondForm({
  listingId,
  complaintId,
}: {
  listingId: string;
  complaintId: string;
}) {
  const [response, setResponse] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    start(async () => {
      const r = await submitOwnerResponse({ listingId, complaintId, response });
      setResult(r);
      if (r.ok) setResponse("");
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
        {result.message}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="response" className="block text-sm font-medium text-neutral-800">
        Your response
      </label>
      <textarea
        id="response"
        name="response"
        required
        minLength={20}
        maxLength={8000}
        rows={6}
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        placeholder="Address each point in the complaint. Plain English is fine."
        className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
      />
      {result && !result.ok && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {result.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || response.trim().length < 20}
        className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit response"}
      </button>
    </form>
  );
}
