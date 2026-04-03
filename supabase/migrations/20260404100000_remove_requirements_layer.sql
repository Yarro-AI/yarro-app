-- =============================================================
-- Remove requirements layer — certs directly on properties
--
-- Before: Properties → Requirements → Certificates
-- After:  Properties → Certificates (directly attached)
--
-- Changes:
-- 1. compliance_get_all_statuses — query certs directly
-- 2. compliance_get_property_status — query certs directly
-- 3. compliance_get_summary — rename missing → incomplete
-- 4. compliance_get_todos — query certs directly
-- 5. c1_get_dashboard_todo_extras — remove compliance_missing CTE
-- 6. onboarding_create_property — remove compliance_set_property_type call
--
-- NOT dropped: c1_compliance_requirements table, compliance_upsert_requirements,
-- compliance_set_property_type — left dormant for safe rollback.
-- =============================================================


-- ─── 1. compliance_get_all_statuses (SSOT) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.compliance_get_all_statuses(
  p_pm_id uuid
)
RETURNS TABLE (
  cert_id uuid,
  property_id uuid,
  property_address text,
  certificate_type text,
  display_status text,
  expiry_date date,
  days_remaining integer,
  issued_date date,
  issued_by text,
  certificate_number text,
  document_url text,
  renewal_ticket_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    cert.id AS cert_id,
    cert.property_id,
    p.address AS property_address,
    cert.certificate_type::text,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'incomplete'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
      ELSE 'valid'
    END AS display_status,
    cert.expiry_date,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining,
    cert.issued_date,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id
  FROM c1_compliance_certificates cert
  JOIN c1_properties p ON p.id = cert.property_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ─── 2. compliance_get_property_status ──────────────────────────────────

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
    cert.certificate_type::text,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'incomplete'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
      ELSE 'valid'
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
  FROM c1_compliance_certificates cert
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE cert.property_id = p_property_id
    AND cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ─── 3. compliance_get_summary ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH statuses AS (
    SELECT * FROM compliance_get_all_statuses(p_pm_id)
  ),
  property_compliance AS (
    SELECT
      property_id,
      CASE
        WHEN COUNT(*) FILTER (
          WHERE display_status IN ('incomplete', 'expired', 'expiring_soon')
        ) = 0 THEN true
        ELSE false
      END AS is_compliant
    FROM statuses
    GROUP BY property_id
  )
  SELECT json_build_object(
    'actions_needed',
      (SELECT COUNT(*) FROM statuses WHERE display_status IN ('incomplete', 'expired', 'expiring_soon')),
    'expired',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expired'),
    'expiring_soon',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expiring_soon'),
    'incomplete',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'incomplete'),
    'renewal_requested',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'renewal_requested'),
    'renewal_scheduled',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'renewal_scheduled'),
    'valid',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'valid'),
    'compliant_properties',
      (SELECT COUNT(*) FROM property_compliance WHERE is_compliant = true),
    'total_properties',
      (SELECT COUNT(DISTINCT property_id) FROM statuses),
    'total_required',
      (SELECT COUNT(*) FROM statuses)
  );
$$;


-- ─── 4. compliance_get_todos ────────────────────────────────────────────

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
    cert.property_id,
    cert.certificate_type::text AS cert_type,
    cert.id AS cert_id,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'complete'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'renew'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'schedule_renewal'
      ELSE NULL
    END AS action,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'Incomplete — add details'
      WHEN cert.expiry_date < CURRENT_DATE THEN
        'Expired ' || abs((cert.expiry_date - CURRENT_DATE)::integer) || ' days ago'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
        'Expires in ' || (cert.expiry_date - CURRENT_DATE)::integer || ' days'
      ELSE NULL
    END AS urgency_label,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining
  FROM c1_compliance_certificates cert
  JOIN c1_properties p ON p.id = cert.property_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE cert.property_manager_id = p_pm_id
    -- Exclude valid certs
    AND NOT (
      cert.document_url IS NOT NULL
      AND cert.expiry_date IS NOT NULL
      AND cert.expiry_date >= CURRENT_DATE + interval '30 days'
    )
    -- Exclude certs with active renewal tickets
    AND t.id IS NULL
  ORDER BY
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 4
      WHEN cert.expiry_date < CURRENT_DATE THEN 1
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 2
      ELSE 5
    END,
    cert.expiry_date ASC NULLS LAST;
$$;


-- ─── 5. c1_get_dashboard_todo_extras — remove compliance_missing CTE ────

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo_extras(p_pm_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY

  -- ─── 1. Compliance: certs that are expired, expiring, or incomplete ───
  WITH compliance_items AS (
    SELECT
      cc.id AS entity_id,
      cc.property_id,
      p.address AS property_label,
      cc.certificate_type,
      cc.expiry_date,
      cc.document_url,
      CASE cc.certificate_type
        WHEN 'hmo_license'  THEN 'HMO Licence'
        WHEN 'gas_safety'   THEN 'Gas Safety (CP12)'
        WHEN 'eicr'         THEN 'EICR'
        WHEN 'epc'          THEN 'EPC'
        WHEN 'fire_risk'    THEN 'Fire Risk Assessment'
        WHEN 'pat'          THEN 'PAT Testing'
        WHEN 'legionella'   THEN 'Legionella Risk Assessment'
        WHEN 'smoke_alarms' THEN 'Smoke Alarms'
        WHEN 'co_alarms'    THEN 'CO Alarms'
        ELSE cc.certificate_type::text
      END AS cert_label,
      CASE
        WHEN cc.document_url IS NULL OR cc.expiry_date IS NULL THEN 'compliance_incomplete'
        WHEN cc.expiry_date < CURRENT_DATE THEN 'compliance_expired'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'compliance_expiring'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'compliance_expiring'
      END AS reason_key,
      CASE
        WHEN cc.document_url IS NULL OR cc.expiry_date IS NULL THEN 100
        WHEN cc.expiry_date < CURRENT_DATE THEN 180
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 120
        WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 80
      END AS priority_score,
      CASE
        WHEN cc.document_url IS NULL OR cc.expiry_date IS NULL THEN 'HIGH'
        WHEN cc.expiry_date < CURRENT_DATE THEN 'URGENT'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'HIGH'
        ELSE 'NORMAL'
      END AS priority_bucket
    FROM c1_compliance_certificates cc
    JOIN c1_properties p ON p.id = cc.property_id
    WHERE (cc.property_manager_id = p_pm_id
           OR (cc.property_manager_id IS NULL AND p.property_manager_id = p_pm_id))
      AND (
        cc.document_url IS NULL
        OR cc.expiry_date IS NULL
        OR cc.expiry_date <= CURRENT_DATE + interval '30 days'
      )
  ),

  -- ─── 2. Rent: overdue or partial payments ───
  rent_items AS (
    SELECT
      rl.id AS entity_id,
      r.property_id,
      p.address AS property_label,
      r.room_number,
      t.full_name AS tenant_name,
      rl.amount_due,
      COALESCE(rl.amount_paid, 0) AS amount_paid,
      rl.due_date,
      rl.status AS rent_status,
      (CURRENT_DATE - rl.due_date) AS days_overdue
    FROM c1_rent_ledger rl
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= date_trunc('month', CURRENT_DATE)::date
      AND rl.due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
      AND (
        rl.status IN ('overdue', 'partial')
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
      )
  ),

  -- ─── 3. Tenancy: ending soon or already expired ───
  tenancy_items AS (
    SELECT
      r.id AS entity_id,
      r.property_id,
      p.address AS property_label,
      r.room_number,
      t.full_name AS tenant_name,
      r.tenancy_end_date,
      CASE
        WHEN r.tenancy_end_date < CURRENT_DATE THEN 'tenancy_expired'
        ELSE 'tenancy_ending'
      END AS reason_key,
      CASE
        WHEN r.tenancy_end_date < CURRENT_DATE THEN 100
        ELSE 70
      END AS priority_score,
      CASE
        WHEN r.tenancy_end_date < CURRENT_DATE THEN 'HIGH'
        ELSE 'NORMAL'
      END AS priority_bucket
    FROM c1_rooms r
    JOIN c1_properties p ON p.id = r.property_id
    LEFT JOIN c1_tenants t ON t.id = r.current_tenant_id
    WHERE r.property_manager_id = p_pm_id
      AND r.current_tenant_id IS NOT NULL
      AND r.tenancy_end_date IS NOT NULL
      AND r.tenancy_end_date <= CURRENT_DATE + interval '30 days'
  ),

  -- ─── 4. Handoff: open conversations without tickets ───
  handoff_items AS (
    SELECT
      c.id AS entity_id,
      c.property_id,
      COALESCE(p.address, 'Unknown property') AS property_label,
      COALESCE(c.caller_name, c.phone, 'Unknown caller') AS caller_label,
      c.last_updated
    FROM c1_conversations c
    LEFT JOIN c1_properties p ON p.id = c.property_id
    WHERE c.property_manager_id = p_pm_id
      AND c.handoff = true
      AND c.status = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM c1_tickets tk WHERE tk.conversation_id = c.id
      )
  )

  -- ═══ UNION ALL: emit JSONB rows ═══

  -- Compliance items (expired, expiring, incomplete)
  SELECT jsonb_build_object(
    'id',                  'compliance_' || ci.entity_id::text,
    'ticket_id',           ci.entity_id,
    'source_type',         'compliance',
    'entity_id',           ci.entity_id,
    'property_id',         ci.property_id,
    'property_label',      COALESCE(ci.property_label, 'Unknown property'),
    'issue_summary',       CASE
                             WHEN ci.reason_key = 'compliance_incomplete'
                               THEN ci.cert_label || ' — missing details'
                             WHEN ci.reason_key = 'compliance_expired'
                               THEN ci.cert_label || ' expired ' || (CURRENT_DATE - ci.expiry_date) || ' days ago'
                             ELSE ci.cert_label || ' expires in ' || (ci.expiry_date - CURRENT_DATE) || ' days'
                           END,
    'action_type',         CASE
                             WHEN ci.reason_key IN ('compliance_expired', 'compliance_incomplete') THEN 'NEEDS_ATTENTION'
                             ELSE 'FOLLOW_UP'
                           END,
    'action_label',        CASE
                             WHEN ci.reason_key = 'compliance_incomplete' THEN 'Complete ' || ci.cert_label
                             WHEN ci.reason_key = 'compliance_expired' THEN ci.cert_label || ' expired'
                             ELSE ci.cert_label || ' expiring'
                           END,
    'action_context',      CASE
                             WHEN ci.reason_key = 'compliance_incomplete'
                               THEN ci.cert_label || ' at ' || COALESCE(ci.property_label, 'unknown') || ' — add expiry date and document'
                             WHEN ci.reason_key = 'compliance_expired'
                               THEN ci.cert_label || ' expired ' || (CURRENT_DATE - ci.expiry_date) || ' days ago at ' || COALESCE(ci.property_label, 'unknown')
                             ELSE ci.cert_label || ' expires in ' || (ci.expiry_date - CURRENT_DATE) || ' days at ' || COALESCE(ci.property_label, 'unknown')
                           END,
    'next_action_reason',  ci.reason_key,
    'priority',            NULL,
    'priority_score',      ci.priority_score,
    'priority_bucket',     ci.priority_bucket,
    'waiting_since',       COALESCE(ci.expiry_date, CURRENT_DATE),
    'sla_breached',        ci.reason_key = 'compliance_expired',
    'created_at',          COALESCE(ci.expiry_date, CURRENT_DATE)
  )
  FROM compliance_items ci

  UNION ALL

  -- Rent: overdue or partial
  SELECT jsonb_build_object(
    'id',                  'rent_' || ri.entity_id::text,
    'ticket_id',           ri.entity_id,
    'source_type',         'rent',
    'entity_id',           ri.entity_id,
    'property_id',         ri.property_id,
    'property_label',      COALESCE(ri.property_label, 'Unknown property'),
    'issue_summary',       CASE
                             WHEN ri.rent_status = 'partial' OR (ri.amount_paid > 0 AND ri.amount_paid < ri.amount_due)
                               THEN 'Room ' || ri.room_number || ' — £' || ri.amount_paid || '/£' || ri.amount_due || ' received'
                             ELSE 'Room ' || ri.room_number || ' — £' || ri.amount_due || ' overdue by ' || ri.days_overdue || ' days'
                           END,
    'action_type',         'NEEDS_ATTENTION',
    'action_label',        CASE
                             WHEN ri.rent_status = 'partial' THEN 'Partial payment'
                             ELSE 'Rent overdue'
                           END,
    'action_context',      CASE
                             WHEN ri.rent_status = 'partial'
                               THEN COALESCE(ri.tenant_name, 'Tenant') || ' paid £' || ri.amount_paid || ' of £' || ri.amount_due || ' for Room ' || ri.room_number
                             ELSE COALESCE(ri.tenant_name, 'Tenant') || ' owes £' || ri.amount_due || ' for Room ' || ri.room_number || ' — ' || ri.days_overdue || ' days overdue'
                           END,
    'next_action_reason',  CASE WHEN ri.rent_status = 'partial' THEN 'rent_partial' ELSE 'rent_overdue' END,
    'priority',            NULL,
    'priority_score',      CASE
                             WHEN ri.rent_status = 'partial' THEN 80
                             ELSE LEAST(100 + ri.days_overdue * 3, 150)
                           END,
    'priority_bucket',     CASE
                             WHEN ri.days_overdue > 14 THEN 'URGENT'
                             WHEN ri.days_overdue > 7 OR ri.rent_status != 'partial' THEN 'HIGH'
                             ELSE 'NORMAL'
                           END,
    'waiting_since',       ri.due_date,
    'sla_breached',        ri.days_overdue > 7,
    'created_at',          ri.due_date
  )
  FROM rent_items ri

  UNION ALL

  -- Tenancy: ending soon or expired
  SELECT jsonb_build_object(
    'id',                  'tenancy_' || ti.entity_id::text,
    'ticket_id',           ti.entity_id,
    'source_type',         'tenancy',
    'entity_id',           ti.entity_id,
    'property_id',         ti.property_id,
    'property_label',      COALESCE(ti.property_label, 'Unknown property'),
    'issue_summary',       CASE
                             WHEN ti.reason_key = 'tenancy_expired'
                               THEN COALESCE(ti.tenant_name, 'Tenant') || ', Room ' || ti.room_number || ' — ended ' || (CURRENT_DATE - ti.tenancy_end_date) || ' days ago'
                             ELSE COALESCE(ti.tenant_name, 'Tenant') || ', Room ' || ti.room_number || ' — ends ' || to_char(ti.tenancy_end_date, 'DD Mon')
                           END,
    'action_type',         CASE WHEN ti.reason_key = 'tenancy_expired' THEN 'NEEDS_ATTENTION' ELSE 'FOLLOW_UP' END,
    'action_label',        CASE WHEN ti.reason_key = 'tenancy_expired' THEN 'Tenancy expired' ELSE 'Tenancy ending' END,
    'action_context',      CASE
                             WHEN ti.reason_key = 'tenancy_expired'
                               THEN 'Tenancy ended ' || (CURRENT_DATE - ti.tenancy_end_date) || ' days ago — update room status'
                             ELSE 'Tenancy ends ' || to_char(ti.tenancy_end_date, 'DD Mon YYYY') || ' — review renewal or void'
                           END,
    'next_action_reason',  ti.reason_key,
    'priority',            NULL,
    'priority_score',      ti.priority_score,
    'priority_bucket',     ti.priority_bucket,
    'waiting_since',       ti.tenancy_end_date,
    'sla_breached',        ti.reason_key = 'tenancy_expired',
    'created_at',          ti.tenancy_end_date
  )
  FROM tenancy_items ti

  UNION ALL

  -- Handoff: open conversations without tickets
  SELECT jsonb_build_object(
    'id',                  'handoff_' || hi.entity_id::text,
    'ticket_id',           hi.entity_id,
    'source_type',         'handoff',
    'entity_id',           hi.entity_id,
    'property_id',         hi.property_id,
    'property_label',      hi.property_label,
    'issue_summary',       hi.caller_label || ' called about ' || hi.property_label || ' — needs ticket',
    'action_type',         'NEEDS_ATTENTION',
    'action_label',        'Handoff conversation',
    'action_context',      hi.caller_label || ' called about ' || hi.property_label || ' — create a ticket to dispatch',
    'next_action_reason',  'handoff_conversation',
    'priority',            NULL,
    'priority_score',      130,
    'priority_bucket',     'HIGH',
    'waiting_since',       hi.last_updated,
    'sla_breached',        false,
    'created_at',          hi.last_updated
  )
  FROM handoff_items hi;

END;
$function$;


-- ─── 6. onboarding_create_property — remove compliance_set_property_type ─

CREATE OR REPLACE FUNCTION public.onboarding_create_property(
  p_pm_id uuid,
  p_address text,
  p_city text DEFAULT 'London',
  p_room_count integer DEFAULT 1,
  p_property_type text DEFAULT 'hmo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_property record;
  v_i int;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert property
  INSERT INTO c1_properties (
    address, city, property_manager_id, property_type
  ) VALUES (
    p_address, p_city, p_pm_id, p_property_type
  )
  RETURNING * INTO v_property;

  -- Create rooms (Room 1, Room 2, etc.)
  FOR v_i IN 1..GREATEST(p_room_count, 0) LOOP
    INSERT INTO c1_rooms (
      property_id, property_manager_id, room_number, room_name
    ) VALUES (
      v_property.id, p_pm_id, v_i, 'Room ' || v_i
    );
  END LOOP;

  -- compliance_set_property_type call REMOVED — certs are added directly, no requirements

  RETURN row_to_json(v_property);
END;
$$;
