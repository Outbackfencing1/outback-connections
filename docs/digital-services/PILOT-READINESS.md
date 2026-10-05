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
