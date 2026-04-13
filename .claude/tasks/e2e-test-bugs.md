# E2E Test Bugs — 2026-04-11

## Summary
- **Total:** 16
- **Blockers:** 7
- **High:** 7
- **Medium:** 2
- **Medium:** 0
- **Low:** 0

---

## Bugs

### BUG-1: Email onboarding message not sent to tenant
- **Test:** 17c
- **Severity:** High
- **Expected:** Tenant with email contact method receives onboarding email (same as WhatsApp tenants get WhatsApp onboarding)
- **Actual:** WhatsApp onboarding sends fine, email onboarding does not send
- **Trace:** Edge function / outbound messaging — email channel path likely not implemented or misconfigured

### BUG-2: rent_due_day not saved when creating room
- **Test:** 17b
- **Severity:** Blocker
- **Expected:** Room 1 created with rent_due_day = 1
- **Actual:** rent_due_day = null in database despite being set in the form
- **Trace:** Room creation form / API — field not being persisted

### ~~BUG-3: INVALID~~ — Rent ledger entries DO auto-generate
- Ledger entries were created on tenant assignment. Earlier SQL query may have had a filter mismatch. Confirmed by unique constraint preventing re-insert.

### BUG-4: Rent cron doesn't create ticket or flip status to overdue
- **Test:** 5e / 5g
- **Severity:** Blocker
- **Expected:** Rent cron should (a) flip ledger status from `pending` → `overdue` when past due, and (b) create a dashboard ticket at 5+ days overdue
- **Actual:** Cron sent chase_10d WhatsApp correctly, but status remains `pending` and zero tickets created. The reminder escalation works but the status change + ticket creation logic is missing or broken.
- **Trace:** Edge function `yarro-rent-reminder` — sends messages but doesn't call status flip or ticket creation

### ~~BUG-5: INVALID~~ — Realtime works
- Dashboard auto-updated when rent ticket was inserted. Earlier non-update was because no ticket was created (BUG-4).

### BUG-6: Compliance reminder fails to create ticket — RPC ambiguity
- **Test:** 4c
- **Severity:** Blocker
- **Expected:** Compliance cron creates a ticket for cert expiring in 59 days
- **Actual:** Error: "Could not choose the best candidate function" between two overloads of `c1_create_manual_ticket` — one with `p_maintenance_trade` + `p_deadline_date`, one without. Ticket not created.
- **Trace:** Edge function `yarro-compliance-reminder` → RPC `c1_create_manual_ticket` — needs explicit cast or the old overload needs dropping

### BUG-7: Compliance PM WhatsApp — garbled template
- **Test:** 4c
- **Severity:** High
- **Expected:** "Your Gas Safety at 42 Test Street expires in 59 days on Tuesday 9th Jun"
- **Actual:** "expires in Tuesday 9th Jun days on 59" — days_remaining and expiry_date values swapped in template
- **Trace:** Edge function `yarro-compliance-reminder` — message template interpolation

### BUG-18: Closed rent ticket has reason `rent_overdue` instead of `rent_cleared`
- **Test:** 5j
- **Severity:** Medium
- **Expected:** After full payment, ticket closes with `next_action_reason = rent_cleared`
- **Actual:** `next_action_reason = rent_overdue` — reason not updated on close
- **Trace:** Rent payment handler — closes ticket but doesn't update reason to `rent_cleared`

### BUG-17: Failed email to landlord resets ticket to "new/triage" — loses all context
- **Test:** 2d
- **Severity:** High
- **Expected:** If landlord email fails to send, ticket should stay in current state with an error flag — PM can see the quote, contractor, and retry/switch channel
- **Actual:** Ticket resets to Needs Action as "triage and assign" — a blank state with no trace of the contractor, quote, or failed email attempt. All progress lost.
- **Trace:** Edge function error handling — email send failure triggers a state reset instead of preserving context and flagging the error

### BUG-16: Landlord decline leaves ticket in "waiting" instead of "needs_action"
- **Test:** 2c (landlord decline)
- **Severity:** High
- **Expected:** Landlord declines quote → ticket moves to Needs Action with `landlord_declined` reason
- **Actual:** Drawer correctly shows "Landlord declined" but ticket stays in Waiting column. `next_action` not updated to `needs_action`.
- **Trace:** Trigger / router — `c1_compute_next_action` not recognising `landlord_declined` as a `needs_action` bucket, or trigger not re-firing after landlord response

### BUG-14: Email notifications fail — "notifications@yarro.ai" address not found
- **Test:** 2d
- **Severity:** Blocker
- **Expected:** Landlord receives email to approve/decline quote over auto-approve limit
- **Actual:** Immediate mail delivery failure — "notifications@yarro.ai" address not found. No email domain/mailbox configured.
- **Trace:** Infrastructure — need to set up email sending domain (e.g. via Resend, SendGrid, or Supabase email). Currently no working outbound email.

### BUG-15: Landlord email approve/decline asks to reply "approve or decline" instead of portal link
- **Test:** 2d
- **Severity:** High
- **Expected:** Landlord email contains a portal link to approve/decline (like contractor portal)
- **Actual:** Email instructs landlord to reply with "approve" or "decline" text. This is fragile and won't work — especially since the sending email doesn't even exist (BUG-14).
- **Trace:** Edge function email template — should use landlord portal link `/landlord/{token}` instead of reply-based flow

### BUG-13: Manual ticket form stuck in "creating" state after submission
- **Test:** 2a (second ticket creation)
- **Severity:** High
- **Expected:** After ticket is created and drawer closes, form resets for next use
- **Actual:** Drawer closed but form retains previous data and button stays in "creating" state. Form is frozen — can't submit without refreshing.
- **Trace:** Frontend — form state not resetting after successful submission. Missing `reset()` or `setSubmitting(false)` in the onSuccess callback.

### BUG-12: WhatsApp decline overrides already-approved quote — state conflict
- **Test:** 1d (edge case)
- **Severity:** Blocker
- **Expected:** WhatsApp approve/decline flow should be invalidated after quote is already actioned in the dashboard. Should return "already approved" or similar.
- **Actual:** Declining via WhatsApp after dashboard approval resets ticket to "no contractors available" / "assign contractor". Contractor already received scheduling link but ticket now says no contractors. Complete state corruption.
- **Trace:** Edge function `yarro-outbound-reply` — processes WhatsApp flow response without checking current ticket state. Needs a guard: if quote already actioned, reject the flow response.

### BUG-11: Contractor scheduling fails — "job_stage" column doesn't exist
- **Test:** 1e
- **Severity:** Blocker
- **Expected:** Contractor schedules job via portal, ticket moves to "Scheduled"
- **Actual:** Edge function `yarro-scheduling` errors: `column "job_stage" of relation "c1_tickets" does not exist`. Scheduling does not persist.
- **Trace:** Edge function `yarro-scheduling` → references removed/renamed column `job_stage`. Likely a migration removed it or it was never created.

### BUG-10: Dashboard stuck on "Awaiting landlord" after auto-approve fires
- **Test:** 1d
- **Severity:** Blocker
- **Expected:** Quote £250 under £500 auto-approve limit → skip landlord → dashboard shows "Awaiting booking" / contractor scheduling
- **Actual:** WhatsApp flow works correctly (auto-approved message sent, contractor told to schedule), but dashboard shows "Awaiting landlord approval". The `next_action_reason` wasn't updated after auto-approve.
- **Trace:** Trigger / router — auto-approve fires correctly for messaging but doesn't re-run `c1_compute_next_action` to update the bucket/reason

### BUG-9: PM not notified when manual ticket is created
- **Test:** 1a
- **Severity:** Medium
- **Expected:** PM receives WhatsApp/email confirmation when a manual ticket is created and contractor dispatched
- **Actual:** Contractor gets WhatsApp, landlord gets email, PM gets nothing
- **Trace:** Edge function dispatch flow — PM notification step missing for manual ticket creation

### BUG-19: Contractor portal doesn't show tenant reschedule request
- **Test:** 12d
- **Severity:** High
- **Expected:** When tenant requests a reschedule, contractor portal shows the proposed new date, reason, and approve/decline options
- **Actual:** Contractor portal just shows the normal "job scheduled" success state. No indication a reschedule was requested. Tenant's proposed date and reason are invisible to the contractor.
- **Trace:** Contractor portal frontend — not reading `reschedule_requested`, `reschedule_date`, `reschedule_reason` from the ticket data returned by `c1_get_contractor_ticket`

### BUG-8: Compliance contractor not notified despite message claiming so
- **Test:** 4c
- **Severity:** High
- **Expected:** Contractor receives WhatsApp/SMS about cert renewal needed
- **Actual:** PM message says "Your contractor Test Plumber has been notified" but contractor received nothing. Likely because ticket creation failed (BUG-6) so dispatch never ran.
- **Trace:** Downstream of BUG-6 — fix ticket creation first, then re-test
