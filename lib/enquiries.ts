// lib/enquiries.ts
// Pure validation for a farmer's "get a quote" enquiry. No server imports so
// the same rules run in tests. The server action adds rate limiting, the
// honeypot drop, the write and the emails.

export type EnquiryInput = {
  name: string;
  email?: string;
  phone?: string;
  postcode?: string;
  message: string;
  consent: boolean;
  /** Honeypot. Real people never fill it. */
  website?: string;
};

export type EnquiryValue = {
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  message: string;
};

export type EnquiryValidation =
  | { ok: true; value: EnquiryValue; honeypot: boolean }
  | { ok: false; errors: Record<string, string> };

const t = (v: string | undefined | null): string => (v ?? "").trim();

export function validateEnquiry(input: EnquiryInput): EnquiryValidation {
  const errors: Record<string, string> = {};
  const name = t(input.name);
  const email = t(input.email);
  const phone = t(input.phone).replace(/\s+/g, " ");
  const postcode = t(input.postcode);
  const message = t(input.message);

  if (name.length < 2 || name.length > 80) errors.name = "Your name: 2 to 80 characters.";
  if (!email && !phone) errors.phone = "Give us a phone number or an email so they can reach you.";
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email)) errors.email = "That email doesn't look right.";
  if (phone && !/^[0-9 ()+-]{6,20}$/.test(phone)) errors.phone = "Phone: digits, spaces and brackets only.";
  if (postcode && !/^[0-9]{4}$/.test(postcode)) errors.postcode = "Postcode: 4 digits.";
  if (message.length < 10) errors.message = "Tell them a bit more: what, where, roughly when.";
  if (message.length > 2000) errors.message = "Keep it under 2000 characters.";
  if (!input.consent) errors.consent = "Tick the box so we can pass your details on.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    honeypot: t(input.website) !== "",
    value: {
      name,
      email: email || null,
      phone: phone || null,
      postcode: postcode || null,
      message,
    },
  };
}
