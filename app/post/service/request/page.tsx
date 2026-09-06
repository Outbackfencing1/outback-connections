import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkPostingGuard } from "@/lib/posting";
import PostServiceForm from "@/components/posting/PostServiceForm";
import { postServiceRequest } from "./actions";

export const metadata = {
  title: "Request a service — Outback Connections",
  description:
    "Need a rural specialist for a one-off job? Post what you need and let providers reach out. Free.",
};

export const dynamic = "force-dynamic";

export default async function PostServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const wanted = typeof sp.category === "string" ? sp.category : "";
  const guard = await checkPostingGuard({ skipAccountAge: true });
  if (!guard.ok && guard.reason === "not_signed_in") {
    redirect("/signin?next=/post/service/request");
  }
  if (!guard.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Request a service</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Can&apos;t post yet</p>
          <p className="mt-2">{guard.message}</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/post" className="underline">
            ← Back to post hub
          </Link>
        </p>
      </div>
    );
  }

  const supa = createClient();
  const { data: cats } = await supa
    .from("categories")
    .select("id, slug, label")
    .eq("pillar", "services")
    .eq("active", true)
    .order("sort_order");
  const preselected = (cats ?? []).find((c) => c.slug === wanted);
  const isFencing = preselected?.slug === "fencing-contractor";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">
        {isFencing ? "Got a fencing job?" : "Request a service"}
      </h1>
      <p className="mt-2 text-sm text-neutral-700">
        {isFencing
          ? "Describe the fence: roughly how far, what type, where, and when. Fencing contractors listed in your region are told straight away, and anyone browsing can see it too."
          : "Need a bore pump fixed, a mob mustered, a drone spray? Describe the job and let providers come to you."}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Free. Your contact details are only shown to signed-in users. You can close it any time.
      </p>

      <div className="mt-8">
        <PostServiceForm
          categories={cats ?? []}
          action={postServiceRequest}
          mode="requesting"
          defaults={preselected ? { category_id: preselected.id } : undefined}
        />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/post" className="underline">
          ← Back to post hub
        </Link>
      </p>
    </div>
  );
}
