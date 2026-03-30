-- Update compliance_get_summary to account for verification status
-- 'valid' now only counts certs that are verified AND not expired/expiring
-- 'review' counts certs with info but not yet verified

CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'expired',  COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE),
    'expiring', COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE AND expiry_date < CURRENT_DATE + interval '30 days'),
    'valid',    COUNT(*) FILTER (WHERE expiry_date >= CURRENT_DATE + interval '30 days' AND status = 'verified'),
    'review',   COUNT(*) FILTER (WHERE status != 'verified' AND (expiry_date >= CURRENT_DATE + interval '30 days' OR expiry_date IS NULL) AND (document_url IS NOT NULL OR expiry_date IS NOT NULL)),
    'missing',  COUNT(*) FILTER (WHERE expiry_date IS NULL AND document_url IS NULL),
    'total',    COUNT(*)
  )
  FROM c1_compliance_certificates
  WHERE property_manager_id = p_pm_id;
$$;
