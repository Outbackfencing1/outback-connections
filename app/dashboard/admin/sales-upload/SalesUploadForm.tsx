"use client";

import { useState } from "react";
import { parseSalesCsv, type SalesParse } from "@/lib/sales-upload";
import { formatAud } from "@/lib/sale";
import { uploadSalesRows } from "./actions";

export default function SalesUploadForm() {
  const [parsed, setParsed] = useState<SalesParse | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFile(f: File) {
    setMessage(null);
    setFileName(f.name);
    const text = await f.text();
    setParsed(parseSalesCsv(text));
  }

  async function upload() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    setMessage(null);
    const res = await uploadSalesRows(parsed.rows);
    setBusy(false);
    if (res.ok) {
      setMessage(`Uploaded ${res.upserted} month-by-postcode rows. The demand report has them now.`);
      setParsed(null);
    } else {
      setMessage(res.message);
    }
  }

  const months = parsed ? Array.from(new Set(parsed.rows.map((r) => r.month.slice(0, 7)))).sort() : [];

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm">
        <span className="font-medium text-neutral-800">Choose the CSV</span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="mt-2 block text-sm"
        />
      </label>

      {parsed && (
        <div className={`rounded-xl border p-4 text-sm ${parsed.format === "unknown" ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
          <p className="font-semibold">
            {fileName}: {parsed.format === "unknown" ? "not recognised" : `${parsed.rows.length} month-by-postcode rows`}
          </p>
          {parsed.format !== "unknown" && (
            <ul className="mt-2 space-y-0.5 text-xs">
              <li>Orders: {parsed.orders.toLocaleString("en-AU")}</li>
              <li>Revenue: {formatAud(parsed.revenue_cents, { whole: true })}</li>
              <li>Months: {months.length > 0 ? `${months[0]} to ${months[months.length - 1]} (${months.length})` : "none"}</li>
            </ul>
          )}
          {parsed.notes.map((n, i) => (
            <p key={i} className="mt-1 text-xs">
              {n}
            </p>
          ))}
          {parsed.rows.length > 0 && (
            <button
              type="button"
              onClick={upload}
              disabled={busy}
              className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
            >
              {busy ? "Uploading…" : `Upload ${parsed.rows.length} rows`}
            </button>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
          {message}
        </p>
      )}
    </div>
  );
}
