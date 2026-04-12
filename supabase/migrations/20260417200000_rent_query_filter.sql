-- Fix rent page queries: filter current tenants + outstanding debt only.
-- Old tenant paid entries hidden (accessible via tenant profile).
-- Old tenant unpaid entries shown with 'former_tenant' flag.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. get_rent_ledger_for_month — main /rent page
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_rent_ledger_for_month(uuid, integer, integer);

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
      END AS effective_status,
      (r.current_tenant_id IS DISTINCT FROM rl.tenant_id) AS is_former_tenant
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= make_date(p_year, p_month, 1)
      AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
      -- Filter: current tenant OR outstanding debt from former tenant
      AND (
        r.current_tenant_id = rl.tenant_id
        OR rl.status IN ('overdue', 'partial')
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
      AND rl.status IN ('pending', 'partial', 'overdue')
  ) AS combined
  ORDER BY
    -- Current tenants first, former tenants below
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


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_rent_summary_for_property — property detail rent tab
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_rent_summary_for_property(uuid, uuid, integer, integer);

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
  -- Current tenant entries + outstanding debt from former tenants
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
      WHEN rl.status = 'paid' THEN 'paid'
      WHEN rl.status = 'partial' THEN 'partial'
      WHEN rl.status = 'overdue' THEN 'overdue'
      WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
      ELSE rl.status
    END AS effective_status,
    rl.notes,
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false) AS is_former_tenant
  FROM c1_rooms r
  LEFT JOIN c1_rent_ledger rl ON rl.room_id = r.id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    -- Filter: current tenant OR outstanding from former
    AND (
      r.current_tenant_id = rl.tenant_id
      OR rl.status IN ('overdue', 'partial')
    )
  LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
  ORDER BY
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false),
    r.room_number::integer,
    rl.due_date;
$function$;
