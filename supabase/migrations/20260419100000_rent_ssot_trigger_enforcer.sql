-- ═══════════════════════════════════════════════════════════════════════════
-- RENT SSOT: Trigger-Enforced Single Chain of Truth
--
-- The room is the atom. The trigger is the enforcer.
-- RPCs only update c1_rooms.current_tenant_id.
-- This trigger handles ALL downstream effects:
--   1. Maintain c1_tenants.room_id + property_id (mirrors)
--   2. Create rent ledger entries on assignment
--   3. Cancel pending rent entries on removal
--   4. Log audit events for every change
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. The single enforcer trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_room_tenant_assigned()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_inserted integer := 0;
  v_cancelled integer := 0;
  v_property_label text;
  v_due_day integer;
BEGIN
  -- Skip if current_tenant_id didn't actually change
  IF TG_OP = 'UPDATE'
     AND OLD.current_tenant_id IS NOT DISTINCT FROM NEW.current_tenant_id THEN
    RETURN NEW;
  END IF;

  -- Get property label once (used by all paths)
  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  -- ═══ REMOVAL PATH: tenant leaving this room ═══
  -- Fires when: value → NULL (unassign/end) or value → different value (swap)
  IF OLD.current_tenant_id IS NOT NULL
     AND (NEW.current_tenant_id IS NULL OR NEW.current_tenant_id != OLD.current_tenant_id) THEN

    -- 1a. Clear tenant's room_id (mirror)
    UPDATE c1_tenants
    SET room_id = NULL
    WHERE id = OLD.current_tenant_id
      AND room_id = OLD.id;  -- safety: only clear if it points to THIS room

    -- 1b. Cancel pending rent entries for the leaving tenant
    UPDATE c1_rent_ledger
    SET status = 'cancelled'
    WHERE room_id = OLD.id
      AND tenant_id = OLD.current_tenant_id
      AND due_date > CURRENT_DATE
      AND status = 'pending';

    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    -- 1c. Log removal event
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_REMOVED_FROM_ROOM', v_property_label,
      jsonb_build_object(
        'room_id', OLD.id,
        'room_number', OLD.room_number,
        'tenant_id', OLD.current_tenant_id,
        'pending_entries_cancelled', v_cancelled
      )
    );
  END IF;

  -- ═══ ASSIGNMENT PATH: tenant arriving in this room ═══
  -- Fires when: NULL → value (assign) or value → different value (swap)
  IF NEW.current_tenant_id IS NOT NULL
     AND (OLD.current_tenant_id IS NULL OR OLD.current_tenant_id != NEW.current_tenant_id) THEN

    -- 2a. Set tenant's room_id and property_id (mirrors)
    UPDATE c1_tenants
    SET room_id = NEW.id,
        property_id = NEW.property_id
    WHERE id = NEW.current_tenant_id;

    -- 2b. Create rent ledger entry if rent is configured
    v_due_day := COALESCE(NEW.rent_due_day, 1);  -- default to 1st if not set

    IF NEW.monthly_rent IS NOT NULL THEN
      v_due_date := compute_rent_due_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,
        EXTRACT(MONTH FROM CURRENT_DATE)::integer,
        v_due_day
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
    END IF;

    -- 2c. Log assignment event
    PERFORM c1_log_system_event(
      NEW.property_manager_id, 'TENANT_ASSIGNED_TO_ROOM', v_property_label,
      jsonb_build_object(
        'room_id', NEW.id,
        'room_number', NEW.room_number,
        'tenant_id', NEW.current_tenant_id,
        'rent_configured', (NEW.monthly_rent IS NOT NULL),
        'due_date', v_due_date,
        'amount_due', NEW.monthly_rent
      )
    );

    -- 2d. Log ledger creation if entry was inserted
    IF v_inserted > 0 THEN
      PERFORM c1_log_system_event(
        NEW.property_manager_id, 'RENT_LEDGER_AUTO_CREATED', v_property_label,
        jsonb_build_object(
          'room_id', NEW.id,
          'tenant_id', NEW.current_tenant_id,
          'due_date', v_due_date,
          'amount_due', NEW.monthly_rent,
          'status', v_status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;


-- ─── 2. Update trg_room_rent_configured to COALESCE rent_due_day ──────────

CREATE OR REPLACE FUNCTION public.trg_room_rent_configured()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_property_label text;
  v_due_day integer;
BEGIN
  IF NEW.current_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.monthly_rent IS NULL THEN RETURN NEW; END IF;
  IF OLD.monthly_rent IS NOT DISTINCT FROM NEW.monthly_rent
     AND OLD.rent_due_day IS NOT DISTINCT FROM NEW.rent_due_day THEN
    RETURN NEW;
  END IF;

  -- COALESCE: default to 1st if rent_due_day not set (matches trigger above)
  v_due_day := COALESCE(NEW.rent_due_day, 1);

  v_due_date := compute_rent_due_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    v_due_day
  );

  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  -- UPSERT: create entry or update existing unpaid entry with new rent config.
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO UPDATE SET
    amount_due = EXCLUDED.amount_due,
    status = CASE
      WHEN c1_rent_ledger.status IN ('paid', 'partial') THEN c1_rent_ledger.status
      ELSE EXCLUDED.status
    END
  WHERE c1_rent_ledger.status IN ('pending', 'overdue');

  -- Void stale entries from old rent config (e.g., due day changed from 1 to 15)
  PERFORM void_stale_rent_entries_for_room(NEW.id, NEW.current_tenant_id, v_due_date);

  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id, 'RENT_CONFIG_UPDATED', v_property_label,
    jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id, 'due_date', v_due_date,
      'new_amount', NEW.monthly_rent, 'old_amount', OLD.monthly_rent,
      'new_due_day', NEW.rent_due_day, 'old_due_day', OLD.rent_due_day)
  );

  RETURN NEW;
END;
$function$;


-- ─── 3. Strip tenant sync from RPCs ───────────────────────────────────────

-- 3a. room_assign_tenant: remove UPDATE c1_tenants (trigger handles it)
CREATE OR REPLACE FUNCTION public.room_assign_tenant(
  p_room_id uuid,
  p_tenant_id uuid,
  p_pm_id uuid,
  p_tenancy_start date,
  p_tenancy_end date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_room record;
  v_tenant record;
BEGIN
  -- Lock the room row to prevent concurrent assignment
  SELECT id, property_id, current_tenant_id, property_manager_id
  INTO v_room
  FROM c1_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
  IF v_room.property_manager_id != p_pm_id THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF v_room.current_tenant_id IS NOT NULL THEN RAISE EXCEPTION 'Room already occupied'; END IF;

  -- Validate tenant
  SELECT id, property_id, room_id
  INTO v_tenant
  FROM c1_tenants
  WHERE id = p_tenant_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found or access denied'; END IF;
  IF v_tenant.property_id != v_room.property_id THEN
    RAISE EXCEPTION 'Tenant must belong to the same property as the room';
  END IF;

  -- If tenant is already in another room, clear the old room
  -- (trigger will handle old tenant's room_id, pending cancellation, audit)
  IF v_tenant.room_id IS NOT NULL THEN
    UPDATE c1_rooms
    SET current_tenant_id = NULL,
        tenancy_start_date = NULL,
        tenancy_end_date = NULL
    WHERE id = v_tenant.room_id;
  END IF;

  -- Assign: ONLY update the room. Trigger handles tenant fields + ledger + audit.
  UPDATE c1_rooms
  SET current_tenant_id = p_tenant_id,
      tenancy_start_date = p_tenancy_start,
      tenancy_end_date = p_tenancy_end
  WHERE id = p_room_id;
END;
$$;


-- 3b. room_remove_tenant: remove UPDATE c1_tenants (trigger handles it)
CREATE OR REPLACE FUNCTION public.room_remove_tenant(
  p_room_id uuid,
  p_pm_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT current_tenant_id INTO v_tenant_id
  FROM c1_rooms
  WHERE id = p_room_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found or access denied'; END IF;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Room is already vacant'; END IF;

  -- ONLY update the room. Trigger handles:
  -- tenant.room_id = NULL, pending entries cancelled, audit logged.
  UPDATE c1_rooms
  SET current_tenant_id = NULL,
      tenancy_start_date = NULL,
      tenancy_end_date = NULL
  WHERE id = p_room_id;
END;
$$;


-- 3c. room_end_tenancy: remove UPDATE c1_tenants + inline ledger cancel (trigger handles both)
CREATE OR REPLACE FUNCTION public.room_end_tenancy(
  p_room_id uuid,
  p_pm_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_name text;
  v_room_number text;
  v_property_address text;
  v_tenancy_start date;
BEGIN
  SELECT r.current_tenant_id, r.room_number, r.tenancy_start_date,
         t.full_name, p.address
  INTO v_tenant_id, v_room_number, v_tenancy_start,
       v_tenant_name, v_property_address
  FROM c1_rooms r
  LEFT JOIN c1_tenants t ON t.id = r.current_tenant_id
  LEFT JOIN c1_properties p ON p.id = r.property_id
  WHERE r.id = p_room_id AND r.property_manager_id = p_pm_id
  FOR UPDATE OF r;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found or access denied'; END IF;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Room is already vacant'; END IF;

  -- ONLY update the room. Trigger handles:
  -- tenant.room_id = NULL, pending entries cancelled, TENANT_REMOVED_FROM_ROOM audit.
  -- We keep tenancy metadata (end date, status) for the room's own record.
  UPDATE c1_rooms
  SET current_tenant_id = NULL,
      tenancy_end_date = CURRENT_DATE,
      tenancy_status = 'inactive'
  WHERE id = p_room_id;

  -- Log TENANCY_ENDED (more specific than the trigger's generic TENANT_REMOVED)
  PERFORM c1_log_system_event(
    p_pm_id,
    'TENANCY_ENDED',
    v_property_address,
    jsonb_build_object(
      'room_id', p_room_id,
      'room_number', v_room_number,
      'tenant_id', v_tenant_id,
      'tenant_name', v_tenant_name,
      'tenancy_start', v_tenancy_start,
      'tenancy_end', CURRENT_DATE
    )
  );
END;
$$;


-- ─── 4. Backfill rent_due_day where NULL ──────────────────────────────────

UPDATE c1_rooms
SET rent_due_day = 1
WHERE monthly_rent IS NOT NULL
  AND rent_due_day IS NULL;
