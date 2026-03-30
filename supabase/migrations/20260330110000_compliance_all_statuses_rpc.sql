-- ============================================================
-- compliance_get_all_statuses — cross-property compliance view
-- Returns all required certs with computed display_status for a PM
-- ============================================================

CREATE OR REPLACE FUNCTION public.compliance_get_all_statuses(
  p_pm_id uuid
)
RETURNS TABLE (
  cert_id uuid,
  property_id uuid,
  property_address text,
  certificate_type text,
  display_status text,
  expiry_date date,
  days_remaining integer,
  issued_date date,
  issued_by text,
  certificate_number text,
  document_url text,
  renewal_ticket_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    cert.id AS cert_id,
    req.property_id,
    p.address AS property_address,
    req.certificate_type::text,
    CASE
      WHEN cert.id IS NULL THEN 'missing'
      WHEN cert.expiry_date IS NULL AND cert.document_url IS NULL AND cert.issued_by IS NULL THEN 'missing'
      WHEN cert.status = 'verified' THEN
        CASE
          WHEN cert.expiry_date < CURRENT_DATE THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expired' END
          WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expiring_soon' END
          ELSE 'valid'
        END
      WHEN cert.expiry_date IS NOT NULL THEN
        CASE
          WHEN cert.expiry_date < CURRENT_DATE THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expired' END
          WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN
            CASE WHEN t.id IS NOT NULL THEN 'renewal_scheduled' ELSE 'expiring_soon' END
          ELSE 'review'
        END
      ELSE 'review'
    END AS display_status,
    cert.expiry_date,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining,
    cert.issued_date,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id
  FROM c1_compliance_requirements req
  JOIN c1_properties p ON p.id = req.property_id
  LEFT JOIN c1_compliance_certificates cert
    ON cert.property_id = req.property_id
    AND cert.certificate_type = req.certificate_type
    AND cert.property_manager_id = req.property_manager_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE req.property_manager_id = p_pm_id
    AND req.is_required = true
  ORDER BY
    CASE
      WHEN cert.id IS NULL THEN 1
      WHEN cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;
