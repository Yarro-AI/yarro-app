-- ============================================================
-- Onboarding RPCs — Account + Property creation
-- Card-based onboarding flow for new operators
-- ============================================================

-- ─── New columns on c1_property_managers ────────────────────
ALTER TABLE c1_property_managers
  ADD COLUMN IF NOT EXISTS preferred_contact_method text DEFAULT 'whatsapp';

ALTER TABLE c1_property_managers
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'manager';

-- ─── RPC 1: Create account (PM record) ─────────────────────
CREATE OR REPLACE FUNCTION public.onboarding_create_account(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_preferred_contact text DEFAULT 'whatsapp',
  p_business_name text DEFAULT '',
  p_role text DEFAULT 'manager'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pm record;
BEGIN
  -- Check if PM already exists for this user
  SELECT * INTO v_pm FROM c1_property_managers WHERE user_id = p_user_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Account already exists for this user';
  END IF;

  INSERT INTO c1_property_managers (
    user_id, name, email, phone,
    preferred_contact_method, business_name, role,
    subscription_status, trial_starts_at, trial_ends_at
  ) VALUES (
    p_user_id, p_name, p_email, p_phone,
    p_preferred_contact, p_business_name, p_role,
    'trialing', now(), now() + interval '14 days'
  )
  RETURNING * INTO v_pm;

  RETURN row_to_json(v_pm);
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_create_account TO authenticated;

-- ─── RPC 2: Create property + rooms + compliance ───────────
CREATE OR REPLACE FUNCTION public.onboarding_create_property(
  p_pm_id uuid,
  p_address text,
  p_city text,
  p_postcode text,
  p_room_count int DEFAULT 1,
  p_property_type text DEFAULT 'hmo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_property record;
  v_i int;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Insert property
  INSERT INTO c1_properties (
    address, city, property_manager_id, property_type
  ) VALUES (
    p_address, p_city, p_pm_id, p_property_type
  )
  RETURNING * INTO v_property;

  -- Create rooms (Room 1, Room 2, etc.)
  FOR v_i IN 1..GREATEST(p_room_count, 0) LOOP
    INSERT INTO c1_rooms (
      property_id, property_manager_id, room_number, room_name
    ) VALUES (
      v_property.id, p_pm_id, v_i, 'Room ' || v_i
    );
  END LOOP;

  -- Seed compliance requirements based on property type
  PERFORM compliance_set_property_type(v_property.id, p_pm_id, p_property_type);

  RETURN row_to_json(v_property);
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_create_property TO authenticated;
