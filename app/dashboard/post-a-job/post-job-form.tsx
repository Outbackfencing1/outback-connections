// app/dashboard/post-a-job/post-job-form.tsx
"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";

export default function PostJobForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    title: "",
    description: "",
    location: "",
    budget: "",
    category: "",
    contactName: "",
    contactEmail: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: any) =>
    setForm(prev => ({ ...prev, [k]: v }));

  async function submit() {
    start(async () => {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          budget: form.budget ? Number(form.budget) : null,
        }),
      });
      if (!res.ok) {
        const msg = await res.text();
        alert(`Failed: ${msg}`);
        return;
      }
      router.push("/dashboard");
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
    >
      <Field label="Title"><input className="border rounded p-2 w-full" required value={form.title} onChange={e=>set("title", e.target.value)}/></Field>
      <Field label="Description"><textarea className="border rounded p-2 w-full min-h-28" required value={form.description} onChange={e=>set("description", e.target.value)}/></Field>
      <Field label="Location"><input className="border rounded p-2 w-full" required value={form.location} onChange={e=>set("location", e.target.value)}/></Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Budget (optional)"><input className="border rounded p-2 w-full" type="number" value={form.budget} onChange={e=>set("budget", e.target.value)}/></Field>
        <Field label="Category (optional)"><input className="border rounded p-2 w-full" value={form.category} onChange={e=>set("category", e.target.value)}/></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Contact name"><input className="border rounded p-2 w-full" value={form.contactName} onChange={e=>set("contactName", e.target.value)}/></Field>
        <Field label="Contact email"><input className="border rounded p-2 w-full" type="email" value={form.contactEmail} onChange={e=>set("contactEmail", e.target.value)}/></Field>
      </div>
      <button disabled={pending} className="rounded-2xl border px-4 py-2 hover:shadow disabled:opacity-60">
        {pending ? "Posting…" : "Post job"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-sm font-medium">{label}</span>{children}</label>;
}
