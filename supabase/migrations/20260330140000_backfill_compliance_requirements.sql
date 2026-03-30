-- ============================================================
-- Backfill: fix property_type NULLs + populate missing requirements
-- Also adds compliance_set_property_type RPC for atomic type changes
-- ============================================================

-- 1. Fix NULLs — existing properties default to HMO
UPDATE c1_properties SET property_type = 'hmo' WHERE property_type IS NULL;

-- 2. Backfill requirements for HMO properties missing them
INSERT INTO c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
SELECT p.id, p.property_manager_id, ct.cert_type, true
FROM c1_properties p
CROSS JOIN (VALUES
  ('hmo_license'::public.certificate_type),
  ('gas_safety'::public.certificate_type),
  ('eicr'::public.certificate_type),
  ('epc'::public.certificate_type),
  ('fire_risk'::public.certificate_type),
  ('pat'::public.certificate_type),
  ('legionella'::public.certificate_type),
  ('smoke_alarms'::public.certificate_type),
  ('co_alarms'::public.certificate_type)
) AS ct(cert_type)
WHERE p.property_type = 'hmo'
AND NOT EXISTS (
  SELECT 1 FROM c1_compliance_requirements cr
  WHERE cr.property_id = p.id AND cr.certificate_type = ct.cert_type
)
ON CONFLICT (property_id, certificate_type) DO NOTHING;

-- 3. Backfill requirements for single_let properties missing them
INSERT INTO c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
SELECT p.id, p.property_manager_id, ct.cert_type, true
FROM c1_properties p
CROSS JOIN (VALUES
  ('gas_safety'::public.certificate_type),
  ('eicr'::public.certificate_type),
  ('epc'::public.certificate_type),
  ('smoke_alarms'::public.certificate_type),
  ('co_alarms'::public.certificate_type)
) AS ct(cert_type)
WHERE p.property_type = 'single_let'
AND NOT EXISTS (
  SELECT 1 FROM c1_compliance_requirements cr
  WHERE cr.property_id = p.id AND cr.certificate_type = ct.cert_type
)
ON CONFLICT (property_id, certificate_type) DO NOTHING;

-- 4. RPC: Set property type + sync default requirements atomically
CREATE OR REPLACE FUNCTION public.compliance_set_property_type(
  p_property_id uuid,
  p_pm_id uuid,
  p_property_type text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cert_types public.certificate_type[];
BEGIN
  -- Validate property belongs to PM
  IF NOT EXISTS (
    SELECT 1 FROM c1_properties
    WHERE id = p_property_id AND property_manager_id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'Property not found or does not belong to PM';
  END IF;

  -- Update property type
  UPDATE c1_properties SET property_type = p_property_type
  WHERE id = p_property_id AND property_manager_id = p_pm_id;

  -- Determine default cert types for this property type
  IF p_property_type = 'single_let' THEN
    v_cert_types := ARRAY[
      'gas_safety', 'eicr', 'epc', 'smoke_alarms', 'co_alarms'
    ]::public.certificate_type[];
  ELSE
    -- Default: HMO
    v_cert_types := ARRAY[
      'hmo_license', 'gas_safety', 'eicr', 'epc', 'fire_risk',
      'pat', 'legionella', 'smoke_alarms', 'co_alarms'
    ]::public.certificate_type[];
  END IF;

  -- Upsert defaults — adds new required types, doesn't remove existing overrides
  INSERT INTO c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
  SELECT p_property_id, p_pm_id, unnest(v_cert_types), true
  ON CONFLICT (property_id, certificate_type)
  DO UPDATE SET is_required = true;
END;
$$;
