-- Dashboard stat card RPCs: occupancy, rent income (£ amounts), AI actions count

-- 1. Portfolio-wide room occupancy
CREATE OR REPLACE FUNCTION public.get_occupancy_summary(p_pm_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'total_rooms',   count(*),
    'occupied',      count(*) FILTER (WHERE NOT is_vacant),
    'vacant',        count(*) FILTER (WHERE is_vacant),
    'ending_soon',   count(*) FILTER (
      WHERE NOT is_vacant
        AND tenancy_end_date IS NOT NULL
        AND tenancy_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days'
    )
  )
  FROM c1_rooms
  WHERE property_manager_id = p_pm_id;
$$;

-- 2. Current-month rent in £ amounts (not counts)
CREATE OR REPLACE FUNCTION public.get_rent_income_summary(p_pm_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'expected_amount',    COALESCE(sum(amount_due), 0),
    'collected_amount',   COALESCE(sum(amount_paid), 0),
    'outstanding_amount', COALESCE(sum(amount_due - amount_paid) FILTER (WHERE status IN ('pending', 'partial')), 0),
    'overdue_amount',     COALESCE(sum(amount_due - amount_paid) FILTER (
      WHERE status = 'overdue' OR (status = 'pending' AND due_date < CURRENT_DATE)
    ), 0)
  )
  FROM c1_rent_ledger
  WHERE property_manager_id = p_pm_id
    AND due_date >= date_trunc('month', CURRENT_DATE)::date
    AND due_date < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
$$;

-- 3. AI/system actions this month (from audit trail)
CREATE OR REPLACE FUNCTION public.get_ai_actions_count(p_pm_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object('count', count(*))
  FROM c1_events
  WHERE portfolio_id = p_pm_id
    AND actor_type IN ('SYSTEM', 'ai', 'AI')
    AND occurred_at >= date_trunc('month', CURRENT_DATE)
    AND occurred_at < date_trunc('month', CURRENT_DATE) + interval '1 month';
$$;
