"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  getOutreachHistory,
  recordOutreach,
  type OutreachHistoryRow,
  type RecordOutreachInput,
} from "./actions";

export const OUTREACH_STATUSES = [
  { value: "not_contacted", label: "Not contacted" },
  { value: "attempted", label: "Attempted" },
  { value: "contacted", label: "Contacted" },
  { value: "interested", label: "Interested" },
  { value: "invite_sent", label: "Invite sent" },
  { value: "follow_up", label: "Follow up" },
  { value: "joined", label: "Joined" },
  { value: "not_interested", label: "Not interested" },
  { value: "invalid_duplicate", label: "Invalid / duplicate" },
  { value: "do_not_contact", label: "Do not contact" },
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]["value"];
type ContactMethod = "phone" | "email" | "sms" | "whatsapp";

type Props = {
  businessId: string;
  businessName: string;
  email: string | null;
  phone: string | null;
  invitationUrl: string;
  hasClaimableListing: boolean;
  status: OutreachStatus;
  assignedTo: string | null;
  assignedName: string | null;
  nextFollowUpAt: string | null;
  assignees: string[];
};

export default function OutreachRowActions({
  businessId,
  businessName,
  email,
  phone,
  invitationUrl,
  hasClaimableListing,
  status: initialStatus,
  assignedTo,
  assignedName,
  nextFollowUpAt,
  assignees,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<OutreachStatus>(initialStatus);
  const [assignee, setAssignee] = useState(assignedName || "Ali");
  const [followUp, setFollowUp] = useState(toLocalInput(nextFollowUpAt));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [history, setHistory] = useState<OutreachHistoryRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const invitationText = useMemo(
    () => buildInvitationText(businessName, invitationUrl, hasClaimableListing),
    [businessName, invitationUrl, hasClaimableListing]
  );
  const emailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent("Free fencing contractor profile on Outback Connections")}&body=${encodeURIComponent(invitationText)}`
    : null;
  const smsHref = phone
    ? `sms:${phone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(invitationText)}`
    : null;
  const whatsappNumber = phone ? toWhatsAppNumber(phone) : null;
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(invitationText)}`
    : null;
  // Honour both the persisted state and an unsaved terminal selection. This
  // prevents a stale server prop (or merely changing the select away from a
  // terminal state) from re-enabling contact actions before the status write
  // has actually succeeded and refreshed the row.
  const contactDisabled = [initialStatus, status].some((value) =>
    value === "do_not_contact" || value === "invalid_duplicate"
  );

  async function runMany(
    inputs: Array<Omit<RecordOutreachInput, "businessId">>,
    successMessage?: string
  ) {
    setBusy(true);
    setMessage(null);
    for (const input of inputs) {
      const result = await recordOutreach({ businessId, ...input });
      if (!result.ok) {
        setBusy(false);
        setMessageOk(false);
        setMessage(result.message);
        return false;
      }
    }
    setBusy(false);
    setMessageOk(true);
    setMessage(successMessage || "Saved.");
    router.refresh();
    return true;
  }

  async function logContact(method: ContactMethod) {
    const nextStatus = status === "not_contacted" ? "attempted" : status;
    const action =
      method === "phone"
        ? "called"
        : method === "email"
          ? "emailed"
          : method;
    const inputs: Array<Omit<RecordOutreachInput, "businessId">> = [];
    if (!assignedTo) {
      inputs.push({
        action: "assigned",
        contactMethod: null,
        status: null,
        note: null,
        nextFollowUpAt: null,
        assignedTo: assignee.trim() || "Ali",
      });
    }
    inputs.push({
        action,
        contactMethod: method,
        status: nextStatus,
        note: null,
        nextFollowUpAt: null,
        assignedTo: null,
      });
    if (await runMany(inputs, "Contact recorded.")) {
      setStatus(nextStatus);
    }
  }

  async function markStatus(nextStatus: OutreachStatus) {
    if (
      nextStatus === "do_not_contact" &&
      !window.confirm(`Mark ${businessName} as do not contact?`)
    ) {
      return;
    }
    if (
      await runMany([{
        action: nextStatus === "joined" ? "joined" : "status_changed",
        contactMethod: null,
        status: nextStatus,
        note: null,
        nextFollowUpAt: null,
        assignedTo: null,
      }], "Status updated.")
    ) {
      setStatus(nextStatus);
    }
  }

  async function saveDetails() {
    if (
      (status === "do_not_contact" || status === "invalid_duplicate") &&
      status !== initialStatus &&
      !window.confirm(
        status === "do_not_contact"
          ? `Mark ${businessName} as do not contact?`
          : `Mark ${businessName} as invalid / duplicate?`
      )
    ) {
      return;
    }
    const followUpIso = followUp ? new Date(followUp).toISOString() : null;
    const inputs: Array<Omit<RecordOutreachInput, "businessId">> = [];
    const cleanAssignee = assignee.trim();
    if (cleanAssignee !== (assignedTo || "")) {
      inputs.push({
        action: "assigned",
        contactMethod: null,
        status: null,
        note: null,
        nextFollowUpAt: null,
        assignedTo: cleanAssignee || null,
      });
    }
    if (followUp !== toLocalInput(nextFollowUpAt)) {
      inputs.push({
        action: "follow_up_set",
        contactMethod: null,
        status: null,
        note: null,
        nextFollowUpAt: followUpIso,
        assignedTo: null,
      });
    }
    if (note.trim()) {
      inputs.push({
        action: "note",
        contactMethod: null,
        status: null,
        note: note.trim(),
        nextFollowUpAt: null,
        assignedTo: null,
      });
    }
    if (status !== initialStatus) {
      inputs.push({
        action: status === "joined" ? "joined" : "status_changed",
        contactMethod: null,
        status,
        note: null,
        nextFollowUpAt: null,
        assignedTo: null,
      });
    }
    if (inputs.length === 0) {
      setMessageOk(true);
      setMessage("Nothing changed.");
      return;
    }
    const ok = await runMany(inputs, "Outreach details saved.");
    if (ok) setNote("");
  }

  async function copyInvitation() {
    const copied = await copyText(invitationText);
    setMessageOk(copied);
    setMessage(copied ? "Invitation copied." : "Couldn't copy — select and copy the text below.");
  }

  async function loadHistory() {
    if (history || historyBusy) return;
    setHistoryBusy(true);
    const result = await getOutreachHistory(businessId);
    setHistoryBusy(false);
    if (result.ok) setHistory(result.rows);
    else {
      setMessageOk(false);
      setMessage(result.message);
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={copyInvitation}
          disabled={contactDisabled}
          className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Copy invitation
        </button>
        {emailHref && !contactDisabled && (
          <a href={emailHref} className={secondaryButton}>Open email</a>
        )}
        {smsHref && !contactDisabled && (
          <a href={smsHref} className={secondaryButton}>Open SMS</a>
        )}
        {whatsappHref && !contactDisabled && (
          <a href={whatsappHref} target="_blank" rel="noreferrer" className={secondaryButton}>
            Open WhatsApp
          </a>
        )}
        {contactDisabled && (
          <span className="self-center text-[11px] font-medium text-red-700">
            Contact actions disabled
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-2">
        <button
          type="button"
          onClick={() => logContact("phone")}
          disabled={busy || contactDisabled || !phone}
          className={quickButton}
        >
          Mark called
        </button>
        <button
          type="button"
          onClick={() => logContact("email")}
          disabled={busy || contactDisabled || !email}
          className={quickButton}
        >
          Mark emailed
        </button>
        <button
          type="button"
          onClick={() => logContact("sms")}
          disabled={busy || contactDisabled || !phone}
          className={quickButton}
        >
          Mark SMS
        </button>
        <button
          type="button"
          onClick={() => logContact("whatsapp")}
          disabled={busy || contactDisabled || !phone}
          className={quickButton}
        >
          Mark WhatsApp
        </button>
        <button
          type="button"
          onClick={() => markStatus("invite_sent")}
          disabled={busy || contactDisabled}
          className={quickButton}
        >
          Mark invite sent
        </button>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        <summary className="cursor-pointer font-medium text-neutral-800">
          Note, status, follow-up & assignment
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label>
            <span className="block font-medium text-neutral-700">Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as OutreachStatus)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {OUTREACH_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-medium text-neutral-700">Assigned to</span>
            <input
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              list={`assignees-${businessId}`}
              maxLength={100}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            />
            <datalist id={`assignees-${businessId}`}>
              {assignees.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Next follow-up</span>
            <input
              type="datetime-local"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Add note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="What happened? Keep it short and useful."
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveDetails}
            disabled={busy}
            className="rounded bg-green-700 px-3 py-1.5 font-semibold text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save update"}
          </button>
          {status !== "joined" && (
            <button
              type="button"
              onClick={() => markStatus("joined")}
              disabled={busy}
              className={secondaryButton}
            >
              Mark joined
            </button>
          )}
          {status !== "do_not_contact" && (
            <button
              type="button"
              onClick={() => markStatus("do_not_contact")}
              disabled={busy}
              className="rounded border border-red-200 bg-white px-2 py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Do not contact
            </button>
          )}
        </div>
      </details>

      <details className="text-neutral-600">
        <summary className="cursor-pointer underline">Preview invitation text</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded border border-neutral-200 bg-white p-2 font-sans text-[11px] leading-relaxed">
          {invitationText}
        </pre>
      </details>

      <details className="text-neutral-600" onToggle={(event) => {
        if (event.currentTarget.open) void loadHistory();
      }}>
        <summary className="cursor-pointer underline">Contact history</summary>
        {historyBusy ? (
          <p className="mt-2">Loading…</p>
        ) : history && history.length > 0 ? (
          <ol className="mt-2 space-y-2 border-l border-neutral-200 pl-3">
            {history.map((event) => (
              <li key={event.id}>
                <p className="font-medium text-neutral-800">
                  {humanise(event.action)} · {formatHistoryDate(event.created_at)}
                </p>
                <p>
                  {event.contact_method ? `${humanise(event.contact_method)} · ` : ""}
                  {event.outreach_status ? humanise(event.outreach_status) : ""}
                  {event.assigned_to ? ` · assigned to ${event.assigned_to}` : ""}
                </p>
                {event.next_follow_up_at && (
                  <p>Follow-up: {formatHistoryDate(event.next_follow_up_at)}</p>
                )}
                {event.note && <p className="whitespace-pre-wrap">“{event.note}”</p>}
              </li>
            ))}
          </ol>
        ) : history ? (
          <p className="mt-2">No outreach history yet.</p>
        ) : null}
      </details>

      {message && (
        <p role="status" className={messageOk ? "text-green-800" : "text-red-700"}>
          {message}
        </p>
      )}
    </div>
  );
}

const secondaryButton =
  "inline-block rounded border border-neutral-300 bg-white px-2 py-1.5 font-medium text-neutral-800 hover:bg-neutral-50";
const quickButton =
  "rounded border border-green-200 bg-green-50 px-2 py-1.5 font-medium text-green-900 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-40";

function buildInvitationText(
  businessName: string,
  invitationUrl: string,
  hasClaimableListing: boolean
): string {
  const action = hasClaimableListing
    ? `We’ve added a free, unclaimed profile for ${businessName}. You can review the details and claim it here:\n${invitationUrl}`
    : `You’re invited to create a free contractor profile here:\n${invitationUrl}`;
  return `Hi ${businessName},

I’m Ali from Outback Connections. We’re building a free rural directory to help property owners and farmers find fencing contractors.

${action}

It’s free to join, there are no lead fees, and you can update your details. If the listing isn’t right for you, just let me know.

Thanks,
Ali
Outback Connections`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toWhatsAppNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `61${digits.slice(1)}`;
  return digits.length >= 9 ? digits : null;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function humanise(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
