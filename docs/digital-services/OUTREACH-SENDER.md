# Connecting the outreach sender (Google Workspace, no extra cost)

Prepared by Claude Code, 5 October 2026. These are the exact steps for Josh.
Nothing here is done for him, and no step costs money:
- no new Workspace user;
- no Microsoft mailbox;
- no MX change;
- no paid API.

`help@` stays the support and transactional address and is **never** the
outreach sender (the code and the database both refuse it). The fencing and
personal mailboxes are not used. Proposed aliases such as `websites@` or
`josh@` don't exist yet; step 3 is where one gets created.

What's known (public DNS, 5 Oct): `outbackconnections.com.au` mail is on
Google Workspace (MX → `aspmx.l.google.com`, SPF includes `_spf.google.com`,
`google._domainkey` published, DMARC `p=quarantine`). Josh reads help@ in
Gmail. Not yet known: who the Workspace admin is, and whether help@ is a user,
an alias or a group.

## 1. Find the Workspace admin (5 minutes)

1. In a private browser window, sign in at <https://admin.google.com> as help@.
   - **The Admin console opens:** help@ is an admin. Carry on from step 2.
   - **"You need admin privileges":** help@ is not an admin. Go to the next point.
2. In help@'s Gmail, search `from:(workspace-noreply@google.com OR payments-noreply@google.com)`.
   - Google sends Workspace billing and admin notices to the admin and billing contacts. The "To" line names the admin account.
3. If nothing turns up, open <https://myaccount.google.com> as help@ and look under **Your organisation's administrator**. It can show the contact.

Write down which account is the super admin. Every later step in Admin console
uses that account.

## 2. Find out what help@ is (2 minutes)

In the Admin console, type `help@outbackconnections.com.au` into the top search bar.
- **A user:** that user's mailbox is the one Josh reads. It is "the mailbox" below.
- **An alternate address on a user:** the mailbox is that user.
- **A group:** a group has no mailbox of its own. Open Directory → Groups → that group → Members.
  The member whose Gmail Josh reads is the mailbox.

## 3. Add a free alias to that mailbox (2 minutes)

Directory → Users → the mailbox → **User information** → **Alternate email
addresses (email aliases)** → add one, for example `josh@` or `websites@`.
Josh chooses the name.

An alias is free and shares the same inbox, so replies land where Josh already
reads. Don't click **Add new user**: that adds a paid licence. New aliases can
take up to an hour to start receiving mail.

## 4. Let Gmail send as the alias (2 minutes)

Signed in to the mailbox's Gmail:
1. Settings (gear) → **See all settings** → **Accounts** → **Send mail as** → **Add another email address**.
2. Name: `Josh Crawford, Outback Connections`. Address: the alias. Leave **Treat as an alias** ticked.
3. Because it's an alias of the same Workspace account, Gmail adds it without a verification email. If it asks for one, the code arrives in this same inbox.

## 5. Owned-inbox send and reply test (5 minutes)

1. From the mailbox's Gmail, compose with **From:** the alias.
2. Send it to an inbox Josh owns **outside** this Workspace. It only receives the test; it never becomes the sender.
3. In the receiving inbox:
   - **Show original** must show `SPF: PASS`, `DKIM: PASS` and `DMARC: PASS`.
   - The message must not be in spam.
4. Reply to it. The reply must arrive in the mailbox's inbox, addressed to the alias.
5. Note the date. It goes into `DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON` (step 8).

## 6. A Gmail API client in Josh's own Google Cloud project (10 minutes, free)

Signed in at <https://console.cloud.google.com> **as the mailbox user**:
1. New project, for example `oc-outreach`. No billing account is needed.
2. **APIs & Services → Library → Gmail API → Enable**.
3. **OAuth consent screen**:
   - User type **Internal**: only this Workspace can use it, so no Google verification and no 7-day token expiry.
   - App name `Outback Connections outreach`, with the support and developer email set to the mailbox.
   - Scopes: add `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.readonly`. Nothing broader.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorised redirect URI: `https://developers.google.com/oauthplayground`.
   - Keep the client ID and secret on screen for step 7. Don't paste them into chat, a document or the repository.

If the Admin console restricts API access (Security → Access and data control
→ API controls), an **Internal** app is trusted by default. Don't change those
settings unless the next step fails.

## 7. Get the refresh token (3 minutes)

1. Open <https://developers.google.com/oauthplayground>.
2. Gear icon → tick **Use your own OAuth credentials** → paste the client ID and secret.
3. Step 1:
   - Paste the two scopes from step 6, separated by a space.
   - Click **Authorize APIs** and sign in **as the mailbox user**.
4. Step 2: **Exchange authorization code for tokens**. Copy the **Refresh token**.
5. Gear icon → untick the credentials and close the tab.

## 8. Put the values in Vercel (server-only)

Vercel → outback-connections → Settings → Environment Variables, **Production**
only. Paste each value directly; never into chat or the repository.

| Variable | Value |
|---|---|
| `DIGITAL_SERVICES_GMAIL_CLIENT_ID` | from step 6 |
| `DIGITAL_SERVICES_GMAIL_CLIENT_SECRET` | from step 6 |
| `DIGITAL_SERVICES_GMAIL_REFRESH_TOKEN` | from step 7 |
| `DIGITAL_SERVICES_OUTREACH_SENDER` | the alias from step 3 |
| `DIGITAL_SERVICES_OUTREACH_SENDER_VERIFIED_ON` | the date of the step 5 test (YYYY-MM-DD) |

**Leave `DIGITAL_SERVICES_OUTREACH_SENDING` unset.** It's the separate switch
for actually sending. It stays off until Josh approves the first three
messages and a release that calls the dispatcher.

## What the code does with it (PR #23, `lib/digital-services/outreach/`)

- **Before sending:**
  - Confirms the sender is an accepted send-as address of the connected mailbox.
  - Runs the first-contact guard: lane reservation, suppression, contact basis for the current address, the latest revision with all four approvals (Josh's own), and a verified sender that isn't help@.
- **Records intent:** writes a `send_attempt` with its own Message-ID. The database re-checks every rule and refuses a second attempt while one is unresolved.
- **Sends once.**
- **Records the outcome:**
  - `contacted` with Gmail's message and thread IDs;
  - `send_failed` on a definite Gmail refusal;
  - an unknown outcome (timeout, 5xx) stays unresolved. `reconcileAttempt()` finds it in the mailbox (by Message-ID, then recipient + exact subject in Sent). It never resends.
- **Reply sync:** `syncReplies()` records replies, opt-outs ("unsubscribe", "remove me", "not interested"…) and bounces once each. It never replies to anyone. A reply or opt-out holds any further contact.
- **Not wired:** nothing in the app calls the dispatcher yet. No route, button or schedule. Wiring it is a separate, approved change.

## Rollback

Delete the five Vercel variables, delete the OAuth client (Cloud console →
Credentials), and remove the alias in Admin console if it's no longer wanted.
Revoke the token at <https://myaccount.google.com/permissions> as the mailbox user.
