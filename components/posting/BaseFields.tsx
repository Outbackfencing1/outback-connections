"use client";
// Shared "base" fields rendered by every posting form: title / category /
// description / postcode / contact (email + phone + best time).
// Honeypot is also rendered here so each form gets it for free.
import type { Category } from "@/components/posting/types";

type Props = {
  categories: Category[];
  errors: Record<string, string>;
  defaults: Record<string, string>;
};

export default function BaseFields({ categories, errors, defaults }: Props) {
  const v = (k: string) => defaults[k] ?? "";

  return (
    <>
      {/* Honeypot */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website (leave blank)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <Field id="category_id" label="Category" error={errors.category_id} required>
        <select
          id="category_id"
          name="category_id"
          required
          defaultValue={v("category_id")}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="">Pick a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field id="title" label="Title" error={errors.title} required hint="Short, plain. What is it?">
        <input
          id="title"
          name="title"
          type="text"
          required
          minLength={5}
          maxLength={120}
          defaultValue={v("title")}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </Field>

      <Field
        id="description"
        label="Description"
        error={errors.description}
        required
        hint="At least 30 characters. What you need, when, who you're after, anything that helps."
      >
        <textarea
          id="description"
          name="description"
          required
          minLength={30}
          maxLength={4000}
          rows={6}
          defaultValue={v("description")}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </Field>

      <Field id="postcode" label="Postcode" error={errors.postcode} required hint="4 digits, where the work is.">
        <input
          id="postcode"
          name="postcode"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          required
          defaultValue={v("postcode")}
          className="mt-1 block w-32 rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </Field>

      <fieldset className="rounded-xl border border-neutral-200 p-4">
        <legend className="px-2 text-sm font-semibold text-neutral-800">
          Contact <span className="text-red-600">*</span>
        </legend>
        <p className="mt-1 text-xs text-neutral-600">
          Email or phone (or both). Hidden from the public — only signed-in
          users see contact details.
        </p>

        <Field id="contact_email" label="Email" error={errors.contact_email} compact>
          <input
            id="contact_email"
            name="contact_email"
            type="email"
            inputMode="email"
            maxLength={255}
            defaultValue={v("contact_email")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>

        <Field id="contact_phone" label="Phone" error={errors.contact_phone} compact>
          <input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            inputMode="tel"
            maxLength={40}
            defaultValue={v("contact_phone")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>

        <Field id="contact_best_time" label="Good time to call (optional)" error={errors.contact_best_time} compact>
          <input
            id="contact_best_time"
            name="contact_best_time"
            type="text"
            maxLength={200}
            defaultValue={v("contact_best_time")}
            placeholder="e.g. weekday afternoons"
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>
      </fieldset>
    </>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  required,
  compact,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={compact ? "mt-3" : ""}>
      <label htmlFor={id} className="block text-sm font-medium text-neutral-800">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
