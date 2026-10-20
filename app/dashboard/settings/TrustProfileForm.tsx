"use client";

import { useActionState } from "react";
import { updateTrustProfile, type TrustProfileState } from "./actions";
import {
  AVAILABILITY_STATUSES,
  BOOKED_UNTIL_MONTHS,
  CONTRACTOR_EQUIPMENT_OPTIONS,
  INSURANCE_BADGES,
  PREFERRED_JOB_SIZES,
  ROLE_TAGS,
  formatAbn,
  formatBelievableAvailability,
} from "@/lib/trust";

type Props = {
  initialValues: {
    display_name: string | null;
    trading_name: string | null;
    suburb?: string | null;
    postcode: string | null;
    bio: string | null;
    abn: string | null;
    abn_verified_at: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    website_url?: string | null;
    services_offered?: string[];
    photo_urls?: string[];
    insurances_held: string[];
    insurance_expiry_date?: string | null;
    role_tags: string[];
    years_in_district: number | null;
    availability_status?: string | null;
    availability_note?: string | null;
    availability_updated_at?: string | null;
    travel_area?: string | null;
    equipment_summary?: string[];
    preferred_job_size?: string | null;
  };
};

const initial: TrustProfileState = {};

export default function TrustProfileForm({ initialValues }: Props) {
  const [state, formAction, pending] = useActionState(updateTrustProfile, initial);
  const existingPhotos = Array.isArray(initialValues.photo_urls)
    ? initialValues.photo_urls
    : [];
  const existingEquipment = Array.isArray(initialValues.equipment_summary)
    ? initialValues.equipment_summary
    : [];
  const defaultSpecialties = Array.isArray(initialValues.services_offered)
    ? initialValues.services_offered.join(", ")
    : "";

  const believableAvail = formatBelievableAvailability({
    availabilityStatus: initialValues.availability_status,
    availabilityNote: initialValues.availability_note,
    availabilityUpdatedAt: initialValues.availability_updated_at,
    ownerConfirmed: true,
  });

  return (
    <form action={formAction} className="mt-4 space-y-5">
      {state.ok && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-xs font-semibold text-green-900">
          ✓ Your public profile, availability date, equipment, work photos &amp; verification details have been saved.
        </div>
      )}
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900">
          {state.error}
        </div>
      )}

      {/* Believable Availability + Booked Until Month */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="block text-xs font-bold uppercase tracking-wide text-emerald-950">
              📅 Booking Availability (Phone-friendly quick update)
            </span>
            <p className="mt-0.5 text-xs text-neutral-600">
              Saving this form stamps today&apos;s date so farmers see fresh, believable availability instead of a stale listing.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${believableAvail.badgeClass}`}
          >
            <span className={`h-2 w-2 rounded-full ${believableAvail.dotClass}`} />
            {believableAvail.headline} · {believableAvail.updatedText}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {AVAILABILITY_STATUSES.map((st) => (
            <label
              key={st.slug}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:border-green-700"
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="availability_note"
              className="block text-xs font-semibold text-neutral-700"
            >
              If booked ahead, when is your next opening? (Optional — shows e.g. &ldquo;Booked until November&rdquo;)
            </label>
            <select
              id="availability_note"
              name="availability_note"
              defaultValue={initialValues.availability_note ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              <option value="">Taking bookings now (no wait month)</option>
              {BOOKED_UNTIL_MONTHS.map((month) => (
                <option key={month} value={month}>
                  Booked until {month}
                </option>
              ))}
            </select>
          </div>
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

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
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
            htmlFor="suburb"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Town / Suburb
          </label>
          <input
            id="suburb"
            name="suburb"
            type="text"
            maxLength={60}
            defaultValue={initialValues.suburb ?? ""}
            placeholder="e.g. Orange"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>

        <div>
          <label
            htmlFor="postcode"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Postcode
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
      </div>

      {/* Direct Public Contact Details (0-Click Call / SMS / Email / Website) */}
      <div className="rounded-xl border border-green-200 bg-green-50/40 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-green-900">
            📞 1-Click Direct Contact Details (shown on your profile &amp; cards)
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Let farmers, property owners, and clients call, text, email, or visit your website in 1 click.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="contact_phone"
              className="block text-xs font-semibold text-neutral-700"
            >
              Phone / Mobile (Call &amp; SMS)
            </label>
            <input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              maxLength={30}
              defaultValue={initialValues.contact_phone ?? ""}
              placeholder="e.g. 0428 123 456"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>

          <div>
            <label
              htmlFor="contact_email"
              className="block text-xs font-semibold text-neutral-700"
            >
              Public Contact Email
            </label>
            <input
              id="contact_email"
              name="contact_email"
              type="email"
              maxLength={120}
              defaultValue={initialValues.contact_email ?? ""}
              placeholder="e.g. info@yourbusiness.com.au"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>

          <div>
            <label
              htmlFor="website_url"
              className="block text-xs font-semibold text-neutral-700"
            >
              Website URL
            </label>
            <input
              id="website_url"
              name="website_url"
              type="text"
              maxLength={200}
              defaultValue={initialValues.website_url ?? ""}
              placeholder="e.g. https://yourbusiness.com.au"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label
            htmlFor="services_offered"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Fencing Specialties &amp; Rural Services (comma-separated chips)
          </label>
          <input
            id="services_offered"
            name="services_offered"
            type="text"
            maxLength={300}
            defaultValue={defaultSpecialties}
            placeholder="e.g. Fixed Knot Exclusion, Hinge Joint, Cattle Yards, Post Driving"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
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

      {/* Practical Contractor Profile: Travel Area, Preferred Job Size & Equipment */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-800">
            🚜 Practical Contractor Details (Travel Area, Job Size &amp; Equipment)
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Help landholders quickly see how far you travel, what size fencing or contracting jobs you take on, and what gear you bring.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="travel_area"
              className="block text-xs font-semibold text-neutral-700"
            >
              Travel &amp; Service Area
            </label>
            <input
              id="travel_area"
              name="travel_area"
              type="text"
              maxLength={140}
              defaultValue={initialValues.travel_area ?? ""}
              placeholder="e.g. Within 150km of Orange — Bathurst, Molong, Cowra, Dubbo"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>

          <div>
            <label
              htmlFor="preferred_job_size"
              className="block text-xs font-semibold text-neutral-700"
            >
              Preferred Job Size
            </label>
            <select
              id="preferred_job_size"
              name="preferred_job_size"
              defaultValue={initialValues.preferred_job_size ?? ""}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            >
              <option value="">Select preferred job size (optional)</option>
              {PREFERRED_JOB_SIZES.map((j) => (
                <option key={j.slug} value={j.slug}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs font-semibold text-neutral-700">
            Equipment &amp; Rig on Board (tap all that apply)
          </span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CONTRACTOR_EQUIPMENT_OPTIONS.map((eq) => (
              <label
                key={eq.slug}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-800 hover:border-green-700"
              >
                <input
                  type="checkbox"
                  name="equipment_summary"
                  value={eq.slug}
                  defaultChecked={existingEquipment.includes(eq.slug)}
                  className="h-4 w-4 rounded border-neutral-300 text-green-700"
                />
                {eq.label}
              </label>
            ))}
          </div>
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
          placeholder="e.g. Family grazing & lucerne operation near Molong NSW, or 15 years operating hydraulic post drivers, B-doubles and exclusion fencing across Central West NSW."
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        />
        {state.fieldErrors?.bio && (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.bio}</p>
        )}
      </div>

      {/* Work, Rig, Fencing & Livestock Photo Gallery Upload */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-800">
            📷 Work, Fleet, Fencing &amp; Property Photos (up to 6 photos)
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Upload photos of your finished exclusion fences, strainer assemblies, trucks, headers, earthmoving gear, or livestock straight from your phone.
          </p>
        </div>

        {existingPhotos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-neutral-700">
              Current photos on your profile (uncheck to remove):
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {existingPhotos.map((url, idx) => (
                <label
                  key={`${url}-${idx}`}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1.5 shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Work photo ${idx + 1}`}
                    className="h-28 w-full rounded-lg object-cover"
                  />
                  <span className="mt-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-neutral-700">
                    <input
                      type="checkbox"
                      name="kept_photo_urls"
                      value={url}
                      defaultChecked
                      className="h-3.5 w-3.5 rounded border-neutral-300 text-green-700"
                    />
                    Keep photo #{idx + 1}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="photo_files"
              className="block text-xs font-semibold text-neutral-700"
            >
              Upload photos from your phone or computer (JPG, PNG, WebP — max 5MB each)
            </label>
            <input
              id="photo_files"
              name="photo_files"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-green-800"
            />
          </div>

          <div>
            <label
              htmlFor="new_photo_url"
              className="block text-xs font-semibold text-neutral-700"
            >
              Or paste a direct image URL (optional)
            </label>
            <input
              id="new_photo_url"
              name="new_photo_url"
              type="url"
              placeholder="https://..."
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
            />
          </div>
        </div>
        {state.fieldErrors?.photos && (
          <p className="text-xs text-red-700">{state.fieldErrors.photos}</p>
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

      <div className="space-y-3">
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-700">
            Insurance &amp; compliance held (shown as self-declared unless certificate sighted)
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

        <div className="max-w-xs">
          <label
            htmlFor="insurance_expiry_date"
            className="block text-xs font-semibold text-neutral-700"
          >
            Current Public Liability policy expiry date (optional)
          </label>
          <input
            id="insurance_expiry_date"
            name="insurance_expiry_date"
            type="date"
            defaultValue={initialValues.insurance_expiry_date ?? ""}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800 disabled:opacity-50"
      >
        {pending ? "Saving profile & uploading photos..." : "Save profile, availability & photos"}
      </button>
    </form>
  );
}

