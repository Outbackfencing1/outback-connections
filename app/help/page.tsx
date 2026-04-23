import { cookies } from "next/headers";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { submitHelpRequest } from "./actions";

export const metadata = {
  title: "Get Help — Outback Connections",
  description:
    "Tell us what's happened and we'll help. We read every message within 48 hours.",
};

// Always dynamic — page state depends on flash cookie + DB lookup.
export const dynamic = "force-dynamic";

type FlashState = {
  errors: Record<string, string>;
  values: Record<string, string>;
};

function readFlash(): FlashState {
  const raw = cookies().get("oc_help_flash")?.value;
  if (!raw) return { errors: {}, values: {} };
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.errors &&
      parsed.values
    ) {
      return parsed as FlashState;
    }
  } catch {
    // fall through
  }
  return { errors: {}, values: {} };
}

type CategoryRow = {
  id: string;
  slug: string;
  label: string;
  of_relevant: boolean;
};

export default async function HelpPage() {
  // Categories has a public-read RLS policy, so we use the anon-keyed client
  // here. Inserts go through supabaseAdmin() in actions.ts, which is the one
  // that needs SUPABASE_SERVICE_ROLE_KEY.
  const supa = supabaseServer();

  let categories: CategoryRow[] = [];
  if (supa) {
    const { data } = await supa
      .from("categories")
      .select("id, slug, label, of_relevant")
      .eq("active", true)
      .order("sort_order");
    categories = (data as CategoryRow[] | null) ?? [];
  }

  // IDs of categories marked of_relevant — used by the small inline script
  // below to hide the OF-consent checkbox when an irrelevant category is picked.
  // The server is the source of truth (server discards OF consent if the
  // category isn't of_relevant), this is purely a UX enhancement.
  const ofRelevantIds = categories.filter((c) => c.of_relevant).map((c) => c.id);

  const { errors, values } = readFlash();
  const v = (k: string) => values[k] ?? "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Get help</h1>
      <p className="mt-2 text-neutral-700">
        Tell us what&apos;s happened. We read every message within 48 hours
        and get back to you.
      </p>

      {/* COI + information-not-advice notice, visible above the form. */}
      <div className="mt-6 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          <span className="font-semibold">Upfront:</span> Outback Connections
          is run by Outback Fencing &amp; Steel Supplies. If your job is
          fencing-related, you can choose to let them contact you — it&apos;s
          optional.
        </p>
        <p>
          <span className="font-semibold">Information, not advice.</span> We
          share what we know, but we&apos;re not lawyers or accountants. If
          the stakes are high, get proper advice alongside ours.
        </p>
      </div>

      {errors._ && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          {errors._}
        </div>
      )}

      {!supa && (
        <div className="mt-6 rounded-xl border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-700">
          <strong>Dev mode:</strong> the database isn&apos;t wired up yet.
          Submissions will be logged to the server console instead of stored,
          and you&apos;ll be redirected to a test confirmation page.
        </div>
      )}

      <form
        action={submitHelpRequest}
        method="post"
        noValidate
        className="mt-8 space-y-6"
      >
        {/* Honeypot: off-screen hidden field. Real humans won't see or tab to it;
            bots that mass-fill every input will trip it. */}
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
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </label>
        </div>

        <Field
          id="request_type"
          label="What's going on?"
          error={errors.request_type}
          required
        >
          <select
            id="request_type"
            name="request_type"
            required
            defaultValue={v("request_type")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Pick one</option>
            <option value="ripped_off">Ripped off</option>
            <option value="stuck_mid_project">Stuck mid-project</option>
            <option value="quote_check">Unsure about a quote</option>
            <option value="bad_workmanship">Bad workmanship</option>
            <option value="contractor_unfinished">
              Contractor won&apos;t finish
            </option>
            <option value="other">Something else</option>
          </select>
        </Field>

        <Field
          id="category_id"
          label="Which category?"
          error={errors.category_id}
          required
        >
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
          {categories.length === 0 && (
            <p className="mt-1 text-xs text-neutral-600">
              (Categories load from the database — empty in dev.)
            </p>
          )}
        </Field>

        <Field
          id="postcode"
          label="Postcode"
          hint="4 digits, where the work is"
          error={errors.postcode}
          required
        >
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

        <Field
          id="dollar_value_bracket"
          label="Roughly how much money is involved?"
          error={errors.dollar_value_bracket}
          required
        >
          <select
            id="dollar_value_bracket"
            name="dollar_value_bracket"
            required
            defaultValue={v("dollar_value_bracket")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Pick a range</option>
            <option value="under_1k">Under $1,000</option>
            <option value="1k_5k">$1,000 – $5,000</option>
            <option value="5k_20k">$5,000 – $20,000</option>
            <option value="20k_50k">$20,000 – $50,000</option>
            <option value="over_50k">$50,000+</option>
            <option value="unknown">Not sure</option>
          </select>
        </Field>

        <Field
          id="urgency_bracket"
          label="How urgent?"
          error={errors.urgency_bracket}
          required
        >
          <select
            id="urgency_bracket"
            name="urgency_bracket"
            required
            defaultValue={v("urgency_bracket")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          >
            <option value="">Pick one</option>
            <option value="emergency">Emergency</option>
            <option value="this_week">This week</option>
            <option value="this_month">This month</option>
            <option value="no_rush">No rush</option>
          </select>
        </Field>

        <Field
          id="description"
          label="Tell us what's happened"
          hint="30 characters or more. What happened, when, who was involved."
          error={errors.description}
          required
        >
          <textarea
            id="description"
            name="description"
            required
            minLength={30}
            maxLength={2000}
            rows={6}
            defaultValue={v("description")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>

        <Field
          id="contractor_name"
          label="Contractor name (optional)"
          hint="Stored privately. We never publish contractor names."
          error={errors.contractor_name}
        >
          <input
            id="contractor_name"
            name="contractor_name"
            maxLength={200}
            defaultValue={v("contractor_name")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>

        <Field
          id="contact_name"
          label="Your first name"
          error={errors.contact_name}
          required
        >
          <input
            id="contact_name"
            name="contact_name"
            required
            maxLength={100}
            defaultValue={v("contact_name")}
            className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
          />
        </Field>

        <fieldset className="rounded-xl border border-neutral-200 p-4">
          <legend className="px-2 text-sm font-semibold text-neutral-800">
            Best contact <span className="text-red-600">*</span>
          </legend>
          <p className="mt-1 text-xs text-neutral-600">
            At least one of email or phone.
          </p>

          <Field
            id="contact_email"
            label="Email"
            error={errors.contact_email}
            compact
          >
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

          <Field
            id="contact_phone"
            label="Phone"
            error={errors.contact_phone}
            compact
          >
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

          <Field
            id="contact_best_time"
            label="Good time to call? (optional)"
            error={errors.contact_best_time}
            compact
          >
            <input
              id="contact_best_time"
              name="contact_best_time"
              maxLength={200}
              defaultValue={v("contact_best_time")}
              placeholder="e.g. weekday afternoons"
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
            />
          </Field>
        </fieldset>

        {/* OF-referral consent — always rendered so the form works without JS.
            The server only acts on this when the selected category is
            of_relevant (fencing, steel supply). Without JS the block stays
            visible and the label explains. With JS, the small script below
            hides it when an irrelevant category is selected. */}
        <div
          id="of-consent-block"
          className="rounded-xl border border-neutral-200 p-4"
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="consent_of_referral"
              defaultChecked={false}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-neutral-800">
              Tick to allow Outback Fencing &amp; Steel Supplies to contact
              you about this fencing job. We&apos;ll only pass it on if you
              tick this <em>and</em> you&apos;ve picked a fencing-related
              category.
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="consent_share_with_authorities"
              defaultChecked={false}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-neutral-800">
              Tick if you want us to help you report this to Fair Trading.
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="consent_store_data"
              required
              defaultChecked={false}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-neutral-800">
              I&apos;ve read the{" "}
              <Link href="/privacy" className="underline">
                privacy notice
              </Link>{" "}
              and agree to my details being stored so you can help me and
              improve rural services.{" "}
              <span className="text-red-600">*</span>
            </span>
          </label>
          {errors.consent_store_data && (
            <p className="mt-2 text-sm text-red-700">
              {errors.consent_store_data}
            </p>
          )}
        </div>

        <div>
          <button
            type="submit"
            className="inline-block rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2"
          >
            Send
          </button>
          <p className="mt-2 text-xs text-neutral-600">
            We read every message within 48 hours.
          </p>
        </div>
      </form>

      {/* Progressive enhancement: hide the OF-consent block when the
          selected category isn't OF-relevant. No JS? Stays visible and the
          server still discards the consent if the category mismatches. */}
      <script
        id="help-of-relevant-ids"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ofRelevantIds) }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  try {
    var data = document.getElementById('help-of-relevant-ids');
    if (!data) return;
    var ids = JSON.parse(data.textContent || '[]');
    var sel = document.getElementById('category_id');
    var block = document.getElementById('of-consent-block');
    if (!sel || !block) return;
    function sync() {
      var relevant = ids.indexOf(sel.value) !== -1;
      block.hidden = !relevant;
      if (!relevant) {
        var box = block.querySelector('input[type="checkbox"]');
        if (box) box.checked = false;
      }
    }
    sel.addEventListener('change', sync);
    sync();
  } catch (e) { /* progressive enhancement, stay silent */ }
})();
`,
        }}
      />
    </div>
  );
}

function Field({
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
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-800"
      >
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {hint && <p className="mt-1 text-xs text-neutral-600">{hint}</p>}
      {children}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
