-- Fix: 3 portal RPCs still reference dropped job_stage column
-- ⚠️ PROTECTED RPCs — approved by Adam.
-- Changes:
--   - c1_get_contractor_ticket: job_stage → next_action_reason
--   - c1_get_tenant_ticket: job_stage → next_action_reason
--   - c1_submit_ooh_outcome: remove job_stage UPDATE (column dropped)


-- ─── 1. c1_get_contractor_ticket ───────────────────────────
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
    'next_action_reason', t.next_action_reason,
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


-- ─── 2. c1_get_tenant_ticket ───────────────────────────────
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
    'next_action_reason', t.next_action_reason,
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


-- ─── 3. c1_submit_ooh_outcome — remove job_stage UPDATE ────
CREATE OR REPLACE FUNCTION public.c1_submit_ooh_outcome(p_token text, p_outcome text, p_notes text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id uuid;
  v_submission jsonb;
BEGIN
  -- Validate token with TTL
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE ooh_token = p_token
    AND ooh_dispatched = true
    AND NOW() - ooh_dispatched_at < interval '30 days';

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  -- Validate outcome
  IF p_outcome NOT IN ('resolved', 'unresolved', 'in_progress') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  -- Build submission record
  v_submission := jsonb_build_object(
    'outcome', p_outcome,
    'notes', p_notes,
    'cost', p_cost,
    'submitted_at', now()
  );

  -- Update ticket: set current fields + append to history
  -- job_stage removed (column dropped). State is managed by the recompute trigger.
  UPDATE c1_tickets SET
    ooh_outcome = p_outcome,
    ooh_outcome_at = now(),
    ooh_notes = p_notes,
    ooh_cost = p_cost,
    ooh_submissions = COALESCE(ooh_submissions, '[]'::jsonb) || v_submission,
    -- When resolved with a cost, fill quote details
    contractor_quote = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE contractor_quote END,
    final_amount = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE final_amount END
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$function$;
