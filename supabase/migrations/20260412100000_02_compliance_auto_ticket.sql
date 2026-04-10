-- Sprint B, Step 2: Compliance auto-ticketing + idempotent dispatch
-- 1. c1_compliance_auto_ticket() — daily cron scans certs, creates tickets
-- 2. compliance_dispatch_renewal — idempotent (handles auto-created tickets)
-- 3. Cron schedule: 08:05 UTC daily (after escalation 07:55, reminder 08:00)


-- ═══════════════════════════════════════════════════════════════
-- 1. c1_compliance_auto_ticket()
-- ═══════════════════════════════════════════════════════════════
-- Scans all compliance certificates and creates tickets for:
--   a) Incomplete certs (missing document_url or expiry_date)
--   b) Expiring certs (≤30 days to expiry)
--   c) Expired certs (past expiry)
-- Dedup: skips if an open ticket already exists for the cert.

CREATE OR REPLACE FUNCTION public.c1_compliance_auto_ticket()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_ticket_id uuid;
  v_cert_label text;
  v_days_to_expiry integer;
  v_title text;
  v_description text;
  v_priority text;
BEGIN
  FOR r IN
    SELECT cc.id AS cert_id,
           cc.property_id,
           cc.property_manager_id,
           cc.certificate_type,
           cc.expiry_date,
           cc.document_url,
           p.address AS property_address
    FROM c1_compliance_certificates cc
    JOIN c1_properties p ON p.id = cc.property_id
    WHERE cc.property_manager_id IS NOT NULL
      -- Dedup: no open ticket for this cert
      AND NOT EXISTS (
        SELECT 1 FROM c1_tickets t
        WHERE t.compliance_certificate_id = cc.id
          AND t.status = 'open'
      )
      -- Must have something actionable
      AND (
        cc.document_url IS NULL
        OR cc.expiry_date IS NULL
        OR cc.expiry_date <= CURRENT_DATE + interval '30 days'
      )
  LOOP
    -- Human-readable cert label (matches compliance_dispatch_renewal)
    v_cert_label := CASE r.certificate_type::text
      WHEN 'hmo_license' THEN 'HMO Licence'
      WHEN 'gas_safety' THEN 'Gas Safety (CP12)'
      WHEN 'eicr' THEN 'EICR'
      WHEN 'epc' THEN 'EPC'
      WHEN 'fire_risk' THEN 'Fire Risk Assessment'
      WHEN 'pat' THEN 'PAT Testing'
      WHEN 'legionella' THEN 'Legionella Risk Assessment'
      WHEN 'smoke_alarms' THEN 'Smoke Alarms'
      WHEN 'co_alarms' THEN 'CO Alarms'
      ELSE r.certificate_type::text
    END;

    v_title := v_cert_label || ' — ' || r.property_address;

    IF r.document_url IS NULL OR r.expiry_date IS NULL THEN
      -- Incomplete cert
      v_description := v_cert_label || ' is incomplete (missing ' ||
        CASE
          WHEN r.document_url IS NULL AND r.expiry_date IS NULL THEN 'document and expiry date'
          WHEN r.document_url IS NULL THEN 'document'
          ELSE 'expiry date'
        END || ')';
      v_priority := 'Normal';
    ELSE
      -- Expiring or expired
      v_days_to_expiry := r.expiry_date - CURRENT_DATE;
      IF v_days_to_expiry < 0 THEN
        v_description := format('%s expired %s days ago — dispatch contractor for renewal',
          v_cert_label, abs(v_days_to_expiry));
        v_priority := 'Urgent';
      ELSE
        v_description := format('%s expires in %s days — dispatch contractor for renewal',
          v_cert_label, v_days_to_expiry);
        v_priority := CASE
          WHEN v_days_to_expiry <= 14 THEN 'High'
          ELSE 'Medium'
        END;
      END IF;
    END IF;

    -- Create ticket
    -- BEFORE INSERT trigger fires but can't read the row yet (gets defaults).
    -- The UPDATE below forces a recompute with the row visible.
    INSERT INTO c1_tickets (
      status, date_logged, property_id, property_manager_id,
      issue_title, issue_description, category, priority,
      verified_by, is_manual, handoff,
      compliance_certificate_id, deadline_date, waiting_since
    ) VALUES (
      'open', now(), r.property_id, r.property_manager_id,
      v_title, v_description, 'compliance_renewal', v_priority,
      'system', true, false,
      r.cert_id, r.expiry_date, now()
    ) RETURNING id INTO v_ticket_id;

    -- Force recompute: trigger reads the row on UPDATE and sets correct state
    UPDATE c1_tickets SET status = status WHERE id = v_ticket_id;

    -- Audit event (non-negotiable per architecture rules)
    PERFORM c1_log_event(
      v_ticket_id, 'AUTO_TICKET_COMPLIANCE', 'SYSTEM', NULL,
      r.property_address,
      jsonb_build_object(
        'cert_id', r.cert_id,
        'cert_type', r.certificate_type::text,
        'expiry_date', r.expiry_date,
        'incomplete', (r.document_url IS NULL OR r.expiry_date IS NULL)
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. compliance_dispatch_renewal — idempotent
-- ═══════════════════════════════════════════════════════════════
-- Previously raised exception when ticket existed for cert.
-- Now: if auto-created ticket exists, assign contractor + dispatch.

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
  v_property record;
  v_pm record;
  v_ticket record;
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

  -- Validate contractor (fetch all fields needed for message JSONB)
  SELECT id, contractor_name, contractor_phone, contractor_email, category
  INTO v_contractor
  FROM public.c1_contractors
  WHERE id = v_contractor_id
    AND property_manager_id = p_pm_id
    AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contractor not found, inactive, or does not belong to this PM';
  END IF;

  -- Check for existing open ticket
  SELECT id INTO v_existing_ticket_id
  FROM public.c1_tickets
  WHERE compliance_certificate_id = p_cert_id
    AND status = 'open'
    AND (archived IS NULL OR archived = false)
  LIMIT 1;

  IF v_existing_ticket_id IS NOT NULL THEN
    -- ── Idempotent path: auto-created ticket exists — assign contractor ──

    -- Fetch property for message + landlord info
    SELECT id, address, landlord_name, landlord_email, landlord_phone
    INTO v_property
    FROM c1_properties WHERE id = v_cert.property_id;

    -- Fetch PM for message
    SELECT id, name, phone, email, business_name
    INTO v_pm
    FROM c1_property_managers WHERE id = p_pm_id;

    -- Fetch ticket for message context
    SELECT issue_description, priority
    INTO v_ticket
    FROM c1_tickets WHERE id = v_existing_ticket_id;

    -- Create message row (auto-created tickets have none)
    PERFORM set_config('application_name', 'compliance_dispatch_renewal', true);

    INSERT INTO c1_messages (ticket_id, contractors, manager, landlord, stage, suppress_webhook, created_at, updated_at)
    VALUES (
      v_existing_ticket_id,
      jsonb_build_array(jsonb_build_object(
        'id', v_contractor.id,
        'name', v_contractor.contractor_name,
        'phone', v_contractor.contractor_phone,
        'email', v_contractor.contractor_email,
        'category', 'compliance_renewal',
        'property_id', v_cert.property_id,
        'property_address', v_property.address,
        'issue_description', v_ticket.issue_description,
        'priority', v_ticket.priority,
        'status', 'pending'
      )),
      jsonb_build_object(
        'id', v_pm.id, 'name', v_pm.name, 'business_name', v_pm.business_name,
        'phone', v_pm.phone, 'email', v_pm.email, 'approval', NULL
      ),
      jsonb_build_object(
        'name', v_property.landlord_name,
        'email', v_property.landlord_email,
        'phone', v_property.landlord_phone
      ),
      'waiting_contractor', true, now(), now()
    )
    ON CONFLICT (ticket_id) DO UPDATE SET
      contractors = EXCLUDED.contractors,
      stage = 'waiting_contractor',
      updated_at = now();

    PERFORM set_config('application_name', '', true);
    PERFORM public.c1_message_next_action(v_existing_ticket_id);

    -- Update cert contractor if different
    IF p_contractor_id IS NOT NULL AND p_contractor_id != COALESCE(v_cert.contractor_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      UPDATE c1_compliance_certificates SET contractor_id = p_contractor_id WHERE id = p_cert_id;
    END IF;

    RETURN jsonb_build_object(
      'ticket_id', v_existing_ticket_id,
      'contractor_name', v_contractor.contractor_name
    );
  END IF;

  -- ── Standard path: no ticket exists — create via c1_create_manual_ticket ──

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
    p_compliance_certificate_id := p_cert_id,
    p_deadline_date := v_cert.expiry_date
  );

  -- Update cert contractor if different
  IF p_contractor_id IS NOT NULL AND p_contractor_id != COALESCE(v_cert.contractor_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    UPDATE c1_compliance_certificates SET contractor_id = p_contractor_id WHERE id = p_cert_id;
  END IF;

  RETURN jsonb_build_object(
    'ticket_id', v_ticket_id,
    'contractor_name', v_contractor.contractor_name
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3. Cron: compliance-auto-ticket-daily at 08:05 UTC
-- ═══════════════════════════════════════════════════════════════
-- Order: escalation (07:55) → reminder (08:00) → auto-ticket (08:05)

SELECT cron.schedule(
  'compliance-auto-ticket-daily',
  '5 8 * * *',
  $$SELECT public.c1_compliance_auto_ticket()$$
);
