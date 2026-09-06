import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkPostingGuard } from "@/lib/posting";
import PostSaleForm from "@/components/posting/PostSaleForm";
import { postForSale } from "./actions";

export const metadata = {
  title: "Sell hay, stock or gear — Outback Connections",
  description:
    "List livestock, hay, grain, machinery or gear for sale. Free, no commission, buyers contact you directly.",
};

export const dynamic = "force-dynamic";

export default async function PostSalePage() {
  const guard = await checkPostingGuard();
  if (!guard.ok && guard.reason === "not_signed_in") {
    redirect("/signin?next=/post/sale");
  }
  if (!guard.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Sell something</h1>
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
    .eq("pillar", "sale")
    .eq("active", true)
    .order("sort_order");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Sell hay, stock or gear</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Livestock, hay, grain, machinery, a trailer, fencing steel. Post it once and it stays
        findable. Free, no commission, buyers contact you directly.
      </p>

      <div className="mt-8">
        <PostSaleForm categories={cats ?? []} action={postForSale} />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/post" className="underline">
          ← Back to post hub
        </Link>
      </p>
    </div>
  );
}
