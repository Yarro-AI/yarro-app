-- ============================================================
-- Day-1 Overdue Rent Tickets
-- 1. New RPC: get_rent_overdue_for_tickets — aggregated per-tenant arrears with priority
-- 2. Update: create_rent_arrears_ticket — add p_priority param, escalate on dedup
-- 3. Sync: get_rent_reminders_due — remove level-0 block, keep property_id column
-- ============================================================

-- ─── 1. get_rent_overdue_for_tickets ───────────────────────────────────────
-- Returns one row per tenant with aggregated arrears and computed priority.
-- Called by yarro-rent-reminder edge function for day-1 ticket creation.

CREATE OR REPLACE FUNCTION public.get_rent_overdue_for_tickets(p_pm_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  property_manager_id uuid,
  property_id uuid,
  tenant_name text,
  property_address text,
  months_overdue bigint,
  total_arrears numeric,
  earliest_overdue date,
  days_overdue integer,
  priority text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    rl.tenant_id,
    rl.property_manager_id,
    r.property_id,
    t.full_name AS tenant_name,
    p.address AS property_address,
    COUNT(*) AS months_overdue,
    SUM(rl.amount_due - COALESCE(rl.amount_paid, 0)) AS total_arrears,
    MIN(rl.due_date) AS earliest_overdue,
    (CURRENT_DATE - MIN(rl.due_date))::integer AS days_overdue,
    CASE
      WHEN (CURRENT_DATE - MIN(rl.due_date)) >= 14 THEN 'urgent'
      WHEN (CURRENT_DATE - MIN(rl.due_date)) >= 7  THEN 'high'
      ELSE 'medium'
    END AS priority
  FROM c1_rent_ledger rl
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
  WHERE rl.property_manager_id = p_pm_id
    AND rl.status IN ('overdue', 'partial')
    AND rl.due_date >= CURRENT_DATE - INTERVAL '90 days'
    AND rl.due_date < CURRENT_DATE
  GROUP BY rl.tenant_id, rl.property_manager_id, r.property_id, t.full_name, p.address;
$$;


-- ─── 2. create_rent_arrears_ticket (protected RPC — Adam approved) ─────────
-- Backup: supabase/migrations/20260404300000_polymorphic_subroutines.sql lines 278-317
-- Change: add p_priority parameter, update priority on dedup

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_priority text DEFAULT 'high'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
    -- Ticket already exists — update description and escalate priority
    UPDATE c1_tickets
    SET issue_description = p_issue_description,
        priority = p_priority
    WHERE id = v_ticket_id;
    RETURN v_ticket_id;
  END IF;

  -- Create new ticket (no c1_messages, no dispatch — PM-only action)
  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    job_stage, verified_by, is_manual, handoff
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', p_priority,
    'created', 'system', true, false
  ) RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;


-- ─── 3. get_rent_reminders_due — sync with deployed + remove level-0 ──────
-- Adds property_id column (already in deployed schema).
-- Removes level-0 block (ticket logic moved to get_rent_overdue_for_tickets).

CREATE OR REPLACE FUNCTION public.get_rent_reminders_due()
RETURNS TABLE (
  ledger_id uuid,
  room_id uuid,
  tenant_id uuid,
  property_manager_id uuid,
  property_id uuid,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  status text,
  reminder_level integer,
  tenant_name text,
  tenant_phone text,
  property_address text,
  room_number text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- Reminder 1: 3 days before due date
  SELECT
    rl.id AS ledger_id,
    rl.room_id,
    rl.tenant_id,
    rl.property_manager_id,
    r.property_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    1 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE + 3
    AND rl.reminder_1_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Reminder 2: on due date (unpaid)
  SELECT
    rl.id AS ledger_id,
    rl.room_id,
    rl.tenant_id,
    rl.property_manager_id,
    r.property_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    2 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE
    AND rl.reminder_2_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Reminder 3: 3 days overdue (unpaid)
  SELECT
    rl.id AS ledger_id,
    rl.room_id,
    rl.tenant_id,
    rl.property_manager_id,
    r.property_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    3 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 3
    AND rl.reminder_3_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  ORDER BY due_date ASC, reminder_level ASC;
$$;
