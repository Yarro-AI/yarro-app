-- =============================================================
-- Compliance Dispatch Renewal — Slice A+C (YAR-56)
--
-- 1. compliance_dispatch_renewal — manual dispatch from cert page
-- 2. compliance_upsert_certificate — auto-close ticket on manual renewal
-- 3. c1_contractor_timeout_check — exclude compliance tickets (PROTECTED, approved)
-- =============================================================

-- ─── 1. compliance_dispatch_renewal ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compliance_dispatch_renewal(
  p_cert_id uuid,
  p_pm_id uuid,
  p_contractor_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cert record;
  v_contractor_id uuid;
  v_contractor record;
  v_ticket_id uuid;
  v_existing_ticket_id uuid;
BEGIN
  -- Fetch cert and validate ownership
  SELECT id, property_id, property_manager_id, certificate_type, expiry_date, contractor_id
  INTO v_cert
  FROM public.c1_compliance_certificates
  WHERE id = p_cert_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate not found or access denied';
  END IF;

  -- Resolve contractor: explicit param > cert's assigned contractor
  v_contractor_id := COALESCE(p_contractor_id, v_cert.contractor_id);

  IF v_contractor_id IS NULL THEN
    RAISE EXCEPTION 'No contractor specified and none assigned to this certificate';
  END IF;

  -- Validate contractor exists and is active
  SELECT id, contractor_name
  INTO v_contractor
  FROM public.c1_contractors
  WHERE id = v_contractor_id
    AND property_manager_id = p_pm_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contractor not found, inactive, or does not belong to this PM';
  END IF;

  -- Prevent double-dispatch: check for existing open ticket
  SELECT id INTO v_existing_ticket_id
  FROM public.c1_tickets
  WHERE compliance_certificate_id = p_cert_id
    AND status = 'open'
    AND (archived IS NULL OR archived = false)
  LIMIT 1;

  IF v_existing_ticket_id IS NOT NULL THEN
    RAISE EXCEPTION 'A renewal is already in progress for this certificate (ticket %)', v_existing_ticket_id;
  END IF;

  -- Create ticket via c1_create_manual_ticket (protected RPC)
  v_ticket_id := public.c1_create_manual_ticket(
    p_property_manager_id := p_pm_id,
    p_property_id := v_cert.property_id,
    p_contractor_ids := ARRAY[v_contractor_id],
    p_issue_title := (
      SELECT COALESCE(
        CASE v_cert.certificate_type::text
          WHEN 'hmo_license' THEN 'HMO Licence'
          WHEN 'gas_safety' THEN 'Gas Safety (CP12)'
          WHEN 'eicr' THEN 'EICR'
          WHEN 'epc' THEN 'EPC'
          WHEN 'fire_risk' THEN 'Fire Risk Assessment'
          WHEN 'pat' THEN 'PAT Testing'
          WHEN 'legionella' THEN 'Legionella Risk Assessment'
          WHEN 'smoke_alarms' THEN 'Smoke Alarms'
          WHEN 'co_alarms' THEN 'CO Alarms'
          ELSE v_cert.certificate_type::text
        END,
        v_cert.certificate_type::text
      ) || ' renewal'
    ),
    p_issue_description := format(
      'Manual compliance renewal dispatch — %s. Current expiry: %s.',
      v_cert.certificate_type::text,
      COALESCE(v_cert.expiry_date::text, 'not set')
    ),
    p_category := 'compliance_renewal',
    p_priority := CASE
      WHEN v_cert.expiry_date IS NULL OR v_cert.expiry_date < CURRENT_DATE THEN 'high'
      WHEN v_cert.expiry_date < CURRENT_DATE + interval '14 days' THEN 'high'
      ELSE 'medium'
    END,
    p_compliance_certificate_id := p_cert_id
  );

  -- Also update the cert's contractor_id if a different one was selected
  IF p_contractor_id IS NOT NULL AND p_contractor_id != COALESCE(v_cert.contractor_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    UPDATE public.c1_compliance_certificates
    SET contractor_id = p_contractor_id
    WHERE id = p_cert_id;
  END IF;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket_id,
    'contractor_name', v_contractor.contractor_name
  );
END;
$$;


-- ─── 2. compliance_upsert_certificate — auto-close ticket on renewal ────

CREATE OR REPLACE FUNCTION public.compliance_upsert_certificate(
  p_property_id uuid,
  p_pm_id uuid,
  p_certificate_type text,
  p_issued_date date DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_certificate_number text DEFAULT NULL,
  p_issued_by text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reminder_days_before integer DEFAULT 60,
  p_contractor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- Auto-close any open compliance ticket linked to the cert being replaced.
  -- Must run BEFORE the DELETE because compliance_certificate_id has ON DELETE SET NULL.
  UPDATE public.c1_tickets
  SET status = 'closed',
      resolved_at = now(),
      tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
        'type', 'compliance_manual_renewal', 'at', now()
      )
  WHERE compliance_certificate_id IN (
    SELECT id FROM public.c1_compliance_certificates
    WHERE property_id = p_property_id
      AND property_manager_id = p_pm_id
      AND certificate_type = p_certificate_type::public.certificate_type
  )
  AND status = 'open';

  DELETE FROM c1_compliance_certificates
  WHERE property_id = p_property_id
    AND property_manager_id = p_pm_id
    AND certificate_type = p_certificate_type::public.certificate_type;

  INSERT INTO c1_compliance_certificates (
    property_id, property_manager_id, certificate_type,
    issued_date, expiry_date, certificate_number, issued_by, notes,
    status, reminder_days_before, contractor_id
  ) VALUES (
    p_property_id, p_pm_id, p_certificate_type::public.certificate_type,
    p_issued_date, p_expiry_date, p_certificate_number, p_issued_by, p_notes,
    'valid', p_reminder_days_before, p_contractor_id
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


-- ─── 3. c1_contractor_timeout_check — exclude compliance tickets ────────
-- PROTECTED RPC — Safe Modification Protocol applied.
-- Change: Add "AND t.compliance_certificate_id IS NULL" to both loops
-- so compliance renewal tickets are not timed out at 6 hours.
-- Compliance-specific escalation (72h) handled by Slice B.

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
      AND t.compliance_certificate_id IS NULL  -- exclude compliance renewals
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
      AND t.compliance_certificate_id IS NULL  -- exclude compliance renewals
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
