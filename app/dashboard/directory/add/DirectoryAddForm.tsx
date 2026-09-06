"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Field } from "@/components/posting/BaseFields";
import { SOURCE_PLATFORM_OPTIONS } from "@/lib/source-platforms";
import {
  addDirectoryEntry,
  previewDirectoryEntry,
  type DirectoryAddResult,
  type DirectoryPreview,
} from "./actions";

export type DirectoryCategory = { id: string; slug: string; label: string; pillar: string };

type Props = { categories: DirectoryCategory[] };

const VERTICALS: { value: "service" | "job" | "freight"; label: string; pillar: string }[] = [
  { value: "service", label: "Services (contractors, suppliers)", pillar: "services" },
  { value: "job", label: "Jobs (an employer)", pillar: "jobs" },
  { value: "freight", label: "Freight (a carrier)", pillar: "freight" },
];

const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"];

type PreviewOk = Extract<DirectoryPreview, { ok: true }>;
type AddOk = Extract<DirectoryAddResult, { ok: true }>;

export default function DirectoryAddForm({ categories }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [vertical, setVertical] = useState<"service" | "job" | "freight">("service");
  const [platform, setPlatform] = useState<string>("facebook");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewOk | null>(null);
  const [added, setAdded] = useState<AddOk | null>(null);
  const [previewing, startPreview] = useTransition();
  const [adding, startAdd] = useTransition();

  const pillar = VERTICALS.find((v) => v.value === vertical)?.pillar ?? "services";
  const cats = categories.filter((c) => c.pillar === pillar);
  const platformOpt = SOURCE_PLATFORM_OPTIONS.find((o) => o.value === platform);

  function invalidate() {
    setPreview(null);
    setAdded(null);
  }

  function doPreview() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setErrors({});
    setAdded(null);
    startPreview(async () => {
      const res = await previewDirectoryEntry(fd);
      if (res.ok) setPreview(res);
      else {
        setPreview(null);
        setErrors(res.errors);
      }
    });
  }

  function doAdd() {
    if (!formRef.current || !preview?.valid) return;
    const fd = new FormData(formRef.current);
    setErrors({});
    startAdd(async () => {
      const res = await addDirectoryEntry(fd);
      if (res.ok) {
        setAdded(res);
        setPreview(null);
      } else {
        setErrors(res.errors);
      }
    });
  }

  function addAnother() {
    formRef.current?.reset();
    setVertical("service");
    setPlatform("facebook");
    setErrors({});
    setPreview(null);
    setAdded(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (added) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-900">
        <p className="font-semibold">
          {added.action === "created" ? "Added" : "Updated"}: {added.title}
        </p>
        <p className="mt-2">
          It&apos;s live as an <strong>unclaimed</strong> directory entry with a business record,
          so the owner can claim it. Phone and email stay private until they do.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {added.href && (
            <Link
              href={added.href}
              className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800"
            >
              View the listing
            </Link>
          )}
          <button
            type="button"
            onClick={addAnother}
            className="rounded-lg border border-green-700 bg-white px-4 py-2 font-semibold text-green-800 hover:bg-green-100"
          >
            Add another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={(e) => e.preventDefault()} noValidate className="space-y-5">
      {errors._ && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {errors._}
        </div>
      )}

      <Field id="name" label="Business name" error={errors.name} required>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          onChange={invalidate}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="vertical" label="Directory" error={errors.vertical} required>
          <select
            id="vertical"
            name="vertical"
            value={vertical}
            onChange={(e) => {
              setVertical(e.target.value as "service" | "job" | "freight");
              invalidate();
            }}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            {VERTICALS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="category_slug"
          label="Category"
          error={errors.category_slug}
          hint="Unknown or blank falls back to the directory's 'other' bucket."
        >
          <select
            id="category_slug"
            name="category_slug"
            defaultValue={pillar === "services" ? "fencing-contractor" : ""}
            onChange={invalidate}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Pick a category</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field id="postcode" label="Postcode" error={errors.postcode} required>
          <input
            id="postcode"
            name="postcode"
            type="text"
            inputMode="numeric"
            required
            maxLength={4}
            onChange={invalidate}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>
        <Field id="suburb" label="Town or area" error={errors.suburb} hint="As you'd say it: Orange, Coolah district.">
          <input
            id="suburb"
            name="suburb"
            type="text"
            maxLength={80}
            onChange={invalidate}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>
        <Field id="state" label="State" error={errors.state}>
          <select
            id="state"
            name="state"
            defaultValue="NSW"
            onChange={invalidate}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">Where did you find it?</p>
        <p className="mt-1 text-xs text-amber-900">
          This is shown publicly as the source. Be exact: the listing says &quot;we found it on
          Facebook&quot; and links there.
        </p>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <Field id="platform" label="Found on" error={errors.platform} required>
            <select
              id="platform"
              name="platform"
              value={platform}
              onChange={(e) => {
                setPlatform(e.target.value);
                invalidate();
              }}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            >
              {SOURCE_PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="source_url"
            label={platformOpt?.needsUrl ? "Page URL" : "Page URL (optional)"}
            error={errors.source_url}
            required={!!platformOpt?.needsUrl}
            hint={platformOpt?.hint}
          >
            <input
              id="source_url"
              name="source_url"
              type="url"
              inputMode="url"
              placeholder="https://"
              onChange={invalidate}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-800">Private details</p>
        <p className="mt-1 text-xs text-neutral-600">
          Kept in the private source record for outreach. Never shown publicly until the
          business claims the listing and confirms them.
        </p>
        <div className="mt-3 grid gap-5 sm:grid-cols-3">
          <Field id="phone" label="Phone" error={errors.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              maxLength={20}
              onChange={invalidate}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
          <Field id="email" label="Email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              maxLength={120}
              onChange={invalidate}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
          <Field id="website" label="Website" error={errors.website} hint="Shown publicly on the business record.">
            <input
              id="website"
              name="website"
              type="url"
              placeholder="https://"
              onChange={invalidate}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field id="notes" label="Notes for the team" error={errors.notes} hint="Private. What they do, who to ask for, anything useful for a call.">
            <textarea
              id="notes"
              name="notes"
              rows={2}
              maxLength={2000}
              onChange={invalidate}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={doPreview}
          disabled={previewing || adding}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {previewing ? "Checking…" : "Check it (no writes)"}
        </button>
        <button
          type="button"
          onClick={doAdd}
          disabled={!preview?.valid || adding || previewing}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
          title={preview?.valid ? undefined : "Check it first"}
        >
          {adding ? "Adding…" : preview?.action === "update" ? "Update the existing entry" : "Add to directory"}
        </button>
      </div>

      {preview && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            preview.valid ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-semibold">
            {preview.valid
              ? preview.action === "update"
                ? "This business is already in the directory. Adding will refresh it."
                : "Ready to add as a new unclaimed entry."
              : "Can't add this yet."}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              Category: {preview.categoryLabel ?? preview.categoryResolved ?? "—"}
              {preview.categoryInput &&
              preview.categoryResolved &&
              preview.categoryInput !== preview.categoryResolved ? (
                <span> (fell back from &quot;{preview.categoryInput}&quot;)</span>
              ) : null}
            </li>
            <li>
              Source link:{" "}
              <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                {preview.sourceUrl}
              </a>{" "}
              {preview.urlKind === "search" ? "(a search for the name, since no page URL was given)" : "(exact page)"}
            </li>
            {preview.existingSlug && <li>Existing listing: {preview.existingSlug}</li>}
            {preview.errors.map((e, i) => (
              <li key={`e${i}`} className="text-red-800">
                • {e}
              </li>
            ))}
            {preview.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-amber-800">
                ⚠ {w}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
