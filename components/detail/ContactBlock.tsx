// components/detail/ContactBlock.tsx — server component.
// Immediate 1-click contact display so customers can Call, SMS, Email, or
// visit the vendor's website with zero friction.
import Link from "next/link";
import { formatPhoneHref, isAustralianMobile } from "@/lib/trust";

type Props = {
  signedIn?: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  contactBestTime: string | null;
  websiteUrl?: string | null;
  signInRedirect?: string;
};

export default function ContactBlock({
  contactEmail,
  contactPhone,
  contactBestTime,
  websiteUrl = null,
}: Props) {
  const phoneHref = formatPhoneHref(contactPhone);
  const canSms = isAustralianMobile(contactPhone);

  if (!contactEmail && !contactPhone && !websiteUrl && !contactBestTime) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="font-semibold text-neutral-900">Direct contact</p>
        <p className="mt-2 text-sm text-neutral-700">
          Use the enquiry / quote form below to message this listing directly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-green-300 bg-green-50/50 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-800">
            Direct Contact — 0 Commission
          </p>
          <p className="mt-0.5 text-base font-bold text-neutral-900">
            Reach out directly by phone, text or email
          </p>
        </div>
        {contactBestTime && (
          <span className="rounded-full border border-green-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700">
            🕒 Best time: {contactBestTime}
          </span>
        )}
      </div>

      {/* 1-Click Action Buttons */}
      <div className="mt-4 flex flex-wrap gap-2.5">
        {phoneHref && (
          <a
            href={`tel:${phoneHref}`}
            className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800"
          >
            📞 Call {contactPhone}
          </a>
        )}
        {phoneHref && canSms && (
          <a
            href={`sms:${phoneHref}`}
            className="inline-flex items-center gap-2 rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
          >
            💬 Send SMS
          </a>
        )}
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700 hover:text-green-900"
          >
            ✉️ {contactEmail}
          </a>
        )}
        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700 hover:text-green-900"
          >
            🌐 Visit Website →
          </a>
        )}
      </div>

      <p className="mt-3 text-xs text-neutral-600">
        Outback Connections connects rural Australians directly — no middleman fees. Please respect rural working hours and never add numbers to marketing lists. Need a hand?{" "}
        <Link href="/report" className="underline">
          Report an issue
        </Link>
        .
      </p>
    </div>
  );
}

