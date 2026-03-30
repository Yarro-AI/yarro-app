-- ============================================================
-- Dashboard To-Do Extras — companion RPC
-- Returns non-ticket actionable items (compliance, rent,
-- tenancy, handoff) in the same JSONB shape as
-- c1_get_dashboard_todo so the frontend can merge + sort.
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo_extras(p_pm_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY

  -- ─── 1a. Compliance: existing certs that are expired or expiring ───
  WITH compliance_existing AS (
    SELECT
      cc.id AS entity_id,
      cc.property_id,
      p.address AS property_label,
      cc.certificate_type,
      cc.expiry_date,
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
      END AS cert_label,
      CASE
        WHEN cc.expiry_date < CURRENT_DATE THEN 'compliance_expired'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'compliance_expiring'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'compliance_expiring'
      END AS reason_key,
      CASE
        WHEN cc.expiry_date < CURRENT_DATE THEN 180
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 120
        WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 80
      END AS priority_score,
      CASE
        WHEN cc.expiry_date < CURRENT_DATE THEN 'URGENT'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'HIGH'
        ELSE 'NORMAL'
      END AS priority_bucket
    FROM c1_compliance_certificates cc
    JOIN c1_properties p ON p.id = cc.property_id
    WHERE (cc.property_manager_id = p_pm_id
           OR (cc.property_manager_id IS NULL AND p.property_manager_id = p_pm_id))
      AND cc.expiry_date IS NOT NULL
      AND cc.expiry_date <= CURRENT_DATE + interval '30 days'
  ),

  -- ─── 1b. Compliance: mandatory certs with no record ───
  compliance_missing AS (
    SELECT
      p.id AS property_id,
      p.address AS property_label,
      mt.cert_type,
      CASE mt.cert_type
        WHEN 'hmo_license'  THEN 'HMO Licence'
        WHEN 'gas_safety'   THEN 'Gas Safety (CP12)'
        WHEN 'eicr'         THEN 'EICR'
        WHEN 'epc'          THEN 'EPC'
        WHEN 'fire_risk'    THEN 'Fire Risk Assessment'
        WHEN 'smoke_alarms' THEN 'Smoke Alarms'
        WHEN 'co_alarms'    THEN 'CO Alarms'
      END AS cert_label
    FROM c1_properties p
    CROSS JOIN (
      VALUES
        ('hmo_license'::public.certificate_type),
        ('gas_safety'::public.certificate_type),
        ('eicr'::public.certificate_type),
        ('epc'::public.certificate_type),
        ('fire_risk'::public.certificate_type),
        ('smoke_alarms'::public.certificate_type),
        ('co_alarms'::public.certificate_type)
    ) AS mt(cert_type)
    WHERE p.property_manager_id = p_pm_id
      AND NOT EXISTS (
        SELECT 1 FROM c1_compliance_certificates cc
        WHERE cc.property_id = p.id
          AND cc.certificate_type = mt.cert_type
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

  -- ═══ UNION ALL: emit JSONB rows in the same shape as c1_get_dashboard_todo ═══

  -- Compliance: existing expired/expiring
  SELECT jsonb_build_object(
    'id',                  'compliance_' || ce.entity_id::text,
    'ticket_id',           ce.entity_id,
    'source_type',         'compliance',
    'entity_id',           ce.entity_id,
    'property_id',         ce.property_id,
    'property_label',      COALESCE(ce.property_label, 'Unknown property'),
    'issue_summary',       CASE
                             WHEN ce.reason_key = 'compliance_expired'
                               THEN ce.cert_label || ' expired ' || (CURRENT_DATE - ce.expiry_date) || ' days ago'
                             ELSE ce.cert_label || ' expires in ' || (ce.expiry_date - CURRENT_DATE) || ' days'
                           END,
    'action_type',         CASE WHEN ce.reason_key = 'compliance_expired' THEN 'NEEDS_ATTENTION' ELSE 'FOLLOW_UP' END,
    'action_label',        CASE WHEN ce.reason_key = 'compliance_expired' THEN ce.cert_label || ' expired' ELSE ce.cert_label || ' expiring' END,
    'action_context',      CASE
                             WHEN ce.reason_key = 'compliance_expired'
                               THEN ce.cert_label || ' expired ' || (CURRENT_DATE - ce.expiry_date) || ' days ago at ' || COALESCE(ce.property_label, 'unknown')
                             ELSE ce.cert_label || ' expires in ' || (ce.expiry_date - CURRENT_DATE) || ' days at ' || COALESCE(ce.property_label, 'unknown')
                           END,
    'next_action_reason',  ce.reason_key,
    'priority',            NULL,
    'priority_score',      ce.priority_score,
    'priority_bucket',     ce.priority_bucket,
    'waiting_since',       ce.expiry_date,
    'sla_breached',        ce.reason_key = 'compliance_expired',
    'created_at',          ce.expiry_date
  )
  FROM compliance_existing ce

  UNION ALL

  -- Compliance: missing mandatory certs
  SELECT jsonb_build_object(
    'id',                  'compliance_missing_' || cm.property_id::text || '_' || cm.cert_type::text,
    'ticket_id',           cm.property_id,
    'source_type',         'compliance',
    'entity_id',           cm.property_id,
    'property_id',         cm.property_id,
    'property_label',      COALESCE(cm.property_label, 'Unknown property'),
    'issue_summary',       cm.cert_label || ' — no record found',
    'action_type',         'NEEDS_ATTENTION',
    'action_label',        cm.cert_label || ' missing',
    'action_context',      'No ' || cm.cert_label || ' on file for ' || COALESCE(cm.property_label, 'this property') || ' — add certificate',
    'next_action_reason',  'compliance_missing',
    'priority',            NULL,
    'priority_score',      140,
    'priority_bucket',     'HIGH',
    'waiting_since',       CURRENT_DATE,
    'sla_breached',        false,
    'created_at',          CURRENT_DATE
  )
  FROM compliance_missing cm

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
  -- Frontend merges both RPCs and sorts by priority_score DESC — no server-side ordering needed.

END;
$function$;
