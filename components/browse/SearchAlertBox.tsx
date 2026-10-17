"use client";

import { useActionState } from "react";
import { subscribeSearchAlert, type SearchAlertState } from "@/app/alerts/actions";

type Props = {
  vertical: "job" | "sale" | "freight" | "service";
  signal: string;
  signalLabel: string;
  postcode?: string;
};

const initial: SearchAlertState = {};

export default function SearchAlertBox({
  vertical,
  signal,
  signalLabel,
  postcode = "",
}: Props) {
  const [state, formAction, pending] = useActionState(subscribeSearchAlert, initial);

  if (state.ok) {
    return (
      <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3.5 text-xs font-semibold text-green-950">
        ✓ Alert saved! We&apos;ll email you as soon as a new listing matching{" "}
        <span className="underline">{signalLabel}</span>
        {postcode ? ` near ${postcode}` : ""} is posted.
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50/60 p-3.5 text-xs"
    >
      <input type="hidden" name="vertical" value={vertical} />
      <input type="hidden" name="signal" value={signal || "all"} />

      <div className="min-w-[220px] flex-1">
        <p className="font-semibold text-neutral-900">
          🔔 Get emailed when new <span className="text-green-900">{signalLabel}</span> listings go up
        </p>
        <p className="mt-0.5 text-neutral-600">
          No spam — only instant alerts when a matching listing is posted in your region.
        </p>
        {state.error && (
          <p className="mt-1 font-semibold text-red-700">{state.error}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="Your email address"
          className="w-48 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900"
        />
        <input
          type="text"
          name="postcode"
          inputMode="numeric"
          maxLength={4}
          defaultValue={postcode}
          placeholder="Postcode (opt.)"
          className="w-28 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-green-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Alert me"}
        </button>
      </div>
    </form>
  );
}
