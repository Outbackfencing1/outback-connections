"use client";

import { useState, useTransition } from "react";
import { saveProfile } from "./saveProfileAction";

export function ProfileForm({ initial }: { initial: any }) {
  const [form, setForm] = useState({
    company: initial.company ?? "",
    abn: initial.abn ?? "",
    serviceAreas: (initial.serviceAreas ?? []).join(","),
    skills: (initial.skills ?? []).join(","),
    rateType: initial.rateType ?? "",
    rateAmount: initial.rateAmount ?? 0,
    licence: initial.licence ?? "",
    insured: initial.insured ?? false,
    insuranceExp: initial.insuranceExp?.slice(0,10) ?? "",
    bio: initial.bio ?? "",
    portfolio: (initial.portfolio ?? []).join(","),
    handle: initial.user?.handle ?? "", // optional; we’ll pass from server if needed
  });
  const [pending, start] = useTransition();

  function update<K extends keyof typeof form>(k: K, v: any) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        start(async () => {
          const ok = await saveProfile({
            ...form,
          });
          alert(ok ? "Saved" : "Could not save");
        });
      }}
    >
      <div className="grid gap-3">
        <label className="font-medium">Public handle (for /c/handle)</label>
        <input className="border rounded p-2" value={form.handle} onChange={e=>update("handle", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} placeholder="e.g. orange-fencing-co" />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Company / Trading name</label>
        <input className="border rounded p-2" value={form.company} onChange={e=>update("company", e.target.value)} />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">ABN</label>
        <input className="border rounded p-2" value={form.abn} onChange={e=>update("abn", e.target.value)} />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Service areas (comma separated postcodes)</label>
        <input className="border rounded p-2" value={form.serviceAreas} onChange={e=>update("serviceAreas", e.target.value)} placeholder="2800, 2794, 2795" />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Skills (comma separated)</label>
        <input className="border rounded p-2" value={form.skills} onChange={e=>update("skills", e.target.value)} placeholder="hinge joint, plain wire, gates" />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Rate</label>
        <div className="flex gap-2">
          <select className="border rounded p-2" value={form.rateType} onChange={e=>update("rateType", e.target.value)}>
            <option value="">Select</option>
            <option value="hourly">Hourly</option>
            <option value="day">Day</option>
          </select>
          <input type="number" className="border rounded p-2 w-40" value={form.rateAmount} onChange={e=>update("rateAmount", Number(e.target.value))} />
        </div>
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Licence #</label>
        <input className="border rounded p-2" value={form.licence} onChange={e=>update("licence", e.target.value)} />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Insurance</label>
        <div className="flex items-center gap-3">
          <input type="checkbox" checked={form.insured} onChange={e=>update("insured", e.target.checked)} />
          <span>Insured</span>
          <input type="date" className="border rounded p-2" value={form.insuranceExp} onChange={e=>update("insuranceExp", e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3">
        <label className="font-medium">About / Bio</label>
        <textarea className="border rounded p-2 min-h-28" value={form.bio} onChange={e=>update("bio", e.target.value)} />
      </div>

      <div className="grid gap-3">
        <label className="font-medium">Portfolio image URLs (comma separated)</label>
        <textarea className="border rounded p-2 min-h-20" value={form.portfolio} onChange={e=>update("portfolio", e.target.value)} placeholder="https://... , https://..." />
      </div>

      <button disabled={pending} className="rounded-2xl border px-4 py-2 hover:shadow disabled:opacity-60">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
