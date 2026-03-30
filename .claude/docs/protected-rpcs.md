# Protected RPCs — Deep Reference

Read this before planning any change that touches SQL functions or migration files.
For the full alphabetical list, see `supabase/core-rpcs/README.md`.

---

## Live Definition Map

Some critical functions have been redefined in later migrations. The **last** migration
wins — earlier definitions are dead code.

| Function | Live Migration | NOT in |
|----------|---------------|--------|
| `c1_context_logic` | `20260329000000_whatsapp_room_awareness.sql` (lines 10-971) | `20260327041845` has the original but it's been replaced |
| `c1_create_ticket` | `20260329000000_whatsapp_room_awareness.sql` (lines 977-end) | `20260327041845` has the original but it's been replaced |
| `c1_log_system_event` | `20260327041845_remote_schema.sql` | Was renamed from `c1_log_compliance_event` in `20260329140000` |
| All other core RPCs | `20260327041845_remote_schema.sql` | — |

**Why this matters:** If you need to back up or extend `c1_context_logic`, you MUST
copy from `20260329000000`, not from the main migration. The main migration has a
stale version that is missing room awareness.

---

## Dependency Graph

### WhatsApp Intake Chain
```
Twilio webhook
  -> yarro-tenant-intake edge function
    -> c1_context_logic (returns conversation state + AI instruction)
      -> c1_find_property_candidate (property search)
      -> c1_find_tenant_candidate (tenant search)
      -> norm_uk_postcode (postcode normalization)
    -> c1_convo_append_outbound (normal branch)
    -> c1_convo_finalize / c1_convo_finalize_quick (final/nomatch/duplicate branch)
    -> c1_create_ticket (creates ticket + messages)
      -> TRIGGERS: c1_ledger_on_ticket_insert, c1_set_sla_due_at, c1_normalize_ticket_fields
      -> WEBHOOK: yarro-ticket-notify
```

### Ticket Notification Chain
```
yarro-ticket-notify edge function
  -> c1_ticket_context (loads ticket + dispatch info)
  -> c1_is_within_business_hours (check if OOH)
    -> If OOH + emergency: c1_get_ooh_contacts
  -> c1_contractor_context (routes to contractors)
  -> WEBHOOK: yarro-dispatcher (for each contractor)
```

### Contractor Dispatch Chain
```
yarro-dispatcher edge function
  -> c1_contractor_mark_sent (records Twilio SID)
  -> c1_msg_merge_contractor (stores portal token)
  -> c1_pm_mark_sent (records PM notification)
  -> c1_landlord_mark_sent (if landlord notified)
  -> c1_prepare_landlord_sms (landlord SMS content)
  -> c1_finalize_job (if auto-approved)
```

### Portal Submission Chain
```
yarro-scheduling edge function
  -> c1_submit_contractor_schedule (books appointment)
  -> c1_submit_contractor_completion (marks done)
  -> c1_submit_contractor_not_completed (marks failed)
  -> c1_submit_reschedule_request (reschedule)
  -> c1_submit_reschedule_decision (approve/reject)
  -> c1_submit_tenant_confirmation (tenant confirms)
  -> c1_job_reminder_payload (reminder context)
  -> c1_message_next_action (advances state)
  -> c1_msg_merge_contractor (updates contractor data)
```

### State Machine Core
```
c1_message_next_action (9+ callers)
  -> c1_compute_next_action (determines next step)

c1_trigger_recompute_next_action (trigger)
  -> c1_compute_next_action
```

### High-Dependency Functions
- `c1_message_next_action` — **9+ direct callers**
- `c1_msg_merge_contractor` — **11 call sites**
- `get_pm_id` — **~33 RLS policies depend on it**

---

## Trigger Map

| Table | Event | Trigger Function | What It Does |
|-------|-------|-----------------|-------------|
| `c1_tickets` | INSERT | `c1_ledger_on_ticket_insert` | Creates audit ledger entry |
| `c1_tickets` | UPDATE | `c1_ledger_on_ticket_update` | Updates audit ledger |
| `c1_tickets` | INSERT/UPDATE | `c1_trigger_recompute_next_action` | Recomputes ticket state |
| `c1_tickets` | INSERT/UPDATE | `c1_set_sla_due_at` | Sets SLA due date |
| `c1_tickets` | INSERT/UPDATE | `c1_normalize_ticket_fields` | Normalizes phone/postcode |
| `c1_tickets` | UPDATE | `c1_trigger_same_day_reminder` | Same-day reminder check |
| `c1_tickets` | INSERT/UPDATE | `trg_c1_events_on_ticket` | Emits event for activity feed |
| `c1_messages` | INSERT/UPDATE | `c1_trigger_recompute_next_action` | Recomputes ticket state |
| `c1_messages` | INSERT/UPDATE | `trg_c1_events_on_message` | Emits event for activity feed |
| `c1_job_completions` | INSERT/UPDATE | `c1_trigger_recompute_next_action` | Recomputes ticket state |
| `c1_contractors` | INSERT/UPDATE | `auto_sync_property_mappings` | Syncs categories to properties |

---

## Cron Schedule

| Interval | Function / Edge Function | Purpose |
|----------|------------------------|---------|
| Every 5 min | `c1_process_delayed_dispatches` | Morning dispatch for OOH tickets |
| Every 15 min | `c1_contractor_timeout_check` | Chase contractors who haven't responded |
| Every 15 min | `c1_landlord_timeout_check` | Chase landlords who haven't responded |
| Every hour | `c1_completion_followup_check` | Follow up on silent completions |
| Daily 8am | `yarro-job-reminder` -> `c1_job_reminder_list` | Daily job reminder digest |
| Daily 8am | `yarro-compliance-reminder` -> `get_compliance_expiring` | Compliance expiry warnings |
| Daily 9am | `yarro-rent-reminder` -> `get_rent_reminders_due` | Rent payment reminders |
