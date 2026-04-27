# Breach response playbook

Operational runbook for actual or suspected data breaches. Distinct
from the higher-level `DATA-BREACH-RESPONSE-PLAN.md`, which documents
the policy-level response procedure, escalation chain, and stakeholder
templates.

This file is the **what to type and what to click** during the
incident itself.

## TL;DR

1. **Lock everything** — visit `/dashboard/admin/lockdown`, flip
   lockdown on with a short reason. Site-wide banner appears, signups
   and posting blocked.
2. **Snapshot the evidence** — run the queries below and save the
   output. Don't edit anything before snapshotting.
3. **Force-revoke all sessions** — see SQL below.
4. **Notify Josh and the lawyer** within 4 hours.
5. **Notify users + OAIC** within 72 hours if the breach is notifiable.
6. **Restore service** only after the cause is fixed and verified.

## 1. Lockdown the platform

### Easy path (recommended)

Sign in as an admin and visit:

```
https://www.outbackconnections.com.au/dashboard/admin/lockdown
```

Click **Activate lockdown**, type a short reason, confirm. The
`app_settings.lockdown` row flips to active and a maintenance banner
appears site-wide. New signups and new listings are blocked. Existing
sessions still work (you may want to revoke them — see step 3).

### SQL fallback (if the dashboard is itself compromised)

```sql
UPDATE app_settings
SET value = jsonb_build_object(
  'active', true,
  'reason', 'Suspected breach — investigation in progress',
  'activated_at', now()
),
updated_at = now()
WHERE key = 'lockdown';
```

### Email kill switch

If you don't trust the email pipe, set the env var on Vercel:

```
EMAIL_THROTTLE_DISABLED=true
```

Redeploy. All `sendThrottledEmail` calls return without sending.

## 2. Snapshot the evidence

Capture the state of the database BEFORE doing any cleanup so the
forensic trail is intact.

```sql
-- Current sessions
SELECT id, user_id, created_at, updated_at, ip
FROM auth.sessions
ORDER BY updated_at DESC
LIMIT 100;

-- Recent auth events
SELECT user_id, email, event_type, ip, user_agent, created_at
FROM auth_events
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- Recently created accounts
SELECT user_id, display_name, postcode, creation_ip, creation_user_agent, created_at
FROM user_profiles
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- Recent listings
SELECT id, anonymised_id, user_id, title, status, created_at
FROM listings
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- Recent edits
SELECT listing_id, edited_by, edited_at, edit_source
FROM listing_edits
WHERE edited_at > now() - interval '7 days'
ORDER BY edited_at DESC;
```

Export all results as CSV via the Supabase dashboard. Save them with
filename `<incident-id>-<table>-<timestamp>.csv` to a secure location.

## 3. Force-revoke sessions

Revoke every active session (forces all users to sign in again):

```sql
DELETE FROM auth.refresh_tokens;
-- After running this, sessions still cached in Supabase Auth's
-- internal cache will still validate for up to 1 hour. Bump the JWT
-- secret if a faster cutover is needed (last resort — invalidates
-- everyone simultaneously and can't be undone).
```

Revoke a single user's sessions:

```sql
DELETE FROM auth.refresh_tokens WHERE user_id = '<uuid>';
```

## 4. OAIC notification

If the breach involves personal information AND is likely to result
in serious harm, the OAIC must be notified within 72 hours under
the Notifiable Data Breaches scheme.

Use the form at: <https://www.oaic.gov.au/privacy/notifiable-data-breaches>

Required minimum content:

- Description of the breach (what happened, when, how discovered)
- Kinds of information involved
- Recommended remedial steps for affected individuals
- Outback Fencing & Steel Supplies Pty Ltd contact details (Josh
  Crawford, help@outbackconnections.com.au, ABN 76 674 671 820)

### Email template (also in DATA-BREACH-RESPONSE-PLAN.md)

```
To: enquiries@oaic.gov.au
Subject: Notifiable Data Breach — Outback Connections (NDB scheme)

Hi OAIC,

This is a notification of an eligible data breach under the Notifiable
Data Breaches scheme.

Entity: Outback Fencing & Steel Supplies Pty Ltd (ABN 76 674 671 820)
Operating: Outback Connections (www.outbackconnections.com.au)

Breach summary: <one paragraph>

Affected individuals: <approximate count + categories>

Personal information involved: <list>

Likely consequences for affected individuals: <serious harm assessment>

Steps taken: <containment, remediation>

Steps recommended for affected individuals: <reset password, watch for
phishing, etc.>

Contact for follow-up: Josh Crawford, help@outbackconnections.com.au,
<phone>

— Joshua Crawford
```

## 5. User notification template

```
To: <affected user email>
Subject: Important: Outback Connections account security notice

Hi,

We're writing because of a security incident affecting your account on
Outback Connections.

What happened:
<one paragraph in plain English>

What information was involved:
<bulleted list — be specific>

What we've done:
<containment actions in past tense>

What you should do:
1. Reset your password at <link>
2. Watch your inbox for any suspicious emails referencing this incident
   — we will only ever contact you from help@outbackconnections.com.au
3. <other context-specific actions>

We've also notified the OAIC (Office of the Australian Information
Commissioner) under the Notifiable Data Breaches scheme.

Sorry for the disruption. If you have questions, reply to this email.

— Outback Connections
Outback Fencing & Steel Supplies Pty Ltd
76 Astill Drive, Orange NSW 2800
Privacy: https://www.outbackconnections.com.au/privacy
Terms: https://www.outbackconnections.com.au/terms
```

## 6. Internal escalation

| When | Who | How |
|------|-----|-----|
| T+0  | Josh Crawford | help@outbackconnections.com.au, phone |
| T+4h | Lawyer (engaged separately) | as agreed |
| T+24h | OAIC if notifiable | online form (see above) |
| T+72h | Affected users via Resend | use template above |

## 7. Restoring service

Only restore after:

- Root cause identified and fixed in code
- Test suite passes against the fix
- A new build is deployed to Vercel
- All sessions revoked (step 3) so anyone re-signing-in goes through
  current auth flow
- An incident note added to `docs/legal-archive/<incident-id>.md`

To turn off lockdown: visit `/dashboard/admin/lockdown` and click
**Deactivate**.
