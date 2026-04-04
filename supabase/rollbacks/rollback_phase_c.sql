-- ============================================================================
-- ROLLBACK: Restore monolithic c1_compute_next_action
--
-- Emergency revert for Phase C (router migration).
-- Restores the original function — sub-routines from Phase B become unused
-- but cause no harm.
--
-- Deploy: supabase db push (or psql $DATABASE_URL -f this_file.sql)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.c1_compute_next_action(p_ticket_id uuid)
 RETURNS TABLE(next_action text, next_action_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket c1_tickets%rowtype;
  v_msg_stage TEXT;
  v_landlord_approval TEXT;
  v_job_not_completed BOOLEAN;
  v_has_completion BOOLEAN;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'new'::TEXT, 'new'::TEXT;
    RETURN;
  END IF;

  -- Archived
  IF v_ticket.archived = true THEN
    IF v_ticket.handoff = true THEN
      RETURN QUERY SELECT 'dismissed'::TEXT, 'dismissed'::TEXT;
    ELSE
      RETURN QUERY SELECT 'archived'::TEXT, 'archived'::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Closed
  IF lower(v_ticket.status) = 'closed' THEN
    RETURN QUERY SELECT 'completed'::TEXT, 'completed'::TEXT;
    RETURN;
  END IF;

  -- ON HOLD
  IF COALESCE(v_ticket.on_hold, false) = true THEN
    RETURN QUERY SELECT 'on_hold'::TEXT, 'on_hold'::TEXT;
    RETURN;
  END IF;

  -- Landlord allocated (ticket handed to landlord to manage)
  IF COALESCE(v_ticket.landlord_allocated, false) = true AND lower(v_ticket.status) = 'open' THEN
    IF v_ticket.landlord_outcome = 'need_help' THEN
      RETURN QUERY SELECT 'needs_attention'::TEXT, 'landlord_needs_help'::TEXT;
    ELSIF v_ticket.landlord_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_attention'::TEXT, 'landlord_resolved'::TEXT;
    ELSIF v_ticket.landlord_outcome = 'in_progress' THEN
      RETURN QUERY SELECT 'in_progress'::TEXT, 'landlord_in_progress'::TEXT;
    ELSE
      RETURN QUERY SELECT 'in_progress'::TEXT, 'allocated_to_landlord'::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Pending review (review mode)
  IF COALESCE(v_ticket.pending_review, false) AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::TEXT, 'pending_review'::TEXT;
    RETURN;
  END IF;

  -- OOH dispatched — check outcome for distinct states
  IF COALESCE(v_ticket.ooh_dispatched, false) AND lower(v_ticket.status) = 'open' THEN
    IF v_ticket.ooh_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_attention'::TEXT, 'ooh_resolved'::TEXT;
    ELSIF v_ticket.ooh_outcome = 'unresolved' THEN
      RETURN QUERY SELECT 'needs_attention'::TEXT, 'ooh_unresolved'::TEXT;
    ELSIF v_ticket.ooh_outcome = 'in_progress' THEN
      RETURN QUERY SELECT 'in_progress'::TEXT, 'ooh_in_progress'::TEXT;
    ELSE
      RETURN QUERY SELECT 'needs_attention'::TEXT, 'ooh_dispatched'::TEXT;
    END IF;
    RETURN;
  END IF;

  -- Handoff review
  IF v_ticket.handoff = true AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::TEXT, 'handoff_review'::TEXT;
    RETURN;
  END IF;

  -- Job completion state
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'follow_up'::TEXT, 'job_not_completed'::TEXT;
    RETURN;
  END IF;

  -- Landlord no response
  IF lower(v_ticket.job_stage) = 'landlord_no_response' OR lower(v_ticket.job_stage) = 'landlord no response' THEN
    RETURN QUERY SELECT 'follow_up'::TEXT, 'landlord_no_response'::TEXT;
    RETURN;
  END IF;

  -- Scheduled
  IF lower(v_ticket.job_stage) IN ('booked', 'scheduled') OR v_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, 'scheduled'::TEXT;
    RETURN;
  END IF;

  -- Awaiting booking
  IF lower(v_ticket.job_stage) = 'sent' THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, 'awaiting_booking'::TEXT;
    RETURN;
  END IF;

  -- Completed via job_completions
  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::TEXT, 'completed'::TEXT;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage, m.landlord->>'approval'
  INTO v_msg_stage, v_landlord_approval
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_attention'::TEXT, 'manager_approval'::TEXT;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'assign_contractor'::TEXT, 'no_contractors'::TEXT;
    RETURN;
  END IF;

  IF v_landlord_approval = 'false' THEN
    RETURN QUERY SELECT 'follow_up'::TEXT, 'landlord_declined'::TEXT;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, 'awaiting_landlord'::TEXT;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'in_progress'::TEXT, 'awaiting_contractor'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'new'::TEXT, 'new'::TEXT;
  RETURN;
END;
$function$;
