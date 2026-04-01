-- Onboarding blast: landlord verification columns, extended RPCs, batch token generation
-- Enables sending WhatsApp onboarding/verification messages to tenants, contractors, and landlords

-- ─── 1a. Add verification columns to c1_landlords ───────────────────────

ALTER TABLE public.c1_landlords
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_landlords_verification_token
  ON public.c1_landlords (verification_token)
  WHERE verification_token IS NOT NULL;


-- ─── 1b. Extend generate_verification_token to handle landlords ─────────
-- Original only handled 'tenant' and 'contractor'. Adding 'landlord' branch.
-- This RPC is NOT in core-rpcs — safe to extend.

CREATE OR REPLACE FUNCTION public.generate_verification_token(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_token text;
  v_pm_id uuid;
BEGIN
  v_pm_id := public.get_pm_id();
  IF v_pm_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated as a property manager';
  END IF;

  v_token := encode(gen_random_bytes(12), 'hex');

  IF p_entity_type = 'tenant' THEN
    UPDATE public.c1_tenants
    SET verification_token = v_token,
        verification_sent_at = now()
    WHERE id = p_entity_id
      AND property_manager_id = v_pm_id;
  ELSIF p_entity_type = 'contractor' THEN
    UPDATE public.c1_contractors
    SET verification_token = v_token,
        verification_sent_at = now()
    WHERE id = p_entity_id
      AND property_manager_id = v_pm_id;
  ELSIF p_entity_type = 'landlord' THEN
    UPDATE public.c1_landlords
    SET verification_token = v_token,
        verification_sent_at = now()
    WHERE id = p_entity_id
      AND property_manager_id = v_pm_id;
  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entity not found or not owned by current PM';
  END IF;

  RETURN v_token;
END;
$$;


-- ─── 1c. Extend verify_entity to handle landlords ──────────────────────
-- Original only checked tenants and contractors. Adding landlord lookup.

CREATE OR REPLACE FUNCTION public.verify_entity(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Try tenants first
  UPDATE public.c1_tenants
  SET verified_at = now(),
      verified_by = COALESCE(verified_by, 'verification_link')
  WHERE verification_token = p_token
    AND verified_at IS NULL
  RETURNING jsonb_build_object(
    'entity_type', 'tenant',
    'name', full_name,
    'business_name', (
      SELECT pm.business_name
      FROM public.c1_property_managers pm
      WHERE pm.id = c1_tenants.property_manager_id
    )
  ) INTO v_result;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Try contractors
  UPDATE public.c1_contractors
  SET verified_at = now(),
      verified_by = 'verification_link'
  WHERE verification_token = p_token
    AND verified_at IS NULL
  RETURNING jsonb_build_object(
    'entity_type', 'contractor',
    'name', contractor_name,
    'business_name', (
      SELECT pm.business_name
      FROM public.c1_property_managers pm
      WHERE pm.id = c1_contractors.property_manager_id
    )
  ) INTO v_result;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Try landlords
  UPDATE public.c1_landlords
  SET verified_at = now(),
      verified_by = 'verification_link'
  WHERE verification_token = p_token
    AND verified_at IS NULL
  RETURNING jsonb_build_object(
    'entity_type', 'landlord',
    'name', full_name,
    'business_name', (
      SELECT pm.business_name
      FROM public.c1_property_managers pm
      WHERE pm.id = c1_landlords.property_manager_id
    )
  ) INTO v_result;

  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- Token not found or already verified
  RETURN jsonb_build_object('error', 'Invalid or already used verification link');
END;
$$;


-- ─── 1d. Batch token generation (service-role safe) ─────────────────────
-- Called by yarro-onboarding-send edge function (service role, no user JWT).
-- Takes p_pm_id explicitly instead of using get_pm_id().

CREATE OR REPLACE FUNCTION public.generate_verification_tokens_batch(
  p_entity_type text,
  p_entity_ids uuid[],
  p_pm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_results jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  -- Validate PM exists
  IF NOT EXISTS (SELECT 1 FROM public.c1_property_managers WHERE id = p_pm_id) THEN
    RAISE EXCEPTION 'Property manager not found: %', p_pm_id;
  END IF;

  FOREACH v_id IN ARRAY p_entity_ids LOOP
    v_token := encode(gen_random_bytes(12), 'hex');

    IF p_entity_type = 'tenant' THEN
      UPDATE public.c1_tenants
      SET verification_token = v_token,
          verification_sent_at = now()
      WHERE id = v_id
        AND property_manager_id = p_pm_id
        AND verified_at IS NULL  -- skip already verified
      RETURNING id, full_name AS name, phone INTO v_row;

    ELSIF p_entity_type = 'contractor' THEN
      UPDATE public.c1_contractors
      SET verification_token = v_token,
          verification_sent_at = now()
      WHERE id = v_id
        AND property_manager_id = p_pm_id
        AND verified_at IS NULL
      RETURNING id, contractor_name AS name, contractor_phone AS phone INTO v_row;

    ELSIF p_entity_type = 'landlord' THEN
      UPDATE public.c1_landlords
      SET verification_token = v_token,
          verification_sent_at = now()
      WHERE id = v_id
        AND property_manager_id = p_pm_id
        AND verified_at IS NULL
      RETURNING id, full_name AS name, phone INTO v_row;

    ELSE
      RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
    END IF;

    IF v_row IS NOT NULL THEN
      v_results := v_results || jsonb_build_object(
        'id', v_row.id,
        'name', v_row.name,
        'phone', v_row.phone,
        'token', v_token,
        'status', CASE WHEN v_row.phone IS NULL OR v_row.phone = '' THEN 'skipped_no_phone' ELSE 'ready' END
      );
    ELSE
      -- Entity not found, not owned by PM, or already verified
      v_results := v_results || jsonb_build_object(
        'id', v_id,
        'name', null,
        'phone', null,
        'token', null,
        'status', 'skipped_not_found_or_verified'
      );
    END IF;
  END LOOP;

  RETURN v_results;
END;
$$;


-- ─── 1e. Get onboarding send targets ───────────────────────────────────
-- Returns entities eligible for onboarding messages (have phone, not yet sent).

CREATE OR REPLACE FUNCTION public.get_onboarding_send_targets(
  p_pm_id uuid,
  p_entity_type text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_results jsonb;
BEGIN
  IF p_entity_type = 'tenant' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id,
      'name', t.full_name,
      'phone', t.phone,
      'verification_sent_at', t.verification_sent_at,
      'verified_at', t.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_tenants t
    WHERE t.property_manager_id = p_pm_id
      AND t.phone IS NOT NULL
      AND t.phone != ''
      AND t.verification_sent_at IS NULL;

  ELSIF p_entity_type = 'contractor' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.contractor_name,
      'phone', c.contractor_phone,
      'verification_sent_at', c.verification_sent_at,
      'verified_at', c.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_contractors c
    WHERE c.property_manager_id = p_pm_id
      AND c.contractor_phone IS NOT NULL
      AND c.contractor_phone != ''
      AND c.verification_sent_at IS NULL;

  ELSIF p_entity_type = 'landlord' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'name', l.full_name,
      'phone', l.phone,
      'verification_sent_at', l.verification_sent_at,
      'verified_at', l.verified_at
    )), '[]'::jsonb)
    INTO v_results
    FROM public.c1_landlords l
    WHERE l.property_manager_id = p_pm_id
      AND l.phone IS NOT NULL
      AND l.phone != ''
      AND l.verification_sent_at IS NULL;

  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
  END IF;

  RETURN v_results;
END;
$$;
