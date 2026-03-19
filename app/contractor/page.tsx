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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            Contractor Dashboard
          </h1>
          <a
            href="/pricing"
            className="rounded-full border px-4 py-2 text-sm font-semibold hover:bg-neutral-50 transition"
          >
            Upgrade
          </a>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                active === t.id
                  ? 'bg-green-700 text-white shadow-sm'
                  : 'border hover:bg-neutral-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-6 rounded-xl border bg-neutral-50 p-5">
          {active === 'leads' && <LeadsView />}
          {active === 'jobs' && <JobsView />}
          {active === 'invoices' && <InvoicesView />}
          {active === 'profile' && <ProfileView />}
        </div>
      </div>
    </div>
  );
}

function LeadsView() {
  const mockLeads = [
    { id: 'LD-1201', title: 'Boundary fence — 3km hinge joint', location: 'Molong, NSW', value: '$14,500 est', type: 'Boundary' },
    { id: 'LD-1202', title: 'Cattle yard gate replacement', location: 'Forbes, NSW', value: '$2,400 est', type: 'Gates' },
    { id: 'LD-1203', title: 'Post driving — 200 star pickets', location: 'Dubbo, NSW', value: '$3,200 est', type: 'Posts' },
    { id: 'LD-1204', title: 'Electric fence install — 5 paddocks', location: 'Orange, NSW', value: '$4,800 est', type: 'Electric' },
  ];

  return (
    <div>
      <h2 className="text-lg font-bold text-neutral-900">Lead Inbox</h2>
      <p className="mt-1 text-sm text-neutral-600">New fencing jobs matching your service area.</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {mockLeads.map((l) => (
          <li key={l.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-semibold text-neutral-900">{l.title}</div>
              <span className="shrink-0 rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-xs font-medium text-green-800">
                {l.type}
              </span>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{l.location}</div>
            <div className="mt-2 text-sm font-semibold text-neutral-800">{l.value}</div>
            <div className="mt-3 flex gap-2">
              <button className="rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 transition">
                View Details
              </button>
              <button className="rounded-full bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800 transition">
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
      <h2 className="text-lg font-bold text-neutral-900">My Jobs</h2>
      <p className="mt-2 text-sm text-neutral-600">
        No active jobs yet. Accepted fencing jobs will appear here with milestones and progress tracking.
      </p>
    </div>
  );
}

function InvoicesView() {
  return (
    <div>
      <h2 className="text-lg font-bold text-neutral-900">Invoices</h2>
      <p className="mt-2 text-sm text-neutral-600">
        Generate and track invoices for completed fencing work.
      </p>
      <button className="mt-3 rounded-full border px-4 py-2 text-sm font-semibold hover:bg-neutral-50 transition">
        Create Invoice
      </button>
    </div>
  );
}

function ProfileView() {
  return (
    <div>
      <h2 className="text-lg font-bold text-neutral-900">Profile</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Your profile is visible to landholders looking for fencing contractors.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-700">Business Name</span>
          <input
            className="w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Smith Rural Fencing"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-700">Service Area</span>
          <input
            className="w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Central West NSW"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-neutral-700">Fencing Specialties</span>
          <input
            className="w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            placeholder="e.g. Hinge joint, post driving, cattle yards, electric"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-neutral-700">Bio</span>
          <textarea
            className="w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            rows={4}
            placeholder="Tell landholders about your fencing experience, equipment, and availability..."
          />
        </label>
      </div>
      <button className="mt-4 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 transition">
        Save Profile
      </button>
    </div>
  );
}
