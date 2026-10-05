# Small sales pilot: readiness view

Prepared by Claude Code, 5 October 2026 (Sydney), against master plan revision 12
(`62e101c8…94bb9cf2`, SHA-256 verified). This is a status view, not a sending
tracker: the eight drafts and any future send records stay in Cowork's approval
workflow until the engine import path exists. Nothing here approves or sends.

## The eight-email cohort (separate from the ten held engine concepts)

| ID | Company | Preview (www.outbackconnections.com.au/preview/…) | Preview check | Draft copy | Review | Sender | Josh approval | Reservation |
|---|---|---|---|---|---|---|---|---|
| OC-001 | Amazing Detail | `f9a0ea6a94a87b4d3c83.html` | pass | not visible here ¹ | Cowork claims gate (reported) | **blocked** ² | not given | — |
| OC-011 | Bathurst Detailing Studio | `bf1031bb9304aa6f9b5d.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | — |
| OC-014 | East Coast Car Detail | `932b5c0a49eefefd5676.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | — |
| OC-002 | Dimi Professional Cleaning | `960a239e73fa2fda683b.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | **reserved for Cowork** (engine first-contact hold) |
| OC-017 | Diamond Commercial Cleaners Brisbane | `6c33998456ed1af20c29.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | **reserved for Cowork** (Gmail contact: match on company, not domain) |
| OC-010 | Q CLEAN | `f8ac7f548484e0e34e52.html` | pass, one copy note ³ | not visible here ¹ | reported | **blocked** ² | not given | **reserved for Cowork** |
| OC-007 | MeshPro Auto Care | `1f5b46299cb2cec194a5.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | — |
| OC-003 | JCS Commercial Cleaners | `062ad8d3c163d569904c.html` | pass | not visible here ¹ | reported | **blocked** ² | not given | **reserved for Cowork** |

Not in the email cohort (Josh handles in person / by phone; no email to them):
OC-004 Mirror Image Cleaning – Car Detailing (Orange walk-in, preview
`77e8b5f25fa816376d34.html`, pass) and OC-012 Northside Premium Detailing (phone
lane, preview `8a34b23b00fcba210d21.html`, pass).

¹ `claude-cowork/website-factory/data/drafts-2026-10-05.json` and the review
artifact are on Josh's PC / in Cowork's context and are not readable from this
session. Copy revision, published-contact evidence and draft hashes cannot be
confirmed here. Import them (with provenance) when shared; until then this column
stays "not visible", not "ready".

² No Outback Connections mailbox is connected anywhere that has been evidenced.
`help@outbackconnections.com.au` is the marketplace support and transactional
(Resend) identity and must not be used for cold outreach. A dedicated address or
no-extra-cost alias needs ownership, send-as, SPF/DKIM/DMARC and reply routing
checked, then one controlled send/reply test between owned inboxes.

³ OC-010 lists "Book a workplace visit" as a service card and dropdown option.
It reads as an action, not a service. Flag for Cowork's pre-send review; not
changed here.

## Preview checks performed (what "pass" means)

Production, custom domain, no site session (Vercel web-fetch, 4 Oct 23:43 UTC):
all ten pages and both assets returned **200** with
`X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`; every page
carries `<meta name="robots" content="noindex,nofollow,noarchive">` and the
"Concept preview by Outback Connections · Not the business's live website"
banner.

Browser (Playwright/Chromium, 5 Oct, the committed files at main `922fd6d`,
which is the deployed commit, served locally at 390×844 and 1440×900):

- No horizontal overflow at either width; no service label, heading, option or
  button is clipped (scrollWidth vs clientWidth on every visible text element).
- Disclosure banner visible at the top; footer says the business "has not
  approved or commissioned this example".
- CSS and JS load; no script errors.
- The guided form: required fields filled with sample values, submit shows the
  on-page brief headed "DEMONSTRATION — not sent or booked", and **no network
  request is made on submit**. The form has no `action`/`method`; "Copy brief"
  copies text to the clipboard. Nothing is captured, stored or emailed. The
  previews do not claim real enquiry capture.
- Links: in-page anchors, plus each business's own public website (and its
  contact/booking page where one was cited). No tracking, images or third-party
  scripts.

Not performed: a real-device check, and a browser run against the production
host itself (this session's network policy blocks the domain; the production
header/body check above used Vercel's fetch).

File hashes (SHA-256, first 12 hex) at `922fd6d`: f9a0…=83b86d667495,
960a…=ae4d4c8eca60, 062a…=c0abbb38f32b, 77e8…=253e79d7e661,
1f5b…=c7772706091f, f8ac…=7ccf145d306c, bf10…=68815293b73b,
8a34…=06a1d41f8b85, 932b…=0ca04546a303, 6c33…=be9877ef8851;
preview.css=6ae32590d410, preview.js=bfb526f7cfb6.

## Company reservations (duplicate-outreach prevention)

OC-002 Dimi, OC-003 JCS, OC-010 Q CLEAN and OC-017 Diamond are **reserved for
the Cowork pilot**: planned contacts, not contacted. The engine must hold first
contact for these companies at the company level (canonical company ID with
source IDs/aliases), not by email address or domain.

Enforcement status: **not enforced yet**. The engine and its dispatch path are
not in any repository this session can reach, and the marketplace has no
outbound sending code to guard. When the engine source is pushed, the
reservation check goes in the server-side dispatch guard (reservation, actual
contact history, suppression, current approval, replies, caps), with tests for a
second address at the same company and two concurrent dispatch attempts. A
confirmed Cowork send is reconciled from provider message IDs/timestamps; an
uncertain send stays unresolved, never retried blindly.

## Sender: the no-extra-cost path (DNS checked 5 Oct 2026)

Public DNS for `outbackconnections.com.au`:
- MX → Google Workspace (`aspmx.l.google.com` and alternates).
- SPF → `include:_spf.google.com` (via `dc-aa8e722993._spfm…`), `~all`.
- DKIM → `google._domainkey` published (and `resend._domainkey` for Resend).
- DMARC → `p=quarantine`, relaxed alignment.
- Resend sends from the separate `send.` subdomain (Amazon SES), so the
  marketplace's transactional mail doesn't share the root domain's reputation.

So the domain's mail already runs on Google Workspace, and Gmail-sent mail
from a Workspace address passes SPF/DKIM/DMARC. A Workspace **user alias**
(e.g. `josh@` on Josh's existing Workspace account) costs nothing extra: add
it in Google Admin, set it as a "Send mail as" address, and it shares the
inbox. A new Workspace **user** would add a monthly cost and needs approval.
Not verified from here: which Workspace account holds help@, whether an alias
already exists, and Gmail send-as setup. Those need Josh in Google Admin. Then
connect that Workspace account (not the fencing Gmail) to the reply workflow
and run one send/reply test between owned inboxes.

## What blocks the first real send

1. Josh's approval of the eight drafts (Cowork workflow).
2. A connected, verified Outback Connections sender with a tested reply route
   (the free Workspace-alias path above).
3. For OC-010: Cowork's call on the "Book a workplace visit" card.

The previews themselves are not a blocker.
