-- ============================================================
-- Fix: get_rent_portfolio_summary — guard aggregations for NULL ledger rows
-- ============================================================
-- Problem: LEFT JOIN means rooms without ledger entries for the selected month
-- still appear, and the overdue/outstanding logic produces phantom amounts.
-- Fix: Keep LEFT JOIN (properties must always show — vacant = lost money),
-- but guard every aggregation with rl.id IS NOT NULL so only actual entries count.

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
    COALESCE(sum(rl.amount_due) FILTER (WHERE rl.id IS NOT NULL), 0) AS total_due,
    COALESCE(sum(rl.amount_paid) FILTER (WHERE rl.id IS NOT NULL), 0) AS total_paid,
    COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
      WHERE rl.id IS NOT NULL AND rl.status IN ('pending', 'partial')
    ), 0) AS outstanding,
    COALESCE(sum(rl.amount_due - rl.amount_paid) FILTER (
      WHERE rl.id IS NOT NULL AND (
        rl.status = 'overdue'
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
      )
    ), 0) AS overdue_amount,
    count(rl.id) FILTER (WHERE rl.id IS NOT NULL AND rl.status = 'paid') AS paid_count,
    count(rl.id) FILTER (
      WHERE rl.id IS NOT NULL AND (
        rl.status = 'overdue'
        OR (rl.status = 'pending' AND rl.due_date < CURRENT_DATE)
      )
    ) AS overdue_count,
    count(rl.id) FILTER (
      WHERE rl.id IS NOT NULL AND rl.status = 'pending' AND (rl.due_date >= CURRENT_DATE OR rl.due_date IS NULL)
    ) AS pending_count,
    count(rl.id) FILTER (WHERE rl.id IS NOT NULL AND rl.status = 'partial') AS partial_count,
    CASE
      WHEN COALESCE(sum(rl.amount_due) FILTER (WHERE rl.id IS NOT NULL), 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(sum(rl.amount_paid) FILTER (WHERE rl.id IS NOT NULL), 0)
        / sum(rl.amount_due) FILTER (WHERE rl.id IS NOT NULL) * 100, 1
      )
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
