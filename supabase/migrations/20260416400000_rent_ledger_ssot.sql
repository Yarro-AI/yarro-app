-- SSOT Fix: Rent ledger auto-creation via database trigger.
--
-- Problem: Rent ledger entries only created when UI component mounts.
-- 5 different code paths assign tenants to rooms, none create rent entries.
--
-- Fix:
--   1. Change unique constraint to allow multiple tenants per room per month
--   2. Add trigger on c1_rooms to auto-create ledger entry on tenant assignment
--   3. Audit events at every step
--   4. Update create_rent_ledger_entries to match new constraint

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Change unique constraint
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE c1_rent_ledger
  DROP CONSTRAINT IF EXISTS c1_rent_ledger_room_due_date_unique;

ALTER TABLE c1_rent_ledger
  ADD CONSTRAINT c1_rent_ledger_room_tenant_due_date_unique
  UNIQUE (room_id, tenant_id, due_date);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Trigger: auto-create rent ledger entry when tenant assigned to room
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- Guard: only fire when a tenant is newly assigned
  IF NEW.current_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.current_tenant_id IS NOT DISTINCT FROM NEW.current_tenant_id THEN
    RETURN NEW;
  END IF;

  -- Guard: room must have rent configured
  IF NEW.monthly_rent IS NULL OR NEW.rent_due_day IS NULL THEN
    -- Still log the assignment even without rent
    SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

    PERFORM c1_log_system_event(
      NEW.property_manager_id,
      'TENANT_ASSIGNED_TO_ROOM',
      v_property_label,
      jsonb_build_object(
        'room_id', NEW.id,
        'room_number', NEW.room_number,
        'tenant_id', NEW.current_tenant_id,
        'rent_configured', false
      )
    );
    RETURN NEW;
  END IF;

  -- Calculate due date for current month
  v_due_date := make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    COALESCE(NEW.rent_due_day, 1)
  );

  -- Determine status based on whether due date has passed
  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  -- Insert ledger entry (ON CONFLICT = idempotent)
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Audit: tenant assignment
  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id,
    'TENANT_ASSIGNED_TO_ROOM',
    v_property_label,
    jsonb_build_object(
      'room_id', NEW.id,
      'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id,
      'rent_configured', true,
      'due_date', v_due_date,
      'amount_due', NEW.monthly_rent
    )
  );

  -- Audit: ledger creation (only if actually inserted)
  IF v_inserted > 0 THEN
    PERFORM c1_log_system_event(
      NEW.property_manager_id,
      'RENT_LEDGER_AUTO_CREATED',
      v_property_label,
      jsonb_build_object(
        'room_id', NEW.id,
        'tenant_id', NEW.current_tenant_id,
        'due_date', v_due_date,
        'amount_due', NEW.monthly_rent,
        'status', v_status
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger fires on UPDATE (all 5 assignment paths do UPDATE on c1_rooms)
CREATE TRIGGER trg_room_tenant_assigned
  AFTER UPDATE OF current_tenant_id
  ON public.c1_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_room_tenant_assigned();


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Update create_rent_ledger_entries to match new constraint
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
        AND rl2.tenant_id = r.current_tenant_id
        AND rl2.due_date >= make_date(p_year, p_month, 1)
        AND rl2.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Add RENT_PAYMENT_RECORDED audit event to record_rent_payment
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, uuid, numeric, text, text);

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
  v_payment_id uuid;
  v_property_label text;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  -- Ownership check
  SELECT tenant_id INTO v_tenant_id
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or access denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  -- Insert payment (trigger handles ledger update + status)
  INSERT INTO c1_rent_payments (rent_ledger_id, tenant_id, property_manager_id, amount, payment_method, notes)
  VALUES (p_rent_ledger_id, v_tenant_id, p_pm_id, p_amount, p_payment_method, p_notes)
  RETURNING id INTO v_payment_id;

  -- Read back updated ledger state
  SELECT COALESCE(amount_paid, 0), status
  INTO v_new_paid, v_new_status
  FROM c1_rent_ledger WHERE id = p_rent_ledger_id;

  -- Audit event
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

  -- Auto-close rent arrears ticket if ALL arrears for this tenant are now cleared
  IF NOT EXISTS (
    SELECT 1 FROM c1_rent_ledger
    WHERE tenant_id = v_tenant_id
      AND status IN ('overdue', 'partial')
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
