-- ============================================================
-- PROTECTED RPC CHANGE: c1_contractor_timeout_check
-- ============================================================
-- Safe Modification Protocol:
--   Backup: supabase/rollbacks/rollback_compliance_contractor_timeout.sql
--   Approved by: Adam (dashboard state machine hardening)
--
-- Change: Remove compliance_certificate_id IS NULL exclusion
-- so compliance renewal tickets get the standard contractor timeout.
-- The "72h Slice B" compliance-specific escalation was never built.
-- Standard PM-configurable timeout (default 6h) is better than none.
-- ============================================================

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
        SELECT (c->>'id')::uuid as cid
        FROM c1_messages m, jsonb_array_elements(m.contractors) c
        WHERE m.ticket_id = v_bc.ticket_id AND (c->>'status') = 'sent'
      LOOP
        PERFORM public.c1_msg_merge_contractor(
          v_bc.ticket_id,
          v_bc_c.cid,
          jsonb_build_object('status', 'no_response', 'no_response_at', to_jsonb(now()))
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

    -- TIMEOUT (sequential only) — no message sent, just DB update, unchanged
    IF v_effective_sent_at < v_timeout_cutoff AND r.dispatch_mode != 'broadcast' THEN
      PERFORM public.c1_msg_merge_contractor(
        r.ticket_id,
        (r.elem->>'id')::uuid,
        jsonb_build_object(
          'status', 'no_response',
          'no_response_at', to_jsonb(now())
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
