-- ============================================================
-- Rent Page RPCs — portfolio analytics, auto-generation, cron
-- ============================================================
-- Powers the /rent page, dashboard rent card, and monthly auto-generation.
-- None of these touch protected RPCs.

-- 1. Auto-generate rent entries for ALL properties of a PM.
--    Wraps create_rent_ledger_entries per-property. Idempotent.
CREATE OR REPLACE FUNCTION public.auto_generate_rent_entries(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_property_id uuid;
  v_total integer := 0;
  v_count integer;
BEGIN
  FOR v_property_id IN
    SELECT DISTINCT property_id
    FROM c1_rooms
    WHERE property_manager_id = p_pm_id
      AND monthly_rent IS NOT NULL
      AND current_tenant_id IS NOT NULL
  LOOP
    v_count := public.create_rent_ledger_entries(v_property_id, p_pm_id, p_month, p_year);
    v_total := v_total + v_count;
  END LOOP;

  RETURN v_total;
END;
$$;

-- 2. Auto-generate for ALL PMs (monthly cron wrapper).
--    No parameters — uses current month/year.
CREATE OR REPLACE FUNCTION public.auto_generate_rent_all_pms()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pm_id uuid;
  v_month integer := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
BEGIN
  FOR v_pm_id IN
    SELECT DISTINCT property_manager_id
    FROM c1_rooms
    WHERE monthly_rent IS NOT NULL
      AND current_tenant_id IS NOT NULL
  LOOP
    PERFORM public.auto_generate_rent_entries(v_pm_id, v_month, v_year);
  END LOOP;
END;
$$;

-- 3. Portfolio rent summary — per-property breakdown for a given month.
--    Powers the "Properties" tab on /rent page.
CREATE OR REPLACE FUNCTION public.get_rent_portfolio_summary(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE (
  property_id uuid,
  property_address text,
  total_rooms bigint,
  occupied_rooms bigint,
  total_due numeric,
  total_paid numeric,
  outstanding numeric,
  overdue_amount numeric,
  paid_count bigint,
  overdue_count bigint,
  pending_count bigint,
  partial_count bigint,
  collection_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    p.id AS property_id,
    p.address AS property_address,
    count(DISTINCT r.id) AS total_rooms,
    count(DISTINCT r.id) FILTER (WHERE NOT r.is_vacant) AS occupied_rooms,
    COALESCE(sum(rl.amount_due), 0) AS total_due,
    COALESCE(sum(rl.amount_paid), 0) AS total_paid,
    COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
      WHERE rl.status IN ('pending', 'partial')
    ), 0) AS outstanding,
    COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
      WHERE rl.status = 'overdue'
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
    ), 0) AS overdue_amount,
    count(rl.id) FILTER (WHERE rl.status = 'paid') AS paid_count,
    count(rl.id) FILTER (
      WHERE rl.status = 'overdue'
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
    ) AS overdue_count,
    count(rl.id) FILTER (
      WHERE rl.status = 'pending' AND (rl.due_date >= CURRENT_DATE OR rl.due_date IS NULL)
    ) AS pending_count,
    count(rl.id) FILTER (WHERE rl.status = 'partial') AS partial_count,
    CASE
      WHEN COALESCE(sum(rl.amount_due), 0) = 0 THEN 0
      ELSE ROUND(COALESCE(sum(rl.amount_paid), 0) / sum(rl.amount_due) * 100, 1)
    END AS collection_rate
  FROM c1_properties p
  JOIN c1_rooms r ON r.property_id = p.id AND r.property_manager_id = p_pm_id
  LEFT JOIN c1_rent_ledger rl
    ON rl.room_id = r.id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
  WHERE p.property_manager_id = p_pm_id
  GROUP BY p.id, p.address
  ORDER BY overdue_amount DESC, outstanding DESC;
$$;

-- 4. Tenant payment health — payment history over last N months.
--    Powers the "Tenants" tab on /rent page.
CREATE OR REPLACE FUNCTION public.get_rent_tenant_health(
  p_pm_id uuid,
  p_months_back integer DEFAULT 6
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  property_address text,
  room_number text,
  months_tracked bigint,
  on_time_count bigint,
  late_count bigint,
  unpaid_count bigint,
  on_time_rate numeric,
  current_month_status text,
  total_owed numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH date_range AS (
    SELECT
      (date_trunc('month', CURRENT_DATE) - (p_months_back || ' months')::interval)::date AS start_date,
      (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS end_date,
      date_trunc('month', CURRENT_DATE)::date AS current_month_start,
      (date_trunc('month', CURRENT_DATE) + interval '1 month')::date AS current_month_end
  ),
  tenant_ledger AS (
    SELECT
      rl.tenant_id,
      t.full_name AS tenant_name,
      p.address AS property_address,
      r.room_number,
      count(*) AS months_tracked,
      count(*) FILTER (WHERE rl.status = 'paid' AND rl.paid_at <= (rl.due_date + interval '1 day')) AS on_time_count,
      count(*) FILTER (WHERE rl.status = 'paid' AND rl.paid_at > (rl.due_date + interval '1 day')) AS late_count,
      count(*) FILTER (WHERE rl.status IN ('pending', 'overdue', 'partial')) AS unpaid_count,
      -- Current month status
      MAX(CASE
        WHEN rl.due_date >= dr.current_month_start AND rl.due_date < dr.current_month_end THEN
          CASE
            WHEN rl.status = 'paid' THEN 'paid'
            WHEN rl.status = 'partial' THEN 'partial'
            WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
            ELSE rl.status
          END
        ELSE NULL
      END) AS current_month_status,
      -- Total currently owed (all unpaid across all months)
      COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
        WHERE rl.status IN ('pending', 'overdue', 'partial')
      ), 0) AS total_owed
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    CROSS JOIN date_range dr
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= dr.start_date
      AND rl.due_date < dr.end_date
    GROUP BY rl.tenant_id, t.full_name, p.address, r.room_number
  )
  SELECT
    tl.tenant_id,
    tl.tenant_name,
    tl.property_address,
    tl.room_number,
    tl.months_tracked,
    tl.on_time_count,
    tl.late_count,
    tl.unpaid_count,
    CASE
      WHEN tl.months_tracked = 0 THEN 0
      ELSE ROUND(tl.on_time_count::numeric / tl.months_tracked * 100, 1)
    END AS on_time_rate,
    COALESCE(tl.current_month_status, 'no_entry') AS current_month_status,
    tl.total_owed
  FROM tenant_ledger tl
  ORDER BY on_time_rate ASC, total_owed DESC;
$$;

-- 5. Cash flow distribution — rent grouped by day of month.
--    Powers the "Cash Flow" tab on /rent page.
CREATE OR REPLACE FUNCTION public.get_rent_cashflow_distribution(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE (
  due_day integer,
  expected_amount numeric,
  collected_amount numeric,
  entry_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    EXTRACT(DAY FROM rl.due_date)::integer AS due_day,
    COALESCE(sum(rl.amount_due), 0) AS expected_amount,
    COALESCE(sum(rl.amount_paid) FILTER (WHERE rl.status = 'paid'), 0) AS collected_amount,
    count(*) AS entry_count
  FROM c1_rent_ledger rl
  WHERE rl.property_manager_id = p_pm_id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
  GROUP BY EXTRACT(DAY FROM rl.due_date)
  ORDER BY due_day;
$$;

-- 6. Collection trend — month-over-month totals for last N months.
--    Powers the trend bar chart on /rent page.
CREATE OR REPLACE FUNCTION public.get_rent_collection_trend(
  p_pm_id uuid,
  p_months_back integer DEFAULT 6
)
RETURNS TABLE (
  month integer,
  year integer,
  month_label text,
  total_due numeric,
  total_collected numeric,
  total_overdue numeric,
  collection_rate numeric,
  entry_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH months AS (
    SELECT
      generate_series(
        date_trunc('month', CURRENT_DATE) - ((p_months_back - 1) || ' months')::interval,
        date_trunc('month', CURRENT_DATE),
        '1 month'::interval
      )::date AS month_start
  )
  SELECT
    EXTRACT(MONTH FROM m.month_start)::integer AS month,
    EXTRACT(YEAR FROM m.month_start)::integer AS year,
    to_char(m.month_start, 'Mon YYYY') AS month_label,
    COALESCE(sum(rl.amount_due), 0) AS total_due,
    COALESCE(sum(rl.amount_paid), 0) AS total_collected,
    COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
      WHERE rl.status = 'overdue'
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
    ), 0) AS total_overdue,
    CASE
      WHEN COALESCE(sum(rl.amount_due), 0) = 0 THEN 0
      ELSE ROUND(COALESCE(sum(rl.amount_paid), 0) / sum(rl.amount_due) * 100, 1)
    END AS collection_rate,
    count(rl.id) AS entry_count
  FROM months m
  LEFT JOIN c1_rent_ledger rl
    ON rl.property_manager_id = p_pm_id
    AND rl.due_date >= m.month_start
    AND rl.due_date < (m.month_start + interval '1 month')::date
  GROUP BY m.month_start
  ORDER BY m.month_start;
$$;

-- 7. Monthly cron — auto-generate rent entries on 1st of every month at 00:05 UTC
SELECT cron.schedule(
  'generate-monthly-rent',
  '5 0 1 * *',
  $$SELECT public.auto_generate_rent_all_pms()$$
);
