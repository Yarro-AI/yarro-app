-- ============================================================
-- Portal Token TTL — 30-day expiry
--
-- Protected RPCs modified (approved by Adam):
--   - c1_get_contractor_ticket
--   - c1_get_tenant_ticket
--
-- Change: adds WHERE condition checking token_at timestamp
-- is within 30 days. Tokens older than 30 days return
-- "Invalid or expired link" (existing error message).
-- No signature changes, no new columns.
-- ============================================================

-- ─── 1. c1_get_contractor_ticket with TTL ───────────────────
CREATE OR REPLACE FUNCTION public.c1_get_contractor_ticket(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'ticket_id', t.id,
    'ticket_ref', split_part(t.id::text, '-', 1),
    'property_address', p.address,
    'issue_title', t.issue_title,
    'issue_description', t.issue_description,
    'category', t.category,
    'priority', t.priority,
    'images', COALESCE(t.images, '[]'::jsonb),
    'availability', t.availability,
    'date_logged', t.date_logged,
    'status', t.status,
    'job_stage', t.job_stage,
    'contractor_quote', t.contractor_quote,
    'final_amount', t.final_amount,
    'scheduled_date', t.scheduled_date,
    'tenant_name', ten.full_name,
    'tenant_phone', ten.phone,
    'business_name', pm.business_name,
    'contractor_name', c.contractor_name,
    'reschedule_requested', COALESCE(t.reschedule_requested, false),
    'reschedule_date', t.reschedule_date,
    'reschedule_reason', t.reschedule_reason,
    'reschedule_status', t.reschedule_status,
    'resolved_at', t.resolved_at,
    'tenant_updates', COALESCE(t.tenant_updates, '[]'::jsonb),
    'min_booking_lead_hours', COALESCE(pm.min_booking_lead_hours, 3),
    -- Compliance fields (null for maintenance tickets)
    'compliance_certificate_id', t.compliance_certificate_id,
    'compliance_cert_type', cert.certificate_type::text,
    'compliance_expiry_date', cert.expiry_date
  ) INTO v_result
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  LEFT JOIN c1_contractors c ON c.id = t.contractor_id
  LEFT JOIN c1_compliance_certificates cert ON cert.id = t.compliance_certificate_id
  WHERE t.contractor_token = p_token
    AND NOW() - t.contractor_token_at < interval '30 days';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  RETURN v_result;
END;
$function$;

-- ─── 2. c1_get_tenant_ticket with TTL ──────────────────────
CREATE OR REPLACE FUNCTION public.c1_get_tenant_ticket(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'ticket_id', t.id,
    'ticket_ref', split_part(t.id::text, '-', 1),
    'property_address', p.address,
    'issue_title', t.issue_title,
    'issue_description', t.issue_description,
    'category', t.category,
    'priority', t.priority,
    'images', COALESCE(t.images, '[]'::jsonb),
    'availability', t.availability,
    'date_logged', t.date_logged,
    'status', t.status,
    'job_stage', t.job_stage,
    'scheduled_date', t.scheduled_date,
    'contractor_name', c.contractor_name,
    'contractor_phone', c.contractor_phone,
    'business_name', pm.business_name,
    'reschedule_requested', COALESCE(t.reschedule_requested, false),
    'reschedule_date', t.reschedule_date,
    'reschedule_reason', t.reschedule_reason,
    'reschedule_status', t.reschedule_status,
    'reschedule_decided_at', t.reschedule_decided_at,
    'resolved_at', t.resolved_at,
    'confirmation_date', t.confirmation_date
  ) INTO v_result
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN c1_contractors c ON c.id = t.contractor_id
  WHERE t.tenant_token = p_token
    AND NOW() - t.tenant_token_at < interval '30 days';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  RETURN v_result;
END;
$function$;
