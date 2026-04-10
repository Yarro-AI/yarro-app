-- Sprint A, Sub-step 1c: Router + sub-routines → new bucket values
-- ⚠️ PROTECTED RPCs — approved by Adam.
-- All CREATE OR REPLACE must come BEFORE trigger update (1d).
--
-- Changes:
--   Router: add awaiting_tenant check after on_hold
--   Maintenance: new bucket values, remove landlord_no_response/landlord_in_progress/ooh_in_progress,
--                fix ooh_dispatched → waiting, remove job_stage checks, add reschedule_pending
--   Compliance: add cert_incomplete, rename compliance_pending → compliance_needs_dispatch,
--               new bucket values, remove job_stage checks, add reschedule_pending
--   Rent: new bucket values (simple rename)
--   New RPCs: c1_set_awaiting_tenant, c1_mark_contractor_withdrawn


-- ═══════════════════════════════════════════════════════════════
-- ROUTER: c1_compute_next_action
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_compute_next_action(p_ticket_id uuid)
 RETURNS TABLE(next_action text, next_action_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket c1_tickets%rowtype;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;

  -- ── Universal states (circuit breakers — all categories) ────
  IF NOT FOUND THEN
    RAISE WARNING 'c1_compute_next_action: ticket % not found', p_ticket_id;
    RETURN QUERY SELECT 'needs_action'::text, 'new'::text;
    RETURN;
  END IF;

  IF v_ticket.archived = true THEN
    IF v_ticket.handoff = true THEN
      RETURN QUERY SELECT 'dismissed'::text, 'dismissed'::text;
    ELSE
      RETURN QUERY SELECT 'archived'::text, 'archived'::text;
    END IF;
    RETURN;
  END IF;

  IF lower(v_ticket.status) = 'closed' THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  IF COALESCE(v_ticket.on_hold, false) = true THEN
    RETURN QUERY SELECT 'on_hold'::text, 'on_hold'::text;
    RETURN;
  END IF;

  -- Awaiting tenant: cross-category, after on_hold (on_hold wins if both true)
  IF COALESCE(v_ticket.awaiting_tenant, false) = true AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_tenant'::text;
    RETURN;
  END IF;

  -- ── Three routes (explicit category match) ──────────────────
  IF v_ticket.category = 'compliance_renewal' THEN
    RETURN QUERY SELECT * FROM compute_compliance_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.category = 'rent_arrears' THEN
    RETURN QUERY SELECT * FROM compute_rent_arrears_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.category = 'maintenance' THEN
    RETURN QUERY SELECT * FROM compute_maintenance_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  -- ── Fail loud — unknown or unexpected category ──────────────
  RAISE WARNING 'c1_compute_next_action: ticket % has unknown category: %',
    p_ticket_id, COALESCE(v_ticket.category, 'NULL');
  RETURN QUERY SELECT 'error'::text, 'unknown_category'::text;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- MAINTENANCE SUB-ROUTINE
-- ═══════════════════════════════════════════════════════════════
-- Changes:
--   - All 'needs_attention' → 'needs_action'
--   - All 'in_progress' → 'waiting' (except scheduled → 'scheduled')
--   - All 'follow_up' → 'needs_action'
--   - All 'assign_contractor' → 'needs_action'
--   - Remove landlord_in_progress (→ waiting/allocated_to_landlord)
--   - Remove ooh_in_progress (→ waiting/ooh_dispatched)
--   - Remove landlord_no_response (timeout replaces it)
--   - Fix ooh_dispatched: needs_attention → waiting (PM is waiting, not acting)
--   - Remove job_stage checks (use scheduled_date + c1_messages.stage instead)
--   - Add reschedule_pending before scheduled check

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
  v_msg_stage text;
  v_landlord_approval text;
BEGIN
  -- ── Lifecycle flags ──────────────────────────────────────────

  -- Pending review: new ticket from WhatsApp needs PM triage
  IF COALESCE(p_ticket.pending_review, false) AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'pending_review'::text;
    RETURN;
  END IF;

  -- Handoff: AI couldn't handle it, PM must review
  IF p_ticket.handoff = true AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'handoff_review'::text;
    RETURN;
  END IF;

  -- Landlord allocated
  IF COALESCE(p_ticket.landlord_allocated, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.landlord_outcome = 'need_help' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'landlord_needs_help'::text;
      RETURN;
    ELSIF p_ticket.landlord_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'landlord_resolved'::text;
      RETURN;
    -- landlord_in_progress REMOVED: acceptance metadata handles this distinction
    -- 'in_progress' outcome now stays as allocated_to_landlord (waiting)
    ELSE
      RETURN QUERY SELECT 'waiting'::text, 'allocated_to_landlord'::text;
      RETURN;
    END IF;
  END IF;

  -- OOH dispatched
  IF COALESCE(p_ticket.ooh_dispatched, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.ooh_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'ooh_resolved'::text;
      RETURN;
    ELSIF p_ticket.ooh_outcome = 'unresolved' THEN
      RETURN QUERY SELECT 'needs_action'::text, 'ooh_unresolved'::text;
      RETURN;
    -- ooh_in_progress REMOVED: acceptance metadata handles this distinction
    -- 'in_progress' outcome now stays as ooh_dispatched (waiting)
    ELSE
      -- FIX: ooh_dispatched is waiting (PM waits for OOH outcome), not needs_action
      RETURN QUERY SELECT 'waiting'::text, 'ooh_dispatched'::text;
      RETURN;
    END IF;
  END IF;

  -- ── Standard maintenance flow ───────────────────────────────

  -- Job completion state
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'needs_action'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  -- landlord_no_response REMOVED: timeout replaces this state
  -- The ticket stays as awaiting_landlord + is_past_timeout = true → displayed as stuck

  -- Reschedule pending: must check before scheduled (reschedule overrides booked state)
  IF COALESCE(p_ticket.reschedule_requested, false)
     AND p_ticket.reschedule_status = 'pending' THEN
    RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
    RETURN;
  END IF;

  -- Scheduled (job_stage checks REMOVED — use scheduled_date only)
  IF p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'scheduled'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Completed via job_completions
  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Message-based states (c1_messages.stage is known debt — still used)
  SELECT m.stage, m.landlord->>'approval'
  INTO v_msg_stage, v_landlord_approval
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  -- Awaiting booking: c1_messages.stage = 'sent' replaces job_stage = 'sent'
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


-- ═══════════════════════════════════════════════════════════════
-- COMPLIANCE SUB-ROUTINE
-- ═══════════════════════════════════════════════════════════════
-- Changes:
--   - Add cert_incomplete check at top
--   - Rename compliance_pending → compliance_needs_dispatch
--   - New bucket values
--   - Remove job_stage checks
--   - Add reschedule_pending

CREATE OR REPLACE FUNCTION public.compute_compliance_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cert_incomplete boolean := false;
  v_cert_renewed boolean := false;
  v_job_not_completed boolean;
  v_has_completion boolean;
  v_msg_stage text;
BEGIN
  -- Cert incomplete: no document or no expiry date
  IF p_ticket.compliance_certificate_id IS NOT NULL THEN
    SELECT (cc.document_url IS NULL OR cc.expiry_date IS NULL)
    INTO v_cert_incomplete
    FROM c1_compliance_certificates cc
    WHERE cc.id = p_ticket.compliance_certificate_id;

    IF v_cert_incomplete THEN
      RETURN QUERY SELECT 'needs_action'::text, 'cert_incomplete'::text;
      RETURN;
    END IF;
  END IF;

  -- Check if cert has been renewed
  IF p_ticket.compliance_certificate_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM c1_compliance_certificates cc
      WHERE cc.id = p_ticket.compliance_certificate_id
        AND cc.expiry_date > CURRENT_DATE
        AND cc.reminder_count = 0
    ) INTO v_cert_renewed;
  END IF;

  IF v_cert_renewed THEN
    RETURN QUERY SELECT 'completed'::text, 'cert_renewed'::text;
    RETURN;
  END IF;

  -- Job completion checks
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'needs_action'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Reschedule pending
  IF COALESCE(p_ticket.reschedule_requested, false)
     AND p_ticket.reschedule_status = 'pending' THEN
    RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
    RETURN;
  END IF;

  -- Scheduled (job_stage checks REMOVED — use scheduled_date only)
  IF p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'scheduled'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage INTO v_msg_stage
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  -- Awaiting booking: c1_messages.stage = 'sent' replaces job_stage = 'sent'
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

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Default: compliance needs dispatch (was compliance_pending)
  RETURN QUERY SELECT 'needs_action'::text, 'compliance_needs_dispatch'::text;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- RENT SUB-ROUTINE
-- ═══════════════════════════════════════════════════════════════
-- Changes: needs_attention → needs_action (simple rename)

CREATE OR REPLACE FUNCTION public.compute_rent_arrears_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_months_overdue integer;
  v_total_arrears numeric;
  v_has_partial boolean;
BEGIN
  SELECT
    COUNT(*),
    COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0),
    bool_or(status = 'partial')
  INTO v_months_overdue, v_total_arrears, v_has_partial
  FROM c1_rent_ledger
  WHERE tenant_id = p_ticket.tenant_id
    AND status IN ('overdue', 'partial');

  IF v_months_overdue = 0 OR v_total_arrears <= 0 THEN
    RETURN QUERY SELECT 'completed'::text, 'rent_cleared'::text;
    RETURN;
  END IF;

  IF v_has_partial THEN
    RETURN QUERY SELECT 'needs_action'::text, 'rent_partial_payment'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'needs_action'::text, 'rent_overdue'::text;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- NEW RPC: c1_set_awaiting_tenant
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION c1_set_awaiting_tenant(
  p_ticket_id uuid,
  p_awaiting boolean,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_property_label text;
BEGIN
  SELECT p.address INTO v_property_label
  FROM c1_tickets t JOIN c1_properties p ON t.property_id = p.id
  WHERE t.id = p_ticket_id;

  IF p_awaiting THEN
    UPDATE c1_tickets SET awaiting_tenant = true, tenant_contacted_at = now()
    WHERE id = p_ticket_id;
    PERFORM c1_log_event(p_ticket_id, 'PM_AWAITING_TENANT', 'PM', NULL, v_property_label,
      jsonb_build_object('reason', p_reason));
  ELSE
    UPDATE c1_tickets SET awaiting_tenant = false, tenant_contacted_at = NULL
    WHERE id = p_ticket_id;
    PERFORM c1_log_event(p_ticket_id, 'TENANT_RESPONDED', 'PM', NULL, v_property_label,
      jsonb_build_object('reason', p_reason));
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- NEW RPC: c1_mark_contractor_withdrawn
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION c1_mark_contractor_withdrawn(
  p_ticket_id uuid,
  p_contractor_id uuid,
  p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_property_label text;
  v_contractors jsonb;
  v_contractor_name text;
  v_remaining int;
  v_msg_id uuid;
BEGIN
  SELECT p.address INTO v_property_label
  FROM c1_tickets t JOIN c1_properties p ON t.property_id = p.id
  WHERE t.id = p_ticket_id;

  -- Get the c1_messages row for this ticket
  SELECT m.id, m.contractors INTO v_msg_id, v_contractors
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  -- Find contractor name for audit
  SELECT c.name INTO v_contractor_name
  FROM c1_contractors c WHERE c.id = p_contractor_id;

  -- Mark contractor as withdrawn in JSONB array
  UPDATE c1_messages
  SET contractors = (
    SELECT jsonb_agg(
      CASE
        WHEN (elem->>'contractor_id')::uuid = p_contractor_id
        THEN elem || jsonb_build_object('withdrawn', true, 'withdrawn_reason', p_reason)
        ELSE elem
      END
    )
    FROM jsonb_array_elements(contractors) elem
  )
  WHERE id = v_msg_id;

  -- Count remaining active contractors
  SELECT COUNT(*) INTO v_remaining
  FROM jsonb_array_elements(v_contractors) elem
  WHERE (elem->>'contractor_id')::uuid != p_contractor_id
    AND NOT COALESCE((elem->>'withdrawn')::boolean, false);

  -- Log withdrawal event
  PERFORM c1_log_event(p_ticket_id, 'CONTRACTOR_WITHDRAWN', 'SYSTEM', v_contractor_name, v_property_label,
    jsonb_build_object('contractor_id', p_contractor_id, 'reason', p_reason, 'remaining_contractors', v_remaining));

  -- If last contractor, update stage to trigger recompute → no_contractors
  IF v_remaining = 0 THEN
    UPDATE c1_messages SET stage = 'no_contractors_left' WHERE id = v_msg_id;
  END IF;
END;
$$;
