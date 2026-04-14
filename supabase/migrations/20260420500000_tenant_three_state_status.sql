-- ============================================================
-- Three-state tenant status: new / current / former
-- ============================================================
-- Bug: tenants added to a property but not assigned to a room show as
-- "former". Should be "new" (unassigned). "Former" = was in a room, left.
--
-- Fix: add moved_out_at column, shared function, update trigger + views.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Add moved_out_at column
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.c1_tenants
  ADD COLUMN IF NOT EXISTS moved_out_at timestamptz;


-- ═══════════════════════════════════════════════════════════════
-- 2. Shared function: compute_tenant_status
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_tenant_status(
  p_room_id uuid,
  p_moved_out_at timestamptz
) RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_room_id IS NOT NULL THEN 'current'
    WHEN p_moved_out_at IS NOT NULL THEN 'former'
    ELSE 'new'
  END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill: existing tenants with room_id=NULL who have rent history
-- ═══════════════════════════════════════════════════════════════

UPDATE c1_tenants t
SET moved_out_at = now()
WHERE t.room_id IS NULL
  AND t.moved_out_at IS NULL
  AND EXISTS (
    SELECT 1 FROM c1_rent_ledger rl WHERE rl.tenant_id = t.id
  );


-- ═══════════════════════════════════════════════════════════════
-- 4. Update trigger: set moved_out_at on removal, clear on assignment
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_room_tenant_assigned_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cancelled integer := 0;
  v_property_label text;
  v_due_day integer;
BEGIN
  -- Skip if current_tenant_id didn't actually change
  IF TG_OP = 'UPDATE'
     AND OLD.current_tenant_id IS NOT DISTINCT FROM NEW.current_tenant_id THEN
    RETURN NEW;
  END IF;

  -- Get property label once (used by all paths)
  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  -- ═══ REMOVAL PATH: tenant leaving this room ═══
  IF OLD.current_tenant_id IS NOT NULL
     AND (NEW.current_tenant_id IS NULL OR NEW.current_tenant_id != OLD.current_tenant_id) THEN

    -- 1a. Clear tenant's room_id, set moved_out_at
    UPDATE c1_tenants
    SET room_id = NULL,
        moved_out_at = now()
    WHERE id = OLD.current_tenant_id
      AND room_id = OLD.id;

    -- 1b. Cancel pending rent entries for the leaving tenant
    UPDATE c1_rent_ledger
    SET status = 'cancelled'
    WHERE room_id = OLD.id
      AND tenant_id = OLD.current_tenant_id
      AND due_date > CURRENT_DATE
      AND status = 'pending';

    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    -- 1c. Log removal event
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_REMOVED_FROM_ROOM', v_property_label,
      jsonb_build_object(
        'room_id', OLD.id,
        'room_number', OLD.room_number,
        'tenant_id', OLD.current_tenant_id,
        'pending_entries_cancelled', v_cancelled
      )
    );
  END IF;

  -- ═══ ASSIGNMENT PATH: tenant arriving in this room ═══
  IF NEW.current_tenant_id IS NOT NULL
     AND (OLD.current_tenant_id IS NULL OR OLD.current_tenant_id != NEW.current_tenant_id) THEN

    -- 2a. Set tenant's room_id, property_id, clear moved_out_at
    UPDATE c1_tenants
    SET room_id = NEW.id,
        property_id = NEW.property_id,
        moved_out_at = NULL
    WHERE id = NEW.current_tenant_id;

    -- 2b. Create rent ledger entry if rent is configured
    v_due_day := COALESCE(NEW.rent_due_day, 1);

    IF NEW.monthly_rent IS NOT NULL THEN
      INSERT INTO c1_rent_ledger (
        room_id, tenant_id, due_date, amount_due, status, property_manager_id
      )
      SELECT
        NEW.id,
        NEW.current_tenant_id,
        make_date(
          EXTRACT(YEAR FROM CURRENT_DATE)::integer,
          EXTRACT(MONTH FROM CURRENT_DATE)::integer,
          LEAST(v_due_day, EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day'))::integer)
        ),
        NEW.monthly_rent,
        'pending',
        NEW.property_manager_id
      WHERE NOT EXISTS (
        SELECT 1 FROM c1_rent_ledger rl
        WHERE rl.room_id = NEW.id
          AND rl.tenant_id = NEW.current_tenant_id
          AND EXTRACT(YEAR FROM rl.due_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND EXTRACT(MONTH FROM rl.due_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      );
    END IF;

    -- 2c. Log assignment event
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_ASSIGNED_TO_ROOM', v_property_label,
      jsonb_build_object(
        'room_id', NEW.id,
        'room_number', NEW.room_number,
        'tenant_id', NEW.current_tenant_id,
        'rent_created', (NEW.monthly_rent IS NOT NULL)
      )
    );
  END IF;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 5. v_properties_hub — use compute_tenant_status
-- ═══════════════════════════════════════════════════════════════

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
  COALESCE(rm.occupied_rooms, 0) AS active_tenants
FROM public.c1_properties p
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id, 'full_name', t.full_name, 'email', t.email,
        'phone', t.phone, 'role_tag', t.role_tag, 'verified_by', t.verified_by,
        'created_at', t.created_at, 'property_manager_id', t.property_manager_id,
        'tenant_status', public.compute_tenant_status(t.room_id, t.moved_out_at)
      ) ORDER BY
        -- Current first, then new, then former
        CASE public.compute_tenant_status(t.room_id, t.moved_out_at)
          WHEN 'current' THEN 0
          WHEN 'new' THEN 1
          WHEN 'former' THEN 2
        END,
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


-- ═══════════════════════════════════════════════════════════════
-- 6. c1_get_dashboard_todo — restore tenant fields with compute_tenant_status
-- ═══════════════════════════════════════════════════════════════
-- The version in 20260419600000 dropped tenant fields. This restores them
-- using the new shared function.

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
  timeout_check AS (
    SELECT t.id AS ticket_id,
      public.compute_is_past_timeout(
        t.next_action, t.next_action_reason,
        t.contractor_sent_at, t.waiting_since, t.date_logged,
        t.landlord_allocated_at, t.ooh_dispatched_at, t.tenant_contacted_at,
        t.scheduled_date, p_pm_id
      ) AS is_past_timeout
    FROM pm_tickets t
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
      public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since) AS priority_score,
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
      -- Tenant fields (restored from 20260418300000, now with three-state status)
      t.tenant_id,
      tn.full_name AS tenant_name,
      public.compute_tenant_status(tn.room_id, tn.moved_out_at) AS tenant_status
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
      'tenant_id', s.tenant_id,
      'tenant_name', s.tenant_name,
      'tenant_status', s.tenant_status
    )
    ORDER BY s.priority_score DESC, s.waiting_since ASC
  ) INTO v_result
  FROM scored s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
