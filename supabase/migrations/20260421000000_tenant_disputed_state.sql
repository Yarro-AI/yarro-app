-- ============================================================
-- FEATURE: Tenant disputed completion — distinct state from job_not_completed
-- ============================================================
-- When a tenant disputes a contractor's completion, it's a different state
-- from when a contractor reports their own job as not complete.
-- The PM needs different context and CTAs for each.
--
-- New reason: 'tenant_disputed' — distinct from 'job_not_completed'
-- ============================================================


-- 1. Add to CHECK constraint

ALTER TABLE c1_tickets DROP CONSTRAINT IF EXISTS chk_next_action_reason;

ALTER TABLE c1_tickets ADD CONSTRAINT chk_next_action_reason
CHECK (next_action_reason IS NULL OR next_action_reason IN (
  -- Universal
  'new', 'archived', 'dismissed', 'completed', 'on_hold', 'manually_closed',
  -- Maintenance: lifecycle flags
  'pending_review', 'handoff_review',
  'allocated_to_landlord', 'landlord_needs_help', 'landlord_resolved', 'landlord_declined',
  'ooh_dispatched', 'ooh_resolved', 'ooh_unresolved',
  -- Maintenance: contractor flow
  'awaiting_contractor', 'awaiting_booking', 'scheduled', 'reschedule_pending',
  'awaiting_landlord', 'manager_approval', 'no_contractors', 'job_not_completed',
  'tenant_disputed',
  -- Cross-category
  'awaiting_tenant',
  -- Compliance
  'compliance_needs_dispatch', 'cert_incomplete', 'cert_renewed',
  -- Rent
  'rent_overdue', 'rent_partial_payment', 'rent_cleared',
  -- Error
  'unknown_category'
));


-- 2. Update maintenance sub-routine to distinguish tenant_disputed from job_not_completed

CREATE OR REPLACE FUNCTION public.compute_maintenance_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job_not_completed boolean;
  v_has_completion boolean;
  v_completion_source text;
  v_msg_stage text;
  v_landlord_approval text;
BEGIN
  -- ── Lifecycle flags ──────────────────────────────────────────

  IF COALESCE(p_ticket.pending_review, false) AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'pending_review'::text;
    RETURN;
  END IF;

  IF p_ticket.handoff = true AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'handoff_review'::text;
    RETURN;
  END IF;

  IF COALESCE(p_ticket.landlord_allocated, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.landlord_outcome = 'need_help' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'landlord_needs_help'::text;
      RETURN;
    ELSIF p_ticket.landlord_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'landlord_resolved'::text;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'waiting'::text, 'allocated_to_landlord'::text;
      RETURN;
    END IF;
  END IF;

  IF COALESCE(p_ticket.ooh_dispatched, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.ooh_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'ooh_resolved'::text;
      RETURN;
    ELSIF p_ticket.ooh_outcome = 'unresolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'ooh_unresolved'::text;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'waiting'::text, 'ooh_dispatched'::text;
      RETURN;
    END IF;
  END IF;

  -- ── Standard maintenance flow ───────────────────────────────

  -- Job completion state — distinguish contractor vs tenant dispute
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_job_not_completed THEN
    -- Check source to distinguish contractor vs tenant dispute
    SELECT jc.source INTO v_completion_source
    FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false;

    IF v_completion_source = 'tenant_dispute' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'tenant_disputed'::text;
    ELSE
      RETURN QUERY SELECT 'needs_action'::text, 'job_not_completed'::text;
    END IF;
    RETURN;
  END IF;

  -- Reschedule pending
  IF COALESCE(p_ticket.reschedule_requested, false)
     AND p_ticket.reschedule_status = 'pending' THEN
    RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
    RETURN;
  END IF;

  -- Scheduled
  IF p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'scheduled'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Completed via job_completions
  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage, m.landlord->>'approval'
  INTO v_msg_stage, v_landlord_approval
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  IF lower(v_msg_stage) = 'sent' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_booking'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'manager_approval'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'no_contractors'::text;
    RETURN;
  END IF;

  IF v_landlord_approval = 'false' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'landlord_declined'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Default
  RETURN QUERY SELECT 'needs_action'::text, 'new'::text;
END;
$$;
