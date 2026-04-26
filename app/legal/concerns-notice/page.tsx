import Link from "next/link";
import ConcernsNoticeForm from "./ConcernsNoticeForm";

export const metadata = {
  title: "Concerns notice — Outback Connections",
  description:
    "Submit a concerns notice under the Defamation Act 2005. Outback Connections will respond within 5 business days.",
};

export const dynamic = "force-dynamic";

export default function ConcernsNoticePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/" className="text-neutral-600 underline">
          ← Home
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Concerns notice
      </h1>
      <p className="mt-3 max-w-prose text-sm text-neutral-700">
        Use this form if a listing on Outback Connections defames you,
        infringes your copyright, or contains illegal content. We aim to
        acknowledge every notice within minutes and respond substantively
        within 5 business days.
      </p>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Before you submit</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            For a defamation concerns notice under the{" "}
            <em>Defamation Act 2005</em> (NSW) and equivalents, you should
            identify the imputations you say are conveyed and explain why they
            harm your reputation. We&apos;ll forward your notice to the
            listing owner who has 7 days to respond before the listing is
            permanently hidden.
          </li>
          <li>
            For copyright, identify the original work and your authorship.
          </li>
          <li>
            For privacy or illegal content, describe what&apos;s on the
            listing and why it crosses the line. We&apos;ll act faster on
            anything that looks unsafe.
          </li>
          <li>
            All concerns notices are logged. False or vexatious notices may
            be referred to authorities.
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <ConcernsNoticeForm />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        Email this notice instead:{" "}
        <a href="mailto:help@outbackconnections.com.au" className="underline">
          help@outbackconnections.com.au
        </a>
        . Postal: Outback Fencing &amp; Steel Supplies Pty Ltd, 76 Astill
        Drive, Orange NSW 2800.
      </p>
    </div>
  );
}
