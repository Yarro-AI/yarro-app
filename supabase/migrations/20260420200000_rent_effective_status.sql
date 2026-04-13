-- ============================================================
-- SSOT Finding #7: Rent status model — stop storing time-derived state
-- ============================================================
-- Problem: c1_rent_ledger.status stores 'overdue' which is time-derived
-- and goes stale. effective_status workaround only covers display RPCs,
-- not business logic (auto-close, ticket creation, arrears computation).
--
-- Fix: rent_effective_status() shared function. Remove 'overdue' as stored
-- value. Every query uses the function instead of reading status directly.
-- Same pattern as compute_is_past_timeout() and compute_cert_display_status().
--
-- ⚠️ PROTECTED RPC: c1_ticket_detail, record_rent_payment — approved by Adam
-- (SSOT audit 2026-04-13, Finding #7).
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Create rent_effective_status() shared function
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rent_effective_status(p_status text, p_due_date date)
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_status = 'paid' THEN 'paid'
    WHEN p_status = 'cancelled' THEN 'cancelled'
    WHEN p_status = 'partial' THEN 'partial'
    WHEN p_due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'pending'
  END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. Backfill: flip stored 'overdue' to 'pending' (or 'partial')
-- ═══════════════════════════════════════════════════════════════

-- Overdue with no payment → pending (function will derive 'overdue' from date)
UPDATE c1_rent_ledger SET status = 'pending'
WHERE status = 'overdue' AND COALESCE(amount_paid, 0) = 0;

-- Overdue with partial payment → partial (shouldn't exist, safety net)
UPDATE c1_rent_ledger SET status = 'partial'
WHERE status = 'overdue' AND COALESCE(amount_paid, 0) > 0;


-- ═══════════════════════════════════════════════════════════════
-- 3. Update CHECK constraint: remove 'overdue'
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE c1_rent_ledger DROP CONSTRAINT IF EXISTS c1_rent_ledger_status_check;
ALTER TABLE c1_rent_ledger ADD CONSTRAINT c1_rent_ledger_status_check
  CHECK (status IN ('pending', 'paid', 'partial', 'cancelled'));


-- ═══════════════════════════════════════════════════════════════
-- 4. Drop overdue ticket trigger (dead code — no status will ever
--    change TO 'overdue' since we no longer store it)
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_rent_ledger_overdue_ticket ON c1_rent_ledger;
DROP FUNCTION IF EXISTS public.trg_rent_ledger_overdue_ticket();


-- ═══════════════════════════════════════════════════════════════
-- 5. Update triggers that WRITE 'overdue' → write 'pending' instead
-- ═══════════════════════════════════════════════════════════════

-- 5a. trg_room_tenant_assigned: stop writing 'overdue', always 'pending'
--     (Full function from 20260419100000, lines 16-134, with status fix)

CREATE OR REPLACE FUNCTION public.trg_room_tenant_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_day integer;
  v_due_date date;
  v_inserted integer;
  v_property_label text;
BEGIN
  -- Only fire when current_tenant_id changes (tenant assigned or swapped)
  IF TG_OP = 'UPDATE'
     AND NEW.current_tenant_id IS NOT DISTINCT FROM OLD.current_tenant_id THEN
    RETURN NEW;
  END IF;

  -- ── A. Handle outgoing tenant (if any) ──
  IF TG_OP = 'UPDATE' AND OLD.current_tenant_id IS NOT NULL
     AND NEW.current_tenant_id IS DISTINCT FROM OLD.current_tenant_id THEN

    -- Cancel unpaid rent entries for outgoing tenant
    UPDATE c1_rent_ledger
    SET status = 'cancelled'
    WHERE room_id = NEW.id
      AND tenant_id = OLD.current_tenant_id
      AND status IN ('pending')
      AND COALESCE(amount_paid, 0) = 0;

    -- Mark room as vacant momentarily (will be filled below if new tenant)
    UPDATE c1_rooms
    SET is_vacant = true
    WHERE id = NEW.id
      AND NEW.current_tenant_id IS NULL;
  END IF;

  -- ── B. Handle incoming tenant ──
  IF NEW.current_tenant_id IS NOT NULL THEN
    -- 2a. Sync tenant's property_id
    UPDATE c1_tenants
    SET property_id = NEW.property_id
    WHERE id = NEW.current_tenant_id
      AND (property_id IS NULL OR property_id != NEW.property_id);

    -- 2b. Create rent ledger entry if rent is configured
    IF NEW.monthly_rent IS NOT NULL AND NEW.monthly_rent > 0 THEN
      v_due_day := COALESCE(NEW.rent_due_day, 1);

      v_due_date := compute_rent_due_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,
        EXTRACT(MONTH FROM CURRENT_DATE)::integer,
        v_due_day
      );

      -- Always 'pending' — overdue is derived by rent_effective_status()
      INSERT INTO c1_rent_ledger (
        property_manager_id, room_id, tenant_id, due_date, amount_due, status
      ) VALUES (
        NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
        v_due_date, NEW.monthly_rent, 'pending'
      )
      ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END IF;

    -- 2c. Log assignment event
    SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_ASSIGNED', v_property_label,
      jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
        'tenant_id', NEW.current_tenant_id,
        'rent_entry_created', COALESCE(v_inserted > 0, false))
    );
  END IF;

  RETURN NEW;
END;
$function$;


-- 5b. trg_room_rent_configured: stop writing 'overdue', always 'pending'
--     (Full function from 20260419100000, lines 139-197, with status fix)

CREATE OR REPLACE FUNCTION public.trg_room_rent_configured()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_day integer;
  v_due_date date;
  v_property_label text;
BEGIN
  -- Only fire when rent config changes on an occupied room
  IF NEW.current_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.monthly_rent IS NULL OR NEW.monthly_rent <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.monthly_rent IS NOT DISTINCT FROM OLD.monthly_rent
     AND NEW.rent_due_day IS NOT DISTINCT FROM OLD.rent_due_day THEN
    RETURN NEW;
  END IF;

  v_due_day := COALESCE(NEW.rent_due_day, 1);

  v_due_date := compute_rent_due_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    v_due_day
  );

  -- Always 'pending' — overdue is derived by rent_effective_status()
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, 'pending'
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO UPDATE SET
    amount_due = EXCLUDED.amount_due,
    status = CASE
      WHEN c1_rent_ledger.status IN ('paid', 'partial') THEN c1_rent_ledger.status
      ELSE EXCLUDED.status
    END
  WHERE c1_rent_ledger.status IN ('pending');

  -- Void stale entries from old rent config
  PERFORM void_stale_rent_entries_for_room(NEW.id, NEW.current_tenant_id, v_due_date);

  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id, 'RENT_CONFIG_UPDATED', v_property_label,
    jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id, 'due_date', v_due_date,
      'new_amount', NEW.monthly_rent, 'old_amount', OLD.monthly_rent,
      'new_due_day', NEW.rent_due_day, 'old_due_day', OLD.rent_due_day)
  );

  RETURN NEW;
END;
$function$;


-- 5c. trg_rent_payment_update_ledger: when v_total_paid = 0, use 'pending' not 'overdue'
--     (Full function from 20260418100000, lines 106-141, with status fix)

CREATE OR REPLACE FUNCTION public.trg_rent_payment_update_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid numeric;
  v_amount_due numeric;
  v_new_status text;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM c1_rent_payments WHERE rent_ledger_id = NEW.rent_ledger_id;

  SELECT amount_due INTO v_amount_due
  FROM c1_rent_ledger WHERE id = NEW.rent_ledger_id;

  v_total_paid := LEAST(v_total_paid, v_amount_due);

  IF v_total_paid >= v_amount_due THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    -- Was 'overdue' — now 'pending' (overdue derived by function)
    v_new_status := 'pending';
  END IF;

  UPDATE c1_rent_ledger
  SET amount_paid = v_total_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      status = v_new_status
  WHERE id = NEW.rent_ledger_id;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 6. Update display RPCs — replace inline CASE with function call
-- ═══════════════════════════════════════════════════════════════

-- 6a. get_rent_ledger_for_month
CREATE OR REPLACE FUNCTION public.get_rent_ledger_for_month(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE(
  rent_ledger_id uuid,
  tenant_id uuid,
  tenant_name text,
  property_id uuid,
  property_address text,
  room_number text,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  effective_status text,
  is_former_tenant boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT * FROM (
    -- Current month entries (exclude cancelled)
    SELECT
      rl.id AS rent_ledger_id,
      rl.tenant_id,
      t.full_name AS tenant_name,
      p.id AS property_id,
      p.address AS property_address,
      r.room_number,
      rl.due_date,
      rl.amount_due,
      rl.amount_paid,
      rent_effective_status(rl.status, rl.due_date) AS effective_status,
      (r.current_tenant_id IS DISTINCT FROM rl.tenant_id) AS is_former_tenant
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= make_date(p_year, p_month, 1)
      AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
      AND rl.status != 'cancelled'
      AND (
        r.current_tenant_id = rl.tenant_id
        OR rent_effective_status(rl.status, rl.due_date) IN ('overdue', 'partial')
      )

    UNION ALL

    -- Arrears from previous months (only outstanding, since PM signup)
    SELECT
      rl.id AS rent_ledger_id,
      rl.tenant_id,
      t.full_name AS tenant_name,
      p.id AS property_id,
      p.address AS property_address,
      r.room_number,
      rl.due_date,
      rl.amount_due,
      rl.amount_paid,
      'arrears' AS effective_status,
      (r.current_tenant_id IS DISTINCT FROM rl.tenant_id) AS is_former_tenant
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    JOIN c1_property_managers pm ON pm.id = rl.property_manager_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date < make_date(p_year, p_month, 1)
      AND rl.due_date >= pm.created_at::date
      AND rent_effective_status(rl.status, rl.due_date) IN ('overdue', 'partial')
  ) AS combined
  ORDER BY
    is_former_tenant,
    CASE combined.effective_status
      WHEN 'arrears' THEN 0
      WHEN 'overdue' THEN 1
      WHEN 'partial' THEN 2
      WHEN 'pending' THEN 3
      WHEN 'paid' THEN 4
      ELSE 5
    END,
    combined.due_date,
    combined.property_address,
    combined.room_number;
$function$;


-- 6b. get_rent_summary_for_property
CREATE OR REPLACE FUNCTION public.get_rent_summary_for_property(
  p_property_id uuid,
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE(
  room_id uuid,
  room_number text,
  room_name text,
  is_vacant boolean,
  tenant_id uuid,
  tenant_name text,
  rent_ledger_id uuid,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  paid_at timestamptz,
  payment_method text,
  effective_status text,
  notes text,
  is_former_tenant boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT
    r.id AS room_id,
    r.room_number,
    r.room_name,
    r.is_vacant,
    rl.tenant_id,
    t.full_name AS tenant_name,
    rl.id AS rent_ledger_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.paid_at,
    rl.payment_method,
    CASE
      WHEN rl.id IS NULL THEN
        CASE WHEN r.current_tenant_id IS NULL THEN 'vacant' ELSE 'no_entry' END
      ELSE rent_effective_status(rl.status, rl.due_date)
    END AS effective_status,
    rl.notes,
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false) AS is_former_tenant
  FROM c1_rooms r
  LEFT JOIN c1_rent_ledger rl ON rl.room_id = r.id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    AND rl.status != 'cancelled'
    AND (
      r.current_tenant_id = rl.tenant_id
      OR rent_effective_status(rl.status, rl.due_date) IN ('overdue', 'partial')
    )
  LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
  ORDER BY
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false),
    r.room_number::integer,
    rl.due_date;
$function$;


-- 6c. get_rent_income_summary
CREATE OR REPLACE FUNCTION public.get_rent_income_summary(p_pm_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'expected_amount',    COALESCE(sum(amount_due), 0),
    'collected_amount',   COALESCE(sum(amount_paid), 0),
    'outstanding_amount', COALESCE(sum(amount_due - amount_paid) FILTER (
      WHERE rent_effective_status(status, due_date) IN ('pending', 'overdue', 'partial')
    ), 0),
    'overdue_amount',     COALESCE(sum(amount_due - amount_paid) FILTER (
      WHERE rent_effective_status(status, due_date) = 'overdue'
    ), 0)
  )
  FROM c1_rent_ledger
  WHERE property_manager_id = p_pm_id
    AND due_date >= date_trunc('month', CURRENT_DATE)::date
    AND due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
    AND status != 'cancelled';
$$;


-- ═══════════════════════════════════════════════════════════════
-- 7. Update business logic RPCs
-- ═══════════════════════════════════════════════════════════════

-- 7a. get_rent_overdue_for_tickets (ticket creation cron)
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
    AND rent_effective_status(rl.status, rl.due_date) IN ('overdue', 'partial')
    AND rl.due_date >= CURRENT_DATE - INTERVAL '90 days'
    AND rl.due_date < CURRENT_DATE
  GROUP BY rl.tenant_id, rl.property_manager_id, r.property_id, t.full_name, p.address;
$$;


-- 7b. compute_rent_arrears_next_action (polymorphic sub-routine)
CREATE OR REPLACE FUNCTION public.compute_rent_arrears_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_months_overdue integer;
  v_total_arrears numeric;
  v_has_partial boolean;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0),
    bool_or(rent_effective_status(status, due_date) = 'partial')
  INTO v_months_overdue, v_total_arrears, v_has_partial
  FROM c1_rent_ledger
  WHERE tenant_id = p_ticket.tenant_id
    AND rent_effective_status(status, due_date) IN ('overdue', 'partial');

  IF v_months_overdue = 0 OR v_total_arrears <= 0 THEN
    RETURN QUERY SELECT 'completed'::text, 'rent_cleared'::text;
    RETURN;
  END IF;

  IF v_has_partial THEN
    RETURN QUERY SELECT 'needs_action'::text, 'rent_partial_payment'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'needs_action'::text, 'rent_overdue'::text;
END;
$$;


-- 7c. record_rent_payment — auto-close check uses function
--     (Protected RPC — approved for this change)
CREATE OR REPLACE FUNCTION public.record_rent_payment(
  p_rent_ledger_id uuid,
  p_pm_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id uuid;
  v_current_status text;
  v_amount_due numeric;
  v_amount_paid numeric;
  v_remaining numeric;
  v_payment_id uuid;
  v_property_label text;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT tenant_id, status, amount_due, COALESCE(amount_paid, 0)
  INTO v_tenant_id, v_current_status, v_amount_due, v_amount_paid
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or access denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  IF v_current_status = 'paid' THEN
    RAISE EXCEPTION 'Entry is already fully paid';
  END IF;

  v_remaining := v_amount_due - v_amount_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Amount exceeds remaining balance of %.2f', v_remaining;
  END IF;

  INSERT INTO c1_rent_payments (rent_ledger_id, tenant_id, property_manager_id, amount, payment_method, notes)
  VALUES (p_rent_ledger_id, v_tenant_id, p_pm_id, p_amount, p_payment_method, p_notes)
  RETURNING id INTO v_payment_id;

  SELECT COALESCE(amount_paid, 0), status
  INTO v_new_paid, v_new_status
  FROM c1_rent_ledger WHERE id = p_rent_ledger_id;

  SELECT p.address INTO v_property_label
  FROM c1_rent_ledger rl
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.id = p_rent_ledger_id;

  PERFORM c1_log_system_event(
    p_pm_id,
    'RENT_PAYMENT_RECORDED',
    v_property_label,
    jsonb_build_object(
      'ledger_id', p_rent_ledger_id,
      'tenant_id', v_tenant_id,
      'amount', p_amount,
      'total_paid', v_new_paid,
      'new_status', v_new_status,
      'payment_method', p_payment_method
    )
  );

  -- Auto-close: use rent_effective_status to check ALL arrears for tenant
  IF NOT EXISTS (
    SELECT 1 FROM c1_rent_ledger
    WHERE tenant_id = v_tenant_id
      AND rent_effective_status(status, due_date) IN ('overdue', 'partial')
  ) THEN
    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = now(),
        next_action = 'completed',
        next_action_reason = 'rent_cleared'
    WHERE tenant_id = v_tenant_id
      AND category = 'rent_arrears'
      AND status = 'open';
  END IF;

  RETURN v_payment_id;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- 8. c1_ticket_detail — rent sections use function
-- ═══════════════════════════════════════════════════════════════
-- Protected RPC — approved. Changes: rent_summary WHERE clause and
-- rent_ledger status field use rent_effective_status().

CREATE OR REPLACE FUNCTION public.c1_ticket_detail(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_ticket c1_tickets%rowtype;
  v_timeout boolean;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_timeout := public.compute_is_past_timeout(
    v_ticket.next_action, v_ticket.next_action_reason,
    v_ticket.contractor_sent_at, v_ticket.waiting_since, v_ticket.date_logged,
    v_ticket.landlord_allocated_at, v_ticket.ooh_dispatched_at, v_ticket.tenant_contacted_at,
    v_ticket.scheduled_date, v_ticket.property_manager_id
  );

  SELECT
    jsonb_build_object(
      'id', t.id, 'issue_title', t.issue_title, 'issue_description', t.issue_description,
      'property_address', p.address, 'property_id', t.property_id,
      'category', t.category, 'maintenance_trade', t.maintenance_trade,
      'priority', t.priority, 'date_logged', t.date_logged,
      'next_action', t.next_action, 'next_action_reason', t.next_action_reason,
      'is_past_timeout', v_timeout,
      'priority_score', public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since),
      'status', t.status, 'archived', t.archived, 'on_hold', t.on_hold,
      'handoff', t.handoff, 'handoff_reason', t.handoff_reason,
      'conversation_id', t.conversation_id, 'is_manual', t.is_manual, 'verified_by', t.verified_by
    )
    || jsonb_build_object(
      'deadline_date', t.deadline_date, 'sla_due_at', t.sla_due_at,
      'sla_total_hours', EXTRACT(EPOCH FROM (t.sla_due_at - t.waiting_since)) / 3600,
      'waiting_since', t.waiting_since, 'contractor_sent_at', t.contractor_sent_at,
      'landlord_allocated_at', t.landlord_allocated_at, 'ooh_dispatched_at', t.ooh_dispatched_at,
      'tenant_contacted_at', t.tenant_contacted_at, 'scheduled_date', t.scheduled_date,
      'resolved_at', t.resolved_at, 'contractor_quote', t.contractor_quote,
      'final_amount', t.final_amount, 'images', t.images,
      'access', t.access, 'access_granted', t.access_granted, 'availability', t.availability,
      'auto_approve_limit', p.auto_approve_limit,
      'label', (SELECT (convo.log -> 0 ->> 'label')::text FROM c1_conversations convo WHERE convo.id = t.conversation_id)
    )
    || jsonb_build_object(
      'reschedule_requested', t.reschedule_requested, 'reschedule_date', t.reschedule_date,
      'reschedule_reason', t.reschedule_reason, 'reschedule_status', t.reschedule_status,
      'reschedule_initiated_by', t.reschedule_initiated_by,
      'ooh_dispatched', t.ooh_dispatched, 'ooh_outcome', t.ooh_outcome,
      'ooh_notes', t.ooh_notes, 'ooh_cost', t.ooh_cost,
      'ooh_outcome_at', t.ooh_outcome_at, 'ooh_submissions', t.ooh_submissions,
      'landlord_allocated', t.landlord_allocated, 'landlord_outcome', t.landlord_outcome,
      'landlord_notes', t.landlord_notes, 'landlord_cost', t.landlord_cost,
      'landlord_outcome_at', t.landlord_outcome_at, 'landlord_submissions', t.landlord_submissions,
      'room_id', t.room_id, 'tenant_id', t.tenant_id,
      'contractor_id', t.contractor_id, 'compliance_certificate_id', t.compliance_certificate_id
    )
    || jsonb_build_object(
      'tenant', CASE WHEN ten.id IS NOT NULL THEN jsonb_build_object(
        'id', ten.id, 'name', ten.full_name, 'phone', ten.phone, 'email', ten.email) ELSE NULL END,
      'landlord', CASE WHEN ll.id IS NOT NULL THEN jsonb_build_object(
        'id', ll.id, 'name', ll.full_name, 'phone', ll.phone, 'email', ll.email)
        ELSE CASE WHEN p.landlord_name IS NOT NULL THEN jsonb_build_object(
          'name', p.landlord_name, 'phone', p.landlord_phone, 'email', p.landlord_email) ELSE NULL END
      END,
      'manager', jsonb_build_object(
        'id', pm.id, 'name', pm.name, 'phone', pm.phone, 'email', pm.email, 'business_name', pm.business_name),
      'contractor', (
        SELECT jsonb_build_object(
          'id', (elem->>'id')::uuid, 'name', elem->>'name',
          'phone', elem->>'phone', 'email', elem->>'email', 'status', elem->>'status'
        )
        FROM c1_messages m, jsonb_array_elements(m.contractors) elem
        WHERE m.ticket_id = t.id
          AND elem->>'status' NOT IN ('withdrawn', 'declined', 'no_response')
        LIMIT 1
      )
    )
    || jsonb_build_object(
      'compliance', CASE WHEN t.compliance_certificate_id IS NOT NULL THEN jsonb_build_object(
        'cert_id', cc.id, 'cert_type', cc.certificate_type, 'expiry_date', cc.expiry_date,
        'status', cc.status, 'document_url', cc.document_url, 'issued_date', cc.issued_date,
        'certificate_number', cc.certificate_number, 'issued_by', cc.issued_by, 'contractor_id', cc.contractor_id,
        'days_remaining', CASE WHEN cc.expiry_date IS NOT NULL THEN (cc.expiry_date - CURRENT_DATE)::integer ELSE NULL END
      ) ELSE NULL END,
      'rent_summary', CASE WHEN t.category = 'rent_arrears' THEN (
        SELECT jsonb_build_object(
          'total_owed', COALESCE(SUM(amount_due), 0),
          'total_paid', COALESCE(SUM(COALESCE(amount_paid, 0)), 0),
          'months_overdue', COUNT(*)
        ) FROM c1_rent_ledger
        WHERE tenant_id = t.tenant_id
          AND rent_effective_status(status, due_date) IN ('overdue', 'partial')
      ) ELSE NULL END,
      'rent_ledger', CASE WHEN t.category = 'rent_arrears' THEN (
        SELECT jsonb_agg(jsonb_build_object(
          'id', rl.id, 'due_date', rl.due_date, 'amount_due', rl.amount_due,
          'amount_paid', rl.amount_paid,
          'status', rent_effective_status(rl.status, rl.due_date),
          'room_id', rl.room_id,
          'paid_at', rl.paid_at, 'payment_method', rl.payment_method, 'notes', rl.notes
        ) ORDER BY rl.due_date DESC)
        FROM (SELECT * FROM c1_rent_ledger WHERE tenant_id = t.tenant_id LIMIT 12) rl
      ) ELSE NULL END
    )
  INTO v_result
  FROM c1_tickets t
  LEFT JOIN c1_properties p ON p.id = t.property_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  LEFT JOIN c1_landlords ll ON ll.id = p.landlord_id
  LEFT JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN c1_compliance_certificates cc ON cc.id = t.compliance_certificate_id
  WHERE t.id = p_ticket_id;

  RETURN v_result;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 9. New RPC: get_tenant_outstanding_debt
-- ═══════════════════════════════════════════════════════════════
-- Replaces frontend raw query in end-tenancy-dialog.tsx

CREATE OR REPLACE FUNCTION public.get_tenant_outstanding_debt(
  p_tenant_id uuid,
  p_pm_id uuid
)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0)
  FROM c1_rent_ledger
  WHERE tenant_id = p_tenant_id
    AND property_manager_id = p_pm_id
    AND rent_effective_status(status, due_date) IN ('overdue', 'partial');
$$;
