'use client';

import React, { useState } from 'react';

type GeoPoint = { type: 'Point'; coordinates: [number, number] };

type JobFormProps = {
  MapComponent: React.ComponentType<{ onSelect?: (lat: number, lng: number) => void }>;
  onSubmit: (formData: {
    jobType: string;
    otherJobType?: string;
    description: string;
    postcode: string;
    state: string;
    contactName: string;
    phone: string;
    email: string;
    geojson: GeoPoint | null;
  }) => void;
};

/** ── Job catalog (easy to edit/expand) ───────────────────────────────── */
const JOB_CATALOG: { group: string; options: string[] }[] = [
  {
    group: 'Fencing',
    options: [
      'Rural fencing (plain/barb)',
      'Post & rail',
      'Colorbond fencing',
      'Timber paling',
      'Chain wire / security',
      'Gates (install/repair)',
      'Stock yards / panels',
      'Electric fencing',
      'Pool fencing',
    ],
  },
  {
    group: 'Irrigation & Water',
    options: [
      'Irrigation install/repair',
      'Water troughs / lines',
      'Bore / pump install',
      'Solar pump',
      'Windmill repair',
      'Tank install',
      'Trenching for services',
    ],
  },
  {
    group: 'Earthworks & Civil',
    options: [
      'Earthmoving / bobcat',
      'Driveways / farm tracks',
      'Retaining walls',
      'Dam desilting / repair',
      'Drainage works',
      'Post hole digging',
      'Slashing / weed control',
    ],
  },
  {
    group: 'Sheds & Structures',
    options: [
      'Shed build (kit/steel)',
      'Shearing shed works',
      'Pergola / carport',
      'Paddock shelter',
      'Concrete slab / footings',
      'Welding / fabrication',
    ],
  },
  {
    group: 'Power & Services',
    options: [
      'Electrical trenching',
      'Conduit / pits',
      'Generator setup',
      'Solar mounting (non-electrical)',
    ],
  },
  {
    group: 'General Farm Work',
    options: [
      'Handyman / maintenance',
      'Carpentry',
      'Roofing / gutters',
      'Tree removal / pruning',
      'Rubbish removal',
      'Harvest / seasonal labour',
    ],
  },
];

export default function JobForm({ MapComponent, onSubmit }: JobFormProps) {
  const [formData, setFormData] = useState({
    jobType: 'Fencing',        // initial value shown at top
    otherJobType: '',
    description: '',
    postcode: '',
    state: 'NSW',
    contactName: '',
    phone: '',
    email: '',
    geojson: null as GeoPoint | null,
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Job details */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Job Type</label>
          <select
            name="jobType"
            value={formData.jobType}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
          >
            {/* Quick picks at the very top */}
            <option value="Fencing">Fencing</option>
            <option value="Sheds">Sheds</option>
            <option value="Irrigation">Irrigation</option>

            {/* Full catalog, grouped */}
            {JOB_CATALOG.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.options.map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </optgroup>
            ))}

            <option value="Other">Other (describe)</option>
          </select>
        </div>

        {/* Show when "Other" is chosen */}
        {formData.jobType === 'Other' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Other job type</label>
            <input
              name="otherJobType"
              value={formData.otherJobType}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
              placeholder="e.g. vineyard trellis, stock grid install…"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Job Description</label>
          <textarea
            name="description"
            rows={4}
            value={formData.description}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
            placeholder="Tell us what needs doing…"
            required
          />
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Location</h3>
        <div className="h-96 rounded-lg border border-gray-300 overflow-hidden">
          <MapComponent
            onSelect={(lat, lng) =>
              setFormData(prev => ({
                ...prev,
                // GeoJSON order is [lng, lat]
                geojson: { type: 'Point', coordinates: [lng, lat] },
              }))
            }
          />
        </div>

        {formData.geojson && (
          <p className="text-sm text-gray-600">
            Selected:&nbsp;
            <span className="font-medium">
              lat {formData.geojson.coordinates[1].toFixed(5)}
            </span>
            ,&nbsp;
            <span className="font-medium">
              lng {formData.geojson.coordinates[0].toFixed(5)}
            </span>
          </p>
        )}
      </div>

      {/* Contact */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Your Contact Details</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700">Full Name</label>
          <input
            name="contactName"
            value={formData.contactName}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
            placeholder="Jane Doe"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
            placeholder="04xx xxx xxx"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
            placeholder="you@example.com"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Postcode</label>
            <input
              name="postcode"
              value={formData.postcode}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
              placeholder="2000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">State</label>
            <select
              name="state"
              value={formData.state}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:outline-none"
            >
              <option value="NSW">NSW</option>
              <option value="VIC">VIC</option>
              <option value="QLD">QLD</option>
              <option value="SA">SA</option>
              <option value="WA">WA</option>
              <option value="TAS">TAS</option>
              <option value="NT">NT</option>
              <option value="ACT">ACT</option>
            </select>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="px-6 py-3 bg-[#0b6e3d] text-white rounded-lg shadow hover:bg-[#095a31]"
      >
        Submit Job
      </button>
    </form>
  );
}
