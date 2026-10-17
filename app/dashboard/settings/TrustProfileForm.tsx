"use client";

import { useActionState } from "react";
import { updateTrustProfile, type TrustProfileState } from "./actions";
import {
  AVAILABILITY_STATUSES,
  INSURANCE_BADGES,
  ROLE_TAGS,
  formatAbn,
} from "@/lib/trust";

type Props = {
  initialValues: {
    display_name: string | null;
    trading_name: string | null;
    postcode: string | null;
    bio: string | null;
    abn: string | null;
    abn_verified_at: string | null;
    insurances_held: string[];
    role_tags: string[];
    years_in_district: number | null;
    availability_status?: string | null;
  };
};

const initial: TrustProfileState = {};

export default function TrustProfileForm({ initialValues }: Props) {
  const [state, formAction, pending] = useActionState(updateTrustProfile, initial);

  return (
    <form action={formAction} className="mt-4 space-y-5">
      {state.ok && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-xs font-semibold text-green-900">
          ✓ Your public trust profile &amp; verification badges have been updated.
        </div>
      )}
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">
          {state.error}
        </div>
      )}

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
          Your current availability status (shown on your profile &amp; listings)
        </span>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {AVAILABILITY_STATUSES.map((st) => (
            <label
              key={st.slug}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-800 hover:border-green-700"
            >
              <input
                type="radio"
                name="availability_status"
                value={st.slug}
                defaultChecked={
                  (initialValues.availability_status || "available") === st.slug
                }
                className="h-4 w-4 text-green-700"
              />
              <span className={`h-2 w-2 rounded-full ${st.dotClass}`} />
              <span>{st.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="display_name"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Your name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            maxLength={80}
            defaultValue={initialValues.display_name ?? ""}
            placeholder="e.g. Josh Crawford"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {state.fieldErrors?.display_name && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.display_name}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="trading_name"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Property / Business / Contracting name
          </label>
          <input
            id="trading_name"
            name="trading_name"
            type="text"
            maxLength={100}
            defaultValue={initialValues.trading_name ?? ""}
            placeholder="e.g. Crawford Pastoral or Outback Fencing"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {state.fieldErrors?.trading_name && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.trading_name}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label
            htmlFor="abn"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            ABN (11 digits — adds Verified badge)
          </label>
          <input
            id="abn"
            name="abn"
            type="text"
            inputMode="numeric"
            defaultValue={formatAbn(initialValues.abn) ?? initialValues.abn ?? ""}
            placeholder="e.g. 51 824 753 556"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {state.fieldErrors?.abn && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.abn}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="postcode"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Home base postcode
          </label>
          <input
            id="postcode"
            name="postcode"
            type="text"
            inputMode="numeric"
            maxLength={4}
            defaultValue={initialValues.postcode ?? ""}
            placeholder="e.g. 2800"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {state.fieldErrors?.postcode && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.postcode}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="years_in_district"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Years in district / trade
          </label>
          <input
            id="years_in_district"
            name="years_in_district"
            type="number"
            min={0}
            max={100}
            defaultValue={initialValues.years_in_district ?? ""}
            placeholder="e.g. 12"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          {state.fieldErrors?.years_in_district && (
            <p className="mt-1 text-xs text-red-700">{state.fieldErrors.years_in_district}</p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="bio"
          className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
        >
          About your property, contracting gear or experience (shown on your listings &amp; profile)
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          maxLength={600}
          defaultValue={initialValues.bio ?? ""}
          placeholder="e.g. Family grazing & lucerne operation near Molong NSW, or 15 years operating headers, B-doubles and exclusion fencing across Central West NSW."
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        />
        {state.fieldErrors?.bio && (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.bio}</p>
        )}
      </div>

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
          What best describes you? (select all that apply)
        </span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ROLE_TAGS.map((r) => (
            <label
              key={r.slug}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800"
            >
              <input
                type="checkbox"
                name="role_tags"
                value={r.slug}
                defaultChecked={initialValues.role_tags.includes(r.slug)}
                className="h-4 w-4 rounded border-neutral-300 text-green-700"
              />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
          Insurance &amp; compliance held (shown as trust badges)
        </span>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {INSURANCE_BADGES.map((b) => (
            <label
              key={b.slug}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-800"
            >
              <input
                type="checkbox"
                name="insurances_held"
                value={b.slug}
                defaultChecked={initialValues.insurances_held.includes(b.slug)}
                className="h-4 w-4 rounded border-neutral-300 text-green-700"
              />
              🛡 {b.label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
      >
        {pending ? "Saving trust profile..." : "Save trust profile"}
      </button>
    </form>
  );
}
