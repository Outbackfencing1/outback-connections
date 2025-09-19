"use client";

import { signIn, signOut } from "next-auth/react";

export default function AuthButtons({ isAuthed }: { isAuthed: boolean }) {
  if (isAuthed) {
    return (
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-xl border px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-50"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      className="rounded-xl border px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-neutral-50"
    >
      Sign in
    </button>
  );
}
