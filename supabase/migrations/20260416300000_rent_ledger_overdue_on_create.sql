-- Fix: Rent ledger entries always created with status='pending' even when
-- due_date is in the past. This means the overdue trigger never fires and
-- no dashboard ticket appears.
--
-- Fix: Set status='overdue' when due_date < CURRENT_DATE on creation.
-- This triggers trg_rent_ledger_overdue_ticket immediately.

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
  -- Validate PM owns property
  IF NOT EXISTS (
    SELECT 1 FROM c1_properties
    WHERE id = p_property_id AND property_manager_id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'Property not found or access denied';
  END IF;

  -- Insert one row per occupied room with rent configured.
  -- Status is 'overdue' if due_date has already passed, otherwise 'pending'.
  INSERT INTO c1_rent_ledger (
    property_manager_id,
    room_id,
    tenant_id,
    due_date,
    amount_due,
    status
  )
  SELECT
    p_pm_id,
    r.id,
    r.current_tenant_id,
    make_date(p_year, p_month, COALESCE(r.rent_due_day, 1)),
    r.monthly_rent,
    CASE
      WHEN make_date(p_year, p_month, COALESCE(r.rent_due_day, 1)) < CURRENT_DATE
        THEN 'overdue'
      ELSE 'pending'
    END
  FROM c1_rooms r
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
    AND r.current_tenant_id IS NOT NULL
    AND r.monthly_rent IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM c1_rent_ledger rl2
      WHERE rl2.room_id = r.id
        AND rl2.due_date >= make_date(p_year, p_month, 1)
        AND rl2.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    )
  ON CONFLICT (room_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
