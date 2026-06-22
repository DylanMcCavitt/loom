---
name: inbox-triage
description: >-
  Clean and organize Gmail and Outlook inboxes. Use when the user
  asks to clean email, remove inbox clutter, check spam or junk, unsubscribe from
  junk mail, group emails, filter promotions/updates, preserve recruiter or job
  messages, mark job-related conversations as important, or recover job offers,
  declines, interviews, and scheduling emails from spam.
compatibility: Requires browser or desktop email access. Prefer official mail APIs or connectors when available; otherwise use Computer Use against the active Gmail or Outlook browser window.
---

# Inbox Triage

Use this skill to help the user clean Gmail and Outlook while preserving anything that could matter for jobs, interviews, recruiting, moving/admin tasks, money/security, or real personal conversations.

The recorded workflow showed the user working in a browser with Outlook and Gmail tabs, checking Outlook Inbox and Junk Email, then Gmail Inbox, Spam, Promotions, Updates, and returning to Inbox. Treat the recording as evidence of the intended triage pattern, not as a coordinate script.

## Core Policy

Optimize for a quieter main inbox without losing opportunities.

- Remove obvious clutter from the main inbox: ads, newsletters, promotions, game/retail marketing, notification digests, and repeated automated updates.
- Preserve human/actionable messages: recruiters, hiring managers, founders, referrals, interviews, job offers, declines, schedule requests, housing/moving/admin messages, security alerts, invoices, account changes, and anything with a direct question.
- Check spam/junk specifically for job-related emails that were incorrectly filtered.
- Mark job-related messages as important, starred, flagged, or pinned depending on the mail app.
- Put job-related items into a dedicated group:
  - Gmail: apply a label such as `Jobs`, `Job Leads`, or the user's existing job-related label if visible.
  - Outlook: apply a category such as `Jobs` or move/copy to an existing job-related folder if visible.
- Keep a concise report of what changed and what still needs the user's decision.

## Safety Rules

Email cleanup can lose important context, so act conservatively.

- Do not delete messages unless the user explicitly asks for deletion in this session.
- Do not report messages as phishing/spam unless the user explicitly asks or the message is clearly malicious and you ask for confirmation.
- Prefer Archive, Move out of Inbox, Categorize, Label, Mark important, Flag, or Mark not junk over Delete.
- Use unsubscribe only for obvious bulk senders the user does not open: retail, newsletters, entertainment, promotions, automated marketing, or recurring digests.
- Do not unsubscribe from banks, brokerages, tax/payroll, health, legal, government, utilities, job boards with active applications, apartment/housing portals, recruiters, or any sender tied to account access or employment.
- Do not expose or repeat sensitive message contents in chat. Summarize by sender type and action, not by private details.
- If a message has mixed signals, leave it in place and add it to the review list.

## Preferred Tools

1. Use official Gmail/Outlook/Microsoft Graph connectors when available because labels, filters, and unread state are more reliable through semantic APIs.
2. If no connector is available, use Computer Use on the active browser window.
3. In a browser, prefer visible semantic controls and accessibility targets over coordinates:
   - Gmail: search box, checkbox, Archive, Report spam, Delete, Mark unread/read, More, Labels, More labels, Spam, Promotions, Updates, Inbox, Back to Inbox.
   - Outlook: Inbox, Junk Email, checkbox, Move, Categorize, Sweep, Archive, Mark as junk/not junk, flag/important controls, folder/category menus.

## Setup

Ask or infer these before making changes:

- Which accounts to clean: Gmail, Outlook, or both.
- The job group name to use. Default to `Jobs` if the user does not specify.
- Whether unsubscribe is allowed. Default to safe unsubscribe for obvious promotional bulk mail only.
- Whether the user wants a dry run first. Use a dry run when the inbox state is unfamiliar or the request is broad.

## Triage Loop

For each mailbox, work in small visible batches.

1. Start in the main Inbox.
2. Scan the visible rows by sender, subject, preview, unread state, and visible labels.
3. Classify each visible email:
   - `job-important`: recruiter, hiring manager, interview, offer, decline, application update, referral, schedule request, or career conversation.
   - `human-actionable`: direct personal/admin message requiring a response or decision.
   - `transactional-keep`: security, account, billing, order execution/confirmation, utilities, housing, legal, medical, government, tax, payroll.
   - `clutter-archive`: ads, newsletters, promotions, games, retail, low-value digests, event marketing, content recommendations.
   - `needs-review`: unclear sender, ambiguous subject, or possible opportunity hidden in a promotional/newsletter wrapper.
4. Apply actions:
   - For `job-important`: mark important/star/flag, apply the job label/category, and keep in Inbox unless the user wants a dedicated folder workflow.
   - For `human-actionable`: keep in Inbox and optionally flag if it needs a response.
   - For `transactional-keep`: keep or archive according to user preference; never unsubscribe.
   - For `clutter-archive`: archive or move out of Inbox. If the sender is clearly bulk marketing and unsubscribe is allowed, use the visible unsubscribe flow.
   - For `needs-review`: leave in place or put in a temporary review group.
5. After each batch, confirm the inbox count or visible list changed as expected.

## Spam And Junk Review

Always check spam/junk before finishing when the user asks for job cleanup.

Search or scan for terms such as:

- interview
- recruiter
- hiring
- application
- offer
- opportunity
- next steps
- schedule
- calendar
- decline
- not moving forward
- unfortunately
- role
- position
- founder
- talent
- careers

For likely job messages in Spam/Junk:

1. Mark as not spam/not junk.
2. Move to Inbox or the job group if the UI supports it.
3. Apply the job label/category.
4. Mark important/star/flag if it needs follow-up.
5. Include it in the final report as recovered from spam/junk without quoting private content.

For obvious spam:

- Leave it in Spam/Junk unless the user asked for cleanup there.
- Do not unsubscribe from suspicious spam; unsubscribe links in spam are not trustworthy.

## Gmail Notes

- Gmail inbox cleanup often works fastest by using checkboxes for obvious clutter rows, then Archive.
- Use `More labels` or the Labels menu to reach categories such as Spam, Promotions, Updates, Forums, Purchases, and custom labels.
- For job messages, use star/important marker and apply the job label.
- For clutter from an open message, use Gmail's unsubscribe link only when it is a recognized bulk sender.
- If a message is opened during triage, use `Back to Inbox` before continuing batch work.

## Outlook Notes

- Outlook cleanup often uses right-click/context menus, `Move`, `Categorize`, `Archive`, and Junk Email controls.
- For job messages, use flag/important and apply the job category.
- In Junk Email, use `Not junk` or move to Inbox for legitimate job-related messages.
- Use `Categorize` for grouping when a folder move would hide active opportunities from the Inbox.
- Be careful with `Sweep`: only use it for clearly repeated clutter senders after confirming the rule behavior.

## Unsubscribe Workflow

Only unsubscribe when the sender is clearly unwanted bulk mail.

1. Open the message or use the list's unsubscribe affordance if visible.
2. Prefer first-party Gmail/Outlook unsubscribe controls over links inside the message body.
3. If the mail app shows a confirmation dialog, confirm only for obvious clutter.
4. After unsubscribing, archive the message.
5. Do not fill external unsubscribe forms with personal data unless the user explicitly approves.

## Filters And Rules

Create durable filters only for repeated clutter patterns.

- Gmail: create a filter from sender or search, then skip Inbox/archive, apply category/label, or mark as read.
- Outlook: use Rules or Sweep for repeated sender patterns.
- Before creating a rule, state the proposed rule and get confirmation unless the user explicitly asked for automated filtering.
- Never create a rule that could hide job, financial, security, housing, legal, or personal messages.

## Final Report

Report only operational outcomes. Do not quote private email bodies.

Use this structure:

```markdown
Inbox triage complete.

- Cleaned: [short count or category summary]
- Preserved: [job/human/actionable categories]
- Recovered from spam/junk: [count and sender type, no sensitive details]
- Job group used: [label/category/folder]
- Unsubscribed: [count or sender categories]
- Needs review: [short list of ambiguous sender types or actions needing approval]
```

If no changes were made because the run was a dry run, say that clearly and list the recommended actions.
