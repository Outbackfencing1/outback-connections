"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  getOutreachHistory,
  recordOutreachOutcome,
  type OutreachHistoryRow,
  type OutreachOutcome,
  type RecordOutcomeInput,
} from "./actions";

export type OutreachScope = "mine" | "unassigned";

export type OutreachProspect = {
  business_id: string;
  business_name: string;
  suburb: string | null;
  postcode: string | null;
  state_code: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website_url: string | null;
  source_platform: string | null;
  source_url: string | null;
  contact_source_url: string | null;
  verification_source_url: string | null;
  contact_verified_at: string | null;
  claim_status: string;
  listing_id: string | null;
  listing_slug: string | null;
  listing_kind: string | null;
  listing_status: string | null;
  category_label: string | null;
  outreach_status: string;
  assigned_user_id: string | null;
  assigned_name: string | null;
  last_contact_method: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  latest_note: string | null;
  suppressed_channels: string[] | null;
  is_suppressed: boolean;
  email_suppressed: boolean;
  phone_suppressed: boolean;
  sms_suppressed: boolean;
  whatsapp_suppressed: boolean;
  queue_priority: number;
  queue_sort_at: string | null;
  updated_at: string | null;
};

type Props = {
  rows: OutreachProspect[];
  scope: OutreachScope;
  operator: { userId: string; displayName: string };
  counts: { mine: number | null; unassigned: number | null };
  baseUrl: string;
  query: string;
  nowMs: number;
};

type EmailTemplateId = "first_touch" | "follow_up" | "close_out";

const EMAIL_TEMPLATES: Array<{ id: EmailTemplateId; label: string }> = [
  { id: "first_touch", label: "First invitation" },
  { id: "follow_up", label: "Follow-up" },
  { id: "close_out", label: "Close the loop" },
];

export default function OutreachWorkspace({
  rows,
  scope,
  operator,
  counts,
  baseUrl,
  query,
  nowMs,
}: Props) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [lastResult, setLastResult] = useState<string | null>(null);
  const visibleRows = rows.filter((row) => !hiddenIds.has(row.business_id));
  const current = visibleRows[0] ?? null;

  function advance() {
    if (!current) return;
    setHiddenIds((previous) => {
      const next = new Set(previous);
      next.add(current.business_id);
      return next;
    });
  }

  function completeCurrent(message: string) {
    setLastResult(message);
    advance();
  }

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2" aria-label="Outreach queue">
          <ScopeLink
            href={withQuery("/dashboard/outreach?scope=mine", query)}
            active={scope === "mine"}
            label="Mine"
            count={counts.mine}
          />
          <ScopeLink
            href={withQuery("/dashboard/outreach?scope=unassigned", query)}
            active={scope === "unassigned"}
            label="Unassigned"
            count={counts.unassigned}
          />
        </div>
        <form action="/dashboard/outreach" method="get" className="flex gap-2">
          <input type="hidden" name="scope" value={scope} />
          <label className="sr-only" htmlFor="outreach-search">
            Search the current queue
          </label>
          <input
            id="outreach-search"
            name="q"
            defaultValue={query}
            placeholder="Search business or town"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm sm:w-64"
          />
          <button
            type="submit"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-neutral-600">
        <p>
          {visibleRows.length} remaining in this view
          {rows.length >= 15 ? " (today's first 15)" : ""}
        </p>
        {current && (
          <button
            type="button"
            onClick={advance}
            className="font-semibold text-green-800 underline underline-offset-2"
          >
            Skip for now and show next
          </button>
        )}
      </div>

      {lastResult && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-900"
        >
          {lastResult} The next record is ready.
        </p>
      )}

      {current ? (
        current.assigned_user_id ? (
          <ProspectPanel
            key={current.business_id}
            row={current}
            operator={operator}
            baseUrl={baseUrl}
            nowMs={nowMs}
            onComplete={completeCurrent}
          />
        ) : (
          <UnassignedGate
            key={current.business_id}
            row={current}
            operator={operator}
            nowMs={nowMs}
          />
        )
      ) : (
        <EmptyQueue scope={scope} query={query} otherCount={
          scope === "mine" ? counts.unassigned : counts.mine
        } />
      )}

      {visibleRows.length > 1 && (
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Up next
          </p>
          <ol className="mt-2 divide-y divide-neutral-200">
            {visibleRows.slice(1, 4).map((row) => (
              <li key={row.business_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium text-neutral-900">
                  {row.business_name}
                </span>
                <span className="shrink-0 text-xs text-neutral-600">
                  {priorityLabel(row, nowMs)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

function UnassignedGate({
  row,
  operator,
  nowMs,
}: {
  row: OutreachProspect;
  operator: Props["operator"];
  nowMs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const actionId = useRef<string | null>(null);
  const sourceQuality = classifyContactSource(row);

  async function takeRecord() {
    setBusy(true);
    setMessage(null);
    const clientActionId = actionId.current || crypto.randomUUID();
    actionId.current = clientActionId;
    try {
      const result = await recordOutreachOutcome({
        businessId: row.business_id,
        clientActionId,
        outcome: "assigned",
        contactMethod: null,
        note: null,
        nextFollowUpAt: null,
        assignedUserId: operator.userId,
        clearFollowUp: false,
      });
      setBusy(false);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      actionId.current = null;
      router.push(
        `/dashboard/outreach?scope=mine&q=${encodeURIComponent(row.business_name)}`
      );
    } catch {
      setBusy(false);
      setMessage(
        "Couldn't confirm the assignment. Retry this button; it will not create a duplicate."
      );
    }
  }

  const sourceHref = safeHttpUrl(row.contact_source_url || row.source_url);
  const verificationHref = safeHttpUrl(row.verification_source_url);
  const websiteHref = safeHttpUrl(row.website_url);

  return (
    <article className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge row={row} nowMs={nowMs} />
              <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700">
                Unassigned
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950">
              {row.business_name}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {[row.suburb, row.state_code, row.postcode].filter(Boolean).join(" ") ||
                "Location not recorded"}
              {row.category_label ? ` · ${row.category_label}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void takeRecord()}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Taking record..." : "Take this record"}
          </button>
        </div>
      </header>

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <section>
          <h3 className="font-bold text-neutral-950">Research details</h3>
          <p className="mt-1 text-sm text-neutral-700">
            Review the business first. Contact actions stay locked until the assignment is
            saved, preventing two team members from contacting it at once.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <ContactValue label="Email" value={row.contact_email} suppressed={row.email_suppressed} />
            <ContactValue label="Phone" value={row.contact_phone} suppressed={row.phone_suppressed} />
            {websiteHref && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Website
                </dt>
                <dd className="mt-1 break-all">
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-green-800 underline"
                  >
                    {row.website_url}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-neutral-950">Source check</h3>
            {row.contact_email && sourceQuality === "business_controlled" ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">
                Business-controlled source
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                Research required
              </span>
            )}
          </div>
          {sourceHref && (
            <p className="mt-3 break-all text-xs text-neutral-700">
              Contact source:{" "}
              <a
                href={sourceHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-green-800 underline"
              >
                {row.contact_source_url || row.source_url}
              </a>
            </p>
          )}
          {verificationHref && (
            <p className="mt-2 break-all text-xs text-neutral-700">
              Business verification:{" "}
              <a
                href={verificationHref}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-green-800 underline"
              >
                {row.verification_source_url}
              </a>
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-amber-950">
            Online publication alone is not blanket consent. Third-party-only addresses stay
            on hold until verified on the business&apos;s own website or by the business directly.
          </p>
        </section>
      </div>

      {message && (
        <p role="status" className="border-t border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {message}
        </p>
      )}
    </article>
  );
}

function ProspectPanel({
  row,
  operator,
  baseUrl,
  nowMs,
  onComplete,
}: {
  row: OutreachProspect;
  operator: Props["operator"];
  baseUrl: string;
  nowMs: number;
  onComplete: (message: string) => void;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<EmailTemplateId>(() =>
    row.last_contacted_at ? "follow_up" : "first_touch"
  );
  const [followUp, setFollowUp] = useState(() =>
    toLocalInput(row.next_follow_up_at) || defaultFollowUp(nowMs)
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);
  const [history, setHistory] = useState<OutreachHistoryRow[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const pendingAction = useRef<{ key: string; id: string } | null>(null);

  const emailSource = row.contact_source_url || row.source_url;
  const sourceQuality = classifyContactSource(row);
  const sequenceClosed = row.outreach_status === "sequence_complete";
  const allSuppressed = Boolean(row.suppressed_channels?.includes("all"));
  const emailSuppressed =
    allSuppressed || row.email_suppressed || sequenceClosed;
  const phoneSuppressed =
    allSuppressed || row.phone_suppressed || sequenceClosed;
  const emailOnHold =
    Boolean(row.contact_email) && sourceQuality !== "business_controlled";
  const assignedToCurrent = row.assigned_user_id === operator.userId;
  const assignmentForOutcome = row.assigned_user_id
    ? undefined
    : operator.userId;
  const hasPriorEmail =
    Boolean(row.last_contacted_at) && row.last_contact_method === "email";
  const availableEmailTemplates = row.last_contacted_at
    ? EMAIL_TEMPLATES.filter(
        (template) => template.id !== "close_out" || hasPriorEmail
      )
    : EMAIL_TEMPLATES.filter((template) => template.id === "first_touch");
  const templateAllowed = availableEmailTemplates.some(
    (template) => template.id === templateId
  );
  const emailDraft = useMemo(
    () => buildEmailDraft(row, templateId, baseUrl, operator.displayName),
    [row, templateId, baseUrl, operator.displayName]
  );
  const emailHref =
    row.contact_email &&
    assignedToCurrent &&
    !emailSuppressed &&
    !emailOnHold &&
    templateAllowed
      ? `mailto:${encodeURIComponent(row.contact_email)}?subject=${encodeURIComponent(
          emailDraft.subject
        )}&body=${encodeURIComponent(emailDraft.body)}`
      : null;

  async function saveOutcome(
    outcome: OutreachOutcome,
    options: Partial<Omit<RecordOutcomeInput, "businessId" | "clientActionId" | "outcome">> = {},
    advanceAfter = true,
    navigateAfter?: string
  ) {
    const inputWithoutId = {
      businessId: row.business_id,
      outcome,
      contactMethod: options.contactMethod ?? null,
      note: options.note ?? null,
      nextFollowUpAt: options.nextFollowUpAt ?? null,
      assignedUserId:
        options.assignedUserId === undefined
          ? assignmentForOutcome ?? null
          : options.assignedUserId,
      clearFollowUp: options.clearFollowUp ?? false,
    } satisfies Omit<RecordOutcomeInput, "clientActionId">;
    const actionKey = JSON.stringify(inputWithoutId);
    const clientActionId =
      pendingAction.current?.key === actionKey
        ? pendingAction.current.id
        : crypto.randomUUID();
    pendingAction.current = { key: actionKey, id: clientActionId };

    setBusy(true);
    setMessage(null);
    try {
      const result = await recordOutreachOutcome({
        ...inputWithoutId,
        clientActionId,
      });
      setBusy(false);
      if (!result.ok) {
        setMessageOk(false);
        setMessage(result.message);
        return;
      }
      pendingAction.current = null;
      setMessageOk(true);
      setMessage(result.message);
      if (navigateAfter) {
        router.push(navigateAfter);
        return;
      }
      router.refresh();
      if (advanceAfter) onComplete(result.message);
    } catch {
      setBusy(false);
      setMessageOk(false);
      setMessage("Couldn't confirm the save. Retry the same action; it will not be duplicated.");
    }
  }

  async function loadHistory() {
    if (history || historyBusy) return;
    setHistoryBusy(true);
    const result = await getOutreachHistory(row.business_id);
    setHistoryBusy(false);
    if (result.ok) setHistory(result.rows);
    else {
      setMessageOk(false);
      setMessage(result.message);
    }
  }

  function followUpIso(): string | null {
    return sydneyLocalToIso(followUp);
  }

  function futureFollowUpIso(): string | null {
    const value = followUpIso();
    if (!value) return null;
    return new Date(value).getTime() > nowMs ? value : null;
  }

  function confirmOutcome(message: string): boolean {
    return window.confirm(`${message} for ${row.business_name}?`);
  }

  return (
    <article className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <header className="border-b border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <PriorityBadge row={row} nowMs={nowMs} />
              <StatusBadge status={row.outreach_status} />
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950">
              {row.business_name}
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {[row.suburb, row.state_code, row.postcode].filter(Boolean).join(" ") ||
                "Location not recorded"}
              {row.category_label ? ` · ${row.category_label}` : ""}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-700">
            <span className="font-semibold">Assigned:</span>{" "}
            {assignedToCurrent ? "You" : row.assigned_name || "Unassigned"}
          </div>
        </div>
      </header>

      {allSuppressed && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 sm:px-6">
          Do not contact. All contact actions are blocked.
        </div>
      )}
      {sequenceClosed && !allSuppressed && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6">
          <span className="font-semibold">Outreach sequence closed.</span> Outbound
          contact is blocked. Record a reply only if this contractor contacted you.
        </div>
      )}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-6 p-4 sm:p-6 lg:border-r lg:border-neutral-200">
          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-neutral-950">Manual email</h3>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Review required
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-neutral-200 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="block text-xs font-semibold text-neutral-700">Template</span>
                  <select
                    value={templateId}
                    onChange={(event) => setTemplateId(event.target.value as EmailTemplateId)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  >
                    {availableEmailTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="block text-xs font-semibold text-neutral-700">
                    Next follow-up
                  </span>
                  <input
                    type="datetime-local"
                    value={followUp}
                    min={toLocalInput(new Date(nowMs + 60_000).toISOString())}
                    onChange={(event) => setFollowUp(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>

              <ContactProvenance
                row={row}
                sourceQuality={sourceQuality}
                emailSource={emailSource}
              />

              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
                <p className="font-semibold text-neutral-900">Subject: {emailDraft.subject}</p>
                <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-neutral-700">
                  {emailDraft.body}
                </pre>
              </div>

              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
                Opening the draft never sends or records an email. Check that the message is
                relevant, send it in your email app, then return here and confirm it was sent.
                Online publication alone is not blanket consent. Send from an Outback
                Connections email address so the sender is clear.
              </div>

              {!assignedToCurrent && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-medium text-blue-950">
                  Take this record before opening a draft or making contact. This prevents
                  two team members contacting the same business.
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {emailHref ? (
                  <a
                    href={emailHref}
                    className="rounded-lg border border-green-700 bg-white px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-50"
                  >
                    Open reviewed email draft
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-400"
                  >
                    Open reviewed email draft
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    busy ||
                    !row.contact_email ||
                    !assignedToCurrent ||
                    emailSuppressed ||
                    emailOnHold ||
                    !templateAllowed ||
                    (templateId !== "close_out" && !futureFollowUpIso())
                  }
                  onClick={() => {
                    if (
                      templateId === "close_out" &&
                      !confirmOutcome("Confirm the final email was sent and close this outreach sequence")
                    ) {
                      return;
                    }
                    void saveOutcome(
                      templateId === "first_touch"
                        ? "invite_sent"
                        : templateId === "close_out"
                          ? "sequence_complete"
                          : "emailed",
                      {
                        contactMethod: "email",
                        note: `${EMAIL_TEMPLATES.find((item) => item.id === templateId)?.label || "Manual"} email confirmed sent.`,
                        nextFollowUpAt:
                          templateId === "close_out" ? null : futureFollowUpIso(),
                        clearFollowUp: templateId === "close_out",
                      }
                    );
                  }}
                  className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {templateId === "close_out"
                    ? "Confirm sent and close sequence"
                    : "Confirm email sent"}
                </button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-bold text-neutral-950">Record one clear outcome</h3>
            <p className="mt-1 text-xs text-neutral-600">
              Each button saves one audited outcome. If this record is unassigned, the outcome
              assigns it to you in the same save.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <OutcomeButton
                label="Call made"
                disabled={
                  busy || !assignedToCurrent || !row.contact_phone || phoneSuppressed
                }
                onClick={() => void saveOutcome("called", { contactMethod: "phone", note: note || null })}
              />
              <OutcomeButton
                label="Reply received"
                disabled={busy || (allSuppressed && !sequenceClosed)}
                onClick={() => void saveOutcome("replied", { note: note || null })}
              />
              <OutcomeButton
                label="Interested"
                disabled={busy || allSuppressed || sequenceClosed}
                onClick={() => void saveOutcome("interested", { note: note || null })}
              />
              <OutcomeButton
                label="Not now"
                disabled={
                  busy || allSuppressed || sequenceClosed || !futureFollowUpIso()
                }
                onClick={() =>
                  void saveOutcome("not_now", {
                    note: note || null,
                    nextFollowUpAt: futureFollowUpIso(),
                  })
                }
              />
              <OutcomeButton
                label="Not interested"
                disabled={busy}
                onClick={() =>
                  confirmOutcome("Mark not interested") &&
                  void saveOutcome("not_interested", { note: note || null })
                }
              />
            </div>
          </section>

          <section>
            <label>
              <span className="block font-bold text-neutral-950">Working note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder="What happened? Keep it factual and useful for the next person."
                className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={() => void saveOutcome("note", { note: note.trim() }, false)}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
              >
                Save note
              </button>
              {!row.assigned_user_id && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveOutcome(
                      "assigned",
                      { assignedUserId: operator.userId },
                      false,
                      `/dashboard/outreach?scope=mine&q=${encodeURIComponent(row.business_name)}`
                    )
                  }
                  className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900 hover:bg-green-100 disabled:opacity-40"
                >
                  Take this record
                </button>
              )}
              {assignedToCurrent && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveOutcome("unassigned", { assignedUserId: null }, true)
                  }
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                >
                  Return to unassigned
                </button>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6 bg-neutral-50/60 p-4 sm:p-6">
          <section>
            <h3 className="font-bold text-neutral-950">Contact record</h3>
            <dl className="mt-3 space-y-3 text-sm">
              <ContactValue label="Email" value={row.contact_email} suppressed={emailSuppressed} />
              <ContactValue label="Phone" value={row.contact_phone} suppressed={phoneSuppressed} />
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Last contacted
                </dt>
                <dd className="mt-1 text-neutral-800">
                  {row.last_contacted_at ? formatDate(row.last_contacted_at) : "Never"}
                  {row.last_contact_method ? ` · ${humanise(row.last_contact_method)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Follow-up
                </dt>
                <dd className="mt-1 text-neutral-800">
                  {row.next_follow_up_at ? formatDate(row.next_follow_up_at) : "Not scheduled"}
                </dd>
              </div>
            </dl>
            {row.latest_note && (
              <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-700">
                <p className="font-semibold text-neutral-900">Latest note</p>
                <p className="mt-1 whitespace-pre-wrap">{row.latest_note}</p>
              </div>
            )}
          </section>

          <section className="border-t border-neutral-200 pt-5">
            <h3 className="font-bold text-neutral-950">Safety outcomes</h3>
            <div className="mt-3 grid gap-2">
              <SafetyButton
                label="Email bounced"
                disabled={busy || !row.contact_email || emailSuppressed}
                onClick={() =>
                  confirmOutcome("Suppress this email after a bounce") &&
                  void saveOutcome("email_bounced", { note: note || null })
                }
              />
              <SafetyButton
                label="Phone is invalid"
                disabled={busy || !row.contact_phone || phoneSuppressed}
                onClick={() =>
                  confirmOutcome("Suppress this phone number as invalid") &&
                  void saveOutcome("invalid_phone", { note: note || null })
                }
              />
              <SafetyButton
                label="Invalid or duplicate record"
                disabled={busy}
                onClick={() =>
                  confirmOutcome("Mark invalid or duplicate") &&
                  void saveOutcome("invalid_duplicate", { note: note || null })
                }
              />
              <button
                type="button"
                disabled={busy || allSuppressed}
                onClick={() =>
                  confirmOutcome("Mark do not contact and suppress every channel") &&
                  void saveOutcome("do_not_contact", { note: note || null })
                }
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-left text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-40"
              >
                Do not contact
              </button>
            </div>
            {(row.suppressed_channels?.length ?? 0) > 0 && (
              <p className="mt-2 text-xs font-semibold text-red-700">
                Suppressed: {row.suppressed_channels!.map(humanise).join(", ")}
              </p>
            )}
          </section>

          <details
            className="border-t border-neutral-200 pt-5 text-sm"
            onToggle={(event) => {
              if (event.currentTarget.open) void loadHistory();
            }}
          >
            <summary className="cursor-pointer font-bold text-neutral-950">
              Activity history
            </summary>
            {historyBusy ? (
              <p className="mt-3 text-neutral-600">Loading...</p>
            ) : history && history.length > 0 ? (
              <ol className="mt-3 space-y-3 border-l border-neutral-300 pl-3">
                {history.map((event) => (
                  <li key={event.id} className="text-xs text-neutral-700">
                    <p className="font-semibold text-neutral-900">
                      {humanise(event.outcome || event.action)} · {event.actor_name}
                    </p>
                    <p>{formatDate(event.created_at)}</p>
                    {event.note && <p className="mt-1 whitespace-pre-wrap">{event.note}</p>}
                    {event.next_follow_up_at && (
                      <p className="mt-1">Follow-up: {formatDate(event.next_follow_up_at)}</p>
                    )}
                  </li>
                ))}
              </ol>
            ) : history ? (
              <p className="mt-3 text-xs text-neutral-600">No history yet.</p>
            ) : null}
          </details>

          {message && (
            <p
              role="status"
              className={`rounded-lg border p-3 text-sm ${
                messageOk
                  ? "border-green-200 bg-green-50 text-green-900"
                  : "border-red-200 bg-red-50 text-red-900"
              }`}
            >
              {message}
            </p>
          )}
        </aside>
      </div>
    </article>
  );
}

function ContactProvenance({
  row,
  sourceQuality,
  emailSource,
}: {
  row: OutreachProspect;
  sourceQuality: "business_controlled" | "third_party" | "unknown";
  emailSource: string | null;
}) {
  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-neutral-900">{row.contact_email || "No email found"}</span>
        {row.contact_email && sourceQuality === "business_controlled" && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-900">
            Business-controlled source
          </span>
        )}
        {row.contact_email && sourceQuality !== "business_controlled" && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-950">
            Research before email
          </span>
        )}
      </div>
      {emailSource && (
        <p className="mt-2 break-all text-neutral-600">
          Contact source:{" "}
          <a
            href={safeHttpUrl(emailSource) || undefined}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-green-800 underline"
          >
            {emailSource}
          </a>
        </p>
      )}
      {row.verification_source_url &&
        row.verification_source_url !== emailSource && (
          <p className="mt-1 break-all text-neutral-600">
            Business verification:{" "}
            <a
              href={safeHttpUrl(row.verification_source_url) || undefined}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-green-800 underline"
            >
              {row.verification_source_url}
            </a>
          </p>
        )}
      {row.contact_verified_at && (
        <p className="mt-1 text-neutral-600">Checked {formatDate(row.contact_verified_at)}</p>
      )}
      {row.contact_email && sourceQuality !== "business_controlled" && (
        <p className="mt-2 font-medium text-amber-900">
          This address is held until it is verified on the business&apos;s own website or by the
          business directly.
        </p>
      )}
    </div>
  );
}

function ContactValue({
  label,
  value,
  suppressed,
}: {
  label: string;
  value: string | null;
  suppressed: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-1 break-all text-neutral-800">
        {value || "Not available"}
        {suppressed && value ? (
          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-800">
            Suppressed
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function ScopeLink({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number | null;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
        active
          ? "bg-green-700 text-white"
          : "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
      }`}
    >
      {label}{" "}
      <span className={active ? "text-green-100" : "text-neutral-500"}>
        {count === null ? "—" : count}
      </span>
    </Link>
  );
}

function OutcomeButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-12 rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-semibold text-green-900 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function SafetyButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-40"
    >
      {label}
    </button>
  );
}

function PriorityBadge({ row, nowMs }: { row: OutreachProspect; nowMs: number }) {
  const due = row.next_follow_up_at
    ? new Date(row.next_follow_up_at).getTime() <= nowMs
    : false;
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        due ? "bg-amber-100 text-amber-950" : "bg-green-100 text-green-900"
      }`}
    >
      {priorityLabel(row, nowMs)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700">
      {humanise(status)}
    </span>
  );
}

function EmptyQueue({
  scope,
  query,
  otherCount,
}: {
  scope: OutreachScope;
  query: string;
  otherCount: number | null;
}) {
  const otherScope = scope === "mine" ? "unassigned" : "mine";
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <h2 className="text-xl font-bold text-neutral-900">
        {query ? "No matching records" : "This queue is clear"}
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        {otherCount === null
          ? "The other queue count is temporarily unavailable."
          : otherCount > 0
          ? `There ${otherCount === 1 ? "is" : "are"} ${otherCount} ${otherScope} record${
              otherCount === 1 ? "" : "s"
            } available.`
          : "There is no outreach work waiting in either queue."}
      </p>
      {(otherCount === null || otherCount > 0) && (
        <Link
          href={`/dashboard/outreach?scope=${otherScope}`}
          className="mt-4 inline-block rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          Open {otherScope}
        </Link>
      )}
    </div>
  );
}

function buildEmailDraft(
  row: OutreachProspect,
  templateId: EmailTemplateId,
  baseUrl: string,
  operatorDisplayName: string
): { subject: string; body: string } {
  const claimUrl = new URL(`/claim/${row.business_id}`, baseUrl);
  claimUrl.searchParams.set("utm_source", "contractor_outreach");
  claimUrl.searchParams.set("utm_medium", "email");
  claimUrl.searchParams.set("utm_campaign", "contractor_claim_invite");
  claimUrl.searchParams.set("utm_content", templateId);

  const cleanOperatorName = operatorDisplayName.trim();
  const senderName =
    cleanOperatorName && cleanOperatorName !== "Outreach team member"
      ? cleanOperatorName
      : "Outback Connections team";
  const introduction =
    senderName === "Outback Connections team"
      ? "I'm contacting you from Outback Connections."
      : `I'm ${senderName} from Outback Connections.`;
  const greeting = `Hi ${row.business_name} team,`;
  const signature = `Regards,
${senderName}
Outback Connections
Operated by Outback Fencing & Steel Supplies Pty Ltd
ABN 76 674 671 820
76 Astill Drive, Orange NSW 2800
help@outbackconnections.com.au
https://www.outbackconnections.com.au

To stop receiving these emails, reply UNSUBSCRIBE and we will update our records.`;

  if (templateId === "follow_up") {
    return {
      subject: `Following up: ${row.business_name}'s free Outback Connections profile`,
      body: `${greeting}

I'm following up on the free contractor profile for ${row.business_name} on Outback Connections, a rural directory helping property owners and farmers find fencing contractors.

You can review the details and claim the profile here:
${claimUrl.toString()}

It is free to join, there are no lead fees, and you can update the profile details. If this is not relevant, just let me know and I will update our records.

${signature}`,
    };
  }

  if (templateId === "close_out") {
    return {
      subject: `Closing the loop: ${row.business_name}'s Outback Connections profile`,
      body: `${greeting}

I'll close the loop after this note about the free contractor profile for ${row.business_name} on Outback Connections.

If you would like to review or claim it, the link is:
${claimUrl.toString()}

There is no cost or lead fee. If the listing is not relevant or should be corrected, reply and I will update our records.

${signature}`,
    };
  }

  return {
    subject: `Free Outback Connections profile for ${row.business_name}`,
    body: `${greeting}

${introduction} We're building a rural directory to help property owners and farmers find fencing contractors.

We've prepared a free, unclaimed profile for ${row.business_name}. You can review the details and claim it here:
${claimUrl.toString()}

It is free to join, there are no lead fees, and you can update the profile details. If the listing is not relevant or needs correcting, reply and I will update our records.

${signature}`,
  };
}

function classifyContactSource(
  row: OutreachProspect
): "business_controlled" | "third_party" | "unknown" {
  if (!row.contact_email) return "unknown";
  const contactHost = hostOf(row.contact_source_url || row.source_url);
  const websiteHost = hostOf(row.website_url);
  const verificationHost = hostOf(row.verification_source_url);
  const emailHost = row.contact_email.split("@")[1]?.trim().toLowerCase() || null;
  if (
    emailHost &&
    websiteHost &&
    hostsMatch(emailHost, websiteHost) &&
    (!verificationHost || hostsMatch(verificationHost, websiteHost))
  ) {
    return "business_controlled";
  }
  if (
    contactHost &&
    websiteHost &&
    (hostsMatch(contactHost, websiteHost) ||
      (verificationHost && hostsMatch(contactHost, verificationHost) && hostsMatch(verificationHost, websiteHost)))
  ) {
    return "business_controlled";
  }
  if (!contactHost && websiteHost && verificationHost && hostsMatch(websiteHost, verificationHost)) {
    return "business_controlled";
  }
  return contactHost ? "third_party" : "unknown";
}

function hostOf(value: string | null): string | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  try {
    return new URL(safe).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostsMatch(left: string, right: string): boolean {
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function priorityLabel(row: OutreachProspect, nowMs: number): string {
  if (row.next_follow_up_at) {
    const date = new Date(row.next_follow_up_at);
    const now = new Date(nowMs);
    if (!Number.isNaN(date.getTime()) && date.getTime() <= now.getTime()) {
      const days = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
      return days === 0 ? "Due now" : `${days}d overdue`;
    }
    return `Due ${date.toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      timeZone: "Australia/Sydney",
    })}`;
  }
  if (!row.last_contacted_at) return "Ready for first touch";
  return "Active follow-up";
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Australia/Sydney",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`;
}

function defaultFollowUp(nowMs: number): string {
  const localDate = toLocalInput(new Date(nowMs).toISOString()).slice(0, 10);
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  const followUpDate = new Date(Date.UTC(year, month - 1, day));
  let businessDays = 0;
  while (businessDays < 5) {
    followUpDate.setUTCDate(followUpDate.getUTCDate() + 1);
    const weekday = followUpDate.getUTCDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }
  return `${followUpDate.toISOString().slice(0, 10)}T09:00`;
}

function sydneyLocalToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute)
  );
  if (!Number.isFinite(localAsUtc)) return null;
  let offset = sydneyOffsetMs(new Date(localAsUtc));
  let utc = localAsUtc - offset;
  const correctedOffset = sydneyOffsetMs(new Date(utc));
  if (correctedOffset !== offset) {
    offset = correctedOffset;
    utc = localAsUtc - offset;
  }
  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

function sydneyOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "Australia/Sydney",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  const representedAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second")
  );
  return representedAsUtc - date.getTime();
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  }).format(date);
}

function humanise(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function withQuery(href: string, query: string): string {
  if (!query) return href;
  return `${href}&q=${encodeURIComponent(query)}`;
}
