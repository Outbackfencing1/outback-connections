"use client";

import { useState, useTransition } from "react";
import {
  previewImport,
  commitImport,
  type PreviewResult,
  type PreviewRow,
} from "./actions";

type Ok = Extract<PreviewResult, { ok: true }>;

export default function ImportPreviewForm() {
  const [json, setJson] = useState("");
  const [preview, setPreview] = useState<Ok | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [committing, setCommitting] = useState(false);

  function doPreview() {
    setError(null);
    setCommitted(null);
    setPreview(null);
    startPreview(async () => {
      const res = await previewImport(json);
      if (res.ok) setPreview(res);
      else setError(res.message);
    });
  }

  async function doCommit() {
    if (!preview) return;
    const ok = window.confirm(
      `Import ${preview.summary.valid} valid row(s) now?\n\nThis writes scraped, UNCLAIMED listings to the LIVE marketplace. Invalid rows are skipped.`
    );
    if (!ok) return;
    setCommitting(true);
    setError(null);
    const res = await commitImport(json);
    setCommitting(false);
    if (res.ok)
      setCommitted(
        `Imported: ${res.created} created, ${res.updated} updated, ${res.skipped} skipped, ${res.failed} failed (of ${res.total}).`
      );
    else setError(res.message);
  }

  return (
    <div className="mt-6">
      <label className="block text-sm font-medium text-neutral-800">
        Paste the import batch (JSON array of records from the scrape script)
      </label>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        rows={10}
        spellCheck={false}
        placeholder='[{"vertical":"job","source_platform":"google_maps","source_external_id":"...","source_url":"...","name":"...","category_slug":"station-hand","postcode":"2800","suburb":"Orange","state":"NSW"}]'
        className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={doPreview}
          disabled={previewing || !json.trim()}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {previewing ? "Previewing…" : "Preview (no writes)"}
        </button>
        {preview && preview.summary.valid > 0 && (
          <button
            type="button"
            onClick={doCommit}
            disabled={committing}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {committing ? "Importing…" : `Commit ${preview.summary.valid} valid row(s)`}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {committed && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
          {committed}
        </div>
      )}

      {preview && (
        <div className="mt-6">
          <Summary s={preview.summary} />
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Vertical</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {preview.rows.map((r, i) => (
                  <Row key={i} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Nothing has been written. Review the table, then commit the valid rows.
            Every imported listing is <strong>scraped / unclaimed</strong> and shown
            that way publicly.
          </p>
        </div>
      )}
    </div>
  );
}

function Summary({ s }: { s: Ok["summary"] }) {
  const chip = (label: string, n: number, cls: string) => (
    <span className={`rounded px-2 py-1 text-xs font-medium ${cls}`}>
      {label}: {n}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-2">
      {chip("Total", s.total, "bg-neutral-100 text-neutral-800")}
      {chip("Valid", s.valid, "bg-green-100 text-green-800")}
      {chip("Invalid", s.invalid, s.invalid > 0 ? "bg-red-100 text-red-800" : "bg-neutral-100 text-neutral-600")}
      {chip("Would create", s.would_create, "bg-blue-100 text-blue-800")}
      {chip("Would update", s.would_update, "bg-amber-100 text-amber-800")}
      {chip("Batch dupes", s.intra_batch_duplicates, s.intra_batch_duplicates > 0 ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600")}
    </div>
  );
}

function Row({ r }: { r: PreviewRow }) {
  return (
    <tr className={r.valid ? "" : "bg-red-50"}>
      <td className="px-3 py-2 font-medium text-neutral-900">{r.name ?? "—"}</td>
      <td className="px-3 py-2 text-neutral-700">
        {r.vertical ?? "—"}
        {r.side ? <span className="text-neutral-400"> · {r.side}</span> : null}
      </td>
      <td className="px-3 py-2 text-neutral-700">
        {r.category_label ?? r.category_resolved ?? "—"}
        {r.category_input && r.category_resolved && r.category_input !== r.category_resolved ? (
          <span className="text-amber-700"> (from “{r.category_input}”)</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-neutral-700">
        {[r.postcode, r.state].filter(Boolean).join(" ")}
      </td>
      <td className="px-3 py-2">
        {!r.valid ? (
          <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">skip (invalid)</span>
        ) : r.listing_action === "would_create" ? (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">create</span>
        ) : (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">update</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {r.errors.map((e, i) => (
          <div key={`e${i}`} className="text-red-700">• {e}</div>
        ))}
        {r.warnings.map((w, i) => (
          <div key={`w${i}`} className="text-amber-700">⚠ {w}</div>
        ))}
        {r.errors.length === 0 && r.warnings.length === 0 ? <span className="text-neutral-400">—</span> : null}
      </td>
    </tr>
  );
}
