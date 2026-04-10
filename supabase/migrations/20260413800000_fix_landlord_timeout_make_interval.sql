-- Fix: c1_landlord_timeout_check uses make_interval(hours => numeric) which doesn't exist.
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Same fix as dashboard RPC: use interval arithmetic instead.

CREATE OR REPLACE FUNCTION public.c1_landlord_timeout_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_notified integer := 0;
  r record;
  v_sent_at timestamptz;
  v_effective_sent_at timestamptz;
  v_followup_cutoff timestamptz;
  v_timeout_cutoff timestamptz;
  v_hours_elapsed numeric;
  v_contractor_amount numeric;
  v_manager_markup numeric;
  v_total_cost numeric;
BEGIN
  FOR r IN
    SELECT
      m.ticket_id,
      m.landlord,
      m.manager->>'approval_amount' as approval_amount,
      pm.landlord_followup_hours as followup_hours,
      COALESCE(pm.landlord_timeout_hours, 48) as timeout_hours,
      t.issue_description,
      t.issue_title,
      t.category as issue_category,
      p.address as property_address,
      pm.name as manager_name,
      pm.phone as manager_phone,
      pm.business_name,
      COALESCE(t.total_hold_duration, interval '0') as hold_duration,
      COALESCE(
        (SELECT elem->>'name' FROM jsonb_array_elements(m.contractors) elem WHERE elem->>'manager_decision' = 'approved' LIMIT 1),
        c.contractor_name
      ) as contractor_name,
      COALESCE(
        (SELECT elem->>'phone' FROM jsonb_array_elements(m.contractors) elem WHERE elem->>'manager_decision' = 'approved' LIMIT 1),
        c.contractor_phone
      ) as contractor_phone,
      COALESCE(
        (SELECT elem->>'quote_amount' FROM jsonb_array_elements(m.contractors) elem WHERE elem->>'manager_decision' = 'approved' LIMIT 1),
        NULL
      ) as contractor_quote_amount
    FROM public.c1_messages m
    JOIN public.c1_tickets t ON t.id = m.ticket_id
    JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
    LEFT JOIN public.c1_properties p ON p.id = t.property_id
    LEFT JOIN public.c1_contractors c ON c.id = t.contractor_id
    WHERE m.stage = 'awaiting_landlord'
      AND m.landlord IS NOT NULL
      AND m.landlord->>'review_request_sent_at' IS NOT NULL
      AND m.landlord->>'replied_at' IS NULL
      AND COALESCE(t.archived, false) = false
      AND COALESCE(t.on_hold, false) = false
  LOOP
    v_sent_at := (r.landlord->>'review_request_sent_at')::timestamptz;
    v_effective_sent_at := v_sent_at + r.hold_duration;
    v_hours_elapsed := EXTRACT(EPOCH FROM (now() - v_effective_sent_at)) / 3600;
    v_timeout_cutoff := now() - interval '1 hour' * r.timeout_hours;

    v_contractor_amount := COALESCE(
      (NULLIF(regexp_replace(COALESCE(r.contractor_quote_amount,''),'[^0-9\.]', '', 'g'),''))::numeric, 0
    );
    v_manager_markup := COALESCE(
      (NULLIF(regexp_replace(COALESCE(r.approval_amount,''),'[^0-9\.]', '', 'g'),''))::numeric, 0
    );
    v_total_cost := v_contractor_amount + v_manager_markup;

    -- STAGE 2: PM escalation (NO pre-send mark — edge function confirms)
    IF v_effective_sent_at < v_timeout_cutoff
      AND (r.landlord->>'followup_sent_at' IS NOT NULL OR r.followup_hours IS NULL)
      AND r.landlord->>'timeout_notified_at' IS NULL
    THEN
      PERFORM net.http_post(
        url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-followups?route=pm-landlord-timeout-sms',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'payload', jsonb_build_object(
            'ticket_id', r.ticket_id,
            'confirm_type', 'landlord_timeout',
            'landlord_name', r.landlord->>'name',
            'landlord_phone', r.landlord->>'phone',
            'property_address', r.property_address,
            'issue_description', COALESCE(r.issue_description, r.issue_category),
            'issue_title', COALESCE(r.issue_title, r.issue_description),
            'contractor_name', r.contractor_name,
            'contractor_phone', r.contractor_phone,
            'total_cost', '£' || v_total_cost,
            'manager_name', r.manager_name,
            'manager_phone', r.manager_phone,
            'business_name', r.business_name,
            'hours_elapsed', floor(v_hours_elapsed),
            'reason', 'Landlord ' || COALESCE(r.landlord->>'name', '') || ' has not responded after ' || floor(v_hours_elapsed) || ' hours'
          )
        )
      );
      v_notified := v_notified + 1;

    -- STAGE 1: Landlord follow-up (NO pre-send mark — edge function confirms)
    ELSIF r.followup_hours IS NOT NULL
      AND v_effective_sent_at < (now() - interval '1 hour' * r.followup_hours)
      AND r.landlord->>'followup_sent_at' IS NULL
    THEN
      PERFORM net.http_post(
        url := 'https://qedsceehrrvohsjmbodc.supabase.co/functions/v1/yarro-followups?route=landlord-followup-sms',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'payload', jsonb_build_object(
            'ticket_id', r.ticket_id,
            'confirm_type', 'landlord_followup',
            'landlord_name', r.landlord->>'name',
            'landlord_phone', r.landlord->>'phone',
            'property_address', r.property_address,
            'issue_description', COALESCE(r.issue_description, r.issue_category),
            'issue_title', COALESCE(r.issue_title, r.issue_description),
            'contractor_name', r.contractor_name,
            'contractor_phone', r.contractor_phone,
            'total_cost', '£' || v_total_cost,
            'manager_name', r.manager_name,
            'manager_phone', r.manager_phone,
            'business_name', r.business_name,
            'hours_elapsed', floor(v_hours_elapsed),
            'reason', 'Landlord ' || COALESCE(r.landlord->>'name', '') || ' has not responded after ' || floor(v_hours_elapsed) || ' hours'
          )
        )
      );
      v_notified := v_notified + 1;
    END IF;
  END LOOP;

  RETURN v_notified;
END;
$function$;
