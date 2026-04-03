-- ============================================================
-- Fix: only show arrears from after PM signup date
-- ============================================================
-- Entries before the PM signed up were probably paid before the app.
-- Don't classify them as arrears.

CREATE OR REPLACE FUNCTION public.get_rent_ledger_for_month(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE (
  rent_ledger_id uuid,
  tenant_id uuid,
  tenant_name text,
  property_id uuid,
  property_address text,
  room_number text,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  effective_status text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT * FROM (
    -- Current month entries
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
      CASE
        WHEN rl.status = 'paid' THEN 'paid'
        WHEN rl.status = 'partial' THEN 'partial'
        WHEN rl.status = 'overdue' THEN 'overdue'
        WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
        ELSE rl.status
      END AS effective_status
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= make_date(p_year, p_month, 1)
      AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date

    UNION ALL

    -- Arrears from previous months (only since PM signup)
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
      'arrears' AS effective_status
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    JOIN c1_property_managers pm ON pm.id = rl.property_manager_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date < make_date(p_year, p_month, 1)
      AND rl.due_date >= pm.created_at::date
      AND rl.status IN ('pending', 'partial', 'overdue')
  ) AS combined
  ORDER BY
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
$$;
