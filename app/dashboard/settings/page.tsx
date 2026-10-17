import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestTimestamp } from "@/lib/request-time";
import { signOut } from "../actions";
import DeleteAccountForm from "./DeleteAccountForm";
import TrustProfileForm from "./TrustProfileForm";

export const metadata = {
  title: "Settings & Trust Profile — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard/settings");

  const user = data.user;
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const now = await requestTimestamp();
  const ageDays = createdAt
    ? Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const [{ count: listingCount }, { data: profile }, { data: claimedBiz }] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("user_profiles")
      .select(
        "display_name, trading_name, suburb, postcode, bio, abn, abn_verified_at, contact_phone, contact_email, website_url, services_offered, photo_urls, insurances_held, role_tags, years_in_district, availability_status"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select(
        "id, trading_name, legal_name, suburb, postcode, bio, abn, contact_phone, contact_email, website_url, services_offered, photo_urls, insurances_held, role_tags, years_in_district, availability_status, claim_status"
      )
      .eq("claimed_by", user.id)
      .eq("status", "active")
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const initialTrustValues = {
    display_name: profile?.display_name ?? null,
    trading_name:
      profile?.trading_name ??
      claimedBiz?.trading_name ??
      claimedBiz?.legal_name ??
      null,
    suburb: profile?.suburb ?? claimedBiz?.suburb ?? null,
    postcode: profile?.postcode ?? claimedBiz?.postcode ?? null,
    bio: profile?.bio ?? claimedBiz?.bio ?? null,
    abn: profile?.abn ?? claimedBiz?.abn ?? null,
    abn_verified_at: profile?.abn_verified_at ?? null,
    contact_phone: profile?.contact_phone ?? claimedBiz?.contact_phone ?? null,
    contact_email: profile?.contact_email ?? claimedBiz?.contact_email ?? null,
    website_url: profile?.website_url ?? claimedBiz?.website_url ?? null,
    services_offered:
      Array.isArray(profile?.services_offered) && profile.services_offered.length > 0
        ? (profile.services_offered as string[])
        : Array.isArray(claimedBiz?.services_offered)
          ? (claimedBiz.services_offered as string[])
          : [],
    photo_urls:
      Array.isArray(profile?.photo_urls) && profile.photo_urls.length > 0
        ? (profile.photo_urls as string[])
        : Array.isArray(claimedBiz?.photo_urls)
          ? (claimedBiz.photo_urls as string[])
          : [],
    insurances_held:
      Array.isArray(profile?.insurances_held) && profile.insurances_held.length > 0
        ? (profile.insurances_held as string[])
        : Array.isArray(claimedBiz?.insurances_held)
          ? (claimedBiz.insurances_held as string[])
          : [],
    role_tags:
      Array.isArray(profile?.role_tags) && profile.role_tags.length > 0
        ? (profile.role_tags as string[])
        : Array.isArray(claimedBiz?.role_tags)
          ? (claimedBiz.role_tags as string[])
          : [],
    years_in_district:
      typeof profile?.years_in_district === "number"
        ? profile.years_in_district
        : typeof claimedBiz?.years_in_district === "number"
          ? claimedBiz.years_in_district
          : null,
    availability_status:
      profile?.availability_status ??
      claimedBiz?.availability_status ??
      "available",
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          Settings &amp; Trust Profile
        </h1>
        <Link
          href={`/profile/${user.id}`}
          className="rounded-lg border border-green-700 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100"
        >
          View my public profile &amp; reviews →
        </Link>
      </div>

      {claimedBiz ? (
        <div className="mt-5 rounded-xl border border-green-300 bg-green-50/80 p-4 text-xs text-green-950">
          <p className="font-bold">
            ✓ Linked Business Profile: {claimedBiz.trading_name || claimedBiz.legal_name}
          </p>
          <p className="mt-1 text-green-900">
            Changes you save below automatically update your public contractor profile, 1-click contact buttons, specialty chips, and work photo gallery.
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950">
          <p className="font-bold">Already listed in our rural directory?</p>
          <p className="mt-1">
            Search your business name on{" "}
            <Link href="/profiles" className="font-bold underline">
              Trusted Profiles &amp; Contractors
            </Link>{" "}
            and tap <strong>Claim this profile</strong> to link your existing directory card to your account.
          </p>
        </div>
      )}

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">
          Public Profile, Contact Details, Work Photos &amp; Verification Badges
        </h2>
        <p className="mt-1 text-xs text-neutral-600">
          Build trust with farmers, contractors, buyers and employers. Your direct phone/SMS, specialties, work photos, ABN badge, insurance badges, and reviews appear on your listings and public profile.
        </p>
        <TrustProfileForm initialValues={initialTrustValues} />
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Account</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600">Email</dt>
          <dd className="text-neutral-900">{user.email}</dd>

          <dt className="text-neutral-600">Email verified</dt>
          <dd className="text-neutral-900">
            {user.email_confirmed_at ? "Yes" : "No"}
          </dd>

          <dt className="text-neutral-600">Account age</dt>
          <dd className="text-neutral-900">
            {ageDays} day{ageDays === 1 ? "" : "s"}
          </dd>

          <dt className="text-neutral-600">Listings</dt>
          <dd className="text-neutral-900">{listingCount ?? 0}</dd>
        </dl>
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Sign out</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Sign out of this device. You can sign back in any time with a magic
          link.
        </p>
        <form action={signOut} className="mt-3">
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
          >
            Sign out
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
        <h2 className="text-sm font-semibold text-red-900">
          Delete my account
        </h2>
        <p className="mt-2 text-sm text-red-900">
          This deletes your account and all {listingCount ?? 0} of your
          listings immediately. It cannot be undone.
        </p>
        <div className="mt-3">
          <DeleteAccountForm listingCount={listingCount ?? 0} />
        </div>
      </section>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}

