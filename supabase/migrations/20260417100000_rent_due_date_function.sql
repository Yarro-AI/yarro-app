-- Due date computation function + relax rent_due_day constraint.
-- Supports: 0 = last day of month, 1-28 = fixed day, 29-31 = clamped to last valid day.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Due date computation function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_rent_due_date(
  p_year integer,
  p_month integer,
  p_due_day integer
)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_last_day integer;
  v_clamped integer;
BEGIN
  -- Last day of the target month
  v_last_day := EXTRACT(DAY FROM (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day'))::integer;

  IF p_due_day = 0 THEN
    -- 0 = last day of month
    RETURN make_date(p_year, p_month, v_last_day);
  END IF;

  -- Clamp to last valid day (handles day 29-31 in short months)
  v_clamped := LEAST(p_due_day, v_last_day);
  RETURN make_date(p_year, p_month, v_clamped);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Relax CHECK constraint on c1_rooms.rent_due_day
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old constraint (may have different names from different migrations)
ALTER TABLE c1_rooms DROP CONSTRAINT IF EXISTS c1_rooms_rent_due_day_check;
ALTER TABLE c1_rooms DROP CONSTRAINT IF EXISTS rooms_rent_due_day_check;

-- New constraint: 0 (last day) or 1-31
ALTER TABLE c1_rooms ADD CONSTRAINT c1_rooms_rent_due_day_check
  CHECK (rent_due_day IS NULL OR (rent_due_day >= 0 AND rent_due_day <= 31));


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Update triggers to use compute_rent_due_date
-- ═══════════════════════════════════════════════════════════════════════════

-- trg_room_tenant_assigned
CREATE OR REPLACE FUNCTION public.trg_room_tenant_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_inserted integer := 0;
  v_property_label text;
BEGIN
  IF NEW.current_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.current_tenant_id IS NOT DISTINCT FROM NEW.current_tenant_id THEN
    RETURN NEW;
  END IF;

  IF NEW.monthly_rent IS NULL OR NEW.rent_due_day IS NULL THEN
    SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_ASSIGNED_TO_ROOM', v_property_label,
      jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
        'tenant_id', NEW.current_tenant_id, 'rent_configured', false)
    );
    RETURN NEW;
  END IF;

  v_due_date := compute_rent_due_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    NEW.rent_due_day
  );

  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id, 'TENANT_ASSIGNED_TO_ROOM', v_property_label,
    jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id, 'rent_configured', true,
      'due_date', v_due_date, 'amount_due', NEW.monthly_rent)
  );

  IF v_inserted > 0 THEN
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'RENT_LEDGER_AUTO_CREATED', v_property_label,
      jsonb_build_object('room_id', NEW.id, 'tenant_id', NEW.current_tenant_id,
        'due_date', v_due_date, 'amount_due', NEW.monthly_rent, 'status', v_status)
    );
  END IF;

  RETURN NEW;
END;
$function$;


-- trg_room_rent_configured
CREATE OR REPLACE FUNCTION public.trg_room_rent_configured()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_property_label text;
BEGIN
  IF NEW.current_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.monthly_rent IS NULL OR NEW.rent_due_day IS NULL THEN RETURN NEW; END IF;
  IF OLD.monthly_rent IS NOT DISTINCT FROM NEW.monthly_rent
     AND OLD.rent_due_day IS NOT DISTINCT FROM NEW.rent_due_day THEN
    RETURN NEW;
  END IF;

  v_due_date := compute_rent_due_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    NEW.rent_due_day
  );

  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id, 'RENT_LEDGER_AUTO_CREATED', v_property_label,
    jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id, 'due_date', v_due_date,
      'amount_due', NEW.monthly_rent, 'trigger', 'rent_configured')
  );

  RETURN NEW;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Update create_rent_ledger_entries to use compute_rent_due_date
-- ═══════════════════════════════════════════════════════════════════════════

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
  IF NOT EXISTS (
    SELECT 1 FROM c1_properties
    WHERE id = p_property_id AND property_manager_id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'Property not found or access denied';
  END IF;

  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  )
  SELECT
    p_pm_id,
    r.id,
    r.current_tenant_id,
    compute_rent_due_date(p_year, p_month, COALESCE(r.rent_due_day, 1)),
    r.monthly_rent,
    CASE
      WHEN compute_rent_due_date(p_year, p_month, COALESCE(r.rent_due_day, 1)) < CURRENT_DATE
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
        AND rl2.tenant_id = r.current_tenant_id
        AND rl2.due_date >= make_date(p_year, p_month, 1)
        AND rl2.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
