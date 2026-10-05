"use client";

// Enquiry form for the digital-services page. A new idempotency key is made
// once per form, so a double click or a retry on bad signal saves one row.
//
// It only submits through the server action, which needs JavaScript. Without
// it (script blocked, failed to load, or not hydrated yet) the button stays
// disabled, which also blocks Enter-to-submit, and a notice points to email.
// method="post" is a backstop: even a forced native submit never puts the
// customer's details in the URL, and nothing claims the enquiry was received.
import { useState, useSyncExternalStore, useTransition } from "react";
import { submitDigitalServicesEnquiry } from "./actions";
import { INTERESTS } from "@/lib/digital-services/offer";

const input = "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for old browsers: RFC 4122 v4 shape from Math.random.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const noopSubscribe = () => () => {};

export default function DigitalServicesEnquiryForm() {
  const [key] = useState(newKey);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // false in the server render and until hydration, true once the client runs.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await submitDigitalServicesEnquiry(fd);
      if (res.ok) setDone(res.reference);
      else setErrors(res.errors);
    });
  }

  if (done) {
    return (
      <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-semibold">Thanks, we have it. Reference {done}.</p>
        <p className="mt-2">Josh will reply by email. If it&apos;s urgent, email help@outbackconnections.com.au with your reference.</p>
      </div>
    );
  }

  const err = (k: string) =>
    errors[k] ? <span className="mt-1 block text-xs text-red-700">{errors[k]}</span> : null;

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="rounded-xl border border-neutral-200 bg-white p-5">
      <noscript>
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This form needs JavaScript. Please email help@outbackconnections.com.au with your business name and what
          you need, and Josh will reply.
        </p>
      </noscript>
      <input type="hidden" name="idempotency_key" value={key} />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {errors._ && (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {errors._}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-800">
          Business name
          <input name="business_name" required maxLength={120} className={input} autoComplete="organization" />
          {err("business_name")}
        </label>
        <label className="block text-sm font-medium text-neutral-800">
          Your name
          <input name="contact_name" required maxLength={80} className={input} autoComplete="name" />
          {err("contact_name")}
        </label>
        <label className="block text-sm font-medium text-neutral-800">
          Email
          <input name="email" type="email" required maxLength={254} className={input} autoComplete="email" />
          {err("email")}
        </label>
        <label className="block text-sm font-medium text-neutral-800">
          Phone (optional)
          <input name="phone" type="tel" maxLength={30} className={input} autoComplete="tel" />
          {err("phone")}
        </label>
        <label className="block text-sm font-medium text-neutral-800 sm:col-span-2">
          Your current website, if you have one (optional)
          <input name="website_url" maxLength={300} className={input} placeholder="example.com.au" autoComplete="url" />
          {err("website")}
        </label>
        <label className="block text-sm font-medium text-neutral-800 sm:col-span-2">
          What are you interested in?
          <select name="interest" required defaultValue="" className={input}>
            <option value="" disabled>
              Choose one
            </option>
            {INTERESTS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          {err("interest")}
        </label>
        <label className="block text-sm font-medium text-neutral-800 sm:col-span-2">
          About your business
          <textarea
            name="message"
            required
            rows={4}
            maxLength={2000}
            className={input}
            placeholder="What you do, where you work, and what you'd like customers to be able to do on your website."
          />
          {err("message")}
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-neutral-700">
        <input type="checkbox" name="consent" className="mt-1" />
        <span>
          I agree to Outback Connections keeping these details to reply about this enquiry. See the{" "}
          <a href="/privacy" className="underline">
            privacy notice
          </a>
          .
        </span>
      </label>
      {err("consent")}

      <button
        type="submit"
        disabled={pending || !ready}
        className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
