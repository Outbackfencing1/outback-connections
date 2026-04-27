// components/LockdownBanner.tsx — server component.
// Renders nothing when lockdown is off. When on, shows a site-wide banner.
import { getLockdownState } from "@/lib/lockdown";

export default async function LockdownBanner() {
  const state = await getLockdownState();
  if (!state.active) return null;
  return (
    <div
      role="alert"
      className="border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-semibold">
          Outback Connections is in maintenance mode.
        </p>
        <p className="mt-1">
          Sign-in and posting are temporarily disabled
          {state.reason ? ` — ${state.reason}` : ""}. We&apos;ll be back
          shortly. Check back soon or email{" "}
          <a
            href="mailto:help@outbackconnections.com.au"
            className="underline"
          >
            help@outbackconnections.com.au
          </a>{" "}
          if you need urgent help.
        </p>
      </div>
    </div>
  );
}
