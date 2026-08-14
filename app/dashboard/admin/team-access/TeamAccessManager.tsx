"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  grantOutreachAccess,
  revokeOutreachAccess,
} from "./actions";

export type OutreachStaffRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  granted_at: string;
  granted_by: string;
  revoked_at: string | null;
  updated_at: string;
};

type Message = { ok: boolean; text: string } | null;

export default function TeamAccessManager({
  staff,
}: {
  staff: OutreachStaffRow[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pending, startTransition] = useTransition();
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  function submitGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await grantOutreachAccess(email, displayName);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setEmail("");
        setDisplayName("");
        router.refresh();
      }
    });
  }

  function revoke(staffMember: OutreachStaffRow) {
    const name = staffMember.display_name || staffMember.email;
    if (!confirm(`Remove outreach access for ${name}?`)) return;

    setMessage(null);
    setWorkingUserId(staffMember.user_id);
    startTransition(async () => {
      const result = await revokeOutreachAccess(staffMember.email);
      setMessage({ ok: result.ok, text: result.message });
      setWorkingUserId(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">
          Grant outreach access
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Enter the email used for an existing Outback Connections account.
          This grants access to the outreach workspace only—it does not make
          the person an administrator. Their team name is private to outreach
          staff and is captured with each saved update.
        </p>

        <form onSubmit={submitGrant} className="mt-5 max-w-xl" noValidate>
          <label
            htmlFor="team-display-name"
            className="block text-sm font-medium text-neutral-800"
          >
            Team member name
          </label>
          <input
            id="team-display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Team member name"
            className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
          <label
            htmlFor="team-email"
            className="mt-4 block text-sm font-medium text-neutral-800"
          >
            Account email
          </label>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row">
            <input
              id="team-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@outbackfencingsupplies.com.au"
              className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || !email.trim() || displayName.trim().length < 2}
              className="rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 disabled:opacity-60"
            >
              {pending && !workingUserId ? "Granting…" : "Grant access"}
            </button>
          </div>
        </form>
      </section>

      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </p>
      )}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">Outreach team</h2>
          <p className="text-sm text-neutral-500">
            {staff.length} {staff.length === 1 ? "person" : "people"}
          </p>
        </div>

        {staff.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-7 text-center text-sm text-neutral-700">
            Nobody has outreach-only access yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {staff.map((staffMember) => (
              <li
                key={staffMember.user_id}
                className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-neutral-900">
                    {staffMember.display_name || staffMember.email}
                  </p>
                  {staffMember.display_name && (
                    <p className="truncate text-sm text-neutral-700">
                      {staffMember.email}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    Outreach access granted {formatGrantedAt(staffMember.granted_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(staffMember)}
                  disabled={pending}
                  className="self-start rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 sm:self-auto"
                >
                  {workingUserId === staffMember.user_id
                    ? "Removing…"
                    : "Remove access"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatGrantedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(date);
}
