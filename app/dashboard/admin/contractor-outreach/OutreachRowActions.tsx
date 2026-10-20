"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  getOutreachHistory,
  recordOutreach,
  sendClaimInvite,
  type OutreachHistoryRow,
  type RecordOutreachInput,
} from "./actions";
import {
  CUSTOMER_FIT_OPTIONS,
  DARYL_HANDOFF_STATES,
  HUB_TASK_STATES,
  MARKETING_CONSENT_OPTIONS,
  mergeDurableOutreachMeta,
  OUTREACH_STATUSES,
  parseSalesMetaFromNote,
  RELEVANT_PRODUCT_OPTIONS,
  SALES_STAGES,
  type DarylHandoffState,
  type HubTaskState,
  type MarketingConsentStatus,
  type OutreachStatus,
  type SalesStage,
} from "@/lib/outreach-statuses";

type ContactMethod = "phone" | "email" | "sms" | "whatsapp";
type MessageTemplateKind = "directory_only" | "enquiry_handoff" | "follow_up";

type Props = {
  businessId: string;
  businessName: string;
  suburb?: string | null;
  email: string | null;
  phone: string | null;
  invitationUrl: string;
  hasClaimableListing: boolean;
  status: OutreachStatus;
  assignedTo: string | null;
  assignedName: string | null;
  nextFollowUpAt: string | null;
  latestNote?: string | null;
  assignees: string[];
};

export default function OutreachRowActions({
  businessId,
  businessName,
  suburb,
  email,
  phone,
  invitationUrl,
  hasClaimableListing,
  status: initialStatus,
  assignedTo,
  assignedName,
  nextFollowUpAt,
  latestNote,
  assignees,
}: Props) {
  const router = useRouter();
  const parsedMeta = useMemo(
    () => parseSalesMetaFromNote(latestNote, initialStatus),
    [latestNote, initialStatus]
  );

  const [status, setStatus] = useState<OutreachStatus>(initialStatus);
  const [salesStage, setSalesStage] = useState<SalesStage>(
    parsedMeta.stage ?? "Ready for outreach"
  );
  const [taskState, setTaskState] = useState<HubTaskState>(
    parsedMeta.taskState ?? "Ready"
  );
  const [darylHandoff, setDarylHandoff] = useState<DarylHandoffState>(
    parsedMeta.darylHandoff ?? "none"
  );
  const [customerFit, setCustomerFit] = useState<string>(
    parsedMeta.customerFit ?? CUSTOMER_FIT_OPTIONS[0]
  );
  const [relevantProduct, setRelevantProduct] = useState<string>(
    parsedMeta.relevantProduct ?? RELEVANT_PRODUCT_OPTIONS[0]
  );
  const [consent, setConsent] = useState<MarketingConsentStatus>(
    parsedMeta.consent ?? "directory_research_only"
  );
  const [nextAction, setNextAction] = useState<string>(parsedMeta.nextAction ?? "");
  // Reconciled first-touch rule: Free directory claim support is default; never bundle
  // an unsolicited product pitch merely because a business is in the directory.
  const [templateKind, setTemplateKind] =
    useState<MessageTemplateKind>("directory_only");
  const [assignee, setAssignee] = useState(assignedName || "Ali");
  const [followUp, setFollowUp] = useState(toLocalInput(nextFollowUpAt));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [history, setHistory] = useState<OutreachHistoryRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);

  const invitationText = useMemo(
    () =>
      buildOutreachMessage({
        kind: templateKind,
        businessName,
        suburb: suburb ?? null,
        invitationUrl,
        hasClaimableListing,
        relevantProduct,
      }),
    [templateKind, businessName, suburb, invitationUrl, hasClaimableListing, relevantProduct]
  );
  const emailSubject = useMemo(() => {
    if (templateKind === "enquiry_handoff") {
      return `Product enquiry handoff for Daryl — ${businessName}`;
    }
    if (templateKind === "follow_up") {
      return `Following up your Outback Connections profile — ${businessName}`;
    }
    return `Free rural profile for ${businessName} on Outback Connections`;
  }, [templateKind, businessName]);

  const emailHref = email
    ? `mailto:${email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(invitationText)}`
    : null;
  const smsHref = phone
    ? `sms:${phone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(invitationText)}`
    : null;
  const whatsappNumber = phone ? toWhatsAppNumber(phone) : null;
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(invitationText)}`
    : null;
  const contactDisabled =
    consent === "do_not_contact" ||
    [initialStatus, status].some(
      (value) => value === "do_not_contact" || value === "invalid_duplicate"
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
    const nextStatus = status === "not_contacted" ? "contacted" : status;
    const nextStage: SalesStage =
      salesStage === "Research" || salesStage === "Ready for outreach"
        ? "Contacted"
        : salesStage;
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
    const structuredNote = mergeDurableOutreachMeta(
      latestNote,
      {
        stage: nextStage,
        taskState: "In progress",
        darylHandoff,
        customerFit,
        relevantProduct,
        consent: consent === "directory_research_only" ? "prospective_1to1" : consent,
        nextAction: nextAction || "Check claim/response in 5 business days",
        note: note.trim() || `Contacted via ${method}.`,
      },
      nextStatus
    );
    inputs.push({
      action,
      contactMethod: method,
      status: nextStatus,
      note: structuredNote,
      nextFollowUpAt: null,
      assignedTo: null,
    });
    if (await runMany(inputs, "Contact & durable state recorded.")) {
      setStatus(nextStatus);
      setSalesStage(nextStage);
      setTaskState("In progress");
      setNote("");
    }
  }

  async function markStatus(
    nextStatus: OutreachStatus,
    overrideStage?: SalesStage,
    overrideHandoff?: DarylHandoffState
  ) {
    if (
      nextStatus === "do_not_contact" &&
      !window.confirm(`Mark ${businessName} as do not contact?`)
    ) {
      return;
    }
    const mappedStage: SalesStage =
      overrideStage ??
      (nextStatus === "joined"
        ? "Profile claimed"
        : nextStatus === "interested"
          ? "Interested"
          : nextStatus === "do_not_contact" || nextStatus === "not_interested"
            ? "Closed"
            : salesStage);
    const nextHandoff = overrideHandoff ?? darylHandoff;
    const nextTask: HubTaskState =
      nextStatus === "joined"
        ? "Completed"
        : nextStatus === "do_not_contact" || nextStatus === "not_interested"
          ? "Cancelled"
          : taskState;

    const structuredNote = mergeDurableOutreachMeta(
      latestNote,
      {
        stage: mappedStage,
        taskState: nextTask,
        darylHandoff: nextHandoff,
        customerFit,
        relevantProduct,
        consent: nextStatus === "do_not_contact" ? "do_not_contact" : consent,
        nextAction:
          nextHandoff === "handed_to_daryl"
            ? "Daryl owns quote follow-up (do not double-chase)"
            : nextAction,
        note:
          nextHandoff === "handed_to_daryl"
            ? note.trim() || "Product enquiry handed to Daryl once."
            : note.trim() || undefined,
      },
      nextStatus
    );
    if (
      await runMany(
        [
          {
            action: nextStatus === "joined" ? "joined" : "status_changed",
            contactMethod: null,
            status: nextStatus,
            note: structuredNote,
            nextFollowUpAt: null,
            assignedTo: nextHandoff === "handed_to_daryl" ? "Daryl" : null,
          },
        ],
        nextHandoff === "handed_to_daryl"
          ? "Handed to Daryl once (status visible to Ali)."
          : nextStatus === "joined"
            ? "Marked as Profile Claimed (directory participation)."
            : "Status updated."
      )
    ) {
      setStatus(nextStatus);
      setSalesStage(mappedStage);
      setTaskState(nextTask);
      setDarylHandoff(nextHandoff);
      if (nextHandoff === "handed_to_daryl") setAssignee("Daryl");
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
    if (cleanAssignee !== (assignedName || "")) {
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
    const structuredNote = mergeDurableOutreachMeta(
      latestNote,
      {
        stage: salesStage,
        taskState,
        darylHandoff,
        customerFit,
        relevantProduct,
        consent,
        nextAction,
        note: note.trim() ? note.trim() : undefined,
      },
      status
    );
    inputs.push({
      action: "note",
      contactMethod: null,
      status: null,
      note: structuredNote,
      nextFollowUpAt: null,
      assignedTo: null,
    });
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
    const ok = await runMany(inputs, "Queue details saved (durable state preserved).");
    if (ok) setNote("");
  }

  async function copyInvitation() {
    const copied = await copyText(invitationText);
    setMessageOk(copied);
    setMessage(copied ? "Message copied." : "Couldn't copy — select and copy the text below.");
  }

  async function emailInvite() {
    if (!email) return;
    const ok = window.confirm(
      `Send the claim-invite email to ${email} now?\n\nIt goes from Outback Connections, includes the claim link, and is logged as "invite sent".`
    );
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    const result = await sendClaimInvite(businessId);
    setBusy(false);
    setMessageOk(result.ok);
    setMessage(result.message);
    if (result.ok) {
      setStatus("invite_sent");
      router.refresh();
    }
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
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Message template"
          value={templateKind}
          onChange={(e) => setTemplateKind(e.target.value as MessageTemplateKind)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] font-medium text-neutral-800"
        >
          <option value="directory_only">Msg: Free Hub Profile Claim Invite (Default)</option>
          <option value="follow_up">Msg: Profile / Availability Check-In</option>
          <option value="enquiry_handoff">Note: Product Enquiry Handoff to Daryl</option>
        </select>
        <button
          type="button"
          onClick={copyInvitation}
          disabled={contactDisabled}
          className={`${secondaryButton} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Copy text
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
          onClick={() => markStatus("interested", "Quote needed", "handed_to_daryl")}
          disabled={busy || contactDisabled || darylHandoff === "handed_to_daryl"}
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {darylHandoff === "handed_to_daryl" ? "✓ Handed to Daryl" : "Hand Product Enquiry to Daryl"}
        </button>
        <button
          type="button"
          onClick={emailInvite}
          disabled={busy || contactDisabled || !email}
          title={email ? "Sends the claim-invite email from Outback Connections and logs it" : "No email on file"}
          className="rounded bg-green-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send invite email
        </button>
      </div>

      <details className="rounded-lg border border-neutral-200 bg-neutral-50 p-2">
        <summary className="cursor-pointer font-medium text-neutral-800">
          Hub task state, directory status, Daryl handoff &amp; note
        </summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label>
            <span className="block font-medium text-neutral-700">Hub task state</span>
            <select
              value={taskState}
              onChange={(event) => setTaskState(event.target.value as HubTaskState)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {HUB_TASK_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-medium text-neutral-700">Directory / outreach status</span>
            <select
              value={status}
              onChange={(event) => {
                const next = event.target.value as OutreachStatus;
                setStatus(next);
                if (next === "joined") setSalesStage("Profile claimed");
              }}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {OUTREACH_STATUSES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">
              Separate Outback Product Handoff (Daryl / Sales — independent of directory)
            </span>
            <select
              value={darylHandoff}
              onChange={(event) => {
                const nextH = event.target.value as DarylHandoffState;
                setDarylHandoff(nextH);
                if (nextH === "handed_to_daryl") setSalesStage("Quote needed");
              }}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {DARYL_HANDOFF_STATES.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Hub role / fit</span>
            <select
              value={customerFit}
              onChange={(event) => setCustomerFit(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {CUSTOMER_FIT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Product enquiry interest (if any)</span>
            <select
              value={relevantProduct}
              onChange={(event) => setRelevantProduct(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {RELEVANT_PRODUCT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Channel contact eligibility (ACMA)</span>
            <select
              value={consent}
              onChange={(event) => {
                const nextConsent = event.target.value as MarketingConsentStatus;
                setConsent(nextConsent);
                if (nextConsent === "do_not_contact") setStatus("do_not_contact");
              }}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            >
              {MARKETING_CONSENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block font-medium text-neutral-700">Assigned owner</span>
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
          <label>
            <span className="block font-medium text-neutral-700">Next due date</span>
            <input
              type="datetime-local"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Next action</span>
            <input
              type="text"
              value={nextAction}
              onChange={(event) => setNextAction(event.target.value)}
              maxLength={180}
              placeholder="e.g. Verify rural service area or help owner claim profile"
              className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="block font-medium text-neutral-700">Add note (preserves durable state)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Record facts observed, source checked, or product enquiry details for Daryl."
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
              onClick={() => markStatus("joined", "Profile claimed")}
              disabled={busy}
              className={secondaryButton}
            >
              Mark Profile Claimed
            </button>
          )}
          {status !== "do_not_contact" && (
            <button
              type="button"
              onClick={() => markStatus("do_not_contact", "Closed")}
              disabled={busy}
              className="rounded border border-red-200 bg-white px-2 py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Do not contact
            </button>
          )}
        </div>
      </details>

      <details className="text-neutral-600">
        <summary className="cursor-pointer underline">Preview message text</summary>
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

function buildOutreachMessage({
  kind,
  businessName,
  suburb,
  invitationUrl,
  hasClaimableListing,
  relevantProduct,
}: {
  kind: MessageTemplateKind;
  businessName: string;
  suburb: string | null;
  invitationUrl: string;
  hasClaimableListing: boolean;
  relevantProduct: string;
}): string {
  const areaText = suburb ? ` around ${suburb}` : " in your region";

  if (kind === "enquiry_handoff") {
    return `PRODUCT ENQUIRY HANDOFF TO DARYL (Outback Fencing & Steel Supplies)
- Business / Customer: ${businessName}${suburb ? ` (${suburb})` : ""}
- Requested Product / Quantity: ${relevantProduct}
- Delivery Postcode or Orange Pickup: [Enter postcode or Orange pickup]
- Unloading Capability (if bulky freight): [Forklift / tractor / hand unload]
- Required Date & Contact Preference: [Phone / Email]
- Notes: Handed once to Daryl for quote follow-up.`;
  }

  if (kind === "follow_up") {
    return `G'day ${businessName},

Just a quick check-in from Outback Connections regarding your free regional profile${areaText}:
${invitationUrl}

You can confirm your current availability ("Taking bookings" or "Booked out"), check your service areas, or remove/update your listing anytime — it’s 100% free with zero lead fees.

Cheers,
Ali
Outback Connections`;
  }

  const action = hasClaimableListing
    ? `We’ve set up a free regional profile for ${businessName} so local landholders and property owners${areaText} can find your services. You can review your details, confirm your availability, and claim it here:\n${invitationUrl}`
    : `You’re invited to claim your free regional profile here:\n${invitationUrl}`;
  return `G'day ${businessName},

I’m Ali from Outback Connections. We’re a free Australian rural hub helping landholders, farmers, and rural workers connect with local services, contractors, freight, and jobs.

${action}

It’s 100% free, there are zero lead fees or commissions, and directory inclusion is completely independent of buying anything. If any detail needs adjusting or if you'd ever like it removed, just let me know.

Cheers,
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
