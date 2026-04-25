// components/detail/ContactBlock.tsx — server component.
// Public-safe gated contact display: only renders raw email/phone when
// the viewer is signed in. Anonymous viewers see a sign-in CTA.
import Link from "next/link";

type Props = {
  signedIn: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  contactBestTime: string | null;
  signInRedirect: string;
};

export default function ContactBlock({
  signedIn,
  contactEmail,
  contactPhone,
  contactBestTime,
  signInRedirect,
}: Props) {
  if (!signedIn) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <p className="font-semibold text-amber-900">Contact details</p>
        <p className="mt-2 text-sm text-amber-900">
          Sign in to see how to get in touch — we hide these to stop spam.
        </p>
        <Link
          href={`/signin?next=${encodeURIComponent(signInRedirect)}`}
          className="mt-3 inline-block rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800"
        >
          Sign in to see contact
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <p className="font-semibold text-neutral-900">Contact</p>
      <ul className="mt-3 space-y-2 text-sm text-neutral-800">
        {contactEmail && (
          <li>
            <span className="text-neutral-600">Email: </span>
            <a href={`mailto:${contactEmail}`} className="font-medium underline">
              {contactEmail}
            </a>
          </li>
        )}
        {contactPhone && (
          <li>
            <span className="text-neutral-600">Phone: </span>
            <a
              href={`tel:${contactPhone.replace(/\s+/g, "")}`}
              className="font-medium underline"
            >
              {contactPhone}
            </a>
          </li>
        )}
        {contactBestTime && (
          <li>
            <span className="text-neutral-600">Best time: </span>
            {contactBestTime}
          </li>
        )}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">
        Contact details visible only to signed-in users. Outback Connections
        doesn&apos;t broker the connection — you&apos;re reaching out directly.
      </p>
    </div>
  );
}
