// app/choose-role/page.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRole } from "./setRoleAction";

export default function ChooseRolePage() {
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (role: "customer" | "contractor") =>
    start(async () => {
      const ok = await setRole(role);
      if (ok) router.replace(role === "customer" ? "/dashboard/post-a-job" : "/dashboard/opportunities");
      else alert("Could not save your role. Try again.");
    });

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Choose your role</h1>
      <div className="grid gap-4">
        <button disabled={pending} onClick={() => pick("customer")} className="rounded-2xl border p-4 text-left hover:shadow-lg disabled:opacity-60">
          <div className="text-lg font-medium">I’m a customer</div>
          <div className="text-sm text-neutral-600">Post a fencing job and hire contractors.</div>
        </button>
        <button disabled={pending} onClick={() => pick("contractor")} className="rounded-2xl border p-4 text-left hover:shadow-lg disabled:opacity-60">
          <div className="text-lg font-medium">I’m a contractor</div>
          <div className="text-sm text-neutral-600">Find nearby jobs and win work.</div>
        </button>
      </div>
    </main>
  );
}
