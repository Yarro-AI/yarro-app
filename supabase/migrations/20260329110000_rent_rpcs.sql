-- ============================================================
-- Rent RPCs — generate entries, summary, mark paid
-- ============================================================
-- All rent business logic lives here. Frontend calls these RPCs
-- and never writes to c1_rent_ledger directly.

-- 1. Generate rent ledger entries for all occupied rooms in a property
--    Returns count of newly inserted rows. Idempotent via ON CONFLICT.
CREATE OR REPLACE FUNCTION public.create_rent_ledger_entries(
  p_property_id uuid,
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Validate month/year
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'Month must be between 1 and 12';
  END IF;
  IF p_year < 2020 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Year out of range';
  END IF;

  -- Insert one row per occupied room with rent configured.
  -- ON CONFLICT DO NOTHING makes this idempotent — safe to call
  -- multiple times (e.g. after adding a new room mid-month).
  INSERT INTO c1_rent_ledger (
    property_manager_id,
    room_id,
    tenant_id,
    due_date,
    amount_due
  )
  SELECT
    p_pm_id,
    r.id,
    r.current_tenant_id,
    make_date(p_year, p_month, COALESCE(r.rent_due_day, 1)),
    r.monthly_rent
  FROM c1_rooms r
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
    AND r.current_tenant_id IS NOT NULL
    AND r.monthly_rent IS NOT NULL
  ON CONFLICT (room_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 2. Get rent summary for a property for a given month.
--    Returns all rooms (including vacant) with their ledger entry if it exists.
--    effective_status is derived — no write side-effects.
CREATE OR REPLACE FUNCTION public.get_rent_summary_for_property(
  p_property_id uuid,
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE (
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
  notes text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    r.id AS room_id,
    r.room_number,
    r.room_name,
    r.is_vacant,
    COALESCE(rl.tenant_id, r.current_tenant_id) AS tenant_id,
    t.full_name AS tenant_name,
    rl.id AS rent_ledger_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.paid_at,
    rl.payment_method,
    CASE
      WHEN r.is_vacant AND rl.id IS NULL THEN 'vacant'
      WHEN rl.id IS NULL THEN 'no_entry'
      WHEN rl.status = 'paid' THEN 'paid'
      WHEN rl.status = 'partial' THEN 'partial'
      WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
      ELSE rl.status
    END AS effective_status,
    rl.notes
  FROM c1_rooms r
  LEFT JOIN c1_rent_ledger rl
    ON rl.room_id = r.id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
  LEFT JOIN c1_tenants t
    ON t.id = COALESCE(rl.tenant_id, r.current_tenant_id)
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
  ORDER BY r.room_number;
$$;

-- 3. Mark a rent ledger entry as paid (or partially paid).
--    Ownership check via property_manager_id.
CREATE OR REPLACE FUNCTION public.mark_rent_paid(
  p_rent_ledger_id uuid,
  p_pm_id uuid,
  p_amount_paid numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_amount_due numeric;
  v_status text;
BEGIN
  -- Ownership check
  SELECT amount_due INTO v_amount_due
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id
    AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or access denied';
  END IF;

  -- Validate amount
  IF p_amount_paid IS NULL OR p_amount_paid <= 0 THEN
    RAISE EXCEPTION 'Amount paid must be greater than zero';
  END IF;

  -- Determine status
  IF p_amount_paid >= v_amount_due THEN
    v_status := 'paid';
  ELSE
    v_status := 'partial';
  END IF;

  UPDATE c1_rent_ledger
  SET amount_paid = p_amount_paid,
      paid_at = now(),
      payment_method = p_payment_method,
      status = v_status,
      notes = p_notes
  WHERE id = p_rent_ledger_id;
END;
$$;
