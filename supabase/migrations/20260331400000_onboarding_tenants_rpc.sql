-- ============================================================
-- Onboarding RPC — Batch create tenants and assign to rooms
-- Also updates checklist link to point to /tenants
-- ============================================================

-- Create tenants in batch and assign each to their room
CREATE OR REPLACE FUNCTION public.onboarding_create_tenants(
  p_pm_id uuid,
  p_property_id uuid,
  p_tenants jsonb  -- array of { room_id, name, phone, email }
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
  v_tenant record;
  v_created int := 0;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Verify property belongs to PM
  IF NOT EXISTS (
    SELECT 1 FROM c1_properties WHERE id = p_property_id AND property_manager_id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'Property not found';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_tenants)
  LOOP
    -- Create tenant with room_id set
    INSERT INTO c1_tenants (
      full_name, phone, email, property_id, property_manager_id, room_id
    ) VALUES (
      v_item->>'name',
      v_item->>'phone',
      v_item->>'email',
      p_property_id,
      p_pm_id,
      (v_item->>'room_id')::uuid
    )
    RETURNING * INTO v_tenant;

    -- Assign tenant to room (both sides of relationship)
    UPDATE c1_rooms
    SET current_tenant_id = v_tenant.id,
        tenancy_start_date = CURRENT_DATE
    WHERE id = (v_item->>'room_id')::uuid
      AND property_manager_id = p_pm_id;

    v_created := v_created + 1;
  END LOOP;

  RETURN json_build_object('created', v_created);
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_create_tenants TO authenticated;

-- Update the checklist RPC to link tenants to /tenants instead of property people tab
CREATE OR REPLACE FUNCTION public.c1_get_onboarding_checklist(p_pm_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_property_id uuid;
  v_tenant_count int;
  v_contractor_count int;
  v_cert_count int;
  v_all_done boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id INTO v_first_property_id
  FROM c1_properties
  WHERE property_manager_id = p_pm_id
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT count(*) INTO v_tenant_count
  FROM c1_tenants WHERE property_manager_id = p_pm_id;

  SELECT count(*) INTO v_contractor_count
  FROM c1_contractors WHERE property_manager_id = p_pm_id;

  SELECT count(*) INTO v_cert_count
  FROM c1_compliance_certificates WHERE property_manager_id = p_pm_id;

  v_all_done := (v_tenant_count > 0 AND v_contractor_count > 0 AND v_cert_count > 0);

  IF v_all_done THEN
    UPDATE c1_property_managers
    SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
    WHERE id = p_pm_id;
  END IF;

  RETURN json_build_array(
    json_build_object(
      'key', 'add_tenants',
      'label', 'Add your tenants',
      'description', 'Assign tenants to rooms',
      'complete', v_tenant_count > 0,
      'count', v_tenant_count,
      'link_href', '/tenants'
    ),
    json_build_object(
      'key', 'add_contractors',
      'label', 'Add a contractor',
      'description', 'So Yarro can dispatch repairs',
      'complete', v_contractor_count > 0,
      'count', v_contractor_count,
      'link_href', '/contractors'
    ),
    json_build_object(
      'key', 'setup_compliance',
      'label', 'Set up compliance',
      'description', 'Upload certificates and set expiry dates',
      'complete', v_cert_count > 0,
      'count', v_cert_count,
      'link_href', CASE
        WHEN v_first_property_id IS NOT NULL
        THEN '/properties/' || v_first_property_id || '?tab=compliance'
        ELSE '/compliance'
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.c1_get_onboarding_checklist TO authenticated;
