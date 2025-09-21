"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { setRole } from "./setRoleAction";

export default function ChooseRoleClient() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(role: "customer" | "contractor") {
    setError(null);
    start(async () => {
      const { ok } = await setRole(role);
      if (ok) {
        router.replace(
          role === "customer"
            ? "/dashboard/post-a-job"
            : "/dashboard/opportunities"
        );
      } else {
        setError("Could not save your role. Try again.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Choose your role</h1>
      <p className="text-neutral-600 text-sm">
        Tell us how you want to use OutbackConnections.
      </p>

      <div className="grid gap-3">
        <button
          onClick={() => choose("customer")}
          disabled={pending}
          className="rounded-xl border px-4 py-3 text-left shadow-sm hover:bg-neutral-50 disabled:opacity-60"
        >
          <div className="font-semibold">I’m a customer</div>
          <div className="text-sm text-neutral-600">
            I want to post a job and get quotes.
          </div>
        </button>

        <button
          onClick={() => choose("contractor")}
          disabled={pending}
          className="rounded-xl border px-4 py-3 text-left shadow-sm hover:bg-neutral-50 disabled:opacity-60"
        >
          <div className="font-semibold">I’m a contractor</div>
          <div className="text-sm text-neutral-600">
            I want to find work and submit quotes.
          </div>
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
