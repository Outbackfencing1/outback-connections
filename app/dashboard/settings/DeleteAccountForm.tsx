"use client";
import { useState, useTransition } from "react";
import { deleteAccount } from "./actions";

type Props = {
  listingCount: number;
};

const REQUIRED_PHRASE = "delete my account";

export default function DeleteAccountForm({ listingCount }: Props) {
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const matches = phrase.trim().toLowerCase() === REQUIRED_PHRASE;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!matches) {
      setError(`Type "${REQUIRED_PHRASE}" exactly to confirm.`);
      return;
    }
    setError(null);
    start(async () => {
      const result = await deleteAccount();
      if (!result.ok) setError(result.message);
      // success → server action redirects to /
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-red-900">
        Type{" "}
        <span className="font-mono font-semibold">{REQUIRED_PHRASE}</span> to
        confirm.{listingCount > 0 && " Your listings will be deleted at the same time."}
      </p>
      <input
        type="text"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="block w-full rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-mono"
        placeholder={REQUIRED_PHRASE}
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!matches || pending}
        className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? "Deleting..." : "Delete account permanently"}
      </button>
    </form>
  );
}
