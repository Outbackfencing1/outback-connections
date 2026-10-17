import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listingHref } from "@/lib/format";
import {
  ROLE_TAGS,
  availabilityStatusInfo,
  formatAbn,
  formatPhoneHref,
  insuranceBadgeLabel,
  isAustralianMobile,
  isValidRoleTag,
  roleTagLabel,
  trustTagLabel,
} from "@/lib/trust";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verified Contractors, Carriers, Skilled Labour & Customer Profiles — Outback Connections",
  description:
    "Find verified rural fencing contractors, livestock & hay carriers, header operators, earthmovers, shearers, bore drillers, and property profiles with 1-click phone numbers, ABN verification, and community vouches.",
};

type TrustedProfileItem = {
  profile_id: string;
  user_id: string | null;
  business_id: string | null;
  name: string;
  display_name: string | null;
  trading_name: string | null;
  bio: string | null;
  suburb?: string | null;
  postcode: string | null;
  state: string | null;
  member_since: string | null;
  email_verified: boolean;
  abn_verified: boolean;
  abn: string | null;
  is_claimed_business: boolean;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  services_offered?: string[];
  insurances_held: string[];
  role_tags: string[];
  years_in_district: number | null;
  availability_status?: string | null;
  outback_verified?: boolean;
  active_listings_count: number;
  completed_deals_count: number;
  review_count: number;
  avg_rating: number | null;
  recommend_pct: number | null;
  top_tags: Array<{ tag: string; count: number }>;
  listing_slug?: string | null;
  listing_kind?: string | null;
  category_label?: string | null;
};

function getInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "OC";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default async function TrustedProfilesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const roleRaw = typeof sp.role === "string" ? sp.role.trim() : "";
  const role = isValidRoleTag(roleRaw) ? roleRaw : "";
  const postcodeRaw = typeof sp.postcode === "string" ? sp.postcode.trim() : "";
  const postcode = /^\d{3,4}$/.test(postcodeRaw) ? postcodeRaw : "";
  const qRaw = typeof sp.q === "string" ? sp.q.trim() : "";
  const abnOnly = sp.abn === "1";

  const supabase = createClient();

  // Map newer granular role slugs so RPC + client filtering both work seamlessly
  const rpcRole =
    role === "earthmoving_dam_contractor" || role === "bore_water_driller"
      ? null
      : role || null;

  const { data: rpcData } = await supabase.rpc("list_trusted_profiles", {
    p_role: rpcRole,
    p_postcode: postcode.length === 4 ? postcode : null,
    p_abn_only: abnOnly,
    p_limit: 200,
  });

  let allProfiles: TrustedProfileItem[] = Array.isArray(rpcData)
    ? (rpcData as TrustedProfileItem[])
    : [];

  if (role === "earthmoving_dam_contractor") {
    allProfiles = allProfiles.filter((p) => {
      const hay = [
        p.name,
        p.bio,
        p.category_label,
        ...(p.role_tags ?? []),
        ...(p.services_offered ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (p.role_tags ?? []).includes("earthmoving_dam_contractor") ||
        hay.includes("earth") ||
        hay.includes("dam") ||
        hay.includes("excavat") ||
        hay.includes("dozer")
      );
    });
  } else if (role === "bore_water_driller") {
    allProfiles = allProfiles.filter((p) => {
      const hay = [
        p.name,
        p.bio,
        p.category_label,
        ...(p.role_tags ?? []),
        ...(p.services_offered ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (p.role_tags ?? []).includes("bore_water_driller") ||
        hay.includes("bore") ||
        hay.includes("drill") ||
        hay.includes("water")
      );
    });
  }

  if (qRaw) {
    const needle = qRaw.toLowerCase();
    allProfiles = allProfiles.filter((p) => {
      const hay = [
        p.name,
        p.suburb,
        p.postcode,
        p.bio,
        p.category_label,
        ...(p.services_offered ?? []),
        ...(p.role_tags ?? []).map(roleTagLabel),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  const withPhoneCount = allProfiles.filter((p) => !!p.contact_phone).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Hero Header */}
      <div className="rounded-3xl border border-green-900/15 bg-gradient-to-br from-green-950 via-green-900 to-emerald-900 p-6 text-white shadow-md sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-200">
              ★ 0-Click Direct Contact · Two-Sided Rural Reputation
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Contractors, Carriers, Skilled Labour &amp; Property Profiles
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-emerald-100 sm:text-base">
              Call or text fencing contractors, livestock &amp; hay truckies, header operators, earthmovers, shearers, bore drillers, and local properties directly — no login wall, no lead fees, backed by community vouches and customer ratings.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold text-emerald-100">
              <span className="rounded-full bg-white/10 px-3 py-1">
                📞 {withPhoneCount} profiles with instant 1-click phone numbers
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                ✓ Contractor &amp; Customer/Property ratings
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1">
                ★ Outback Verified &amp; ABN badges
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 lg:shrink-0 lg:flex-col">
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-amber-950 shadow-sm hover:bg-amber-300"
            >
              Set up your Vendor / Customer Profile →
            </Link>
            <Link
              href="/post/job?direction=available_for_work"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              + List your skills or contracting gear
            </Link>
          </div>
        </div>
      </div>

      {/* Role filter pills */}
      <nav aria-label="Filter profiles by trade or role" className="mt-6 flex flex-wrap gap-1.5">
        <Link
          href={`/profiles${postcode ? `?postcode=${postcode}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
            !role
              ? "border-green-800 bg-green-800 text-white shadow-sm"
              : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
          }`}
        >
          All profiles ({allProfiles.length})
        </Link>
        {ROLE_TAGS.map((r) => {
          const active = role === r.slug;
          const q = new URLSearchParams();
          if (!active) q.set("role", r.slug);
          if (postcode) q.set("postcode", postcode);
          if (qRaw) q.set("q", qRaw);
          if (abnOnly) q.set("abn", "1");
          return (
            <Link
              key={r.slug}
              href={`/profiles${q.toString() ? `?${q.toString()}` : ""}`}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-green-800 bg-green-800 text-white shadow-sm"
                  : "border-neutral-300 bg-white text-neutral-800 hover:border-green-700"
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </nav>

      {/* Search & Filter Bar */}
      <form
        method="get"
        action="/profiles"
        className="mt-4 grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_140px_auto_auto]"
      >
        <div>
          <label
            htmlFor="profile-q"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Search town, business, skill or gear
          </label>
          <input
            id="profile-q"
            name="q"
            type="text"
            defaultValue={qRaw}
            placeholder="e.g. Dubbo, Orange, B-double, hay baling, shearing, bore..."
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>

        <div>
          <label
            htmlFor="profile-role"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Role / trade
          </label>
          <select
            id="profile-role"
            name="role"
            defaultValue={role}
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
          >
            <option value="">All roles, contractors &amp; properties</option>
            {ROLE_TAGS.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="profile-postcode"
            className="block text-xs font-semibold uppercase tracking-wide text-neutral-700"
          >
            Postcode
          </label>
          <input
            id="profile-postcode"
            name="postcode"
            type="text"
            inputMode="numeric"
            maxLength={4}
            defaultValue={postcode}
            placeholder="e.g. 2800"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>

        <label className="flex items-center gap-2 self-end rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-800">
          <input
            type="checkbox"
            name="abn"
            value="1"
            defaultChecked={abnOnly}
            className="h-4 w-4 rounded border-neutral-300 text-green-700"
          />
          ✓ ABN Verified
        </label>

        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
          >
            Search
          </button>
          {(role || postcode || qRaw || abnOnly) && (
            <Link
              href="/profiles"
              className="px-2 py-2 text-xs font-medium text-neutral-600 underline"
            >
              Reset
            </Link>
          )}
        </div>
      </form>

      {/* Profiles Grid */}
      {allProfiles.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">
            No profiles match those exact filters yet
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Clear a filter to see all {withPhoneCount}+ regional contractors, or add your own profile in 60 seconds.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/profiles"
              className="rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800"
            >
              Show all profiles
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800"
            >
              Create your profile
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {allProfiles.map((p) => {
            const formattedAbn = formatAbn(p.abn);
            const avail = availabilityStatusInfo(p.availability_status);
            const phoneHref = formatPhoneHref(p.contact_phone);
            const canSms = isAustralianMobile(p.contact_phone);
            const initials = getInitials(p.name);
            const services = Array.isArray(p.services_offered)
              ? p.services_offered
              : [];
            const primaryListingHref =
              p.listing_kind && p.listing_slug
                ? listingHref(p.listing_kind, p.listing_slug)
                : null;

            return (
              <div
                key={p.profile_id}
                className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
              >
                <div>
                  {/* Card Top: Avatar + Name + Rating */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-3">
                      <Link
                        href={`/profile/${p.profile_id}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-800 text-sm font-extrabold text-white shadow-sm"
                      >
                        {initials}
                      </Link>
                      <div>
                        <Link
                          href={`/profile/${p.profile_id}`}
                          className="text-base font-bold text-neutral-900 hover:text-green-800 hover:underline [overflow-wrap:anywhere]"
                        >
                          {p.name}
                        </Link>
                        <p className="mt-0.5 text-xs font-medium text-neutral-600">
                          📍 {p.suburb ? `${p.suburb}, ` : ""}
                          {p.postcode
                            ? `${p.postcode}${p.state ? ` ${p.state}` : ""}`
                            : "Regional NSW"}
                          {p.years_in_district
                            ? ` · ${p.years_in_district}+ yrs`
                            : ""}
                        </p>
                      </div>
                    </div>

                    {p.review_count > 0 && p.avg_rating !== null ? (
                      <span className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-extrabold text-amber-950">
                        ★ {Number(p.avg_rating).toFixed(1)} ({p.review_count})
                      </span>
                    ) : null}
                  </div>

                  {/* Verification & Role Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.outback_verified && (
                      <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-950">
                        ★ Outback Verified
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${avail.badgeClass}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${avail.dotClass}`} />
                      {avail.shortLabel}
                    </span>
                    {p.abn_verified && (
                      <span className="rounded-full border border-green-300 bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-900">
                        ✓ ABN{formattedAbn ? ` ${formattedAbn}` : " Verified"}
                      </span>
                    )}
                    {p.category_label && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900">
                        {p.category_label}
                      </span>
                    )}
                    {Array.isArray(p.role_tags) &&
                      p.role_tags.slice(0, 2).map((r) => (
                        <span
                          key={r}
                          className="rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700"
                        >
                          {roleTagLabel(r)}
                        </span>
                      ))}
                    {Array.isArray(p.insurances_held) &&
                      p.insurances_held.slice(0, 2).map((ins) => (
                        <span
                          key={ins}
                          className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900"
                        >
                          🛡 {insuranceBadgeLabel(ins)}
                        </span>
                      ))}
                  </div>

                  {/* Services / Specialties */}
                  {services.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {services.slice(0, 3).map((srv) => (
                        <span
                          key={srv}
                          className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-700"
                        >
                          🔧 {srv}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bio snippet */}
                  {p.bio && (
                    <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-neutral-700">
                      {p.bio}
                    </p>
                  )}

                  {/* Vouched tags */}
                  {Array.isArray(p.top_tags) && p.top_tags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {p.top_tags.slice(0, 2).map((t) => (
                        <span
                          key={t.tag}
                          className="rounded-full border border-green-200 bg-green-50/70 px-2 py-0.5 text-[11px] font-medium text-green-900"
                        >
                          ✓ {trustTagLabel(t.tag)} ({t.count})
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 0-Click Direct Contact Footer Bar */}
                <div className="mt-4 border-t border-neutral-100 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {phoneHref && (
                      <a
                        href={`tel:${phoneHref}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-green-800"
                      >
                        📞 {p.contact_phone}
                      </a>
                    )}
                    {phoneHref && canSms && (
                      <a
                        href={`sms:${phoneHref}?body=${encodeURIComponent(
                          `Hi ${p.name}, saw your profile on Outback Connections (${p.postcode ?? "NSW"}) — are you available?`
                        )}`}
                        className="inline-flex items-center rounded-lg border border-green-700 bg-green-50 px-2.5 py-1.5 text-xs font-bold text-green-900 hover:bg-green-100"
                      >
                        💬 SMS
                      </a>
                    )}
                    {p.contact_email && (
                      <a
                        href={`mailto:${p.contact_email}?subject=${encodeURIComponent(
                          `Enquiry via Outback Connections: ${p.name}`
                        )}`}
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-800 hover:border-green-700"
                      >
                        ✉️ Email
                      </a>
                    )}
                    {p.website_url && (
                      <a
                        href={p.website_url}
                        target="_blank"
                        rel="nofollow noopener noreferrer"
                        className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-800 hover:border-green-700"
                      >
                        🌐 Web
                      </a>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-xs text-neutral-500">
                    {primaryListingHref ? (
                      <Link
                        href={primaryListingHref}
                        className="font-medium text-neutral-700 hover:text-green-800 hover:underline"
                      >
                        Get quote / listing →
                      </Link>
                    ) : (
                      <span>
                        {p.active_listings_count} active listing
                        {p.active_listings_count === 1 ? "" : "s"}
                      </span>
                    )}
                    <Link
                      href={`/profile/${p.profile_id}`}
                      className="font-bold text-green-800 hover:underline"
                    >
                      Profile &amp; Vouch →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

