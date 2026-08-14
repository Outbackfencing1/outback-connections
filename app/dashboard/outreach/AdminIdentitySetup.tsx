"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOwnAdminOutreachIdentity } from "./actions";

export default function AdminIdentitySetup() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await setOwnAdminOutreachIdentity(displayName);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950 shadow-sm">
      <h2 className="text-lg font-bold">Set your outreach name</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed">
        Enter the name the team should see beside your calls, emails, notes, and
        follow-ups. It is kept private to the outreach team and saved with each update.
      </p>
      <form onSubmit={submit} className="mt-5 max-w-lg" noValidate>
        <label htmlFor="admin-outreach-name" className="block text-sm font-semibold">
          Your name
        </label>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row">
          <input
            id="admin-outreach-name"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Alex Morgan"
            className="min-w-0 flex-1 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-neutral-950"
          />
          <button
            type="submit"
            disabled={pending || displayName.trim().length < 2}
            className="rounded-xl bg-blue-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-3 rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
