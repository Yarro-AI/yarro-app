-- Rename c1_log_compliance_event → c1_log_system_event
-- This RPC logs to c1_events without requiring a ticket_id.
-- Originally created for compliance, but it's fully generic —
-- used by any ticket-less event (compliance reminders, rent reminders, etc.)

ALTER FUNCTION public.c1_log_compliance_event(uuid, text, text, jsonb)
  RENAME TO c1_log_system_event;
