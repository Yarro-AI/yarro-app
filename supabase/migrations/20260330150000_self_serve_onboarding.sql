-- Self-serve onboarding: trial gating + verification tokens
-- Enables public signup with 14-day free trial and phone verification for tenants/contractors

-- Trial columns on c1_property_managers
ALTER TABLE public.c1_property_managers
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz DEFAULT now() + interval '14 days',
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Verification columns on c1_tenants (already has verified_by)
ALTER TABLE public.c1_tenants
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Verification columns on c1_contractors (no verified_by yet)
ALTER TABLE public.c1_contractors
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Unique index on verification tokens for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_verification_token
  ON public.c1_tenants (verification_token)
  WHERE verification_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_verification_token
  ON public.c1_contractors (verification_token)
  WHERE verification_token IS NOT NULL;

-- RPC: generate a verification token for a tenant or contractor
CREATE OR REPLACE FUNCTION public.generate_verification_token(
  p_entity_type text,  -- 'tenant' or 'contractor'
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
  ELSE
    RAISE EXCEPTION 'Invalid entity type: %', p_entity_type;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entity not found or not owned by current PM';
  END IF;

  RETURN v_token;
END;
$$;

-- RPC: verify an entity via token (called from public verification page, no auth required)
CREATE OR REPLACE FUNCTION public.verify_entity(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_entity_type text;
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

  -- Token not found or already verified
  RETURN jsonb_build_object('error', 'Invalid or already used verification link');
END;
$$;
