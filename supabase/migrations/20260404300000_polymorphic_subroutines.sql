-- ============================================================
-- Polymorphic Dispatch — Sub-routines
-- ============================================================
-- 5 domain-specific sub-routines for c1_compute_next_action
-- + create_rent_arrears_ticket + rent_escalation_check
--
-- Phase B: These are created alongside the existing monolithic
-- function. No production behavior changes until Phase C.
-- ============================================================

-- ─── 1. compute_landlord_next_action ────────────────────────────────────
-- Built FIRST to validate row-type parameter pattern.

CREATE OR REPLACE FUNCTION public.compute_landlord_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_ticket.landlord_outcome = 'need_help' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'landlord_needs_help'::text;
  ELSIF p_ticket.landlord_outcome = 'resolved' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'landlord_resolved'::text;
  ELSIF p_ticket.landlord_outcome = 'in_progress' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'landlord_in_progress'::text;
  ELSE
    RETURN QUERY SELECT 'in_progress'::text, 'allocated_to_landlord'::text;
  END IF;
END;
$$;

-- ─── 2. compute_ooh_next_action ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_ooh_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF p_ticket.ooh_outcome = 'resolved' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'ooh_resolved'::text;
  ELSIF p_ticket.ooh_outcome = 'unresolved' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'ooh_unresolved'::text;
  ELSIF p_ticket.ooh_outcome = 'in_progress' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'ooh_in_progress'::text;
  ELSE
    RETURN QUERY SELECT 'needs_attention'::text, 'ooh_dispatched'::text;
  END IF;
END;
$$;

-- ─── 3. compute_compliance_next_action ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_compliance_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_cert_renewed boolean := false;
  v_job_not_completed boolean;
  v_has_completion boolean;
  v_msg_stage text;
BEGIN
  -- Check if cert has been renewed (new expiry date, reminder_count reset)
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
    RETURN QUERY SELECT 'follow_up'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage INTO v_msg_stage
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'manager_approval'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'no_contractors'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Scheduled
  IF lower(p_ticket.job_stage) IN ('booked', 'scheduled') OR p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Sent / awaiting booking
  IF lower(p_ticket.job_stage) = 'sent' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_booking'::text;
    RETURN;
  END IF;

  -- Default: compliance pending
  RETURN QUERY SELECT 'needs_attention'::text, 'compliance_pending'::text;
END;
$$;

-- ─── 4. compute_rent_arrears_next_action ────────────────────────────────

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
  -- Query all overdue/partial entries for this tenant
  SELECT
    COUNT(*),
    COALESCE(SUM(amount_due - COALESCE(amount_paid, 0)), 0),
    bool_or(status = 'partial')
  INTO v_months_overdue, v_total_arrears, v_has_partial
  FROM c1_rent_ledger
  WHERE tenant_id = p_ticket.tenant_id
    AND status IN ('overdue', 'partial');

  -- No overdue entries remain → cleared
  IF v_months_overdue = 0 OR v_total_arrears <= 0 THEN
    RETURN QUERY SELECT 'completed'::text, 'rent_cleared'::text;
    RETURN;
  END IF;

  -- Partial payment exists
  IF v_has_partial THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'rent_partial_payment'::text;
    RETURN;
  END IF;

  -- All overdue
  RETURN QUERY SELECT 'needs_attention'::text, 'rent_overdue'::text;
END;
$$;

-- ─── 5. compute_maintenance_next_action ─────────────────────────────────
-- Direct extraction of current Branches 9-11 + default. Zero logic change.

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
  -- Job completion state
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'follow_up'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  -- Landlord no response
  IF lower(p_ticket.job_stage) = 'landlord_no_response' OR lower(p_ticket.job_stage) = 'landlord no response' THEN
    RETURN QUERY SELECT 'follow_up'::text, 'landlord_no_response'::text;
    RETURN;
  END IF;

  -- Scheduled
  IF lower(p_ticket.job_stage) IN ('booked', 'scheduled') OR p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Awaiting booking
  IF lower(p_ticket.job_stage) = 'sent' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_booking'::text;
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

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'manager_approval'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'assign_contractor'::text, 'no_contractors'::text;
    RETURN;
  END IF;

  IF v_landlord_approval = 'false' THEN
    RETURN QUERY SELECT 'follow_up'::text, 'landlord_declined'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Default
  RETURN QUERY SELECT 'new'::text, 'new'::text;
END;
$$;

-- ─── 6. create_rent_arrears_ticket ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
    -- Ticket already exists — update description with latest arrears info
    UPDATE c1_tickets
    SET issue_description = p_issue_description
    WHERE id = v_ticket_id;
    RETURN v_ticket_id;
  END IF;

  -- Create new ticket (no c1_messages, no dispatch — PM-only action)
  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    job_stage, verified_by, is_manual, handoff
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', 'high',
    'created', 'system', true, false
  ) RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;

-- ─── 7. rent_escalation_check ───────────────────────────────────────────
-- Returns tenants with overdue rent ready for ticket escalation.

CREATE OR REPLACE FUNCTION public.rent_escalation_check(p_pm_id uuid)
RETURNS TABLE(
  tenant_id uuid,
  property_manager_id uuid,
  property_id uuid,
  tenant_name text,
  property_address text,
  months_overdue bigint,
  total_arrears numeric,
  earliest_overdue date
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    rl.tenant_id,
    rl.property_manager_id,
    r.property_id,
    t.full_name AS tenant_name,
    p.address AS property_address,
    COUNT(*) AS months_overdue,
    SUM(rl.amount_due - COALESCE(rl.amount_paid, 0)) AS total_arrears,
    MIN(rl.due_date) AS earliest_overdue
  FROM c1_rent_ledger rl
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
  WHERE rl.property_manager_id = p_pm_id
    AND rl.status = 'overdue'
    AND rl.reminder_3_sent_at IS NOT NULL
    AND rl.reminder_3_sent_at < NOW() - INTERVAL '7 days'
  GROUP BY rl.tenant_id, rl.property_manager_id, r.property_id, t.full_name, p.address
  HAVING NOT EXISTS (
    SELECT 1 FROM c1_tickets tk
    WHERE tk.tenant_id = rl.tenant_id
      AND tk.category = 'rent_arrears'
      AND tk.status = 'open'
  );
$$;
