-- ============================================================
-- Extend v_properties_hub with room counts
-- ============================================================
-- Adds total_rooms and occupied_rooms columns via a new LATERAL join.
-- CREATE OR REPLACE VIEW allows adding columns without dropping.

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
  COALESCE(rm.occupied_rooms, 0) AS occupied_rooms
FROM public.c1_properties p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'full_name', t.full_name, 'email', t.email,
        'phone', t.phone, 'role_tag', t.role_tag, 'verified_by', t.verified_by,
        'created_at', t.created_at, 'property_manager_id', t.property_manager_id
      ) ORDER BY t.created_at DESC
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
        'id', t.id, 'status', t.status, 'job_stage', t.job_stage,
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
          'id', t.id, 'status', t.status, 'job_stage', t.job_stage,
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
