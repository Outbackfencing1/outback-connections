import Link from "next/link";

export const metadata = {
  title: "Cookies notice — Outback Connections",
  description:
    "What cookies we set, why, and how to control them.",
};

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Cookies notice</h1>
      <p className="mt-2 text-sm text-neutral-600">Last updated 25 April 2026.</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What we set today</h2>
        <p className="text-neutral-800">
          We currently set two kinds of cookie. Both are{" "}
          <strong>strictly necessary</strong> for the site to work, so
          neither requires opt-in consent under Australian or EU
          guidelines.
        </p>

        <ol className="list-decimal space-y-3 pl-6 text-neutral-800">
          <li>
            <strong>Auth session cookies</strong> — set by Supabase when
            you sign in. They keep you signed in across pages and
            requests, so you don&apos;t have to click a magic link on
            every page load. Cookie names start with{" "}
            <span className="font-mono text-xs">sb-</span>. They&apos;re
            HTTP-only (not readable by JavaScript on other domains) and
            expire when your session does.
          </li>
          <li>
            <strong>Flash cookies</strong> — small, short-lived cookies
            we set to display a one-shot success message after you post
            a listing or perform a similar action. They expire within
            60 seconds.
          </li>
        </ol>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">What we don&apos;t set</h2>
        <ul className="list-disc space-y-2 pl-6 text-neutral-800">
          <li>
            <strong>No analytics.</strong> No Google Analytics, no Plausible,
            no Mixpanel, no anything similar. We don&apos;t track which
            pages you visit, where you scroll, or how long you stay.
          </li>
          <li>
            <strong>No tracking pixels.</strong> No Facebook Pixel, no
            Google Ads conversion tags, no LinkedIn Insight Tag.
          </li>
          <li>
            <strong>No third-party cookies.</strong> Other than the auth
            session cookies set by Supabase, all cookies are first-party.
          </li>
          <li>
            <strong>No cross-site cookies.</strong> We don&apos;t share
            cookies with other sites or networks.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">If we add analytics later</h2>
        <p className="text-neutral-800">
          If we ever add analytics or any other non-essential cookies
          we&apos;ll update this notice and ask for your consent first
          via an on-site banner. We won&apos;t silently switch on
          tracking.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Controlling cookies</h2>
        <p className="text-neutral-800">
          You can clear or block cookies via your browser settings. If
          you block our auth cookies, you won&apos;t be able to sign in.
          Browsing the site without signing in will still work — you just
          won&apos;t see contact details or be able to post.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-bold">Questions</h2>
        <p className="text-neutral-800">
          Email{" "}
          <a
            href="mailto:support@outbackfencingsupplies.com.au"
            className="underline"
          >
            support@outbackfencingsupplies.com.au
          </a>
          .
        </p>
      </section>

      <hr className="my-10 border-neutral-200" />

      <p className="text-xs text-neutral-600">
        Read alongside the{" "}
        <Link href="/privacy" className="underline">
          Privacy notice
        </Link>
        .
      </p>

      <div className="mt-4">
        <Link href="/" className="text-sm underline">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
