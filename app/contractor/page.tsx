'use client';
import { useState } from 'react';
import Link from 'next/link';

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
      <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neutral-900">
            Contractor Dashboard
          </h1>
          <a
            href="/pricing"
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
          >
            Upgrade
          </a>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                active === t.id
                  ? 'bg-[#2D5016] text-white'
                  : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-5">
          {active === 'leads' && <LeadsView />}
          {active === 'jobs' && <JobsView />}
          {active === 'invoices' && <InvoicesView />}
          {active === 'profile' && <ProfileView />}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, message, cta, href }: { title: string; message: string; cta?: string; href?: string }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center">
        <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5V6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v6.75m-19.5 0v5.25A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25v-5.25" />
        </svg>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{message}</p>
      {cta && href && (
        <Link
          href={href}
          className="mt-4 inline-block rounded-md bg-[#2D5016] px-4 py-2 text-sm font-semibold text-white hover:bg-[#234012] transition"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

function LeadsView() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Lead Inbox</h2>
      <EmptyState
        title="No leads yet"
        message="New fencing jobs matching your service area will appear here."
        cta="Browse Opportunities"
        href="/opportunities"
      />
    </div>
  );
}

function JobsView() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">My Jobs</h2>
      <EmptyState
        title="No active jobs"
        message="Accepted fencing jobs will appear here with milestones and progress tracking."
      />
    </div>
  );
}

function InvoicesView() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Invoices</h2>
      <EmptyState
        title="No invoices"
        message="Invoices for completed fencing work will appear here."
      />
    </div>
  );
}

function ProfileView() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Profile</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Your profile is visible to landholders looking for fencing contractors.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-700">Business Name</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D5016] focus:border-[#2D5016]"
            placeholder="e.g. Smith Rural Fencing"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-neutral-700">Service Area</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D5016] focus:border-[#2D5016]"
            placeholder="e.g. Central West NSW"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-neutral-700">Fencing Specialties</span>
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D5016] focus:border-[#2D5016]"
            placeholder="e.g. Hinge joint, post driving, cattle yards, electric"
          />
        </label>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-medium text-neutral-700">Bio</span>
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2D5016] focus:border-[#2D5016]"
            rows={4}
            placeholder="Tell landholders about your fencing experience, equipment, and availability..."
          />
        </label>
      </div>
      <button className="mt-4 rounded-md bg-[#2D5016] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#234012] transition">
        Save Profile
      </button>
    </div>
  );
}
