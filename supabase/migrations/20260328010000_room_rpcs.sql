-- ============================================================
-- Room RPCs — CRUD + tenant assignment for c1_rooms
-- ============================================================
-- All room business logic lives here. Frontend calls these RPCs
-- and never writes to c1_rooms or c1_tenants.room_id directly.

-- 1. Get all rooms for a property, with tenant name
CREATE OR REPLACE FUNCTION public.get_rooms_for_property(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  room_number text,
  room_name text,
  floor text,
  current_tenant_id uuid,
  tenant_name text,
  tenancy_start_date date,
  tenancy_end_date date,
  monthly_rent numeric,
  rent_due_day integer,
  rent_frequency text,
  is_vacant boolean,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    r.id,
    r.property_id,
    r.room_number,
    r.room_name,
    r.floor,
    r.current_tenant_id,
    t.full_name AS tenant_name,
    r.tenancy_start_date,
    r.tenancy_end_date,
    r.monthly_rent,
    r.rent_due_day,
    r.rent_frequency,
    r.is_vacant,
    r.created_at
  FROM c1_rooms r
  LEFT JOIN c1_tenants t ON t.id = r.current_tenant_id
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
  ORDER BY r.room_number;
$$;

-- 2. Create or update a room
CREATE OR REPLACE FUNCTION public.room_upsert(
  p_pm_id uuid,
  p_property_id uuid,
  p_room_number text,
  p_room_name text DEFAULT NULL,
  p_floor text DEFAULT NULL,
  p_monthly_rent numeric DEFAULT NULL,
  p_rent_due_day integer DEFAULT NULL,
  p_rent_frequency text DEFAULT 'monthly',
  p_room_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validate rent_due_day if provided
  IF p_rent_due_day IS NOT NULL AND (p_rent_due_day < 1 OR p_rent_due_day > 28) THEN
    RAISE EXCEPTION 'Rent due day must be between 1 and 28';
  END IF;

  -- Validate rent_frequency
  IF p_rent_frequency NOT IN ('monthly', 'weekly') THEN
    RAISE EXCEPTION 'Rent frequency must be monthly or weekly';
  END IF;

  -- Validate monthly_rent if provided
  IF p_monthly_rent IS NOT NULL AND p_monthly_rent < 0 THEN
    RAISE EXCEPTION 'Monthly rent cannot be negative';
  END IF;

  IF p_room_id IS NULL THEN
    -- INSERT new room
    INSERT INTO c1_rooms (
      property_manager_id,
      property_id,
      room_number,
      room_name,
      floor,
      monthly_rent,
      rent_due_day,
      rent_frequency
    ) VALUES (
      p_pm_id,
      p_property_id,
      p_room_number,
      p_room_name,
      p_floor,
      p_monthly_rent,
      p_rent_due_day,
      p_rent_frequency
    )
    RETURNING id INTO v_id;
  ELSE
    -- UPDATE existing room (with ownership check)
    UPDATE c1_rooms SET
      room_number = p_room_number,
      room_name = p_room_name,
      floor = p_floor,
      monthly_rent = p_monthly_rent,
      rent_due_day = p_rent_due_day,
      rent_frequency = p_rent_frequency
    WHERE id = p_room_id
      AND property_manager_id = p_pm_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Room not found or access denied';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

-- 3. Delete a room (blocked if tenant assigned)
CREATE OR REPLACE FUNCTION public.room_delete(
  p_room_id uuid,
  p_pm_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_deleted integer;
BEGIN
  -- Check if room has a tenant
  SELECT current_tenant_id INTO v_tenant_id
  FROM c1_rooms
  WHERE id = p_room_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or access denied';
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Remove tenant from room before deleting';
  END IF;

  DELETE FROM c1_rooms
  WHERE id = p_room_id AND property_manager_id = p_pm_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- 4. Assign a tenant to a room (updates both sides in one transaction)
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  IF v_room.property_manager_id != p_pm_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_room.current_tenant_id IS NOT NULL THEN
    RAISE EXCEPTION 'Room already occupied';
  END IF;

  -- Validate tenant
  SELECT id, property_id, room_id
  INTO v_tenant
  FROM c1_tenants
  WHERE id = p_tenant_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found or access denied';
  END IF;

  IF v_tenant.property_id != v_room.property_id THEN
    RAISE EXCEPTION 'Tenant must belong to the same property as the room';
  END IF;

  -- If tenant is already in another room, clear the old assignment
  IF v_tenant.room_id IS NOT NULL THEN
    UPDATE c1_rooms
    SET current_tenant_id = NULL,
        tenancy_start_date = NULL,
        tenancy_end_date = NULL
    WHERE id = v_tenant.room_id;
  END IF;

  -- Assign: update both sides
  UPDATE c1_rooms
  SET current_tenant_id = p_tenant_id,
      tenancy_start_date = p_tenancy_start,
      tenancy_end_date = p_tenancy_end
  WHERE id = p_room_id;

  UPDATE c1_tenants
  SET room_id = p_room_id
  WHERE id = p_tenant_id;
END;
$$;

-- 5. Remove a tenant from a room (clears both sides)
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
  -- Get current tenant with ownership check
  SELECT current_tenant_id INTO v_tenant_id
  FROM c1_rooms
  WHERE id = p_room_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found or access denied';
  END IF;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Room is already vacant';
  END IF;

  -- Clear both sides
  UPDATE c1_tenants
  SET room_id = NULL
  WHERE id = v_tenant_id;

  UPDATE c1_rooms
  SET current_tenant_id = NULL,
      tenancy_start_date = NULL,
      tenancy_end_date = NULL
  WHERE id = p_room_id;
END;
$$;
