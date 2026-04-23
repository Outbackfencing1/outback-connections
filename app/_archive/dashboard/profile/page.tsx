import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Contractor profile – Outback Connections" };

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login?callbackUrl=/dashboard/profile");

  const role = cookies().get("fc_role")?.value as
    | "customer"
    | "contractor"
    | undefined;

  if (role !== "contractor") {
    redirect("/choose-role");
  }

  const email = session.user?.email;
  const supa = supabaseAdmin();

  let initial: Record<string, unknown> = {};

  if (supa && email) {
    const { data } = await supa
      .from("profiles")
      .select("*")
      .eq("user_email", email)
      .single();

    if (data) {
      initial = {
        handle: data.handle ?? "",
        company: data.company ?? "",
        abn: data.abn ?? "",
        serviceAreas: data.service_areas ?? [],
        skills: data.skills ?? [],
        rateType: data.rate_type ?? "",
        rateAmount: data.rate_amount ?? 0,
        licence: data.licence ?? "",
        insured: data.insured ?? false,
        insuranceExp: data.insurance_exp ?? "",
        bio: data.bio ?? "",
        portfolio: data.portfolio ?? [],
      };
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-bold tracking-tight">Contractor profile</h1>
      <p className="mt-2 text-neutral-600">
        Signed in as{" "}
        <span className="font-medium">{email ?? "unknown"}</span>.
      </p>

      {!supa ? (
        <div className="mt-6 rounded-xl border bg-amber-50 p-6">
          <h2 className="font-medium text-amber-800">Coming Soon</h2>
          <p className="mt-1 text-sm text-amber-700">
            Profile editing will be available once the database is connected.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <ProfileForm initial={initial} />
        </div>
      )}
    </div>
  );
}
