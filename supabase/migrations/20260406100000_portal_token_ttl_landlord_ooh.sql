-- ============================================================
-- Portal Token TTL — Landlord & OOH portals (30-day expiry)
--
-- Extends the TTL pattern from 20260405400000_portal_token_ttl.sql
-- to the remaining two portal types.
--
-- Protected RPCs modified (approved by Adam):
--   - c1_get_landlord_ticket
--   - c1_get_ooh_ticket
--   - c1_submit_landlord_outcome
--   - c1_submit_ooh_outcome
--
-- Change: adds WHERE condition checking allocation/dispatch
-- timestamp is within 30 days. Tokens older than 30 days
-- return "Invalid or expired link" (existing error message).
-- No signature changes, no new columns.
-- ============================================================

-- ─── 1. c1_get_landlord_ticket with TTL ────────────────────
CREATE OR REPLACE FUNCTION public.c1_get_landlord_ticket(p_token text)
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
    'issue_description', t.issue_description,
    'issue_title', t.issue_title,
    'tenant_name', ten.full_name,
    'tenant_phone', ten.phone,
    'priority', t.priority,
    'business_name', pm.business_name,
    'landlord_outcome', t.landlord_outcome,
    'landlord_outcome_at', t.landlord_outcome_at,
    'landlord_notes', t.landlord_notes,
    'landlord_cost', t.landlord_cost,
    'landlord_submissions', COALESCE(t.landlord_submissions, '[]'::jsonb)
  ) INTO v_result
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  WHERE t.landlord_token = p_token
    AND t.landlord_allocated = true
    AND NOW() - t.landlord_allocated_at < interval '30 days';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  RETURN v_result;
END;
$function$;

-- ─── 2. c1_get_ooh_ticket with TTL ────────────────────────
CREATE OR REPLACE FUNCTION public.c1_get_ooh_ticket(p_token text)
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
    'issue_description', t.issue_description,
    'issue_title', t.issue_title,
    'tenant_name', ten.full_name,
    'tenant_phone', ten.phone,
    'priority', t.priority,
    'business_name', pm.business_name,
    'ooh_outcome', t.ooh_outcome,
    'ooh_outcome_at', t.ooh_outcome_at,
    'ooh_notes', t.ooh_notes,
    'ooh_cost', t.ooh_cost,
    'ooh_submissions', COALESCE(t.ooh_submissions, '[]'::jsonb)
  ) INTO v_result
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  WHERE t.ooh_token = p_token
    AND t.ooh_dispatched = true
    AND NOW() - t.ooh_dispatched_at < interval '30 days';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  RETURN v_result;
END;
$function$;

-- ─── 3. c1_submit_landlord_outcome with TTL ───────────────
CREATE OR REPLACE FUNCTION public.c1_submit_landlord_outcome(p_token text, p_outcome text, p_notes text DEFAULT NULL::text, p_cost numeric DEFAULT NULL::numeric)
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
  WHERE landlord_token = p_token
    AND landlord_allocated = true
    AND NOW() - landlord_allocated_at < interval '30 days';

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  -- Validate outcome
  IF p_outcome NOT IN ('resolved', 'in_progress', 'need_help') THEN
    RAISE EXCEPTION 'Invalid outcome: %', p_outcome;
  END IF;

  -- Build submission record
  v_submission := jsonb_build_object(
    'outcome', p_outcome,
    'notes', p_notes,
    'cost', p_cost,
    'submitted_at', now()
  );

  -- Update ticket: current fields + append to history
  UPDATE c1_tickets SET
    landlord_outcome = p_outcome,
    landlord_outcome_at = now(),
    landlord_notes = p_notes,
    landlord_cost = p_cost,
    landlord_submissions = COALESCE(landlord_submissions, '[]'::jsonb) || v_submission,
    -- When resolved with a cost, fill quote details (no markup)
    contractor_quote = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE contractor_quote END,
    final_amount = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE final_amount END,
    -- When need_help, flag for PM attention
    next_action_reason = CASE WHEN p_outcome = 'need_help' THEN 'landlord_needs_help' ELSE next_action_reason END
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$function$;

-- ─── 4. c1_submit_ooh_outcome with TTL ────────────────────
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

  -- Update ticket: set current fields + append to history + update job_stage
  UPDATE c1_tickets SET
    ooh_outcome = p_outcome,
    ooh_outcome_at = now(),
    ooh_notes = p_notes,
    ooh_cost = p_cost,
    ooh_submissions = COALESCE(ooh_submissions, '[]'::jsonb) || v_submission,
    -- When resolved with a cost, fill quote details
    contractor_quote = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE contractor_quote END,
    final_amount = CASE WHEN p_outcome = 'resolved' AND p_cost IS NOT NULL THEN p_cost ELSE final_amount END,
    -- Move job_stage so tenant portal shows progress (status stays open — PM closes)
    job_stage = CASE
      WHEN p_outcome = 'resolved' THEN 'completed'
      WHEN p_outcome = 'in_progress' THEN 'booked'
      ELSE job_stage
    END
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$function$;
