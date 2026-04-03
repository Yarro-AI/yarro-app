-- =============================================================
-- Split renewal_scheduled into renewal_requested + renewal_scheduled
--
-- renewal_requested: dispatch sent, contractor hasn't booked yet
-- renewal_scheduled: contractor has booked/scheduled the renewal
--
-- Affects: compliance_get_all_statuses, compliance_get_property_status,
--          compliance_get_summary (aggregates from get_all_statuses)
-- =============================================================

-- ─── 1. compliance_get_all_statuses — SSOT ──────────────────────────────

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
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'missing'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
      ELSE 'valid'
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
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ─── 2. compliance_get_property_status ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.compliance_get_property_status(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  certificate_type text,
  display_status text,
  expiry_date date,
  days_remaining integer,
  cert_id uuid,
  issued_by text,
  certificate_number text,
  document_url text,
  renewal_ticket_id uuid,
  reminder_days_before integer,
  contractor_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    req.certificate_type::text,
    CASE
      WHEN cert.id IS NULL THEN 'missing'
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'missing'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      WHEN cert.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
      ELSE 'valid'
    END AS display_status,
    cert.expiry_date,
    CASE
      WHEN cert.expiry_date IS NOT NULL THEN (cert.expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END AS days_remaining,
    cert.id AS cert_id,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id,
    cert.reminder_days_before,
    cert.contractor_id
  FROM c1_compliance_requirements req
  LEFT JOIN c1_compliance_certificates cert
    ON cert.property_id = req.property_id
    AND cert.certificate_type = req.certificate_type
    AND cert.property_manager_id = req.property_manager_id
  LEFT JOIN c1_tickets t
    ON t.compliance_certificate_id = cert.id
    AND t.status = 'open'
    AND t.archived = false
  WHERE req.property_id = p_property_id
    AND req.property_manager_id = p_pm_id
    AND req.is_required = true
  ORDER BY
    CASE
      WHEN cert.id IS NULL THEN 1
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ─── 3. compliance_get_summary — add renewal_requested count ────────────

CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH statuses AS (
    SELECT * FROM compliance_get_all_statuses(p_pm_id)
  ),
  property_compliance AS (
    SELECT
      property_id,
      CASE
        WHEN COUNT(*) FILTER (
          WHERE display_status IN ('missing', 'expired', 'expiring_soon', 'review')
        ) = 0 THEN true
        ELSE false
      END AS is_compliant
    FROM statuses
    GROUP BY property_id
  )
  SELECT json_build_object(
    'actions_needed',
      (SELECT COUNT(*) FROM statuses WHERE display_status IN ('missing', 'expired', 'expiring_soon', 'review')),
    'expired',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expired'),
    'expiring_soon',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expiring_soon'),
    'review',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'review'),
    'missing',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'missing'),
    'renewal_requested',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'renewal_requested'),
    'renewal_scheduled',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'renewal_scheduled'),
    'valid',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'valid'),
    'compliant_properties',
      (SELECT COUNT(*) FROM property_compliance WHERE is_compliant = true),
    'total_properties',
      (SELECT COUNT(DISTINCT property_id) FROM statuses),
    'total_required',
      (SELECT COUNT(*) FROM statuses)
  );
$$;
