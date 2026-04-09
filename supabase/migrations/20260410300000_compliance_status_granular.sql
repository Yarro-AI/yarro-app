-- ============================================================
-- PROTECTED RPC CHANGE: compliance_get_all_statuses + compliance_get_property_status
-- ============================================================
-- Safe Modification Protocol:
--   Backup: supabase/rollbacks/rollback_compliance_status_granular.sql
--   Approved by: Adam (compliance page state consistency with ticket drawer)
--
-- Changes:
--   Replace flat "renewal_requested" with granular ticket stage:
--     compliance_pending   → awaiting_dispatch
--     awaiting_contractor  → awaiting_contractor
--     awaiting_booking     → awaiting_booking
--     scheduled/booked     → renewal_scheduled (unchanged)
--     no_contractors       → no_contractors
--     manager_approval     → awaiting_approval
--     Other active ticket  → renewal_requested (fallback)
--
--   Return type unchanged — display_status is still text.
--   All consumers use StatusBadge which needs new badge styles.
-- ============================================================

-- ─── 1. compliance_get_all_statuses (SSOT) ──��──────────────────

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
    cert.property_id,
    p.address AS property_address,
    cert.certificate_type::text,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'incomplete'
      -- Ticket exists: use next_action_reason for granular status
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'compliance_pending' THEN 'awaiting_dispatch'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'awaiting_contractor' THEN 'awaiting_contractor'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'awaiting_booking' THEN 'awaiting_booking'
      WHEN t.id IS NOT NULL AND t.next_action_reason IN ('scheduled', 'awaiting_completion')
        THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'no_contractors' THEN 'no_contractors'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'manager_approval' THEN 'awaiting_approval'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      -- No ticket: date-based status
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
  FROM c1_compliance_certificates cert
  JOIN c1_properties p ON p.id = cert.property_id
  LEFT JOIN LATERAL (
    SELECT tk.id, tk.job_stage, tk.next_action_reason
    FROM c1_tickets tk
    WHERE tk.compliance_certificate_id = cert.id
      AND tk.status = 'open'
      AND tk.archived = false
    ORDER BY tk.date_logged DESC
    LIMIT 1
  ) t ON true
  WHERE cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ─── 2. compliance_get_property_status ─────────────────────────

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
    cert.certificate_type::text,
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 'incomplete'
      -- Ticket exists: use next_action_reason for granular status
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'compliance_pending' THEN 'awaiting_dispatch'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'awaiting_contractor' THEN 'awaiting_contractor'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'awaiting_booking' THEN 'awaiting_booking'
      WHEN t.id IS NOT NULL AND t.next_action_reason IN ('scheduled', 'awaiting_completion')
        THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL AND t.job_stage IN ('booked', 'scheduled') THEN 'renewal_scheduled'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'no_contractors' THEN 'no_contractors'
      WHEN t.id IS NOT NULL AND t.next_action_reason = 'manager_approval' THEN 'awaiting_approval'
      WHEN t.id IS NOT NULL THEN 'renewal_requested'
      -- No ticket: date-based status
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
  FROM c1_compliance_certificates cert
  LEFT JOIN LATERAL (
    SELECT tk.id, tk.job_stage, tk.next_action_reason
    FROM c1_tickets tk
    WHERE tk.compliance_certificate_id = cert.id
      AND tk.status = 'open'
      AND tk.archived = false
    ORDER BY tk.date_logged DESC
    LIMIT 1
  ) t ON true
  WHERE cert.property_id = p_property_id
    AND cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cert.document_url IS NULL OR cert.expiry_date IS NULL THEN 2
      WHEN cert.expiry_date < CURRENT_DATE THEN 3
      WHEN cert.expiry_date < CURRENT_DATE + interval '30 days' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;
