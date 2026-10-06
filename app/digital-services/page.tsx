// /digital-services — "Websites & digital tools". Additive page; the
// marketplace is unchanged. Off unless DIGITAL_SERVICES_PUBLIC=on, so merging
// the code does not publish the offer: Josh switches it on once the terms
// (seller, tax, payment destination) are confirmed.
import { notFound } from "next/navigation";
import { digitalServicesPublic } from "@/lib/digital-services/flags";
import { OFFERS } from "@/lib/digital-services/offer";
import DigitalServicesEnquiryForm from "./DigitalServicesEnquiryForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Websites & digital tools for service businesses — Outback Connections",
  description:
    "Template-based websites with a guided quote form, quote forms for existing sites, and managed care, for small service businesses.",
  alternates: { canonical: "/digital-services" },
};

export default function DigitalServicesPage() {
  if (!digitalServicesPublic()) notFound();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium text-green-800">Websites & digital tools</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Websites that turn visitors into clear quote requests</h1>
      <p className="mt-3 max-w-prose text-neutral-700">
        For small service businesses. A guided quote form asks your customers the questions you would
        ask on the phone, so you know the job before you call back.
      </p>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {OFFERS.map((o) => (
          <section key={o.key} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-neutral-900">{o.name}</h2>
            <p className="mt-1 text-2xl font-bold text-green-800">{o.price}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              {o.scope.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            {o.note && <p className="mt-3 text-xs text-neutral-600">{o.note}</p>}
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>
          Prices are in Australian dollars. The full scope, payment terms and any applicable tax are confirmed
          in writing before any work starts, and nothing is charged until you agree to them. Your domain and
          accounts stay in your name.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Tell us about your business</h2>
      <p className="mt-1 text-sm text-neutral-700">Josh replies personally. No obligation, and no sales list.</p>
      <div className="mt-4">
        <DigitalServicesEnquiryForm />
      </div>
    </div>
  );
}
