# Digital services: environment variables

Set these in Vercel (Project → Settings → Environment Variables). Never commit
their values. All are optional; the defaults keep everything switched off.

| Variable | What it does |
|---|---|
| `DIGITAL_SERVICES_PUBLIC` | The public `/digital-services` page and its nav/footer/sitemap links are shown only when this is exactly `on`. The matching privacy section is shown too. |
| `DIGITAL_SERVICES_LAUNCHED_ON` | The date (YYYY-MM-DD) the page was first switched on. Set it at launch and leave it for 12 months after the page is switched off: it keeps the privacy section visible while enquiries collected by the form are still kept. |
| `DIGITAL_SERVICES_OWNER_USER_ID` | Josh's Supabase auth user id (uuid). It is the only account allowed into `/dashboard/owner`; missing or malformed means nobody gets in. Use the same id for `app.ds_owner_user_id` when applying the pilot migration. |
| `DIGITAL_SERVICES_ALERT_TO` | Where new-enquiry alerts go (reference and link only). Blank falls back to `NOTIFICATION_EMAIL`, then help@. |
| `RESEND_API_KEY` | The existing mail transport. Without it, owner alerts are only logged and the owner dashboard shows alerts as Blocked. |
| `DIGITAL_SERVICES_OUTREACH_SENDER` | The outreach sender address, named explicitly. Never help@ (it's refused). |
| `DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON` | The date (YYYY-MM-DD) the owned-inbox send/reply test passed. Until it's set, the sender isn't verified and every first contact stays held. |
| `DIGITAL_SERVICES_GMAIL_CLIENT_ID` / `_CLIENT_SECRET` / `_REFRESH_TOKEN` | The Gmail API connection for the mailbox that owns the outreach alias (scopes gmail.send and gmail.readonly). Setup: `OUTREACH-SENDER.md`. Server-only. |
| `DIGITAL_SERVICES_OUTREACH_SENDING` | The separate switch for actually sending. Nothing sends unless it is exactly `on`, and nothing in the app calls the dispatcher yet. Leave unset until Josh approves. |
