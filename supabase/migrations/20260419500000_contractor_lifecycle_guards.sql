-- SSOT Findings #5, #13, #14: Contractor lifecycle hardening
--
-- Finding #13: Late contractor reply can overwrite 'no_response' status.
--   Guard exists for manager/landlord decisions but NOT for contractor replies.
--   Fix: Guard at the merge layer (c1_msg_merge_contractor). When a merge would
--   change status from a terminal state to 'replied', preserve the terminal status
--   but still record the reply data with a late_reply flag. Protects ALL callers.
--
-- Finding #14: Contractor timeout events missing from audit trail.
--   c1_contractor_timeout_check marks contractors as 'no_response' but
--   does NOT call c1_log_event. Timeouts are invisible in the audit trail.
--   Fix: Add CONTRACTOR_TIMED_OUT event after each timeout merge.
--
-- ⚠️ PROTECTED RPCs — approved by Adam (SSOT audit 2026-04-13, Findings #13, #14).


-- ═══════════════════════════════════════════════════════════════
-- 1. c1_msg_merge_contractor — add late reply guard at merge layer
-- ═══════════════════════════════════════════════════════════════
-- When a merge would overwrite a terminal status (no_response, declined,
-- send_failed) with 'replied', preserve the terminal status but record the
-- reply data. Adds late_reply=true flag so the UI can show it happened.
--
-- This guards ALL callers (c1_inbound_reply, etc.) without modifying the
-- 550-line c1_inbound_reply function.

CREATE OR REPLACE FUNCTION public.c1_msg_merge_contractor(p_ticket_id uuid, p_contractor_id uuid, p_patch jsonb)
 RETURNS integer
 LANGUAGE sql
AS $function$
with msg as (
  select contractors
  from public.c1_messages
  where ticket_id = p_ticket_id
),
reindexed as (
  select i-1 as idx, c
  from msg, jsonb_array_elements(contractors) with ordinality as t(c,i)
),
patched as (
  select jsonb_agg(
           case when (c->>'id')::uuid = p_contractor_id
                then case
                  -- Guard: don't overwrite terminal status with 'replied' (Finding #13)
                  -- Record reply data but keep terminal status + add late_reply flag
                  when c->>'status' in ('no_response', 'declined', 'send_failed')
                       and p_patch->>'status' = 'replied'
                  then coalesce(c,'{}'::jsonb) || (p_patch - 'status') || '{"late_reply": true}'::jsonb
                  else coalesce(c,'{}'::jsonb) || p_patch
                end
                else c
           end
         ) as new_contractors,
         count(*) filter (where (c->>'id')::uuid = p_contractor_id) as hit
  from reindexed
)
update public.c1_messages m
set contractors = patched.new_contractors,
    updated_at = now()
from patched
where m.ticket_id = p_ticket_id
returning patched.hit;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- 2. c1_contractor_timeout_check — add audit events
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_contractor_timeout_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_updated integer := 0;
  r record;
  v_timeout_cutoff timestamptz;
  v_reminder_cutoff timestamptz;
  v_effective_sent_at timestamptz;
  v_bc record;
  v_bc_c record;
  v_earliest_sent timestamptz;
BEGIN
  -- BROADCAST MODE: Timeout marks ALL sent contractors at once
  FOR v_bc IN
    SELECT DISTINCT ON (m.ticket_id)
      m.ticket_id,
      COALESCE(pm.contractor_timeout_minutes, 360) as timeout_minutes,
      COALESCE(t.total_hold_duration, interval '0') as hold_duration
    FROM public.c1_messages m
    JOIN public.c1_tickets t ON t.id = m.ticket_id
    JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
    WHERE pm.dispatch_mode = 'broadcast'
      AND m.stage IN ('waiting_contractor', 'next_contractor', 'awaiting_manager')
      AND (t.archived IS NULL OR t.archived = false)
      AND (t.on_hold IS NULL OR t.on_hold = false)
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(m.contractors) c
        WHERE (c->>'status') = 'sent'
      )
  LOOP
    SELECT MIN((c->>'sent_at')::timestamptz) INTO v_earliest_sent
    FROM c1_messages m, jsonb_array_elements(m.contractors) c
    WHERE m.ticket_id = v_bc.ticket_id AND (c->>'status') = 'sent';

    v_timeout_cutoff := now() - make_interval(mins => v_bc.timeout_minutes);

    IF v_earliest_sent IS NOT NULL AND (v_earliest_sent + v_bc.hold_duration) < v_timeout_cutoff THEN
      FOR v_bc_c IN
        SELECT (c->>'id')::uuid as cid, c->>'name' as cname
        FROM c1_messages m, jsonb_array_elements(m.contractors) c
        WHERE m.ticket_id = v_bc.ticket_id AND (c->>'status') = 'sent'
      LOOP
        PERFORM public.c1_msg_merge_contractor(
          v_bc.ticket_id,
          v_bc_c.cid,
          jsonb_build_object('status', 'no_response', 'no_response_at', to_jsonb(now()))
        );

        -- Audit event: contractor timed out (Finding #14)
        PERFORM public.c1_log_event(
          v_bc.ticket_id,
          'CONTRACTOR_TIMED_OUT',
          'system',
          v_bc_c.cname,
          NULL,
          jsonb_build_object(
            'contractor_id', v_bc_c.cid,
            'contractor_name', v_bc_c.cname,
            'timeout_minutes', v_bc.timeout_minutes,
            'dispatch_mode', 'broadcast'
          )
        );

        v_updated := v_updated + 1;
      END LOOP;

      PERFORM public.c1_message_next_action(v_bc.ticket_id);
    END IF;
  END LOOP;

  -- ALL MODES: Per-contractor reminders + sequential timeouts
  FOR r IN
    SELECT
      m.ticket_id,
      elem,
      COALESCE(pm.contractor_timeout_minutes, 360) as timeout_minutes,
      pm.contractor_reminder_minutes,
      COALESCE(pm.dispatch_mode, 'sequential') as dispatch_mode,
      t.issue_description,
      t.issue_title,
      t.category as issue_category,
      p.address as property_address,
      pm.name as manager_name,
      pm.phone as manager_phone,
      pm.business_name,
      COALESCE(t.total_hold_duration, interval '0') as hold_duration
    FROM public.c1_messages m
    CROSS JOIN LATERAL jsonb_array_elements(m.contractors) elem
    JOIN public.c1_tickets t ON t.id = m.ticket_id
    JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
    LEFT JOIN public.c1_properties p ON p.id = t.property_id
    WHERE (elem->>'status') = 'sent'
      AND m.stage IN ('waiting_contractor', 'next_contractor', 'awaiting_manager')
      AND (t.archived IS NULL OR t.archived = false)
      AND (t.on_hold IS NULL OR t.on_hold = false)
  LOOP
    v_effective_sent_at := (r.elem->>'sent_at')::timestamptz + r.hold_duration;
    v_timeout_cutoff := now() - make_interval(mins => r.timeout_minutes);

    -- TIMEOUT (sequential only) — no message sent, just DB update
    IF v_effective_sent_at < v_timeout_cutoff AND r.dispatch_mode != 'broadcast' THEN
      PERFORM public.c1_msg_merge_contractor(
        r.ticket_id,
        (r.elem->>'id')::uuid,
        jsonb_build_object(
          'status', 'no_response',
          'no_response_at', to_jsonb(now())
        )
      );

      -- Audit event: contractor timed out (Finding #14)
      PERFORM public.c1_log_event(
        r.ticket_id,
        'CONTRACTOR_TIMED_OUT',
        'system',
        r.elem->>'name',
        r.property_address,
        jsonb_build_object(
          'contractor_id', (r.elem->>'id')::uuid,
          'contractor_name', r.elem->>'name',
          'timeout_minutes', r.timeout_minutes,
          'dispatch_mode', 'sequential'
        )
      );

      PERFORM public.c1_message_next_action(r.ticket_id);
      v_updated := v_updated + 1;

    -- REMINDER (NO pre-send mark — edge function confirms)
    ELSIF r.contractor_reminder_minutes IS NOT NULL
      AND (r.elem->>'reminded_at') IS NULL
    THEN
      v_reminder_cutoff := now() - make_interval(mins => r.contractor_reminder_minutes);

      IF v_effective_sent_at < v_reminder_cutoff THEN
        PERFORM net.http_post(
          url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-followups?route=contractor-reminder-sms',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := jsonb_build_object(
            'payload', jsonb_build_object(
              'ticket_id', r.ticket_id,
              'confirm_type', 'contractor_reminder',
              'contractor_id', (r.elem->>'id')::uuid,
              'contractor_name', r.elem->>'name',
              'contractor_phone', r.elem->>'phone',
              'portal_token', r.elem->>'portal_token',
              'property_address', r.property_address,
              'issue_description', COALESCE(r.issue_description, r.issue_category),
              'issue_title', r.issue_title,
              'manager_name', r.manager_name,
              'manager_phone', r.manager_phone,
              'business_name', r.business_name,
              'reason', (r.elem->>'name') || ' has not responded to the quote request'
            )
          )
        );

        v_updated := v_updated + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$function$;
