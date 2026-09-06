"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateEnquiry } from "./actions";

type Via = "phone" | "sms" | "email" | "whatsapp" | "other";

export default function EnquiryRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [via, setVia] = useState<Via>("phone");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(next: "new" | "forwarded" | "closed" | "spam") {
    if (next === "spam" && !window.confirm("Mark as spam? It drops out of the queue and the metrics.")) return;
    setBusy(true);
    setMsg(null);
    const res = await updateEnquiry({ id, status: next, via: next === "forwarded" ? via : null, note: note || null });
    setBusy(false);
    setMsg(res.message);
    if (res.ok) {
      setNote("");
      router.refresh();
    }
  }

  const btn =
    "rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {status !== "forwarded" && status !== "closed" && (
        <>
          <select
            value={via}
            onChange={(e) => setVia(e.target.value as Via)}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5"
            aria-label="Forwarded via"
          >
            <option value="phone">by phone</option>
            <option value="sms">by SMS</option>
            <option value="email">by email</option>
            <option value="whatsapp">by WhatsApp</option>
            <option value="other">other</option>
          </select>
          <button type="button" disabled={busy} onClick={() => run("forwarded")} className={`${btn} bg-green-700 text-white hover:bg-green-800`}>
            Mark forwarded
          </button>
        </>
      )}
      {status !== "closed" && (
        <button type="button" disabled={busy} onClick={() => run("closed")} className={`${btn} border border-neutral-300 text-neutral-700 hover:bg-neutral-50`}>
          Close
        </button>
      )}
      {status === "closed" && (
        <button type="button" disabled={busy} onClick={() => run("new")} className={`${btn} border border-neutral-300 text-neutral-700 hover:bg-neutral-50`}>
          Reopen
        </button>
      )}
      {status !== "spam" && (
        <button type="button" disabled={busy} onClick={() => run("spam")} className={`${btn} border border-red-200 text-red-700 hover:bg-red-50`}>
          Spam
        </button>
      )}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        maxLength={2000}
        className="min-w-[12rem] flex-1 rounded border border-neutral-300 bg-white px-2 py-1.5"
      />
      {msg && <span className="text-neutral-700">{msg}</span>}
    </div>
  );
}
