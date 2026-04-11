-- Category-aware consequence escalation in priority scoring.
-- Compliance certs expiring within 7 days get Emergency-level consequence weight (400)
-- because an expired cert = illegal property → fines, reputational risk, potential jail time.
--
-- Changes:
--   1. c1_compute_priority_score: add p_category param, compliance escalation logic
--   2. c1_get_dashboard_todo: pass t.category to scoring function
--   3. c1_ticket_detail: pass t.category to scoring function

-- ── 1. Recreate scoring function with category param ──────────────
DROP FUNCTION IF EXISTS c1_compute_priority_score(text, date, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION c1_compute_priority_score(
  p_priority text,
  p_deadline_date date,
  p_sla_due_at timestamptz,
  p_waiting_since timestamptz,
  p_category text DEFAULT NULL
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (
    -- Component 1: Consequence weight (severity + category escalation)
    CASE
      -- Compliance near expiry: legal risk → Emergency-level consequence
      WHEN p_category = 'compliance_renewal'
        AND p_deadline_date IS NOT NULL
        AND p_deadline_date <= CURRENT_DATE + 7
        THEN 400
      -- Standard priority-based consequence
      WHEN p_priority = 'Emergency' THEN 400
      WHEN p_priority = 'Urgent'    THEN 175
      WHEN p_priority = 'High'      THEN 100
      WHEN p_priority = 'Medium'    THEN 50
      ELSE 25
    END
    -- Component 2: Time pressure (external deadline proximity)
    + CASE
        WHEN p_deadline_date IS NULL THEN 0
        WHEN p_deadline_date < CURRENT_DATE THEN 150
        WHEN p_deadline_date <= CURRENT_DATE + 1 THEN 100
        WHEN p_deadline_date <= CURRENT_DATE + 2 THEN 75
        WHEN p_deadline_date <= CURRENT_DATE + 7 THEN 25
        ELSE 0
      END
    -- Component 3: SLA proximity (PM response window)
    + CASE
        WHEN p_sla_due_at IS NULL THEN 0
        WHEN p_sla_due_at < now() THEN 100
        WHEN p_sla_due_at <= now() + interval '1 hour' THEN 75
        WHEN p_sla_due_at <= now() + interval '4 hours' THEN 50
        WHEN p_sla_due_at <= now() + interval '24 hours' THEN 25
        ELSE 0
      END
    -- Component 4: Age boost (capped at 48h to prevent ancient low-priority items outranking fresh high-priority)
    + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(p_waiting_since, now()))) / 3600, 48)::int
  )
$$;


-- ── 2. Dashboard RPC — pass category to scoring ──────────────────
CREATE OR REPLACE FUNCTION public.c1_get_dashboard_todo(p_pm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  pm_tickets AS (
    SELECT t.*
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) = 'open'
      AND t.archived = false
      AND COALESCE(t.on_hold, false) = false
  ),
  contractor_timing AS (
    SELECT t.id AS ticket_id,
           t.contractor_sent_at
    FROM pm_tickets t
  ),
  timeout_check AS (
    SELECT t.id AS ticket_id,
      CASE
        WHEN t.next_action != 'waiting' THEN false
        WHEN t.next_action_reason = 'awaiting_contractor'
          AND ct.contractor_sent_at IS NOT NULL
          AND now() - ct.contractor_sent_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_booking'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '3 days'
          THEN true
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND now() - COALESCE(t.waiting_since, t.date_logged) >
            interval '1 hour' * COALESCE(
              (SELECT landlord_timeout_hours FROM c1_property_managers WHERE id = p_pm_id),
              48)
          THEN true
        WHEN t.next_action_reason = 'allocated_to_landlord'
          AND t.landlord_allocated_at IS NOT NULL
          AND now() - t.landlord_allocated_at > interval '72 hours'
          THEN true
        WHEN t.next_action_reason = 'ooh_dispatched'
          AND t.ooh_dispatched_at IS NOT NULL
          AND now() - t.ooh_dispatched_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_tenant'
          AND t.tenant_contacted_at IS NOT NULL
          AND now() - t.tenant_contacted_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date < CURRENT_DATE
          THEN true
        WHEN t.next_action_reason = 'reschedule_pending'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '48 hours'
          THEN true
        ELSE false
      END AS is_past_timeout
    FROM pm_tickets t
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  ),
  scored AS (
    SELECT
      t.id,
      t.id AS ticket_id,
      t.property_id,
      t.category,
      t.maintenance_trade,
      t.issue_title AS issue_summary,
      CASE
        WHEN t.next_action_reason = 'reschedule_pending'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date - now() <= interval '24 hours'
          THEN 'needs_action'
        WHEN tc.is_past_timeout AND t.next_action = 'waiting'
          THEN 'stuck'
        ELSE t.next_action
      END AS bucket,
      t.next_action,
      t.next_action_reason,
      t.priority,
      public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since, t.category) AS priority_score,
      tc.is_past_timeout,
      t.sla_due_at,
      EXTRACT(EPOCH FROM (t.sla_due_at - t.waiting_since)) / 3600 AS sla_total_hours,
      t.deadline_date,
      t.waiting_since,
      t.contractor_sent_at,
      t.scheduled_date,
      t.landlord_allocated_at,
      t.ooh_dispatched_at,
      t.tenant_contacted_at,
      t.compliance_certificate_id,
      p.address AS property_label,
      t.date_logged AS created_at,
      t.reschedule_initiated_by
    FROM pm_tickets t
    LEFT JOIN timeout_check tc ON tc.ticket_id = t.id
    LEFT JOIN c1_properties p ON p.id = t.property_id
  )

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'ticket_id', s.ticket_id,
      'property_id', s.property_id,
      'category', s.category,
      'maintenance_trade', s.maintenance_trade,
      'issue_summary', s.issue_summary,
      'bucket', s.bucket,
      'next_action', s.next_action,
      'next_action_reason', s.next_action_reason,
      'priority', s.priority,
      'priority_score', s.priority_score,
      'is_past_timeout', s.is_past_timeout,
      'sla_due_at', s.sla_due_at,
      'sla_total_hours', s.sla_total_hours,
      'deadline_date', s.deadline_date,
      'waiting_since', s.waiting_since,
      'contractor_sent_at', s.contractor_sent_at,
      'scheduled_date', s.scheduled_date,
      'landlord_allocated_at', s.landlord_allocated_at,
      'ooh_dispatched_at', s.ooh_dispatched_at,
      'tenant_contacted_at', s.tenant_contacted_at,
      'compliance_certificate_id', s.compliance_certificate_id,
      'property_label', s.property_label,
      'created_at', s.created_at,
      'reschedule_initiated_by', s.reschedule_initiated_by
    )
    ORDER BY s.priority_score DESC, s.waiting_since ASC
  ) INTO v_result
  FROM scored s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ── 3. Ticket Detail RPC — pass category to scoring ──────────────
CREATE OR REPLACE FUNCTION public.c1_ticket_detail(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_ticket c1_tickets%rowtype;
  v_timeout boolean;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_timeout := CASE
    WHEN v_ticket.next_action != 'waiting' THEN false
    WHEN v_ticket.next_action_reason = 'awaiting_contractor'
      AND v_ticket.contractor_sent_at IS NOT NULL
      AND now() - v_ticket.contractor_sent_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'awaiting_booking'
      AND now() - COALESCE(v_ticket.waiting_since, v_ticket.date_logged) > interval '3 days' THEN true
    WHEN v_ticket.next_action_reason = 'awaiting_landlord'
      AND now() - COALESCE(v_ticket.waiting_since, v_ticket.date_logged) > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'allocated_to_landlord'
      AND v_ticket.landlord_allocated_at IS NOT NULL
      AND now() - v_ticket.landlord_allocated_at > interval '72 hours' THEN true
    WHEN v_ticket.next_action_reason = 'ooh_dispatched'
      AND v_ticket.ooh_dispatched_at IS NOT NULL
      AND now() - v_ticket.ooh_dispatched_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'awaiting_tenant'
      AND v_ticket.tenant_contacted_at IS NOT NULL
      AND now() - v_ticket.tenant_contacted_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'scheduled'
      AND v_ticket.scheduled_date IS NOT NULL
      AND v_ticket.scheduled_date < CURRENT_DATE THEN true
    WHEN v_ticket.next_action_reason = 'reschedule_pending'
      AND now() - COALESCE(v_ticket.waiting_since, v_ticket.date_logged) > interval '48 hours' THEN true
    ELSE false
  END;

  SELECT
    -- Section 1: Core ticket fields
    jsonb_build_object(
      'id', t.id,
      'issue_title', t.issue_title,
      'issue_description', t.issue_description,
      'property_address', p.address,
      'property_id', t.property_id,
      'category', t.category,
      'maintenance_trade', t.maintenance_trade,
      'priority', t.priority,
      'date_logged', t.date_logged,
      'next_action', t.next_action,
      'next_action_reason', t.next_action_reason,
      'is_past_timeout', v_timeout,
      'priority_score', public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since, t.category),
      'status', t.status,
      'archived', t.archived,
      'on_hold', t.on_hold,
      'handoff', t.handoff,
      'handoff_reason', t.handoff_reason,
      'conversation_id', t.conversation_id,
      'is_manual', t.is_manual,
      'verified_by', t.verified_by
    )
    -- Section 2: Timing + financials
    || jsonb_build_object(
      'deadline_date', t.deadline_date,
      'sla_due_at', t.sla_due_at,
      'sla_total_hours', EXTRACT(EPOCH FROM (t.sla_due_at - t.waiting_since)) / 3600,
      'waiting_since', t.waiting_since,
      'contractor_sent_at', t.contractor_sent_at,
      'landlord_allocated_at', t.landlord_allocated_at,
      'ooh_dispatched_at', t.ooh_dispatched_at,
      'tenant_contacted_at', t.tenant_contacted_at,
      'scheduled_date', t.scheduled_date,
      'resolved_at', t.resolved_at,
      'contractor_quote', t.contractor_quote,
      'final_amount', t.final_amount,
      'images', t.images,
      'access', t.access,
      'access_granted', t.access_granted,
      'availability', t.availability,
      'auto_approve_limit', p.auto_approve_limit,
      'label', (SELECT (convo.log -> 0 ->> 'label')::text FROM c1_conversations convo WHERE convo.id = t.conversation_id)
    )
    -- Section 3: Reschedule + OOH + landlord allocation
    || jsonb_build_object(
      'reschedule_requested', t.reschedule_requested,
      'reschedule_date', t.reschedule_date,
      'reschedule_reason', t.reschedule_reason,
      'reschedule_status', t.reschedule_status,
      'reschedule_initiated_by', t.reschedule_initiated_by,
      'ooh_dispatched', t.ooh_dispatched,
      'ooh_outcome', t.ooh_outcome,
      'ooh_notes', t.ooh_notes,
      'ooh_cost', t.ooh_cost,
      'ooh_outcome_at', t.ooh_outcome_at,
      'ooh_submissions', t.ooh_submissions,
      'landlord_allocated', t.landlord_allocated,
      'landlord_outcome', t.landlord_outcome,
      'landlord_notes', t.landlord_notes,
      'landlord_cost', t.landlord_cost,
      'landlord_outcome_at', t.landlord_outcome_at,
      'landlord_submissions', t.landlord_submissions,
      'room_id', t.room_id,
      'tenant_id', t.tenant_id,
      'contractor_id', t.contractor_id,
      'compliance_certificate_id', t.compliance_certificate_id
    )
    -- Section 4: People
    || jsonb_build_object(
      'tenant', CASE WHEN ten.id IS NOT NULL THEN jsonb_build_object(
        'id', ten.id, 'name', ten.full_name, 'phone', ten.phone, 'email', ten.email) ELSE NULL END,
      'landlord', CASE WHEN ll.id IS NOT NULL THEN jsonb_build_object(
        'id', ll.id, 'name', ll.full_name, 'phone', ll.phone, 'email', ll.email)
        ELSE CASE WHEN p.landlord_name IS NOT NULL THEN jsonb_build_object(
          'name', p.landlord_name, 'phone', p.landlord_phone, 'email', p.landlord_email) ELSE NULL END
      END,
      'manager', jsonb_build_object(
        'id', pm.id, 'name', pm.name, 'phone', pm.phone, 'email', pm.email, 'business_name', pm.business_name),
      'contractor', (
        SELECT jsonb_build_object(
          'id', (elem->>'id')::uuid, 'name', elem->>'name',
          'phone', elem->>'phone', 'email', elem->>'email', 'status', elem->>'status'
        )
        FROM c1_messages m, jsonb_array_elements(m.contractors) elem
        WHERE m.ticket_id = t.id
          AND elem->>'status' NOT IN ('withdrawn', 'declined', 'no_response')
        LIMIT 1
      )
    )
    -- Section 5: Category-specific data
    || jsonb_build_object(
      'compliance', CASE WHEN t.compliance_certificate_id IS NOT NULL THEN jsonb_build_object(
        'cert_id', cc.id, 'cert_type', cc.certificate_type, 'expiry_date', cc.expiry_date,
        'status', cc.status, 'document_url', cc.document_url, 'issued_date', cc.issued_date,
        'certificate_number', cc.certificate_number, 'issued_by', cc.issued_by, 'contractor_id', cc.contractor_id
      ) ELSE NULL END,
      'rent_summary', CASE WHEN t.category = 'rent_arrears' THEN (
        SELECT jsonb_build_object(
          'total_owed', COALESCE(SUM(amount_due), 0),
          'total_paid', COALESCE(SUM(COALESCE(amount_paid, 0)), 0),
          'months_overdue', COUNT(*)
        ) FROM c1_rent_ledger
        WHERE tenant_id = t.tenant_id AND status IN ('overdue', 'partial')
      ) ELSE NULL END,
      'rent_ledger', CASE WHEN t.category = 'rent_arrears' THEN (
        SELECT jsonb_agg(jsonb_build_object(
          'id', rl.id, 'due_date', rl.due_date, 'amount_due', rl.amount_due,
          'amount_paid', rl.amount_paid, 'status', rl.status, 'room_id', rl.room_id,
          'paid_at', rl.paid_at, 'payment_method', rl.payment_method, 'notes', rl.notes
        ) ORDER BY rl.due_date DESC)
        FROM (SELECT * FROM c1_rent_ledger WHERE tenant_id = t.tenant_id LIMIT 12) rl
      ) ELSE NULL END
    )
  INTO v_result
  FROM c1_tickets t
  LEFT JOIN c1_properties p ON p.id = t.property_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  LEFT JOIN c1_landlords ll ON ll.id = p.landlord_id
  LEFT JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN c1_compliance_certificates cc ON cc.id = t.compliance_certificate_id
  WHERE t.id = p_ticket_id;

  RETURN v_result;
END;
$$;
