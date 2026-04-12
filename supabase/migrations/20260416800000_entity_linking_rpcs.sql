-- Migration C: Entity Linking RPCs
--
-- Replace direct .from().update() calls with RPCs that include
-- ownership checks and audit events.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Link tenant to property
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_link_tenant_to_property(
  p_tenant_id uuid,
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_name text;
  v_property_label text;
BEGIN
  -- Ownership check
  IF NOT EXISTS (SELECT 1 FROM c1_tenants WHERE id = p_tenant_id AND property_manager_id = p_pm_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tenant not found or access denied');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM c1_properties WHERE id = p_property_id AND property_manager_id = p_pm_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Property not found or access denied');
  END IF;

  UPDATE c1_tenants SET property_id = p_property_id WHERE id = p_tenant_id;

  SELECT full_name INTO v_tenant_name FROM c1_tenants WHERE id = p_tenant_id;
  SELECT address INTO v_property_label FROM c1_properties WHERE id = p_property_id;

  PERFORM c1_log_system_event(
    p_pm_id, 'TENANT_LINKED_TO_PROPERTY', v_property_label,
    jsonb_build_object('tenant_id', p_tenant_id, 'tenant_name', v_tenant_name, 'property_id', p_property_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Unlink tenant from property
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_unlink_tenant_from_property(
  p_tenant_id uuid,
  p_pm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_name text;
  v_property_label text;
  v_property_id uuid;
BEGIN
  SELECT property_id, full_name INTO v_property_id, v_tenant_name
  FROM c1_tenants WHERE id = p_tenant_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tenant not found or access denied');
  END IF;

  SELECT address INTO v_property_label FROM c1_properties WHERE id = v_property_id;

  UPDATE c1_tenants SET property_id = NULL WHERE id = p_tenant_id;

  PERFORM c1_log_system_event(
    p_pm_id, 'TENANT_UNLINKED_FROM_PROPERTY', v_property_label,
    jsonb_build_object('tenant_id', p_tenant_id, 'tenant_name', v_tenant_name, 'property_id', v_property_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Toggle contractor on/off a property
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_toggle_contractor_property(
  p_contractor_id uuid,
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_current_ids uuid[];
  v_is_linked boolean;
  v_contractor_name text;
  v_property_label text;
  v_event_type text;
BEGIN
  -- Ownership check
  SELECT property_ids, contractor_name INTO v_current_ids, v_contractor_name
  FROM c1_contractors WHERE id = p_contractor_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Contractor not found or access denied');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM c1_properties WHERE id = p_property_id AND property_manager_id = p_pm_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Property not found or access denied');
  END IF;

  v_current_ids := COALESCE(v_current_ids, '{}');
  v_is_linked := p_property_id = ANY(v_current_ids);

  IF v_is_linked THEN
    -- Remove
    UPDATE c1_contractors SET property_ids = array_remove(v_current_ids, p_property_id)
    WHERE id = p_contractor_id;
    v_event_type := 'CONTRACTOR_UNLINKED_FROM_PROPERTY';
  ELSE
    -- Add
    UPDATE c1_contractors SET property_ids = v_current_ids || p_property_id
    WHERE id = p_contractor_id;
    v_event_type := 'CONTRACTOR_LINKED_TO_PROPERTY';
  END IF;

  SELECT address INTO v_property_label FROM c1_properties WHERE id = p_property_id;

  PERFORM c1_log_system_event(
    p_pm_id, v_event_type, v_property_label,
    jsonb_build_object('contractor_id', p_contractor_id, 'contractor_name', v_contractor_name, 'property_id', p_property_id)
  );

  RETURN jsonb_build_object('ok', true, 'linked', NOT v_is_linked);
END;
$function$;
