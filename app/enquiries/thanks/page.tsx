// /enquiries/thanks?o=<outcome> — landing after a one-click follow-up answer.
import Link from "next/link";
import { isEnquiryOutcome } from "@/lib/enquiry-outcome";

export const metadata = {
  title: "Thanks — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EnquiryThanksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const o = typeof sp.o === "string" ? sp.o : "";
  const outcome = isEnquiryOutcome(o) ? o : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      {outcome === "responded" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Good to hear. Thanks.</h1>
          <p className="mt-3 text-neutral-700">
            That helps the next farmer pick someone who answers. If the job went well and you want
            to say so, a word on their listing page helps too.
          </p>
        </>
      )}
      {outcome === "no_response" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">Sorry about that. Thanks for telling us.</h1>
          <p className="mt-3 text-neutral-700">
            We&apos;ve recorded it. If you still need the job done, try another contractor near
            you, or post the job so the listed contractors in your region are told.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link href="/services/fencing-contractor" className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800">
              Find another contractor
            </Link>
            <Link href="/post/service/request?category=fencing-contractor" className="rounded-lg border border-green-700 px-4 py-2 font-semibold text-green-800 hover:bg-green-50">
              Post the job
            </Link>
          </div>
        </>
      )}
      {outcome === "done_elsewhere" && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">No worries. Thanks for letting us know.</h1>
          <p className="mt-3 text-neutral-700">Glad it&apos;s sorted. We won&apos;t email you about this one again.</p>
        </>
      )}
      {!outcome && (
        <>
          <h1 className="text-2xl font-bold tracking-tight">That link has expired.</h1>
          <p className="mt-3 text-neutral-700">
            Follow-up links work for 30 days. If you want to tell us how it went, email{" "}
            <a href="mailto:help@outbackconnections.com.au" className="underline">
              help@outbackconnections.com.au
            </a>
            .
          </p>
        </>
      )}
      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          ← Outback Connections
        </Link>
      </p>
    </div>
  );
}
