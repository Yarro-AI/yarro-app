-- ============================================================
-- Compliance RPCs — moves business logic from frontend to DB
-- ============================================================

-- 1. Get certificates for a property, with computed status
-- Returns rows with a `status` field: 'valid', 'expiring', 'expired', 'missing'
CREATE OR REPLACE FUNCTION public.compliance_get_certificates(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  id uuid,
  property_id uuid,
  property_manager_id uuid,
  certificate_type text,
  issued_date date,
  expiry_date date,
  certificate_number text,
  issued_by text,
  document_url text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  status text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.property_id,
    c.property_manager_id,
    c.certificate_type::text,
    c.issued_date,
    c.expiry_date,
    c.certificate_number,
    c.issued_by,
    c.document_url,
    c.notes,
    c.created_at,
    c.updated_at,
    CASE
      WHEN c.expiry_date IS NULL THEN 'missing'
      WHEN c.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN c.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring'
      ELSE 'valid'
    END AS status
  FROM c1_compliance_certificates c
  WHERE c.property_id = p_property_id
    AND c.property_manager_id = p_pm_id
  ORDER BY c.expiry_date ASC NULLS FIRST;
$$;

-- 2. Upsert a certificate (replaces existing cert of same type for same property)
CREATE OR REPLACE FUNCTION public.compliance_upsert_certificate(
  p_property_id uuid,
  p_pm_id uuid,
  p_certificate_type text,
  p_issued_date date DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_certificate_number text DEFAULT NULL,
  p_issued_by text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  -- Delete existing certificate of same type for this property (upsert behavior)
  DELETE FROM c1_compliance_certificates
  WHERE property_id = p_property_id
    AND property_manager_id = p_pm_id
    AND certificate_type = p_certificate_type::public.certificate_type;

  -- Insert new certificate
  INSERT INTO c1_compliance_certificates (
    property_id,
    property_manager_id,
    certificate_type,
    issued_date,
    expiry_date,
    certificate_number,
    issued_by,
    notes
  ) VALUES (
    p_property_id,
    p_pm_id,
    p_certificate_type::public.certificate_type,
    p_issued_date,
    p_expiry_date,
    p_certificate_number,
    p_issued_by,
    p_notes
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 3. Delete a certificate (with ownership check)
CREATE OR REPLACE FUNCTION public.compliance_delete_certificate(
  p_cert_id uuid,
  p_pm_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_deleted boolean;
BEGIN
  DELETE FROM c1_compliance_certificates
  WHERE id = p_cert_id
    AND property_manager_id = p_pm_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 4. Dashboard summary — counts by status across all properties for a PM
CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'expired', COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE),
    'expiring', COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date < CURRENT_DATE + interval '30 days'),
    'valid', COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE + interval '30 days'),
    'missing', COUNT(*) FILTER (WHERE expiry_date IS NULL),
    'total', COUNT(*)
  )
  FROM c1_compliance_certificates
  WHERE property_manager_id = p_pm_id;
$$;
