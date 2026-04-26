"use client";
import { useState, useTransition } from "react";
import { submitConcernsNotice } from "./actions";

export default function ConcernsNoticeForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    reference?: string;
  } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await submitConcernsNotice(fd);
      setResult(r);
      if (r.ok) e.currentTarget.reset();
    });
  }

  if (result?.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-900">
        <p className="font-semibold">Notice received.</p>
        <p className="mt-2">{result.message}</p>
        {result.reference && (
          <p className="mt-3 font-mono text-xs">
            Reference: <strong>{result.reference}</strong>
          </p>
        )}
        <p className="mt-3 text-xs">
          A copy has been emailed to you. Save the reference number for any
          follow-up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field id="notice_type" label="Notice type" required>
        <select
          id="notice_type"
          name="notice_type"
          required
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="">Pick one</option>
          <option value="concerns_notice">Defamation (concerns notice)</option>
          <option value="copyright">Copyright infringement</option>
          <option value="illegal_content">Illegal content</option>
          <option value="general_concern">Other concern</option>
        </select>
      </Field>

      <Field id="complainant_name" label="Your full name" required>
        <input id="complainant_name" name="complainant_name" type="text" required maxLength={200} className={inputCls} />
      </Field>

      <Field id="complainant_email" label="Your email" required>
        <input id="complainant_email" name="complainant_email" type="email" required maxLength={255} className={inputCls} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="complainant_phone" label="Phone (optional)">
          <input id="complainant_phone" name="complainant_phone" type="tel" maxLength={40} className={inputCls} />
        </Field>
        <Field id="complainant_address" label="Postal address (optional)">
          <input id="complainant_address" name="complainant_address" type="text" maxLength={300} className={inputCls} />
        </Field>
      </div>

      <Field id="listing_url" label="Listing URL (or anonymised ID)" required hint="Paste the page link, or the LST-XXXXXXXX shown on the listing.">
        <input id="listing_url" name="listing_url" type="text" required maxLength={500} className={inputCls} />
      </Field>

      <Field id="statement_at_issue" label="The exact words / statement at issue" required hint="Quote the words you say are defamatory, infringing, or illegal.">
        <textarea id="statement_at_issue" name="statement_at_issue" required rows={4} maxLength={4000} className={inputCls} />
      </Field>

      <Field id="reputation_harm_narrative" label="Why is this defamatory / harmful?" required hint="Explain the imputations and the harm to your reputation, business, or rights. Plain English is fine.">
        <textarea id="reputation_harm_narrative" name="reputation_harm_narrative" required rows={5} maxLength={6000} className={inputCls} />
      </Field>

      <Field id="evidence_urls" label="Evidence URLs (optional)" hint="One per line. E.g. screenshots, prior versions, ABN registration, copyright certificates.">
        <textarea id="evidence_urls" name="evidence_urls" rows={3} maxLength={3000} className={inputCls} />
      </Field>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="serious_harm_acknowledged"
            value="yes"
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm text-neutral-800">
            For defamation notices: I acknowledge that under the{" "}
            <em>Defamation Act 2005</em> the publication must have caused or
            be likely to cause <strong>serious harm</strong> to my reputation
            for a claim to succeed. I make this notice in good faith.
          </span>
        </label>
      </div>

      {result && !result.ok && (
        <p role="alert" className="text-sm text-red-700">
          {result.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit notice"}
      </button>
      <p className="text-xs text-neutral-500">
        We&apos;ll email an acknowledgement with a reference number within
        minutes. Substantive response within 5 business days.
      </p>
    </form>
  );
}

const inputCls = "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2";

function Field({
  id,
  label,
  required,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}
