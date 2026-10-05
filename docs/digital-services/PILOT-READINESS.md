# Small sales pilot: readiness view

Prepared by Claude Code, 5 October 2026 (Sydney), against master plan revision 12
(`62e101c8…94bb9cf2`, SHA-256 verified). This is a status view, not a sending
tracker. The drafts and any future send records stay in Cowork's approval
workflow until the engine import path exists. Nothing here approves or sends.

**Prospect data is owner-only (AGENTS.md), and this repository is public.** The
per-company table isn't kept here: the companies, lanes, reservations, preview
checks, copy notes and file hashes. Its private record is the
`oc_planning.agent_updates` row with event key
`claude-code-pilot-readiness-private-copy-2026-10-05`. Once the
`digital_services_pilot` draft migration is approved and loaded from that record,
the owner dashboard (`/dashboard/owner`) shows the same table after the owner check.

## Shape of the pilot (aggregate only)

- **Ten concept previews**, all live and passing the checks below. One has a copy
  note for Cowork's pre-send review: a service card that reads as an action.
- **An eight-company email cohort**, separate from the ten held engine concepts.
  Two more companies are handled by Josh in person or by phone, with no email.
- **Four companies are reserved for the Cowork pilot.** They are planned contacts,
  not contacted.

## Preview checks performed (what "pass" means)

Production, custom domain, no site session (Vercel web-fetch, 4 Oct 23:43 UTC):
- All ten pages and both assets returned **200** with
  `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`.
- Every page carries `<meta name="robots" content="noindex,nofollow,noarchive">`.
- Every page carries the "Concept preview by Outback Connections · Not the
  business's live website" banner.

Browser (Playwright/Chromium, 5 Oct). These checks used the committed files at
main `922fd6d`, which is the deployed commit, served locally at 390×844 and
1440×900:

- No horizontal overflow at either width. No service label, heading, option or
  button is clipped (scrollWidth vs clientWidth on every visible text element).
- The disclosure banner is visible at the top, and the footer says the business
  "has not approved or commissioned this example".
- CSS and JS load, with no script errors.
- The guided form:
  - With the required fields filled with sample values, submit shows an on-page
    brief headed "DEMONSTRATION — not sent or booked".
  - **No network request is made on submit.** The form has no `action` or
    `method`, and "Copy brief" copies text to the clipboard.
  - Nothing is captured, stored or emailed, and the previews do not claim real
    enquiry capture.
- Links: in-page anchors, plus each business's own public website (and its
  contact or booking page where one was cited). No tracking, images or
  third-party scripts.

Not performed:
- a real-device check;
- a browser run against the production host itself. This session's network
  policy blocks the domain, so the production header and body check above used
  Vercel's fetch.

## Company reservations (duplicate-outreach prevention)

The engine must hold first contact for the reserved companies at the company
level (a canonical company ID with source IDs and aliases), not by email address
or domain.

Enforcement status: **not enforced yet.** The engine and its dispatch path are
not in any repository this session can reach, and the marketplace has no
outbound sending code to guard. When the engine source arrives (privately), the
reservation check goes in the server-side dispatch guard. That guard checks:
- the reservation;
- actual contact history;
- suppression;
- current approval;
- replies;
- caps.

It gets tests for a second address at the same company and for two concurrent
dispatch attempts. A confirmed Cowork send is reconciled from provider message
IDs and timestamps; an uncertain send stays unresolved and is never retried
blindly.

## Sender: the no-extra-cost path (DNS checked 5 Oct 2026)

Public DNS for `outbackconnections.com.au`:
- MX → Google Workspace (`aspmx.l.google.com` and alternates).
- SPF → `include:_spf.google.com` (via `dc-aa8e722993._spfm…`), `~all`.
- DKIM → `google._domainkey` published (and `resend._domainkey` for Resend).
- DMARC → `p=quarantine`, relaxed alignment.
- Resend sends from the separate `send.` subdomain (Amazon SES), so the
  marketplace's transactional mail doesn't share the root domain's reputation.

So the domain's mail already runs on Google Workspace, and Gmail-sent mail from a
Workspace address passes SPF/DKIM/DMARC.

- **A Workspace user alias costs nothing extra** (for example `josh@` on Josh's
  existing Workspace account). Add it in Google Admin and set it as a "Send mail
  as" address; it shares the inbox.
- **A new Workspace user would add a monthly cost** and needs approval.

Not verified from here, because these need Josh in Google Admin:
- which Workspace account holds help@;
- whether an alias already exists;
- Gmail send-as setup.

After that, connect that Workspace account (not the fencing Gmail) to the reply
workflow and run one send/reply test between owned inboxes.

## What blocks the first real send

1. Josh's approval of the drafts (Cowork workflow).
2. A connected, verified Outback Connections sender with a tested reply route
   (the free Workspace-alias path above). `help@` is the support and
   transactional identity and is not used for outreach.
3. Cowork's call on the one preview copy note.

The previews themselves are not a blocker.

## First-customer priority (5 October 2026, master revision 14)

Joshua narrowed the goal to the first paying customers. Three cleaners from the
reserved Cowork cohort are prepared and **held**:
- one for the A$1,990 website;
- two for the A$490 guided form on their useful existing site, which stays as it is.

Their per-company records are in owner-only storage (`oc_planning.agent_updates`,
event `claude-code-three-cleaner-pilot-pack-2026-10-05`), not here. Each record holds:
- **Draft revision 1:** Cowork's unsent original, kept as history.
- **Draft revision 2:** the current offer, with a concept-only disclosure and a GST wording placeholder.
- **Approval slots:** four, all empty.
- **Evidence-refresh list:** claim by claim.
- **Draft quote:** GST pending.

| Check | State |
|---|---|
| Cowork drafts | Read from the shared artifact: 8 unsent, 0 of 8 review boxes ticked |
| Evidence refresh | **Not done.** This session's network policy blocks all three business sites |
| Preview behaviour (390/1440) | Pass. No request on submit, "DEMONSTRATION — not sent or booked", no overflow |
| Preview content | Notes on all three. Generic site-type options ("Home"/"Strata building") on the two commercial cleaners; one "Book a workplace visit" service card. Repairs are a preview release (approval needed) |
| Contact basis confirmed | 0 of 3 |
| Approvals (evidence, preview, copy, message) | 0 of 12 |
| Verified outreach sender | None (help@ is never used) |
| First contact | Held for all three. The server guard and the database both refuse it today |

Enforcement is now in code:
- `lib/digital-services/dispatch-guard.ts`, the server-side check any future dispatch must pass;
- the `digital_services_pilot` draft migration, which refuses a "contacted" event unless every condition holds and allows only one first contact per company.

Both are tested, including two simultaneous dispatches on a real Postgres 16, of which exactly one succeeded.

## Revision 3, owner controls and the sender adapter (5 October 2026, later)

Revision 3 of all three drafts is in owner-only storage (event
`claude-code-three-cleaner-pilot-rev3-2026-10-05`). Revisions 1 and 2 are
unchanged in the earlier record. Revision 3:
- resolves the GST wording to "+ GST" from the established operator/ABN/GST record;
- frames one form offer as an upgrade of the contact form that business already has;
- moves the draft quotes to exclusive GST.

The older local pitch at A$1,490 that Codex reported (a laptop file) is
superseded and must not be sent.

| Check | State |
|---|---|
| Drafts | Revision 3 for all three; the database recomputed each SHA-256 and it matched |
| Evidence refresh | **Not done.** The three business sites are still blocked by this session's network policy. Needs the domains allowed, or Codex's five-file `claude-first-customer-handoff` folder attached |
| Preview content | Two commercial-cleaner previews repaired in PR #23 (not deployed): site types limited to evidenced ones; the action-style service card removed; existing forms, location pages and client login stated as kept. Browser re-check at 390/1440 passed. The website prospect's preview waits on evidence for its "Home" option |
| Approvals on revision 3 | 0 of 12 |
| Contact basis confirmed | 0 of 3 |
| Sender | Adapter ready (Gmail REST, `lib/digital-services/outreach/`). Not connected. Steps: `OUTREACH-SENDER.md` |
| Sending switch | Off (`DIGITAL_SERVICES_OUTREACH_SENDING` unset); no route calls the dispatcher |
| First contact | Held for all three |

**Owner controls** are on `/dashboard/owner` (draft migration
`digital_services_sales`, not applied):
- quotes;
- payment evidence;
- intake/delivery stage, gated on evidenced payment;
- an append-only conversation log.

Proven on the local stack (Postgres 16 + PostgREST; fixture data only). The
hosted flow is unproven until the enquiry, pilot and sales migrations are
approved and applied.
