"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { submitLegalConcern, type LegalReportResult } from "@/app/listings/actions";

type Props = {
  listingId: string;
};

export default function LegalConcernForm({ listingId }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ reference: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">Complaint received.</p>
        <p className="mt-1">
          Reference: <span className="font-mono">{done.reference}</span>. We&apos;ll
          respond within 5 business days. See our{" "}
          <Link href="/terms" className="underline">
            Terms of service §7
          </Link>{" "}
          for the full procedure.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-600 underline hover:text-neutral-900"
      >
        Report a legal concern (defamation, copyright, illegal content)
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    start(async () => {
      const result: LegalReportResult = await submitLegalConcern(formData);
      if (result.ok) {
        setDone({ reference: result.reference });
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <input type="hidden" name="listing_id" value={listingId} />

      <p className="text-sm font-semibold text-amber-900">Report a legal concern</p>
      <p className="mt-1 text-xs text-amber-900">
        Use this for defamation, copyright, illegal content, or privacy
        breaches. For general &ldquo;this looks dodgy&rdquo; reports, use
        the regular flag button instead. Response within 5 business days.
        See <Link href="/terms" className="underline">Terms §7</Link>.
      </p>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-neutral-700">Type of concern</span>
        <select
          name="type_of_concern"
          required
          defaultValue=""
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">Pick one</option>
          <option value="defamation">Defamation</option>
          <option value="copyright">Copyright infringement</option>
          <option value="illegal_content">Illegal content</option>
          <option value="privacy_breach">Privacy breach (e.g. doxxing)</option>
          <option value="other">Other legal concern</option>
        </select>
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-medium text-neutral-700">Your name (optional)</span>
          <input
            type="text"
            name="complainant_name"
            maxLength={200}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-neutral-700">
            Your email <span className="text-red-600">*</span>
          </span>
          <input
            type="email"
            name="complainant_email"
            required
            maxLength={255}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="block text-xs font-medium text-neutral-700">
          Details <span className="text-red-600">*</span>
        </span>
        <textarea
          name="details"
          required
          rows={5}
          minLength={20}
          maxLength={5000}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          placeholder="What's the concern? If defamation, what specifically is false? If copyright, what do you own? Be specific — vague reports are slower to action."
        />
      </label>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Submit complaint"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-neutral-700 underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
