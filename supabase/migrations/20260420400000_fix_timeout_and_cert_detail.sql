-- ============================================================
-- FIX: compute_is_past_timeout signature + compliance_get_cert_detail missing field
-- ============================================================
-- Bug 1: compute_is_past_timeout declares p_scheduled_date as DATE but
--   c1_tickets.scheduled_date is TIMESTAMPTZ. PostgreSQL can't find the
--   function → c1_ticket_detail and c1_get_dashboard_todo both fail.
-- Bug 2: compliance_get_cert_detail doesn't return property_manager_id →
--   cert detail page can't update document_url.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Fix compute_is_past_timeout — change p_scheduled_date from date to timestamptz
-- ═══════════════════════════════════════════════════════════════

-- Drop old signature (date param)
DROP FUNCTION IF EXISTS public.compute_is_past_timeout(text, text, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, date, uuid);

CREATE OR REPLACE FUNCTION public.compute_is_past_timeout(
  p_next_action text,
  p_next_action_reason text,
  p_contractor_sent_at timestamptz,
  p_waiting_since timestamptz,
  p_date_logged timestamptz,
  p_landlord_allocated_at timestamptz,
  p_ooh_dispatched_at timestamptz,
  p_tenant_contacted_at timestamptz,
  p_scheduled_date timestamptz,   -- was: date
  p_pm_id uuid
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_contractor_timeout_mins integer;
  v_landlord_timeout_hrs numeric;
BEGIN
  -- Not waiting = not timed out
  IF p_next_action != 'waiting' THEN RETURN false; END IF;

  -- Read PM settings once
  SELECT
    COALESCE(pm.contractor_timeout_minutes, 360),
    COALESCE(pm.landlord_timeout_hours, 48)
  INTO v_contractor_timeout_mins, v_landlord_timeout_hrs
  FROM c1_property_managers pm
  WHERE pm.id = p_pm_id;

  RETURN CASE
    -- Contractor: use PM's contractor_timeout_minutes (default 6h / 360 min)
    WHEN p_next_action_reason = 'awaiting_contractor'
      AND p_contractor_sent_at IS NOT NULL
      AND now() - p_contractor_sent_at > make_interval(mins => v_contractor_timeout_mins)
      THEN true

    -- Booking: 3 days (no PM setting)
    WHEN p_next_action_reason = 'awaiting_booking'
      AND now() - COALESCE(p_waiting_since, p_date_logged) > interval '3 days'
      THEN true

    -- Landlord: use PM's landlord_timeout_hours (default 48h)
    WHEN p_next_action_reason = 'awaiting_landlord'
      AND now() - COALESCE(p_waiting_since, p_date_logged) >
        interval '1 hour' * v_landlord_timeout_hrs
      THEN true

    -- Landlord allocated: 72h (no PM setting)
    WHEN p_next_action_reason = 'allocated_to_landlord'
      AND p_landlord_allocated_at IS NOT NULL
      AND now() - p_landlord_allocated_at > interval '72 hours'
      THEN true

    -- OOH dispatched: 48h (no PM setting)
    WHEN p_next_action_reason = 'ooh_dispatched'
      AND p_ooh_dispatched_at IS NOT NULL
      AND now() - p_ooh_dispatched_at > interval '48 hours'
      THEN true

    -- Tenant contacted: 48h (no PM setting)
    WHEN p_next_action_reason = 'awaiting_tenant'
      AND p_tenant_contacted_at IS NOT NULL
      AND now() - p_tenant_contacted_at > interval '48 hours'
      THEN true

    -- Scheduled: past date (cast timestamptz to date for comparison)
    WHEN p_next_action_reason = 'scheduled'
      AND p_scheduled_date IS NOT NULL
      AND p_scheduled_date::date < CURRENT_DATE
      THEN true

    -- Reschedule pending: 48h (no PM setting)
    WHEN p_next_action_reason = 'reschedule_pending'
      AND now() - COALESCE(p_waiting_since, p_date_logged) > interval '48 hours'
      THEN true

    ELSE false
  END;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. Fix compliance_get_cert_detail — add property_manager_id to return
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compliance_get_cert_detail(
  p_cert_id uuid,
  p_pm_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', cert.id,
    'property_id', cert.property_id,
    'property_manager_id', cert.property_manager_id,
    'property_address', p.address,
    'certificate_type', cert.certificate_type,
    'expiry_date', cert.expiry_date,
    'issued_date', cert.issued_date,
    'issued_by', cert.issued_by,
    'certificate_number', cert.certificate_number,
    'document_url', cert.document_url,
    'notes', cert.notes,
    'reminder_days_before', cert.reminder_days_before,
    'contractor_id', cert.contractor_id,
    'contractor_name', c.contractor_name,
    'display_status', cs.display_status,
    'status_group', cs.status_group,
    'days_remaining', cs.days_remaining,
    'ticket', CASE WHEN t.id IS NOT NULL THEN jsonb_build_object(
      'id', t.id,
      'next_action', t.next_action,
      'next_action_reason', t.next_action_reason,
      'status', t.status
    ) ELSE NULL END
  )
  INTO v_result
  FROM c1_compliance_certificates cert
  JOIN c1_properties p ON p.id = cert.property_id
  LEFT JOIN c1_contractors c ON c.id = cert.contractor_id
  LEFT JOIN LATERAL (
    SELECT tk.id, tk.next_action, tk.next_action_reason, tk.status
    FROM c1_tickets tk
    WHERE tk.compliance_certificate_id = cert.id
      AND tk.status = 'open'
      AND tk.archived = false
    ORDER BY tk.date_logged DESC
    LIMIT 1
  ) t ON true
  CROSS JOIN LATERAL public.compute_cert_display_status(
    cert.document_url, cert.expiry_date,
    t.id IS NOT NULL, t.next_action, t.next_action_reason
  ) cs
  WHERE cert.id = p_cert_id
    AND cert.property_manager_id = p_pm_id;

  RETURN v_result;
END;
$$;
