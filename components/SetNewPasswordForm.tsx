"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePassword } from "@/app/signin/actions";

export default function SetNewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    start(async () => {
      const result = await updatePassword({ password });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(result.redirect ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-neutral-800"
        >
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-neutral-800"
        >
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-2"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !password || !confirm}
        className="inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
