# Core RPCs — DO NOT MODIFY

These SQL functions are the production backbone of Yarro PM.
They handle WhatsApp conversations, ticket lifecycle, contractor
dispatch, portal authentication, cron automation, and audit logging.

## Rules

1. **NEVER** write `CREATE OR REPLACE FUNCTION` for any function listed here
   unless Adam explicitly requests it
2. **NEVER** `DROP` any of these functions
3. **NEVER** alter the signature (parameters, return type) of these functions
4. If a new feature needs to extend a protected function, follow the
   **Safe Modification Protocol** below
5. After any approved modification, update the relevant category file
   with the new migration location and line range

## Safe Modification Protocol

When Adam explicitly approves a change to a protected RPC:

1. Back up the current definition from the **live** migration
   (check `protected-rpcs.md` for which migration has the current version)
2. Copy the full function into a **new** migration file
3. Make your surgical addition
4. Test in Supabase SQL editor before pushing
5. Run `supabase db push` to deploy
6. Update the category file in this folder with new migration + line range

## Protected Functions (alphabetical)

```
auto_sync_property_mappings
c1_allocate_to_landlord
c1_complete_handoff_ticket
c1_completion_followup_check
c1_compute_next_action
compute_compliance_next_action
compute_maintenance_next_action
compute_rent_arrears_next_action
create_rent_arrears_ticket
c1_context_logic
c1_contractor_context
c1_contractor_mark_sent
c1_contractor_timeout_check
c1_convo_append_outbound
c1_convo_finalize
c1_convo_finalize_quick
c1_create_manual_ticket
c1_create_ticket
c1_dispatch_from_review
c1_find_property_candidate
c1_find_tenant_candidate
c1_finalize_job
c1_get_contractor_quote_context
c1_get_contractor_ticket
c1_get_dashboard_todo
c1_get_landlord_ticket
c1_get_ooh_contacts
c1_get_ooh_ticket
c1_get_recent_events
c1_get_tenant_ticket
c1_inbound_reply
c1_is_within_business_hours
c1_job_reminder_list
c1_job_reminder_payload
c1_landlord_mark_sent
c1_landlord_timeout_check
c1_ledger_on_ticket_insert
c1_ledger_on_ticket_update
c1_log_event
c1_log_outbound
c1_log_system_event
c1_manager_decision_from_app
c1_message_next_action
c1_msg_merge_contractor
c1_normalize_ticket_fields
c1_pm_mark_sent
c1_prepare_landlord_sms
c1_process_delayed_dispatches
c1_process_job_completion
c1_redispatch_contractor
c1_set_sla_due_at
c1_submit_contractor_completion
c1_submit_contractor_not_completed
c1_submit_contractor_schedule
c1_submit_landlord_outcome
c1_submit_ooh_outcome
c1_submit_reschedule_decision
c1_submit_reschedule_request
c1_submit_tenant_confirmation
c1_ticket_context
c1_toggle_hold
c1_trigger_recompute_next_action
c1_upsert_contact
get_pm_id
norm_uk_postcode
record_rent_payment
```

## Category Files

| File | What It Covers |
|------|---------------|
| [ticket-lifecycle.md](ticket-lifecycle.md) | State machine, contractor dispatch, PM decisions, submissions (28 functions) |
| [infrastructure.md](infrastructure.md) | Triggers, cron jobs, logging, RLS/auth utilities (28 functions) |
| [portals.md](portals.md) | Token-based portal authentication (5 functions) |

## New Protected RPCs (Ticket State Model Refactor)

```
c1_ticket_detail — Single RPC for drawer, returns universal + category-specific data
c1_compute_priority_score — Shared scoring function, called by dashboard + drawer RPCs
c1_set_awaiting_tenant — Sets/clears awaiting_tenant flag + audit event
c1_mark_contractor_withdrawn — Marks contractor withdrawn, cycles to next or sets no_contractors
c1_submit_contractor_reschedule_request — Contractor-initiated reschedule via portal
c1_compliance_auto_ticket — Daily cron, scans certs, creates tickets with dedup
```

## Dropped RPCs (Ticket State Model Refactor)

```
DROPPED: c1_get_dashboard_todo_extras — replaced by c1_get_dashboard_todo (all items are tickets)
DROPPED: c1_set_sla_due_at — SLA logic consolidated into c1_trigger_recompute_next_action
```

## NOT Protected (still iterating)

These RPCs are newer and actively being developed:

- Compliance: `compliance_get_certificates`, `compliance_upsert_certificate`, `compliance_delete_certificate`, `compliance_get_summary`, `compliance_get_all_statuses`, `compliance_get_property_status`, `compliance_get_todos`, `get_compliance_expiring`, `compliance_submit_contractor_renewal`
  - **SSOT:** `compliance_get_all_statuses` is the sole owner of status CASE logic. `compliance_get_summary` aggregates from it (rewritten 2026-04-02). Do NOT add status logic elsewhere.
  - **Dropped (2026-04-04):** `compliance_set_property_type`, `compliance_upsert_requirements`, `compliance_auto_populate_requirements` trigger + function. Requirements layer removed — compliance is now opt-in, no auto-populated defaults by property type. See migration `20260404800000_drop_compliance_auto_gen.sql`.
  - **Protected RPC change:** `c1_get_contractor_ticket` extended (2026-04-03) with `compliance_certificate_id`, `compliance_cert_type`, `compliance_expiry_date` — safe addition, existing keys unchanged.
- Rooms: `get_rooms_for_property`, `room_upsert`, `room_delete`, `room_assign_tenant`, `room_remove_tenant`
- Rent: `create_rent_ledger_entries`, `get_rent_summary_for_property`, `get_rent_dashboard_summary`, `get_rent_reminders_due`
  - **Deprecated:** `mark_rent_paid` — replaced by `record_rent_payment` (protected)
- Dashboard stats: `get_occupancy_summary`, `get_rent_income_summary`, `get_ai_actions_count`
