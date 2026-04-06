-- ============================================================
-- RPC Deployment Verification (YAR-203)
--
-- Run against production Supabase SQL editor to verify all
-- expected RPCs exist. Reports MISSING and EXTRA functions.
--
-- Usage: paste into Supabase SQL Editor > Run
-- ============================================================

WITH expected_rpcs AS (
  SELECT unnest(ARRAY[
    -- Protected RPCs (69 from core-rpcs/README.md)
    'auto_sync_property_mappings',
    'c1_allocate_to_landlord',
    'c1_complete_handoff_ticket',
    'c1_completion_followup_check',
    'c1_compute_next_action',
    'compute_compliance_next_action',
    'compute_landlord_next_action',
    'compute_maintenance_next_action',
    'compute_ooh_next_action',
    'compute_rent_arrears_next_action',
    'create_rent_arrears_ticket',
    'c1_context_logic',
    'c1_contractor_context',
    'c1_contractor_mark_sent',
    'c1_contractor_timeout_check',
    'c1_convo_append_outbound',
    'c1_convo_finalize',
    'c1_convo_finalize_quick',
    'c1_create_manual_ticket',
    'c1_create_ticket',
    'c1_dispatch_from_review',
    'c1_find_property_candidate',
    'c1_find_tenant_candidate',
    'c1_finalize_job',
    'c1_get_contractor_quote_context',
    'c1_get_contractor_ticket',
    'c1_get_dashboard_todo',
    'c1_get_landlord_ticket',
    'c1_get_ooh_contacts',
    'c1_get_ooh_ticket',
    'c1_get_recent_events',
    'c1_get_tenant_ticket',
    'c1_inbound_reply',
    'c1_is_within_business_hours',
    'c1_job_reminder_list',
    'c1_job_reminder_payload',
    'c1_landlord_mark_sent',
    'c1_landlord_timeout_check',
    'c1_ledger_on_ticket_insert',
    'c1_ledger_on_ticket_update',
    'c1_log_event',
    'c1_log_outbound',
    'c1_log_system_event',
    'c1_manager_decision_from_app',
    'c1_message_next_action',
    'c1_msg_merge_contractor',
    'c1_normalize_ticket_fields',
    'c1_pm_mark_sent',
    'c1_prepare_landlord_sms',
    'c1_process_delayed_dispatches',
    'c1_process_job_completion',
    'c1_redispatch_contractor',
    'c1_set_sla_due_at',
    'c1_submit_contractor_completion',
    'c1_submit_contractor_not_completed',
    'c1_submit_contractor_schedule',
    'c1_submit_landlord_outcome',
    'c1_submit_ooh_outcome',
    'c1_submit_reschedule_decision',
    'c1_submit_reschedule_request',
    'c1_submit_tenant_confirmation',
    'c1_ticket_context',
    'c1_toggle_hold',
    'c1_trigger_recompute_next_action',
    'c1_upsert_contact',
    'get_pm_id',
    'norm_uk_postcode',
    'record_rent_payment',

    -- Non-protected RPCs (actively iterating)
    -- Compliance
    'compliance_get_certificates',
    'compliance_upsert_certificate',
    'compliance_delete_certificate',
    'compliance_get_summary',
    'compliance_get_all_statuses',
    'compliance_get_property_status',
    'compliance_get_todos',
    'compliance_upsert_requirements',
    'compliance_set_property_type',
    'get_compliance_expiring',
    'compliance_submit_contractor_renewal',
    -- Rooms
    'get_rooms_for_property',
    'room_upsert',
    'room_delete',
    'room_assign_tenant',
    'room_remove_tenant',
    -- Rent
    'create_rent_ledger_entries',
    'get_rent_summary_for_property',
    'get_rent_dashboard_summary',
    'get_rent_reminders_due',
    -- Dashboard stats
    'get_occupancy_summary',
    'get_rent_income_summary',
    'get_ai_actions_count'
  ]) AS function_name
),
deployed_rpcs AS (
  SELECT DISTINCT p.proname AS function_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname NOT LIKE 'pg_%'
    AND p.proname NOT LIKE 'postgis_%'
)

-- Missing: expected but not deployed
SELECT 'MISSING' AS status, e.function_name
FROM expected_rpcs e
LEFT JOIN deployed_rpcs d ON d.function_name = e.function_name
WHERE d.function_name IS NULL

UNION ALL

-- Present: expected and deployed
SELECT 'OK' AS status, e.function_name
FROM expected_rpcs e
JOIN deployed_rpcs d ON d.function_name = e.function_name

ORDER BY status DESC, function_name;
