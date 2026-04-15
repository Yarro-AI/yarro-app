-- ============================================================
-- PURGE: Remove all remaining job_stage references from RPCs
-- ============================================================
-- job_stage was dropped in Sprint B (20260412300000_04_drop_job_stage.sql).
-- These 6 functions still reference it. The router/trigger pipeline now
-- manages next_action + next_action_reason — job_stage is dead.
--
-- For each function:
--   - SET job_stage = X  → removed (trigger handles state)
--   - WHERE job_stage = 'booked' → WHERE next_action_reason = 'scheduled'
--   - v_ticket.job_stage → v_ticket.next_action_reason (for logging)
--   - IF NEW.job_stage = 'booked' → IF NEW.next_action_reason = 'scheduled'


-- ─── 1. c1_complete_handoff_ticket ────────────────────────────
-- FIX: Remove `job_stage = 'contractor_notified'` from UPDATE.
-- The recompute trigger sets next_action after the c1_messages INSERT.

CREATE OR REPLACE FUNCTION public.c1_complete_handoff_ticket(
  p_ticket_id uuid,
  p_property_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_issue_description text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_contractor_ids uuid[] DEFAULT NULL,
  p_availability text DEFAULT NULL,
  p_access text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ticket c1_tickets%rowtype;
  v_pm_id UUID;
  v_pm_row c1_property_managers%rowtype;
  v_contractors_json jsonb;
  v_landlord_json jsonb;
  v_property_address TEXT;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  v_pm_id := v_ticket.property_manager_id;
  SELECT * INTO v_pm_row FROM c1_property_managers WHERE id = v_pm_id;
  SELECT address INTO v_property_address FROM c1_properties WHERE id = p_property_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', c.id, 'name', c.contractor_name, 'phone', c.contractor_phone,
      'email', c.contractor_email, 'category', c.category, 'status', 'pending',
      'property_id', p_property_id, 'property_address', v_property_address,
      'issue_description', p_issue_description, 'priority', p_priority,
      'availability', p_availability,
      'access', CASE WHEN p_access IS NOT NULL THEN 'GRANTED' ELSE 'PENDING' END,
      'access_granted', p_access IS NOT NULL
    ) ORDER BY u.ord
  )
  INTO v_contractors_json
  FROM unnest(p_contractor_ids) WITH ORDINALITY AS u(contractor_id, ord)
  JOIN c1_contractors c ON c.id = u.contractor_id;

  SELECT jsonb_build_object('name', p.landlord_name, 'phone', p.landlord_phone, 'email', p.landlord_email)
  INTO v_landlord_json
  FROM c1_properties p WHERE p.id = p_property_id;

  -- job_stage removed — trigger pipeline handles state via c1_messages
  UPDATE c1_tickets SET
    property_id = p_property_id,
    tenant_id = p_tenant_id,
    issue_description = p_issue_description,
    category = p_category,
    priority = p_priority,
    contractor_id = p_contractor_ids[1],
    contractor_ids = p_contractor_ids,
    availability = p_availability,
    access = p_access,
    handoff = false,
    was_handoff = true,
    is_manual = true,
    waiting_since = now()
  WHERE id = p_ticket_id;

  INSERT INTO c1_messages (ticket_id, manager, contractors, landlord, stage)
  VALUES (
    p_ticket_id,
    jsonb_build_object('id', v_pm_row.id, 'name', v_pm_row.name, 'business_name', v_pm_row.business_name, 'phone', v_pm_row.phone),
    v_contractors_json,
    v_landlord_json,
    'waiting_contractor'
  )
  ON CONFLICT (ticket_id) DO UPDATE SET
    manager = EXCLUDED.manager,
    contractors = EXCLUDED.contractors,
    landlord = EXCLUDED.landlord,
    stage = 'waiting_contractor',
    updated_at = now();

  PERFORM net.http_post(
    url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-dispatcher',
    body := jsonb_build_object(
      'instruction', 'contractor-sms',
      'payload', jsonb_build_object(
        'ticket', jsonb_build_object('id', p_ticket_id, 'images', COALESCE(v_ticket.images, '[]'::jsonb)),
        'contractor', v_contractors_json->0,
        'manager', jsonb_build_object('phone', v_pm_row.phone, 'business_name', v_pm_row.business_name)
      )
    )
  );

  RETURN p_ticket_id;
END;
$function$;


-- ─── 2. c1_confirm_followup_sent ──────────────────────────────
-- FIX: Remove `SET job_stage = 'landlord_no_response'`.
-- The recompute trigger handles landlord timeout state.

CREATE OR REPLACE FUNCTION public.c1_confirm_followup_sent(
  p_ticket_id uuid,
  p_confirm_type text,
  p_contractor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  CASE p_confirm_type
    WHEN 'completion_reminder' THEN
      UPDATE public.c1_messages
      SET completion_reminder_sent_at = now(), updated_at = now()
      WHERE ticket_id = p_ticket_id;

    WHEN 'completion_escalation' THEN
      UPDATE public.c1_messages
      SET completion_pm_escalated_at = now(), updated_at = now()
      WHERE ticket_id = p_ticket_id;

    WHEN 'contractor_reminder' THEN
      IF p_contractor_id IS NOT NULL THEN
        PERFORM public.c1_msg_merge_contractor(
          p_ticket_id, p_contractor_id,
          jsonb_build_object('reminded_at', to_jsonb(now()))
        );
      END IF;

    WHEN 'landlord_followup' THEN
      UPDATE public.c1_messages
      SET landlord = landlord || jsonb_build_object('followup_sent_at', to_jsonb(now())),
          updated_at = now()
      WHERE ticket_id = p_ticket_id;

    WHEN 'landlord_timeout' THEN
      UPDATE public.c1_messages
      SET landlord = landlord || jsonb_build_object('timeout_notified_at', to_jsonb(now())),
          updated_at = now()
      WHERE ticket_id = p_ticket_id;
      -- job_stage = 'landlord_no_response' removed. Trigger handles state.

    ELSE
      RAISE WARNING '[c1_confirm_followup_sent] Unknown confirm_type: %', p_confirm_type;
  END CASE;
END;
$function$;


-- ─── 3. c1_completion_followup_check ──────────────────────────
-- FIX: WHERE t.job_stage = 'booked' → WHERE t.next_action_reason = 'scheduled'

CREATE OR REPLACE FUNCTION public.c1_completion_followup_check()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_notified integer := 0;
  r record;
  v_hours_since_slot_end numeric;
  v_scheduled_local timestamptz;
  v_slot_end timestamptz;
  v_local_hour integer;
  v_formatted_date text;
  v_reminder_hours integer;
  v_escalation_hours integer;
BEGIN
  FOR r IN
    SELECT
      t.id as ticket_id, t.scheduled_date, t.issue_description, t.issue_title,
      t.category as issue_category, t.contractor_id, t.contractor_token,
      c.contractor_name, c.contractor_phone, p.address as property_address,
      pm.name as manager_name, pm.phone as manager_phone, pm.business_name,
      pm.completion_reminder_hours,
      COALESCE(pm.completion_timeout_hours, 12) as completion_timeout_hours,
      m.completion_reminder_sent_at, m.completion_pm_escalated_at,
      COALESCE(t.total_hold_duration, interval '0') as hold_duration
    FROM public.c1_tickets t
    JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
    LEFT JOIN public.c1_properties p ON p.id = t.property_id
    LEFT JOIN public.c1_contractors c ON c.id = t.contractor_id
    LEFT JOIN public.c1_messages m ON m.ticket_id = t.id
    WHERE t.next_action_reason = 'scheduled'
      AND t.status = 'open'
      AND t.scheduled_date IS NOT NULL
      AND COALESCE(t.archived, false) = false
      AND COALESCE(t.on_hold, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.c1_job_completions jc WHERE jc.id = t.id
      )
  LOOP
    v_scheduled_local := timezone('Europe/London', r.scheduled_date);
    v_local_hour := extract(hour from v_scheduled_local);

    v_slot_end := CASE
      WHEN v_local_hour = 9  THEN v_scheduled_local + interval '3 hours'
      WHEN v_local_hour = 13 THEN v_scheduled_local + interval '4 hours'
      WHEN v_local_hour = 18 THEN v_scheduled_local + interval '2 hours'
      ELSE v_scheduled_local + interval '1 hour'
    END;
    v_slot_end := timezone('Europe/London', v_slot_end);

    IF v_slot_end > now() THEN CONTINUE; END IF;

    v_hours_since_slot_end := EXTRACT(EPOCH FROM (now() - v_slot_end - r.hold_duration)) / 3600;
    v_reminder_hours := r.completion_reminder_hours;
    v_escalation_hours := r.completion_timeout_hours;
    v_formatted_date := to_char(v_scheduled_local, 'DD/MM/YY');

    IF v_reminder_hours IS NOT NULL
      AND v_hours_since_slot_end >= v_reminder_hours
      AND r.completion_reminder_sent_at IS NULL
    THEN
      PERFORM net.http_post(
        url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-followups?route=contractor-completion-reminder-sms',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'ticket_id', r.ticket_id, 'contractor_phone', r.contractor_phone,
          'contractor_name', r.contractor_name, 'contractor_token', r.contractor_token,
          'property_address', r.property_address, 'formatted_date', v_formatted_date,
          'business_name', r.business_name, 'issue_title', r.issue_title,
          'issue_category', r.issue_category
        )
      );
      v_notified := v_notified + 1;
    END IF;

    IF v_hours_since_slot_end >= v_escalation_hours
      AND r.completion_pm_escalated_at IS NULL
    THEN
      PERFORM net.http_post(
        url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-followups?route=pm-completion-escalation',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'ticket_id', r.ticket_id, 'manager_phone', r.manager_phone,
          'manager_name', r.manager_name, 'contractor_name', r.contractor_name,
          'property_address', r.property_address, 'formatted_date', v_formatted_date,
          'issue_title', r.issue_title, 'issue_category', r.issue_category
        )
      );
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  RETURN v_notified;
END;
$function$;


-- ─── 4. c1_trigger_same_day_reminder ──────────────────────────
-- FIX: job_stage = 'booked' → next_action_reason = 'scheduled'

CREATE OR REPLACE FUNCTION public.c1_trigger_same_day_reminder()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_reminder record;
  v_webhook_url text := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-job-reminder?source=direct';
BEGIN
  IF NEW.next_action_reason = 'scheduled' AND (OLD.next_action_reason IS DISTINCT FROM 'scheduled') THEN
    IF NEW.scheduled_date IS NOT NULL AND NEW.scheduled_date::date = CURRENT_DATE THEN
      SELECT * INTO v_reminder FROM public.c1_check_same_day_reminder(NEW.id);
      IF FOUND THEN
        PERFORM net.http_post(
          url := v_webhook_url,
          body := jsonb_build_object(
            'ticket_id', v_reminder.ticket_id, 'scheduled_date', v_reminder.scheduled_date,
            'property_address', v_reminder.property_address, 'contractor_phone', v_reminder.contractor_phone,
            'access_text', v_reminder.access_text, 'formatted_time', v_reminder.formatted_time,
            'formatted_window', v_reminder.formatted_window
          ),
          headers := '{"Content-Type": "application/json"}'::jsonb
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;


-- ─── 5. c1_process_job_completion ─────────────────────────────
-- FIX: Remove job_stage from INSERT into c1_job_completions (use next_action_reason).
-- Remove SET job_stage = 'closed' from ticket close UPDATE.

CREATE OR REPLACE FUNCTION public.c1_process_job_completion(
  p_ticket_id uuid, p_source text, p_completed boolean,
  p_notes text DEFAULT NULL, p_reason text DEFAULT NULL,
  p_media_urls jsonb DEFAULT '[]'::jsonb,
  p_fillout_submission_id text DEFAULT NULL,
  p_inbound_sid text DEFAULT NULL,
  p_completion_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ticket record; v_property record; v_contractor record;
  v_manager record; v_tenant record; v_existing record;
  v_quote_amount numeric; v_total_amount numeric; v_markup_amount numeric;
  v_attempt jsonb; v_is_new boolean := false; v_should_notify boolean := false;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found'); END IF;

  SELECT * INTO v_property FROM c1_properties WHERE id = v_ticket.property_id;
  SELECT * INTO v_contractor FROM c1_contractors WHERE id = v_ticket.contractor_id;
  SELECT * INTO v_manager FROM c1_property_managers WHERE id = v_property.property_manager_id;
  SELECT * INTO v_tenant FROM c1_tenants WHERE id = v_ticket.tenant_id;

  v_quote_amount := COALESCE(v_ticket.contractor_quote::numeric, 0);
  v_total_amount := COALESCE(v_ticket.final_amount::numeric, 0);
  v_markup_amount := v_total_amount - v_quote_amount;

  SELECT * INTO v_existing FROM c1_job_completions WHERE id = p_ticket_id;

  v_attempt := jsonb_build_object(
    'at', now(), 'source', p_source, 'completed', p_completed,
    'notes', p_notes, 'reason', p_reason, 'media_urls', p_media_urls,
    'fillout_submission_id', p_fillout_submission_id,
    'inbound_sid', p_inbound_sid, 'completion_text', p_completion_text
  );

  IF v_existing IS NULL THEN
    v_is_new := true; v_should_notify := true;
    INSERT INTO c1_job_completions (
      id, source, completed, notes, reason, media_urls,
      inbound_sid, completion_text, fillout_submission_id,
      contractor_id, property_id, tenant_id, conversation_id,
      quote_amount, markup_amount, total_amount,
      job_stage_at_receive, ticket_status_at_receive, received_at, attempts
    ) VALUES (
      p_ticket_id, p_source, p_completed, p_notes, p_reason, p_media_urls,
      p_inbound_sid, p_completion_text, p_fillout_submission_id,
      v_ticket.contractor_id, v_ticket.property_id, v_ticket.tenant_id, v_ticket.conversation_id,
      v_quote_amount, v_markup_amount, v_total_amount,
      v_ticket.next_action_reason, v_ticket.status, now(), '[]'::jsonb
    );
  ELSIF p_source = 'fillout' THEN
    v_should_notify := true;
    UPDATE c1_job_completions SET
      source = p_source, completed = p_completed, notes = p_notes, reason = p_reason,
      media_urls = CASE WHEN jsonb_typeof(p_media_urls) = 'array' AND jsonb_array_length(p_media_urls) > 0 THEN p_media_urls ELSE media_urls END,
      fillout_submission_id = p_fillout_submission_id,
      quote_amount = v_quote_amount, markup_amount = v_markup_amount, total_amount = v_total_amount,
      received_at = now(),
      attempts = COALESCE(attempts, '[]'::jsonb) || jsonb_build_object(
        'at', v_existing.received_at, 'source', v_existing.source, 'completed', v_existing.completed,
        'notes', v_existing.notes, 'reason', v_existing.reason, 'media_urls', v_existing.media_urls,
        'inbound_sid', v_existing.inbound_sid, 'completion_text', v_existing.completion_text,
        'fillout_submission_id', v_existing.fillout_submission_id
      )
    WHERE id = p_ticket_id;
  ELSIF v_existing.source = 'fillout' THEN
    UPDATE c1_job_completions SET attempts = COALESCE(attempts, '[]'::jsonb) || v_attempt WHERE id = p_ticket_id;
  ELSE
    UPDATE c1_job_completions SET
      source = p_source, completed = p_completed, inbound_sid = p_inbound_sid,
      completion_text = p_completion_text,
      quote_amount = v_quote_amount, markup_amount = v_markup_amount, total_amount = v_total_amount,
      received_at = now(),
      attempts = COALESCE(attempts, '[]'::jsonb) || jsonb_build_object(
        'at', v_existing.received_at, 'source', v_existing.source, 'completed', v_existing.completed,
        'notes', v_existing.notes, 'reason', v_existing.reason, 'media_urls', v_existing.media_urls,
        'inbound_sid', v_existing.inbound_sid, 'completion_text', v_existing.completion_text
      )
    WHERE id = p_ticket_id;
  END IF;

  IF p_completed THEN
    -- job_stage = 'closed' removed. Trigger handles state.
    UPDATE c1_tickets SET status = 'closed', confirmation_date = now()
    WHERE id = p_ticket_id;
  END IF;

  IF v_should_notify AND p_completed THEN
    PERFORM net.http_post(
      url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-completion',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'ticket_id', p_ticket_id, 'source', p_source,
        'contractor_name', v_contractor.contractor_name,
        'property_address', v_property.address,
        'manager_phone', v_manager.phone, 'manager_name', v_manager.name,
        'business_name', v_manager.business_name,
        'tenant_phone', v_tenant.phone, 'tenant_name', v_tenant.full_name
      )
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'is_new', v_is_new, 'notified', v_should_notify);
END;
$function$;


-- ─── 6. c1_check_same_day_reminder ────────────────────────────
-- FIX: WHERE t.job_stage = 'booked' → WHERE t.next_action_reason = 'scheduled'

CREATE OR REPLACE FUNCTION public.c1_check_same_day_reminder(p_ticket_id uuid)
RETURNS TABLE(
  ticket_id uuid, scheduled_date timestamptz, property_address text,
  contractor_phone text, access_text text, formatted_time text,
  formatted_window text, issue_title text, contractor_token text, arrival_slot text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  rec record;
  v_access_text text;
  start_utc timestamptz; end_utc timestamptz;
  start_local timestamptz; end_local timestamptz;
  v_arrival_slot text;
BEGIN
  SELECT
    t.id, t.scheduled_date, t.access_granted, t.contractor_token,
    COALESCE(t.issue_title, t.issue_description) AS issue_title,
    p.address AS property_address, p.access_instructions,
    pm.phone AS pm_phone, c.contractor_phone AS contractor_phone
  INTO rec
  FROM public.c1_tickets t
  JOIN public.c1_properties p ON p.id = t.property_id
  JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN public.c1_contractors c ON c.id = t.contractor_id
  WHERE t.id = p_ticket_id
    AND t.next_action_reason = 'scheduled'
    AND t.status = 'open'
    AND t.scheduled_date::date = CURRENT_DATE
    AND (t.on_hold IS NULL OR t.on_hold = false)
    AND NOT EXISTS (
      SELECT 1 FROM public.c1_outbound_log ol
      WHERE ol.ticket_id = t.id
        AND ol.message_type = 'contractor_job_reminder'
        AND ol.sent_at::date = CURRENT_DATE
    );

  IF NOT FOUND THEN RETURN; END IF;

  IF rec.access_granted THEN
    v_access_text := nullif(trim(coalesce(rec.access_instructions, '')), '');
    IF v_access_text IS NULL THEN
      v_access_text := 'Access granted. Instructions will be shared directly if needed.';
    END IF;
  ELSE
    v_access_text := 'Access to be arranged with tenant. If the tenant does not answer, contact the property manager on '
      || coalesce(rec.pm_phone, '[number]') || '.';
  END IF;

  start_utc := rec.scheduled_date;
  end_utc := rec.scheduled_date + interval '1 hour';
  start_local := timezone('Europe/London', start_utc);
  end_local := timezone('Europe/London', end_utc);

  IF extract(hour from start_local) < 12 THEN
    v_arrival_slot := 'Morning';
  ELSE
    v_arrival_slot := 'Afternoon';
  END IF;

  RETURN QUERY SELECT
    rec.id, rec.scheduled_date, rec.property_address, rec.contractor_phone,
    v_access_text,
    to_char(start_local, 'HH24:MI DD/MM/YY'),
    to_char(start_local, 'HH24:MI') || '-' || to_char(end_local, 'HH24:MI') || ' ' || to_char(start_local, 'DD/MM/YY'),
    rec.issue_title, rec.contractor_token, v_arrival_slot;
END;
$function$;
