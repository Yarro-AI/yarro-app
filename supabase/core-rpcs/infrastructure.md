# Infrastructure RPCs

Trigger functions, cron jobs, logging, dashboard, and RLS/auth utilities.
These run automatically — failures are often silent and invisible.

---

## Trigger Functions

These execute automatically on INSERT/UPDATE. Breaking them causes silent data corruption.

### c1_trigger_recompute_next_action
- **Purpose:** Trigger dispatcher — recomputes ticket state on every change.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_tickets` INSERT/UPDATE, `c1_messages` INSERT/UPDATE, `c1_job_completions` INSERT/UPDATE
- **Calls:** `c1_compute_next_action`
- **Breaks:** Ticket routing broken — next_action never updated, UI shows stale state

### c1_set_sla_due_at
- **Purpose:** Computes and sets SLA due date on ticket creation/update.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_tickets` INSERT/UPDATE
- **Breaks:** SLA never set — no escalation triggers, no overdue detection

### c1_ledger_on_ticket_insert
- **Purpose:** Creates audit ledger entry when ticket is inserted.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_tickets` INSERT
- **Breaks:** Audit trail empty for new tickets

### c1_ledger_on_ticket_update
- **Purpose:** Updates audit ledger on ticket state changes.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_tickets` UPDATE
- **Breaks:** Audit trail missing state transitions

### c1_normalize_ticket_fields
- **Purpose:** Normalizes phone numbers, postcodes on ticket rows.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_tickets` INSERT/UPDATE
- **Breaks:** Denormalized data — phone lookups and postcode matching fail

### auto_sync_property_mappings
- **Purpose:** Syncs contractor category mappings to properties.
- **Live in:** `20260327041845_remote_schema.sql`
- **Fires on:** `c1_contractors` INSERT/UPDATE
- **Breaks:** New contractor categories not available for dispatch routing

---

## Cron-Triggered Functions

These run on pg_cron schedules. If broken, automated workflows stop silently.

### c1_contractor_timeout_check
- **Purpose:** Reminds contractor after 15 min no response. Escalates to PM if still no response. Logs CONTRACTOR_TIMED_OUT audit events.
- **Live in:** `20260419500000_contractor_lifecycle_guards.sql`
- **Schedule:** Every 15 minutes (`*/15 * * * *`)
- **Breaks:** Contractors never chased — tickets stuck waiting for response
- **Modified:** 2026-04-13 — Added CONTRACTOR_TIMED_OUT audit events (SSOT Finding #14)

### c1_landlord_timeout_check
- **Purpose:** Escalates stalled tickets when landlord doesn't respond.
- **Live in:** `20260327041845_remote_schema.sql`
- **Schedule:** Every 15 minutes (`15 * * * *`)
- **Breaks:** Landlords never chased — escalated tickets stuck

### c1_completion_followup_check
- **Purpose:** Auto-sends followup if contractor silent on completion.
- **Live in:** `20260327041845_remote_schema.sql`
- **Schedule:** Hourly (`0 * * * *`)
- **Breaks:** Completion reports not pursued

### c1_process_delayed_dispatches
- **Purpose:** Processes tickets queued during OOH for morning dispatch.
- **Live in:** `20260327041845_remote_schema.sql`
- **Schedule:** Every 5 minutes (`*/5 * * * *`)
- **Breaks:** Out-of-hours tickets never dispatched at 9am

### c1_job_reminder_list
- **Purpose:** Returns jobs due for reminder today.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-job-reminder` edge function (daily 8am cron)
- **Breaks:** Daily reminder digest empty

### c1_job_reminder_payload
- **Purpose:** Gets full ticket context for reminder notifications.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function (6 call sites)
- **Breaks:** Reminder SMS has missing context

---

## Support & Logging

### c1_is_within_business_hours
- **Purpose:** Checks if current time is within PM's configured business hours.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-ticket-notify` edge function
- **Breaks:** Emergency routing fails — all tickets treated as in-hours OR out-of-hours

### c1_get_ooh_contacts
- **Purpose:** Fetches out-of-hours emergency contacts for PM.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-ticket-notify` edge function
- **Breaks:** Emergency tickets have no one to route to

### c1_pm_mark_sent
- **Purpose:** Records PM SMS dispatch for audit trail.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-dispatcher` edge function

### c1_landlord_mark_sent
- **Purpose:** Records landlord SMS dispatch.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-dispatcher` edge function

### c1_prepare_landlord_sms
- **Purpose:** Prepares landlord SMS content from ticket data.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-dispatcher` edge function

### c1_finalize_job
- **Purpose:** Finalizes job after completion verified.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-dispatcher` edge function

### c1_process_job_completion
- **Purpose:** Processes job completion with media/notes (source-agnostic).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-completion` edge function

### c1_toggle_hold
- **Purpose:** Pauses/resumes ticket processing.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ticket-detail-modal.tsx`, `tickets/page.tsx`

### c1_log_event
- **Purpose:** Logs system events to c1_events table (ticket-based).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `_shared/events.ts` in edge functions

### c1_log_outbound
- **Purpose:** Logs SMS sends for compliance audit.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `_shared/twilio.ts` in edge functions

### c1_log_system_event
- **Purpose:** Logs automated system actions (compliance reminders, rent reminders).
- **Live in:** `20260327041845_remote_schema.sql` (renamed in `20260329140000`)
- **Called by:** `yarro-rent-reminder`, `yarro-compliance-reminder` edge functions

---

## Dashboard

### c1_get_dashboard_todo
- **Purpose:** Fetches prioritized to-do list scored by system.
- **Live in:** `20260405600000_dashboard_todo_perf.sql`
- **Called by:** Dashboard `page.tsx`
- **Breaks:** Dashboard to-do queue empty

### c1_get_recent_events
- **Purpose:** Fetches recent system events for activity feed.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** Dashboard `page.tsx`
- **Breaks:** Activity feed empty

---

## RLS / Auth Utility

### get_pm_id
- **Purpose:** Gets current PM ID from auth session. Used by ALL RLS policies.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** Every RLS policy (~33 policies)
- **Breaks:** **ALL authenticated queries fail** — users locked out of everything

### norm_uk_postcode
- **Purpose:** Normalizes UK postcodes for consistent matching.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `c1_context_logic`, `c1_normalize_ticket_fields`
- **Breaks:** Postcode matching fails — tenants not linked to properties

### c1_find_property_candidate
- **Purpose:** Searches for property by raw text input (postcode/address).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `c1_context_logic`
- **Breaks:** WhatsApp intake can't match properties

### c1_find_tenant_candidate
- **Purpose:** Searches for tenant in property by name/phone.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `c1_context_logic`
- **Breaks:** WhatsApp intake can't match tenants

### c1_upsert_contact
- **Purpose:** Creates/updates contact with verified_by tracking.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** Various intake and submission flows
- **Breaks:** Contact records not created/updated
