"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

const MESH_TYPES = [
  { label: "8/90/30 Hinge Joint", value: "8-90-30", rollLength: 100, pricePerRoll: 345 },
  { label: "7/90/30 Hinge Joint", value: "7-90-30", rollLength: 100, pricePerRoll: 365 },
  { label: "8/90/15 Hinge Joint", value: "8-90-15", rollLength: 100, pricePerRoll: 410 },
  { label: "8/115/30 Hinge Joint", value: "8-115-30", rollLength: 100, pricePerRoll: 380 },
  { label: "8/115/15 Hinge Joint", value: "8-115-15", rollLength: 100, pricePerRoll: 425 },
  { label: "8/80/15 Hinge Joint", value: "8-80-15", rollLength: 100, pricePerRoll: 440 },
] as const;

const POST_SPACINGS = [
  { label: "3m spacing", value: 3 },
  { label: "4m spacing", value: 4 },
  { label: "5m spacing", value: 5 },
] as const;

const PICKET_PRICE = 12.5; // per star picket

export function FencingCalculator() {
  const [length, setLength] = useState<string>("");
  const [meshIdx, setMeshIdx] = useState(0);
  const [spacingIdx, setSpacingIdx] = useState(1); // default 4m

  const mesh = MESH_TYPES[meshIdx];
  const spacing = POST_SPACINGS[spacingIdx];
  const lengthM = parseFloat(length) || 0;

  const result = useMemo(() => {
    if (lengthM <= 0) return null;
    const rolls = Math.ceil(lengthM / mesh.rollLength);
    const pickets = Math.ceil(lengthM / spacing.value) + 1;
    const meshCost = rolls * mesh.pricePerRoll;
    const picketCost = pickets * PICKET_PRICE;
    const total = meshCost + picketCost;
    return { rolls, pickets, meshCost, picketCost, total };
  }, [lengthM, mesh, spacing]);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-neutral-900 px-6 py-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-amber-500">Fencing Calculator</h2>
        <span className="text-xs text-neutral-400">Quick estimate</span>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Fence length */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">Fence Length (m)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              placeholder="e.g. 1000"
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>

          {/* Mesh type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">Mesh Type</label>
            <select
              value={meshIdx}
              onChange={(e) => setMeshIdx(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
            >
              {MESH_TYPES.map((m, i) => (
                <option key={m.value} value={i}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Post spacing */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">Post Spacing</label>
            <select
              value={spacingIdx}
              onChange={(e) => setSpacingIdx(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
            >
              {POST_SPACINGS.map((s, i) => (
                <option key={s.value} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        {result ? (
          <div className="mt-5 rounded-md border border-neutral-200 bg-neutral-50 p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <ResultItem label="Rolls needed" value={String(result.rolls)} sub={`${mesh.rollLength}m rolls`} />
              <ResultItem label="Pickets needed" value={String(result.pickets)} sub={`@ ${spacing.value}m`} />
              <ResultItem label="Mesh cost" value={`$${result.meshCost.toLocaleString()}`} sub={`@ $${mesh.pricePerRoll}/roll`} />
              <ResultItem
                label="Estimated total"
                value={`$${result.total.toLocaleString()}`}
                sub="Materials only"
                bold
              />
            </div>
            <div className="mt-4 flex gap-3">
              <Link
                href="/dashboard/post-a-job"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-400 transition shadow-sm"
              >
                Create Quote
              </Link>
              <button
                onClick={() => setLength("")}
                className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50 transition"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-400">
            Enter a fence length to see an instant estimate.
          </p>
        )}
      </div>
    </div>
  );
}

function ResultItem({ label, value, sub, bold }: { label: string; value: string; sub: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-lg ${bold ? "font-bold text-neutral-900" : "font-semibold text-neutral-800"}`}>
        {value}
      </p>
      <p className="text-xs text-neutral-400">{sub}</p>
    </div>
  );
}
