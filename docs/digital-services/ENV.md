# Digital services: environment variables

Set these in Vercel (Project → Settings → Environment Variables). Never commit
their values. All are optional; the defaults keep everything switched off.

| Variable | What it does |
|---|---|
| `DIGITAL_SERVICES_PUBLIC` | The public `/digital-services` page, its nav/footer/sitemap links and the matching privacy section are shown only when this is exactly `on`. |
| `DIGITAL_SERVICES_OWNER_USER_ID` | Josh's Supabase auth user id (uuid). It is the only account allowed into `/dashboard/owner`; missing or malformed means nobody gets in. Use the same id for `app.ds_owner_user_id` when applying the pilot migration. |
| `DIGITAL_SERVICES_ALERT_TO` | Where new-enquiry alerts go (reference and link only). Blank falls back to `NOTIFICATION_EMAIL`, then help@. |
| `RESEND_API_KEY` | The existing mail transport. Without it, owner alerts are only logged and the owner dashboard shows alerts as Blocked. |
| `DIGITAL_SERVICES_OUTREACH_SENDER` | The outreach sender address, named explicitly. Never help@ (it's refused). |
| `DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON` | The date (YYYY-MM-DD) the owned-inbox send/reply test passed. Until it's set, the sender isn't verified and every first contact stays held. |
