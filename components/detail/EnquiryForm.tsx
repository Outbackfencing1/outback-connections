"use client";

// components/detail/EnquiryForm.tsx — "Get a quote" on a service listing.
// No sign-in. Honest about what happens next: an unclaimed listing is
// forwarded by our team; a claimed one goes straight to the business.
//
// Works without JavaScript: <details> opens the form natively, and the form
// POSTs to /api/enquiries, which saves it and redirects back here with a
// status (see lib/enquiry-fallback.ts). With JavaScript the submit is
// intercepted and sent through the server action instead. Either way the
// farmer's details never go in a URL.
import { useState, useTransition } from "react";
import { submitEnquiry } from "@/app/listings/enquiry-actions";
import { ENQUIRY_ANCHOR, type EnquiryNotice } from "@/lib/enquiry-fallback";

type Props = {
  listingId: string;
  businessName: string;
  claimed: boolean;
  /** The listing's own path, where the no-JS submit returns to. */
  returnTo: string;
  /** Outcome of a no-JS submit, read from the redirect. */
  notice?: EnquiryNotice | null;
};

type Done = { reference: string; direct: boolean };

const input =
  "mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm";

export default function EnquiryForm({ listingId, businessName, claimed, returnTo, notice }: Props) {
  const [open, setOpen] = useState(notice?.kind === "error");
  const [errors, setErrors] = useState<Record<string, string>>(
    notice?.kind === "error" ? { _: notice.message } : {}
  );
  const [done, setDone] = useState<Done | null>(
    notice?.kind === "sent" ? { reference: notice.reference, direct: notice.direct } : null
  );
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await submitEnquiry(fd);
      if (res.ok) setDone(res);
      else setErrors(res.errors);
    });
  }

  if (done) {
    return (
      <div id={ENQUIRY_ANCHOR} role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-semibold">Sent. Reference {done.reference}.</p>
        <p className="mt-2">
          {done.direct
            ? `${businessName} has your details and should reply directly.`
            : `We'll pass this to ${businessName} and let you know if we can't reach them.`}
        </p>
      </div>
    );
  }

  return (
    <div id={ENQUIRY_ANCHOR} className="group rounded-xl border border-green-200 bg-white p-5">
      <div className="group-has-[details[open]]:hidden">
        <p className="font-semibold text-neutral-900">Need a quote from {businessName}?</p>
        <p className="mt-1 text-sm text-neutral-700">
          {claimed
            ? "Tell them the job and they'll get back to you. No account needed."
            : "Tell us the job and we'll pass it on. No account needed, and your details only go to this business."}
        </p>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="mt-3 inline-block cursor-pointer list-none rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 [&::-webkit-details-marker]:hidden [details[open]>&]:hidden">
          Get a quote
        </summary>
        <form method="post" action="/api/enquiries" onSubmit={onSubmit} noValidate>
          <input type="hidden" name="listing_id" value={listingId} />
          <input type="hidden" name="return_to" value={returnTo} />
          {/* Honeypot: hidden from people, filled by bots. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website (leave blank)
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </label>
          </div>

          <p className="font-semibold text-neutral-900">Get a quote from {businessName}</p>
          {errors._ && (
            <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {errors._}
            </p>
          )}

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Your name</span>
              <input name="name" type="text" required maxLength={80} className={input} />
              {errors.name && <span className="mt-1 block text-xs text-red-700">{errors.name}</span>}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Postcode of the job</span>
              <input name="postcode" type="text" inputMode="numeric" maxLength={4} className={input} placeholder="2800" />
              {errors.postcode && <span className="mt-1 block text-xs text-red-700">{errors.postcode}</span>}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Phone</span>
              <input name="phone" type="tel" maxLength={20} className={input} />
              {errors.phone && <span className="mt-1 block text-xs text-red-700">{errors.phone}</span>}
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-800">Email</span>
              <input name="email" type="email" maxLength={120} className={input} />
              {errors.email && <span className="mt-1 block text-xs text-red-700">{errors.email}</span>}
            </label>
          </div>
          <p className="mt-1 text-xs text-neutral-500">Phone or email, whichever you answer.</p>

          <label className="mt-3 block text-sm">
            <span className="font-medium text-neutral-800">What needs doing?</span>
            <textarea
              name="message"
              rows={4}
              required
              maxLength={2000}
              className={input}
              placeholder="Roughly how much, where, and when. E.g. 2km boundary fence near Cargo, wanting it done before October."
            />
            {errors.message && <span className="mt-1 block text-xs text-red-700">{errors.message}</span>}
          </label>

          <label className="mt-3 flex items-start gap-2 text-xs text-neutral-700">
            <input type="checkbox" name="consent" className="mt-0.5" />
            <span>
              I&apos;m happy for Outback Connections to pass these details to {businessName} so they can
              quote. We don&apos;t share them with anyone else, we may email you once about a week later
              to ask whether they got back to you, and we delete them after 12 months.
            </span>
          </label>
          {errors.consent && <p className="mt-1 text-xs text-red-700">{errors.consent}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-neutral-700 underline">
              Cancel
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
