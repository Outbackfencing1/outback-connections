// /enquiries/outcome?t=<signed token> — confirm page for the one-click
// follow-up answer. The email links land here (GET, no write); the answer is
// committed by the button below (POST server action). Scanners that prefetch
// links therefore never answer on the farmer's behalf.
import Link from "next/link";
import { verifyToken } from "@/lib/signed-tokens";
import { isEnquiryOutcome, OUTCOME_LABELS } from "@/lib/enquiry-outcome";
import { confirmOutcome } from "./actions";

export const metadata = {
  title: "Confirm your answer — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EnquiryOutcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  const v = verifyToken(t);
  const outcome = v.ok && v.payload.p === "enq_outcome" && isEnquiryOutcome(v.payload.l) ? v.payload.l : null;

  if (!outcome) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">That link has expired.</h1>
        <p className="mt-3 text-neutral-700">
          Follow-up links work for 30 days. If you want to tell us how it went, email{" "}
          <a href="mailto:help@outbackconnections.com.au" className="underline">
            help@outbackconnections.com.au
          </a>
          .
        </p>
        <p className="mt-8 text-sm">
          <Link href="/" className="underline">← Outback Connections</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">One more click to confirm</h1>
      <p className="mt-3 text-neutral-700">
        You&apos;re about to tell us: <strong>{OUTCOME_LABELS[outcome]}</strong>.
      </p>
      <form action={confirmOutcome} className="mt-6">
        <input type="hidden" name="t" value={t} />
        <button
          type="submit"
          className="rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Confirm
        </button>
      </form>
      <p className="mt-4 text-xs text-neutral-500">
        Wrong answer? Just go back to the email and click the right one. Your name is never shown;
        answers only ever appear as a count on the business&apos;s listing.
      </p>
    </div>
  );
}
