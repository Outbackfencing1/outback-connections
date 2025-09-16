'use client';
import { useState } from 'react';

const tabs = [
  { id: 'leads', label: 'Leads' },
  { id: 'jobs', label: 'My Jobs' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'profile', label: 'Profile' },
];

export default function ContractorDashboard() {
  const [active, setActive] = useState('leads');

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-green-800">
          OutbackConnections Dashboard
        </h1>
        <a
          href="/pricing"
          className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
        >
          Pricing
        </a>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              active === t.id
                ? 'bg-green-700 text-white'
                : 'border hover:bg-neutral-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-neutral-50 p-4">
        {active === 'leads' && <LeadsView />}
        {active === 'jobs' && <JobsView />}
        {active === 'invoices' && <InvoicesView />}
        {active === 'profile' && <ProfileView />}
      </div>
    </div>
  );
}

function LeadsView() {
  const mockLeads = [
    { id: 'LD-1201', title: 'Strainer assembly install', location: 'Molong, NSW', value: '$1,800 est' },
    { id: 'LD-1202', title: 'Boundary fencing repair', location: 'Forbes, NSW', value: '$2,400 est' },
  ];
  return (
    <div>
      <h2 className="text-lg font-bold">Lead Inbox</h2>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {mockLeads.map((l) => (
          <li key={l.id} className="rounded-xl border bg-white p-4">
            <div className="text-sm font-semibold">{l.title}</div>
            <div className="text-xs text-neutral-600">{l.location}</div>
            <div className="mt-2 text-sm">Value: {l.value}</div>
            <div className="mt-3 flex gap-2">
              <button className="rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-neutral-50">
                View
              </button>
              <button className="rounded-lg bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-800">
                Send Quote
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobsView() {
  return (
    <div>
      <h2 className="text-lg font-bold">My Jobs</h2>
      <p className="mt-2 text-sm text-neutral-700">
        No active jobs yet. Accepted jobs will appear here with milestones.
      </p>
    </div>
  );
}

function InvoicesView() {
  return (
    <div>
      <h2 className="text-lg font-bold">Invoices</h2>
      <p className="mt-2 text-sm text-neutral-700">
        Generate and track invoices for completed milestones.
      </p>
      <button className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-neutral-50">
        Create Invoice
      </button>
    </div>
  );
}

function ProfileView() {
  return (
    <div>
      <h2 className="text-lg font-bold">Profile</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-neutral-600">Business Name</span>
          <input
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-green-600"
            placeholder="Your Pty Ltd"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-neutral-600">Service Area</span>
          <input
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-green-600"
            placeholder="e.g. Central West NSW"
          />
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs text-neutral-600">Bio</span>
          <textarea
            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-green-600"
            rows={4}
            placeholder="Tell farmers about your experience..."
          />
        </label>
      </div>
      <button className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
        Save
      </button>
    </div>
  );
}
