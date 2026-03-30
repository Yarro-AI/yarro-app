-- ============================================================
-- Compliance Workflow MVP
-- Adds property compliance configuration, cert-to-ticket linkage,
-- and new RPCs for status computation, dashboard summary, and to-dos
-- ============================================================

-- ─── 1. Property type column ────────────────────────────────

ALTER TABLE c1_properties
  ADD COLUMN IF NOT EXISTS property_type text DEFAULT 'hmo';

-- ─── 2. Compliance requirements table ───────────────────────

CREATE TABLE IF NOT EXISTS c1_compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES c1_properties(id) ON DELETE CASCADE,
  property_manager_id uuid NOT NULL REFERENCES c1_property_managers(id),
  certificate_type public.certificate_type NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, certificate_type)
);

ALTER TABLE c1_compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "PM sees own requirements"
  ON c1_compliance_requirements
  FOR ALL
  USING (property_manager_id = auth.uid());

-- ─── 3. Cert-to-ticket linkage ──────────────────────────────

ALTER TABLE c1_tickets
  ADD COLUMN IF NOT EXISTS compliance_certificate_id uuid
    REFERENCES c1_compliance_certificates(id) ON DELETE SET NULL;

-- ─── 4. Auto-populate requirements on property insert ───────

CREATE OR REPLACE FUNCTION public.compliance_auto_populate_requirements()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cert_types public.certificate_type[];
BEGIN
  -- Choose cert types based on property type
  IF NEW.property_type = 'single_let' THEN
    v_cert_types := ARRAY[
      'gas_safety', 'eicr', 'epc', 'smoke_alarms', 'co_alarms'
    ]::public.certificate_type[];
  ELSE
    -- Default: HMO — all 9 cert types
    v_cert_types := ARRAY[
      'hmo_license', 'gas_safety', 'eicr', 'epc', 'fire_risk',
      'pat', 'legionella', 'smoke_alarms', 'co_alarms'
    ]::public.certificate_type[];
  END IF;

  INSERT INTO c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
  SELECT NEW.id, NEW.property_manager_id, unnest(v_cert_types), true
  ON CONFLICT (property_id, certificate_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compliance_auto_populate ON c1_properties;
CREATE TRIGGER trg_compliance_auto_populate
  AFTER INSERT ON c1_properties
  FOR EACH ROW
  EXECUTE FUNCTION compliance_auto_populate_requirements();

-- ─── 5. Seed requirements for existing properties ───────────
-- Backfill: insert HMO defaults for any property that has no requirements yet

INSERT INTO c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
SELECT
  p.id,
  p.property_manager_id,
  ct.cert_type,
  true
FROM c1_properties p
CROSS JOIN (
  VALUES
    ('hmo_license'::public.certificate_type),
    ('gas_safety'::public.certificate_type),
    ('eicr'::public.certificate_type),
    ('epc'::public.certificate_type),
    ('fire_risk'::public.certificate_type),
    ('pat'::public.certificate_type),
    ('legionella'::public.certificate_type),
    ('smoke_alarms'::public.certificate_type),
    ('co_alarms'::public.certificate_type)
) AS ct(cert_type)
WHERE NOT EXISTS (
  SELECT 1 FROM c1_compliance_requirements cr
  WHERE cr.property_id = p.id AND cr.certificate_type = ct.cert_type
)
AND p.property_type IS DISTINCT FROM 'single_let';

-- ─── 6. RPC: Upsert compliance requirements ─────────────────

CREATE OR REPLACE FUNCTION public.compliance_upsert_requirements(
  p_property_id uuid,
  p_pm_id uuid,
  p_requirements jsonb  -- array of { certificate_type: string, is_required: boolean }
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_req jsonb;
BEGIN
  -- Validate property belongs to PM
  IF NOT EXISTS (
    SELECT 1 FROM c1_properties
    WHERE id = p_property_id AND property_manager_id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'Property not found or does not belong to PM';
  END IF;

  -- Upsert each requirement
  FOR v_req IN SELECT * FROM jsonb_array_elements(p_requirements)
  LOOP
    INSERT INTO c1_compliance_requirements (
      property_id, property_manager_id, certificate_type, is_required
    ) VALUES (
      p_property_id,
      p_pm_id,
      (v_req->>'certificate_type')::public.certificate_type,
      (v_req->>'is_required')::boolean
    )
    ON CONFLICT (property_id, certificate_type)
    DO UPDATE SET is_required = (v_req->>'is_required')::boolean;
  END LOOP;
END;
$$;

-- ─── 7. RPC: Get property compliance status ─────────────────
-- Joins requirements + certificates + active renewal tickets
-- Returns one row per required cert type with computed display_status

CREATE OR REPLACE FUNCTION public.compliance_get_property_status(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  certificate_type text,
  display_status text,
  expiry_date date,
  days_remaining integer,
  cert_id uuid,
  issued_by text,
  certificate_number text,
  document_url text,
  renewal_ticket_id uuid,
  reminder_days_before integer,
  contractor_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    req.certificate_type::text,
    CASE
      -- No certificate record at all, or no expiry AND no document
      WHEN cert.id IS NULL THEN 'missing'
      WHEN cert.expiry_date IS NULL AND cert.document_url IS NULL AND cert.issued_by IS NULL THEN 'missing'
      -- Has info but not verified
      WHEN cert.status != 'verified' AND cert.expiry_date IS NOT NULL THEN
        CASE
          WHEN cert.expiry_date < CURRENT_DATE THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expired' END
          WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expiring_soon' END
          ELSE 'review'
        END
      -- Verified cert
      WHEN cert.status = 'verified' THEN
        CASE
          WHEN cert.expiry_date < CURRENT_DATE THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expired' END
          WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expiring_soon' END
          ELSE 'valid'
        END
      -- Has some data but no expiry (e.g. uploaded doc, no date)
      ELSE 'review'
    END AS display_status,
    cert.expiry_date,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining,
    cert.id AS cert_id,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id,
    cert.reminder_days_before,
    cert.contractor_id
  FROM c1_compliance_requirements req
  LEFT JOIN c1_compliance_certificates cert
    ON cert.property_id = req.property_id
    AND cert.certificate_type = req.certificate_type
    AND cert.property_manager_id = req.property_manager_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE req.property_id = p_property_id
    AND req.property_manager_id = p_pm_id
    AND req.is_required = true
  ORDER BY
    CASE
      WHEN cert.id IS NULL THEN 1  -- missing first
      WHEN cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3  -- expired
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4  -- expiring
      ELSE 5  -- valid
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;

-- ─── 8. Updated RPC: compliance_get_summary ─────────────────
-- Now based on requirements, not just certificates.
-- Returns action-oriented counts instead of simple status counts.

CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH status_calc AS (
    SELECT
      req.property_id,
      req.certificate_type,
      CASE
        WHEN cert.id IS NULL THEN 'missing'
        WHEN cert.expiry_date IS NULL AND cert.document_url IS NULL AND cert.issued_by IS NULL THEN 'missing'
        WHEN cert.status = 'verified' AND cert.expiry_date >= CURRENT_DATE + interval '30 days' THEN 'valid'
        WHEN cert.expiry_date < CURRENT_DATE THEN
          CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expired' END
        WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
          CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expiring_unscheduled' END
        WHEN cert.status != 'verified' THEN 'review'
        ELSE 'valid'
      END AS display_status
    FROM c1_compliance_requirements req
    LEFT JOIN c1_compliance_certificates cert
      ON cert.property_id = req.property_id
      AND cert.certificate_type = req.certificate_type
      AND cert.property_manager_id = req.property_manager_id
    LEFT JOIN c1_tickets t
      ON t.compliance_certificate_id = cert.id
      AND t.status = 'open'
      AND t.archived = false
    WHERE req.property_manager_id = p_pm_id
      AND req.is_required = true
  ),
  property_status AS (
    SELECT
      property_id,
      -- A property is compliant if ALL required certs are valid or renewal_scheduled
      CASE
        WHEN COUNT(*) FILTER (WHERE display_status IN ('missing', 'expired', 'expiring_unscheduled', 'review')) = 0
        THEN true
        ELSE false
      END AS is_compliant
    FROM status_calc
    GROUP BY property_id
  )
  SELECT json_build_object(
    'actions_needed',
      (SELECT COUNT(*) FROM status_calc WHERE display_status IN ('missing', 'expired', 'expiring_unscheduled', 'review')),
    'expired',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'expired'),
    'expiring_unscheduled',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'expiring_unscheduled'),
    'review',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'review'),
    'missing',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'missing'),
    'renewal_scheduled',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'renewal_scheduled'),
    'valid',
      (SELECT COUNT(*) FROM status_calc WHERE display_status = 'valid'),
    'compliant_properties',
      (SELECT COUNT(*) FROM property_status WHERE is_compliant = true),
    'total_properties',
      (SELECT COUNT(*) FROM property_status),
    'total_required',
      (SELECT COUNT(*) FROM status_calc)
  );
$$;

-- ─── 9. New RPC: compliance_get_todos ───────────────────────
-- Returns ordered list of actionable compliance items for the dashboard.
-- Excludes certs with active renewal tickets.

CREATE OR REPLACE FUNCTION public.compliance_get_todos(
  p_pm_id uuid
)
RETURNS TABLE (
  property_address text,
  property_id uuid,
  cert_type text,
  cert_id uuid,
  action text,
  urgency_label text,
  days_remaining integer
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.address AS property_address,
    req.property_id,
    req.certificate_type::text AS cert_type,
    cert.id AS cert_id,
    -- Action text
    CASE
      WHEN cert.id IS NULL THEN 'obtain'
      WHEN cert.expiry_date IS NULL AND cert.document_url IS NULL THEN 'obtain'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'renew'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'schedule_renewal'
      WHEN cert.status != 'verified' THEN 'verify'
      ELSE NULL  -- shouldn't reach here
    END AS action,
    -- Urgency label
    CASE
      WHEN cert.id IS NULL THEN 'Missing'
      WHEN cert.expiry_date IS NULL AND cert.document_url IS NULL THEN 'Missing'
      WHEN cert.expiry_date < CURRENT_DATE THEN
        'Expired ' || abs((cert.expiry_date - CURRENT_DATE)::integer) || ' days ago'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
        'Expires in ' || (cert.expiry_date - CURRENT_DATE)::integer || ' days'
      WHEN cert.status != 'verified' THEN 'Needs verification'
      ELSE NULL
    END AS urgency_label,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining
  FROM c1_compliance_requirements req
  JOIN c1_properties p ON p.id = req.property_id
  LEFT JOIN c1_compliance_certificates cert
    ON cert.property_id = req.property_id
    AND cert.certificate_type = req.certificate_type
    AND cert.property_manager_id = req.property_manager_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE req.property_manager_id = p_pm_id
    AND req.is_required = true
    -- Exclude valid verified certs
    AND NOT (
      cert.id IS NOT NULL
      AND cert.status = 'verified'
      AND cert.expiry_date >= CURRENT_DATE + interval '30 days'
    )
    -- Exclude certs with active renewal tickets
    AND t.id IS NULL
  ORDER BY
    -- Priority: expired first, then expiring by days, then review, then missing
    CASE
      WHEN cert.id IS NULL THEN 4                          -- missing
      WHEN cert.expiry_date < CURRENT_DATE THEN 1          -- expired
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 2  -- expiring
      WHEN cert.status != 'verified' THEN 3                -- review
      ELSE 5
    END,
    cert.expiry_date ASC NULLS LAST;
$$;

-- ─── 10. Update c1_create_manual_ticket to accept cert ID ───
-- Add optional p_compliance_certificate_id parameter

DROP FUNCTION IF EXISTS public.c1_create_manual_ticket(uuid, uuid, uuid, uuid[], text, text, text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.c1_create_manual_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_contractor_ids uuid[] DEFAULT NULL,
  p_issue_description text DEFAULT NULL,
  p_issue_title text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_access text DEFAULT NULL,
  p_availability text DEFAULT NULL,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_compliance_certificate_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
  v_property record;
  v_tenant record;
  v_pm record;
  v_contractor record;
  v_contractor_obj jsonb;
  v_contractors_array jsonb := '[]'::jsonb;
  v_manager_obj jsonb;
  v_landlord_obj jsonb;
  v_contractor_count int := 0;
  v_idx int := 0;
BEGIN
  -- Validate property
  SELECT id, address, landlord_name, landlord_email, landlord_phone,
         property_manager_id, auto_approve_limit
  INTO v_property
  FROM public.c1_properties
  WHERE id = p_property_id AND property_manager_id = p_property_manager_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property % not found or does not belong to PM %',
      p_property_id, p_property_manager_id;
  END IF;

  -- Validate tenant (only if provided)
  IF p_tenant_id IS NOT NULL THEN
    SELECT id, full_name, phone, email
    INTO v_tenant
    FROM public.c1_tenants
    WHERE id = p_tenant_id AND property_id = p_property_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant % not found or does not belong to property %',
        p_tenant_id, p_property_id;
    END IF;
  END IF;

  -- Validate PM
  SELECT id, name, phone, email, business_name
  INTO v_pm
  FROM public.c1_property_managers
  WHERE id = p_property_manager_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property manager % not found', p_property_manager_id;
  END IF;

  -- Validate contractors
  IF p_contractor_ids IS NULL OR array_length(p_contractor_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one contractor must be selected';
  END IF;

  FOR v_idx IN 1..array_length(p_contractor_ids, 1) LOOP
    SELECT id, contractor_name, contractor_phone, contractor_email, category
    INTO v_contractor
    FROM public.c1_contractors
    WHERE id = p_contractor_ids[v_idx]
      AND property_manager_id = p_property_manager_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contractor % not found, inactive, or does not belong to PM',
        p_contractor_ids[v_idx];
    END IF;

    v_contractor_count := v_contractor_count + 1;
  END LOOP;

  IF p_issue_description IS NULL OR trim(p_issue_description) = '' THEN
    RAISE EXCEPTION 'Issue description cannot be empty';
  END IF;

  IF p_category IS NULL OR trim(p_category) = '' THEN
    RAISE EXCEPTION 'Category cannot be empty';
  END IF;

  IF p_priority IS NULL OR trim(p_priority) = '' THEN
    RAISE EXCEPTION 'Priority cannot be empty';
  END IF;

  -- Create ticket
  INSERT INTO public.c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_description, issue_title, category, priority, images, job_stage, verified_by,
    access, availability, reporter_role, handoff, is_manual, conversation_id,
    compliance_certificate_id
  )
  VALUES (
    'open', timezone('utc', now()), p_tenant_id, p_property_id, p_property_manager_id,
    trim(p_issue_description), NULLIF(trim(p_issue_title), ''), p_category, p_priority, COALESCE(p_images, '[]'::jsonb),
    'created', 'manual', COALESCE(trim(p_access), NULL),
    COALESCE(trim(p_availability), 'Not specified - please contact tenant'),
    'reporter_role', false, true, NULL,
    p_compliance_certificate_id
  )
  RETURNING id INTO v_ticket_id;

  -- Build contractors array
  FOR v_idx IN 1..array_length(p_contractor_ids, 1) LOOP
    SELECT
      jsonb_build_object(
        'id',               c.id,
        'name',             c.contractor_name,
        'phone',            c.contractor_phone,
        'email',            c.contractor_email,
        'category',         p_category,
        'property_id',      p_property_id,
        'property_address', v_property.address,
        'issue_description', trim(p_issue_description),
        'priority',         p_priority,
        'status',           'pending',
        'access',           COALESCE(trim(p_access), NULL),
        'access_granted',   CASE WHEN p_access IS NOT NULL THEN true ELSE NULL END,
        'availability',     COALESCE(trim(p_availability), 'Not specified - please contact tenant'),
        'reporter_role',    'manager'
      )
    INTO v_contractor_obj
    FROM public.c1_contractors c
    WHERE c.id = p_contractor_ids[v_idx];

    v_contractors_array := v_contractors_array || v_contractor_obj;
  END LOOP;

  -- Build manager object
  v_manager_obj := jsonb_build_object(
    'id',            v_pm.id,
    'name',          v_pm.name,
    'business_name', v_pm.business_name,
    'phone',         v_pm.phone,
    'email',         v_pm.email,
    'approval',      NULL
  );

  -- Build landlord object
  v_landlord_obj := jsonb_build_object(
    'name',   v_property.landlord_name,
    'email',  v_property.landlord_email,
    'phone',  v_property.landlord_phone
  );

  -- Insert into c1_messages
  PERFORM set_config('application_name', 'c1_create_manual_ticket', true);

  INSERT INTO public.c1_messages (
    ticket_id, contractors, manager, landlord, stage, suppress_webhook, created_at, updated_at
  )
  VALUES (
    v_ticket_id, v_contractors_array, v_manager_obj, v_landlord_obj,
    'waiting_contractor', true, now(), now()
  );

  PERFORM set_config('application_name', '', true);
  PERFORM public.c1_message_next_action(v_ticket_id);

  RETURN v_ticket_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create manual ticket: %', SQLERRM;
END;
$$;
