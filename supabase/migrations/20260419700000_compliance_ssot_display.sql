-- SSOT Findings #2 + #10: Compliance status SSOT
--
-- Finding #2: Cert expiry status computed in 3 frontend files with different date math.
--   Fix: Shared SQL function + new cert detail RPC + days_remaining in ticket detail.
--
-- Finding #10: Status grouping hardcoded in 5 frontend locations.
--   Fix: status_group field computed by shared function, returned by all compliance RPCs.
--
-- Pattern: matches compute_sla_due_at() and compute_is_past_timeout() — shared function,
-- one definition, multiple consumers.
--
-- ⚠️ PROTECTED RPCs — approved by Adam (SSOT audit 2026-04-13, Findings #2, #10).


-- ═══════════════════════════════════════════════════════════════
-- 1. Shared function: compute_cert_display_status
-- ═══════════════════════════════════════════════════════════════
-- One definition of display_status, status_group, and days_remaining.
-- Called by compliance_get_all_statuses, compliance_get_property_status,
-- compliance_get_cert_detail, and available for future compliance RPCs.

CREATE OR REPLACE FUNCTION public.compute_cert_display_status(
  p_document_url text,
  p_expiry_date date,
  p_has_ticket boolean,
  p_ticket_next_action text,
  p_ticket_next_action_reason text
) RETURNS TABLE(display_status text, status_group text, days_remaining integer)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    -- display_status: fine-grained status for badges and filter tabs
    CASE
      WHEN p_document_url IS NULL OR p_expiry_date IS NULL THEN 'incomplete'
      WHEN p_has_ticket AND p_ticket_next_action_reason IN ('cert_renewed', 'completed') THEN 'valid'
      WHEN p_has_ticket AND p_ticket_next_action = 'scheduled' THEN 'renewal_scheduled'
      WHEN p_has_ticket AND p_ticket_next_action = 'waiting' THEN 'in_progress'
      WHEN p_has_ticket AND p_ticket_next_action = 'needs_action' THEN 'awaiting_dispatch'
      WHEN p_has_ticket THEN 'renewal_requested'
      WHEN p_expiry_date < CURRENT_DATE THEN 'expired'
      WHEN p_expiry_date < CURRENT_DATE + interval '30 days' THEN 'expiring_soon'
      ELSE 'valid'
    END,
    -- status_group: broad grouping for sidebar badges and property page
    -- 'attention' = PM needs to act (no ticket handling it)
    -- 'valid' = cert is ok or actively being renewed
    CASE
      WHEN p_document_url IS NULL OR p_expiry_date IS NULL THEN 'attention'
      WHEN p_has_ticket THEN 'valid'
      WHEN p_expiry_date < CURRENT_DATE THEN 'attention'
      WHEN p_expiry_date < CURRENT_DATE + interval '30 days' THEN 'attention'
      ELSE 'valid'
    END,
    -- days_remaining: computed from expiry_date
    CASE
      WHEN p_expiry_date IS NOT NULL THEN (p_expiry_date - CURRENT_DATE)::integer
      ELSE NULL
    END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. compliance_get_all_statuses — use shared function + add status_group
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compliance_get_all_statuses(
  p_pm_id uuid
)
RETURNS TABLE (
  cert_id uuid,
  property_id uuid,
  property_address text,
  certificate_type text,
  display_status text,
  status_group text,
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
    cs.display_status,
    cs.status_group,
    cert.expiry_date,
    cs.days_remaining,
    cert.issued_date,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id
  FROM c1_compliance_certificates cert
  JOIN c1_properties p ON p.id = cert.property_id
  LEFT JOIN LATERAL (
    SELECT tk.id, tk.next_action, tk.next_action_reason
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
  WHERE cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cs.display_status = 'incomplete' THEN 2
      WHEN cs.display_status = 'expired' THEN 3
      WHEN cs.display_status = 'expiring_soon' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3. compliance_get_property_status — use shared function + add status_group
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compliance_get_property_status(
  p_property_id uuid,
  p_pm_id uuid
)
RETURNS TABLE (
  certificate_type text,
  display_status text,
  status_group text,
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
    cs.display_status,
    cs.status_group,
    cert.expiry_date,
    cs.days_remaining,
    cert.id AS cert_id,
    cert.issued_by,
    cert.certificate_number,
    cert.document_url,
    t.id AS renewal_ticket_id,
    cert.reminder_days_before,
    cert.contractor_id
  FROM c1_compliance_certificates cert
  LEFT JOIN LATERAL (
    SELECT tk.id, tk.next_action, tk.next_action_reason
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
  WHERE cert.property_id = p_property_id
    AND cert.property_manager_id = p_pm_id
  ORDER BY
    CASE
      WHEN cs.display_status = 'incomplete' THEN 2
      WHEN cs.display_status = 'expired' THEN 3
      WHEN cs.display_status = 'expiring_soon' THEN 4
      ELSE 5
    END,
    cert.expiry_date ASC NULLS FIRST;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 4. compliance_get_cert_detail — new RPC for cert detail page
-- ═══════════════════════════════════════════════════════════════
-- Returns full cert + display_status + days_remaining + status_group
-- + linked ticket + property address + contractor name.
-- Replaces the direct .from() query + manual status computation in the frontend.

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


-- ═══════════════════════════════════════════════════════════════
-- 5. c1_ticket_detail — add days_remaining to compliance section
-- ═══════════════════════════════════════════════════════════════
-- This replaces the version from 20260419600000 (Session 3).
-- Only change: added days_remaining to the compliance jsonb_build_object.

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

  v_timeout := public.compute_is_past_timeout(
    v_ticket.next_action, v_ticket.next_action_reason,
    v_ticket.contractor_sent_at, v_ticket.waiting_since, v_ticket.date_logged,
    v_ticket.landlord_allocated_at, v_ticket.ooh_dispatched_at, v_ticket.tenant_contacted_at,
    v_ticket.scheduled_date, v_ticket.property_manager_id
  );

  SELECT
    jsonb_build_object(
      'id', t.id, 'issue_title', t.issue_title, 'issue_description', t.issue_description,
      'property_address', p.address, 'property_id', t.property_id,
      'category', t.category, 'maintenance_trade', t.maintenance_trade,
      'priority', t.priority, 'date_logged', t.date_logged,
      'next_action', t.next_action, 'next_action_reason', t.next_action_reason,
      'is_past_timeout', v_timeout,
      'priority_score', public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since),
      'status', t.status, 'archived', t.archived, 'on_hold', t.on_hold,
      'handoff', t.handoff, 'handoff_reason', t.handoff_reason,
      'conversation_id', t.conversation_id, 'is_manual', t.is_manual, 'verified_by', t.verified_by
    )
    || jsonb_build_object(
      'deadline_date', t.deadline_date, 'sla_due_at', t.sla_due_at,
      'sla_total_hours', EXTRACT(EPOCH FROM (t.sla_due_at - t.waiting_since)) / 3600,
      'waiting_since', t.waiting_since, 'contractor_sent_at', t.contractor_sent_at,
      'landlord_allocated_at', t.landlord_allocated_at, 'ooh_dispatched_at', t.ooh_dispatched_at,
      'tenant_contacted_at', t.tenant_contacted_at, 'scheduled_date', t.scheduled_date,
      'resolved_at', t.resolved_at, 'contractor_quote', t.contractor_quote,
      'final_amount', t.final_amount, 'images', t.images,
      'access', t.access, 'access_granted', t.access_granted, 'availability', t.availability,
      'auto_approve_limit', p.auto_approve_limit,
      'label', (SELECT (convo.log -> 0 ->> 'label')::text FROM c1_conversations convo WHERE convo.id = t.conversation_id)
    )
    || jsonb_build_object(
      'reschedule_requested', t.reschedule_requested, 'reschedule_date', t.reschedule_date,
      'reschedule_reason', t.reschedule_reason, 'reschedule_status', t.reschedule_status,
      'reschedule_initiated_by', t.reschedule_initiated_by,
      'ooh_dispatched', t.ooh_dispatched, 'ooh_outcome', t.ooh_outcome,
      'ooh_notes', t.ooh_notes, 'ooh_cost', t.ooh_cost,
      'ooh_outcome_at', t.ooh_outcome_at, 'ooh_submissions', t.ooh_submissions,
      'landlord_allocated', t.landlord_allocated, 'landlord_outcome', t.landlord_outcome,
      'landlord_notes', t.landlord_notes, 'landlord_cost', t.landlord_cost,
      'landlord_outcome_at', t.landlord_outcome_at, 'landlord_submissions', t.landlord_submissions,
      'room_id', t.room_id, 'tenant_id', t.tenant_id,
      'contractor_id', t.contractor_id, 'compliance_certificate_id', t.compliance_certificate_id
    )
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
    || jsonb_build_object(
      'compliance', CASE WHEN t.compliance_certificate_id IS NOT NULL THEN jsonb_build_object(
        'cert_id', cc.id, 'cert_type', cc.certificate_type, 'expiry_date', cc.expiry_date,
        'status', cc.status, 'document_url', cc.document_url, 'issued_date', cc.issued_date,
        'certificate_number', cc.certificate_number, 'issued_by', cc.issued_by, 'contractor_id', cc.contractor_id,
        'days_remaining', CASE WHEN cc.expiry_date IS NOT NULL THEN (cc.expiry_date - CURRENT_DATE)::integer ELSE NULL END
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
