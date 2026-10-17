import Link from "next/link";
import { checkPostingGuard } from "@/lib/posting";

export const metadata = {
  title: "Post a listing — Outback Connections",
  robots: { index: false, follow: true },
  description:
    "List your rural skills, post a job, sell livestock or harvest, or post freight and rural services. Free forever.",
};

export const dynamic = "force-dynamic";

export default async function PostHubPage() {
  const guard = await checkPostingGuard();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        What are you posting?
      </h1>
      <p className="mt-2 text-neutral-700">
        Pick the right kind of listing. Free forever, no lead fees, no commission.
      </p>
      <p className="mt-1 text-sm text-neutral-600">
        Posting needs a free account (takes 1 minute — post straight away). Asking a listed business for a quote
        doesn&apos;t.
      </p>

      {!guard.ok && <PostingGate guard={guard} />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <PostCard
          href="/post/job?direction=available_for_work"
          title="List your skills (Available for work)"
          blurb="Truck driver, header/machine operator, fencer, station hand, shearer or welder? List your tickets, rate & availability."
          eyebrow="Work & Skills — available"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/job?direction=hiring"
          title="Post a job (Hiring)"
          blurb="Need a driver, machine operator, station hand, fencer, or harvest crew? Describe the work and rate."
          eyebrow="Work & Skills — hiring"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/sale?side=supply"
          title="Sell livestock, hay, grain or gear"
          blurb="Cattle, sheep, lucerne/cereal hay, grain, machinery, trailers, fencing steel. Zero commission; buyers contact you direct."
          eyebrow="Livestock & Harvest — For Sale"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/sale?side=demand"
          title="Wanted to buy — stock, hay, grain or gear"
          blurb="Chasing weaner steers, breeding ewes, lucerne hay, feed barley or a tractor/header? Post what you need and your postcode."
          eyebrow="Livestock & Harvest — Wanted"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/service/offering"
          title="Offering a rural service"
          blurb="Fencing contractor, bore pumps, drone spraying, mobile diesel mechanic, contract cropping, earthworks. Add your business."
          eyebrow="Services — contractor directory"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/service/request"
          title="Need a contractor or service done"
          blurb="Got a fencing job, earthworks, spraying or bore repair? Post what you need and let contractors get in touch."
          eyebrow="Services — job request"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/freight"
          title="Freight & backloads"
          blurb="Need livestock, hay, grain or machinery moved — or got a truck with empty deck space on a run?"
          eyebrow="Freight"
          disabled={!guard.ok}
        />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}

function PostingGate({
  guard,
}: {
  guard: Awaited<ReturnType<typeof checkPostingGuard>>;
}) {
  if (guard.ok) return null;

  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-semibold">{titleFor(guard)}</p>
      <p className="mt-2">{guard.message}</p>
      {guard.reason === "not_signed_in" && (
        <p className="mt-3">
          <Link href="/signin?next=/post" className="font-medium underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/signup?next=/post" className="font-medium underline">
            create a free account
          </Link>{" "}
          to post right away.
        </p>
      )}
    </div>
  );
}

function titleFor(
  guard: Extract<Awaited<ReturnType<typeof checkPostingGuard>>, { ok: false }>
): string {
  switch (guard.reason) {
    case "not_signed_in":
      return "Sign in to post";
    case "email_unverified":
      return "Verify your email first";
    case "account_too_new":
      return "Your account is too new";
    case "lockdown":
      return "Posting temporarily disabled";
  }
}

function PostCard({
  href,
  title,
  blurb,
  eyebrow,
  disabled,
}: {
  href: string;
  title: string;
  blurb: string;
  eyebrow: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 opacity-60"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-neutral-700">{title}</h2>
        <p className="mt-2 text-sm text-neutral-600">{blurb}</p>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="mt-2 text-sm text-neutral-700">{blurb}</p>
      <p className="mt-3 text-sm font-medium text-green-800">Start →</p>
    </Link>
  );
}
