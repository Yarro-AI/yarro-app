-- Migration 2: Priority setting + reminder RPC fixes
-- Fixes: BUG-2 (priority mismatch), BUG-16 (reminder routing)


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-2: create_rent_arrears_ticket — compute priority from days overdue
-- Tiers: >= 14d = Urgent, >= 7d = High, >= 1d = Medium, else Low
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_deadline_date date DEFAULT NULL::date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id uuid;
  v_property_label text;
  v_days_overdue integer;
  v_priority text;
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
    UPDATE c1_tickets
    SET issue_description = p_issue_description
    WHERE id = v_ticket_id;
    RETURN v_ticket_id;
  END IF;

  -- Auto-compute deadline from earliest overdue rent entry if not provided
  IF p_deadline_date IS NULL THEN
    SELECT MIN(due_date) INTO p_deadline_date
    FROM c1_rent_ledger
    WHERE tenant_id = p_tenant_id AND status IN ('overdue', 'partial');
  END IF;

  -- Compute priority from days overdue
  v_days_overdue := GREATEST(0, CURRENT_DATE - COALESCE(p_deadline_date, CURRENT_DATE));
  v_priority := CASE
    WHEN v_days_overdue >= 14 THEN 'urgent'
    WHEN v_days_overdue >= 7  THEN 'high'
    WHEN v_days_overdue >= 1  THEN 'medium'
    ELSE 'low'
  END;

  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    verified_by, is_manual, handoff,
    waiting_since, deadline_date
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', v_priority,
    'system', true, false,
    now(), p_deadline_date
  ) RETURNING id INTO v_ticket_id;

  -- Audit event
  SELECT address INTO v_property_label FROM c1_properties WHERE id = p_property_id;

  PERFORM c1_log_event(
    v_ticket_id, 'AUTO_TICKET_RENT', 'SYSTEM', NULL,
    v_property_label,
    jsonb_build_object('tenant_id', p_tenant_id, 'deadline_date', p_deadline_date, 'priority', v_priority)
  );

  RETURN v_ticket_id;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-2: escalate_rent_ticket_priority — called by daily cron
-- Updates priority on open rent arrears tickets based on current days overdue
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.escalate_rent_ticket_priority()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE c1_tickets t
  SET priority = CASE
    WHEN CURRENT_DATE - t.deadline_date >= 14 THEN 'urgent'
    WHEN CURRENT_DATE - t.deadline_date >= 7  THEN 'high'
    WHEN CURRENT_DATE - t.deadline_date >= 1  THEN 'medium'
    ELSE 'low'
  END
  WHERE t.category = 'rent_arrears'
    AND t.status = 'open'
    AND t.deadline_date IS NOT NULL
    -- Only update if priority would actually change
    AND t.priority IS DISTINCT FROM CASE
      WHEN CURRENT_DATE - t.deadline_date >= 14 THEN 'urgent'
      WHEN CURRENT_DATE - t.deadline_date >= 7  THEN 'high'
      WHEN CURRENT_DATE - t.deadline_date >= 1  THEN 'medium'
      ELSE 'low'
    END;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-16: get_rent_reminders_due — add contact_method and email to output
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_rent_reminders_due();

CREATE OR REPLACE FUNCTION public.get_rent_reminders_due()
RETURNS TABLE (
  ledger_id uuid,
  room_id uuid,
  tenant_id uuid,
  property_manager_id uuid,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  status text,
  reminder_level integer,
  tenant_name text,
  tenant_phone text,
  tenant_email text,
  contact_method text,
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
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    1 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    t.email AS tenant_email,
    t.contact_method,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE + 3
    AND rl.reminder_1_sent_at IS NULL
    AND rl.status != 'paid'

  UNION ALL

  -- Reminder 2: on due date (unpaid)
  SELECT
    rl.id AS ledger_id,
    rl.room_id,
    rl.tenant_id,
    rl.property_manager_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    2 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    t.email AS tenant_email,
    t.contact_method,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE
    AND rl.reminder_2_sent_at IS NULL
    AND rl.status != 'paid'

  UNION ALL

  -- Reminder 3: 3 days overdue (unpaid)
  SELECT
    rl.id AS ledger_id,
    rl.room_id,
    rl.tenant_id,
    rl.property_manager_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.status,
    3 AS reminder_level,
    t.full_name AS tenant_name,
    t.phone AS tenant_phone,
    t.email AS tenant_email,
    t.contact_method,
    p.address AS property_address,
    r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 3
    AND rl.reminder_3_sent_at IS NULL
    AND rl.status != 'paid'

  ORDER BY due_date ASC, reminder_level ASC;
$$;
