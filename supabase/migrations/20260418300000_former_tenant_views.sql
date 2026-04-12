-- Migration 3: Former tenant SSOT views
-- Fixes: BUG-4 (people tab), BUG-5 (tenant profile), BUG-6 (property counts), BUG-8 (dashboard tickets)


-- ═══════════════════════════════════════════════════════════════════════════
-- BUGs 4, 6: v_properties_hub — add is_active flag to tenants + fix count
-- SSOT: a tenant is "active" if a room in this property has current_tenant_id = tenant.id
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_properties_hub AS
SELECT
  p.id AS property_id,
  p.property_manager_id,
  p.address,
  p.landlord_name,
  p.landlord_email,
  p.landlord_phone,
  p.landlord_id,
  p.access_instructions,
  p.emergency_access_contact,
  p.auto_approve_limit,
  p.require_landlord_approval,
  COALESCE(tn.tenants, '[]'::jsonb) AS tenants,
  COALESCE(ct.contractors, '[]'::jsonb) AS contractors,
  COALESCE(ot.open_tickets, '[]'::jsonb) AS open_tickets,
  COALESCE(rt.recent_tickets, '[]'::jsonb) AS recent_tickets,
  COALESCE(rm.total_rooms, 0) AS total_rooms,
  COALESCE(rm.occupied_rooms, 0) AS occupied_rooms,
  -- BUG-6 fix: active tenant count from rooms SSOT, not c1_tenants.property_id
  COALESCE(rm.occupied_rooms, 0) AS active_tenants
FROM public.c1_properties p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'full_name', t.full_name, 'email', t.email,
        'phone', t.phone, 'role_tag', t.role_tag, 'verified_by', t.verified_by,
        'created_at', t.created_at, 'property_manager_id', t.property_manager_id,
        -- BUG-4 fix: is_active flag from rooms SSOT
        'is_active', EXISTS(
          SELECT 1 FROM c1_rooms r
          WHERE r.property_id = p.id AND r.current_tenant_id = t.id
        )
      ) ORDER BY
        -- Active tenants first, then former
        EXISTS(SELECT 1 FROM c1_rooms r WHERE r.property_id = p.id AND r.current_tenant_id = t.id) DESC,
        t.created_at DESC
    ) AS tenants
    FROM public.c1_tenants t
    WHERE t.property_id = p.id
  ) tn ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', c.id, 'category', c.category, 'contractor_name', c.contractor_name,
        'contractor_email', c.contractor_email, 'contractor_phone', c.contractor_phone,
        'active', c.active, 'created_at', c.created_at
      ) ORDER BY c.active DESC, c.contractor_name
    ) AS contractors
    FROM public.c1_contractors c
    WHERE p.id = ANY(c.property_ids)
  ) ct ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'status', t.status, 'next_action_reason', t.next_action_reason,
        'priority', t.priority, 'category', t.category,
        'issue_description', t.issue_description, 'date_logged', t.date_logged,
        'tenant_id', t.tenant_id, 'contractor_id', t.contractor_id,
        'final_amount', t.final_amount
      ) ORDER BY t.date_logged DESC
    ) AS open_tickets
    FROM public.c1_tickets t
    WHERE t.property_id = p.id
      AND upper(COALESCE(t.status, '')) <> 'CLOSED'
      AND t.archived IS NOT TRUE
  ) ot ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(x.obj ORDER BY x.date_logged DESC) AS recent_tickets
    FROM (
      SELECT t.date_logged,
        jsonb_build_object(
          'id', t.id, 'status', t.status, 'next_action_reason', t.next_action_reason,
          'priority', t.priority, 'category', t.category,
          'issue_description', t.issue_description, 'date_logged', t.date_logged,
          'tenant_id', t.tenant_id, 'contractor_id', t.contractor_id,
          'final_amount', t.final_amount
        ) AS obj
      FROM public.c1_tickets t
      WHERE t.property_id = p.id
        AND t.archived IS NOT TRUE
      ORDER BY t.date_logged DESC
      LIMIT 10
    ) x
  ) rt ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::integer AS total_rooms,
      COUNT(*) FILTER (WHERE r.current_tenant_id IS NOT NULL)::integer AS occupied_rooms
    FROM public.c1_rooms r
    WHERE r.property_id = p.id
  ) rm ON true;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-8: c1_get_dashboard_todo — add tenant_id, tenant_name, is_former_tenant
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo(p_pm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  pm_tickets AS (
    SELECT t.*
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) = 'open'
      AND t.archived = false
      AND COALESCE(t.on_hold, false) = false
  ),
  contractor_timing AS (
    SELECT t.id AS ticket_id,
           t.contractor_sent_at
    FROM pm_tickets t
  ),
  timeout_check AS (
    SELECT t.id AS ticket_id,
      CASE
        WHEN t.next_action != 'waiting' THEN false
        WHEN t.next_action_reason = 'awaiting_contractor'
          AND ct.contractor_sent_at IS NOT NULL
          AND now() - ct.contractor_sent_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_booking'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '3 days'
          THEN true
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND now() - COALESCE(t.waiting_since, t.date_logged) >
            interval '1 hour' * COALESCE(
              (SELECT landlord_timeout_hours FROM c1_property_managers WHERE id = p_pm_id),
              48)
          THEN true
        WHEN t.next_action_reason = 'allocated_to_landlord'
          AND t.landlord_allocated_at IS NOT NULL
          AND now() - t.landlord_allocated_at > interval '72 hours'
          THEN true
        WHEN t.next_action_reason = 'ooh_dispatched'
          AND t.ooh_dispatched_at IS NOT NULL
          AND now() - t.ooh_dispatched_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_tenant'
          AND t.tenant_contacted_at IS NOT NULL
          AND now() - t.tenant_contacted_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date < CURRENT_DATE
          THEN true
        WHEN t.next_action_reason = 'reschedule_pending'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '48 hours'
          THEN true
        ELSE false
      END AS is_past_timeout
    FROM pm_tickets t
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  ),
  scored AS (
    SELECT
      t.id,
      t.id AS ticket_id,
      t.property_id,
      t.category,
      t.maintenance_trade,
      t.issue_title AS issue_summary,
      CASE
        WHEN t.next_action_reason = 'reschedule_pending'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date - now() <= interval '24 hours'
          THEN 'needs_action'
        WHEN tc.is_past_timeout AND t.next_action = 'waiting'
          THEN 'stuck'
        ELSE t.next_action
      END AS bucket,
      t.next_action,
      t.next_action_reason,
      t.priority,
      public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since, t.category) AS priority_score,
      tc.is_past_timeout,
      t.sla_due_at,
      EXTRACT(EPOCH FROM (t.sla_due_at - t.waiting_since)) / 3600 AS sla_total_hours,
      t.deadline_date,
      t.waiting_since,
      t.contractor_sent_at,
      t.scheduled_date,
      t.landlord_allocated_at,
      t.ooh_dispatched_at,
      t.tenant_contacted_at,
      t.compliance_certificate_id,
      p.address AS property_label,
      t.date_logged AS created_at,
      t.reschedule_initiated_by,
      -- BUG-8: Add tenant info
      t.tenant_id,
      tn.full_name AS tenant_name,
      -- is_former: tenant exists but no room in this property has them as current
      CASE
        WHEN t.tenant_id IS NULL THEN false
        ELSE NOT EXISTS(
          SELECT 1 FROM c1_rooms r
          WHERE r.property_id = t.property_id AND r.current_tenant_id = t.tenant_id
        )
      END AS is_former_tenant
    FROM pm_tickets t
    LEFT JOIN timeout_check tc ON tc.ticket_id = t.id
    LEFT JOIN c1_properties p ON p.id = t.property_id
    LEFT JOIN c1_tenants tn ON tn.id = t.tenant_id
  )

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'ticket_id', s.ticket_id,
      'property_id', s.property_id,
      'category', s.category,
      'maintenance_trade', s.maintenance_trade,
      'issue_summary', s.issue_summary,
      'bucket', s.bucket,
      'next_action', s.next_action,
      'next_action_reason', s.next_action_reason,
      'priority', s.priority,
      'priority_score', s.priority_score,
      'is_past_timeout', s.is_past_timeout,
      'sla_due_at', s.sla_due_at,
      'sla_total_hours', s.sla_total_hours,
      'deadline_date', s.deadline_date,
      'waiting_since', s.waiting_since,
      'contractor_sent_at', s.contractor_sent_at,
      'scheduled_date', s.scheduled_date,
      'landlord_allocated_at', s.landlord_allocated_at,
      'ooh_dispatched_at', s.ooh_dispatched_at,
      'tenant_contacted_at', s.tenant_contacted_at,
      'compliance_certificate_id', s.compliance_certificate_id,
      'property_label', s.property_label,
      'created_at', s.created_at,
      'reschedule_initiated_by', s.reschedule_initiated_by,
      -- BUG-8: tenant info fields
      'tenant_id', s.tenant_id,
      'tenant_name', s.tenant_name,
      'is_former_tenant', s.is_former_tenant
    )
    ORDER BY s.priority_score DESC, s.waiting_since ASC
  ) INTO v_result
  FROM scored s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
