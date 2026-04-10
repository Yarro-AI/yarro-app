-- Sprint B, Step 4: Drop job_stage column
-- Safe to run: all edge functions deployed without job_stage writes,
-- all RPCs updated in Sprint A (1c, 1f) to not reference job_stage,
-- router (1c) uses scheduled_date + c1_messages.stage instead.
--
-- Dependencies that must be removed first:
-- 1. trg_same_day_reminder — fired on job_stage change to 'booked'.
--    Dead code: nothing writes job_stage anymore. Same-day reminder
--    cron (yarro-job-reminder) still runs independently.
-- 2. v_properties_hub — included job_stage in ticket JSONB output.
--    Recreated without job_stage, using next_action_reason instead.

-- 1. Drop the dead trigger (fired on job_stage updates)
DROP TRIGGER IF EXISTS trg_same_day_reminder ON c1_tickets;

-- 2. Recreate view without job_stage
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

-- 3. Drop the column
ALTER TABLE c1_tickets DROP COLUMN IF EXISTS job_stage;
