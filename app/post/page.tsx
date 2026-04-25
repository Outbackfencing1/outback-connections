import Link from "next/link";
import { checkPostingGuard } from "@/lib/posting";

export const metadata = {
  title: "Post a listing — Outback Connections",
  description: "Post a job, freight, or rural service. Free forever.",
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
        Pick the right kind of listing. Free forever, no lead fees.
      </p>

      {!guard.ok && <PostingGate guard={guard} />}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <PostCard
          href="/post/job"
          title="Post a job"
          blurb="Need a station hand, fencer, harvester, or driver? Describe the work."
          eyebrow="Jobs"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/freight"
          title="Need freight moved"
          blurb="Livestock, hay, grain, machinery — post what needs moving and where."
          eyebrow="Freight"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/service/offering"
          title="Offering a rural service"
          blurb="Bore pumps, drone spraying, mechanical repairs, contract cropping. Add your service to the directory."
          eyebrow="Services — offering"
          disabled={!guard.ok}
        />
        <PostCard
          href="/post/service/request"
          title="Need a service done"
          blurb="Looking for a specialist for a one-off job? Post what you need."
          eyebrow="Services — requesting"
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
          <Link href="/signin" className="font-medium underline">
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="font-medium underline">
            create an account
          </Link>
          .
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
