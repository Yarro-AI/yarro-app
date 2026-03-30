-- ============================================================
-- Rent dashboard summary — portfolio-wide current month
-- ============================================================
-- Returns paid/outstanding/overdue/partial counts across all
-- properties for the current month. Used by dashboard rent card.

CREATE OR REPLACE FUNCTION public.get_rent_dashboard_summary(p_pm_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'paid',        count(*) FILTER (WHERE effective_status = 'paid'),
    'outstanding', count(*) FILTER (WHERE effective_status = 'pending'),
    'overdue',     count(*) FILTER (WHERE effective_status = 'overdue'),
    'partial',     count(*) FILTER (WHERE effective_status = 'partial'),
    'total',       count(*)
  )
  FROM (
    SELECT
      CASE
        WHEN rl.status = 'paid' THEN 'paid'
        WHEN rl.status = 'partial' THEN 'partial'
        WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
        ELSE rl.status
      END AS effective_status
    FROM c1_rent_ledger rl
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= date_trunc('month', CURRENT_DATE)::date
      AND rl.due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
  ) sub;
$$;
