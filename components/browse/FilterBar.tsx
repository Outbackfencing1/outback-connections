// components/browse/FilterBar.tsx — server-rendered <form method="get">
// so filters work without JS. Passing children lets each browse page
// supply its own kind-specific filters.
import type { ReactNode } from "react";

type Props = {
  /** Form action — typically the same browse path */
  action: string;
  /** Currently applied postcode filter (renders as default value) */
  postcode?: string;
  /** Children: extra filter inputs (category select, pay_type select, etc.) */
  children?: ReactNode;
  /** Optional reset link */
  resetHref?: string;
};

export default function FilterBar({ action, postcode = "", children, resetHref }: Props) {
  return (
    <form
      action={action}
      method="get"
      className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className="block text-xs font-medium text-neutral-700">
            Postcode (starts with)
          </span>
          <input
            type="text"
            name="postcode"
            defaultValue={postcode}
            inputMode="numeric"
            maxLength={4}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            placeholder="2800"
          />
        </label>
        {children}
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          type="submit"
          className="rounded-lg bg-green-700 px-3 py-1.5 font-semibold text-white hover:bg-green-800"
        >
          Filter
        </button>
        {resetHref && (
          <a href={resetHref} className="text-neutral-700 underline">
            Reset
          </a>
        )}
      </div>
    </form>
  );
}
