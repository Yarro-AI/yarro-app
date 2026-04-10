-- Sprint E, Part 1: Ticket detail RPC
-- Single RPC replaces 7+ queries in the drawer.
-- Returns all ticket data + people + category-specific fields + timeout.

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

  -- Compute timeout (same logic as dashboard RPC)
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

  SELECT jsonb_build_object(
    -- Universal
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
    'priority_score', public.c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since),
    'status', t.status,
    'archived', t.archived,
    'on_hold', t.on_hold,
    'handoff', t.handoff,
    'handoff_reason', t.handoff_reason,
    'conversation_id', t.conversation_id,
    'is_manual', t.is_manual,
    'verified_by', t.verified_by,

    -- Timing
    'deadline_date', t.deadline_date,
    'sla_due_at', t.sla_due_at,
    'waiting_since', t.waiting_since,
    'contractor_sent_at', t.contractor_sent_at,
    'landlord_allocated_at', t.landlord_allocated_at,
    'ooh_dispatched_at', t.ooh_dispatched_at,
    'tenant_contacted_at', t.tenant_contacted_at,
    'scheduled_date', t.scheduled_date,
    'resolved_at', t.resolved_at,

    -- Financials
    'contractor_quote', t.contractor_quote,
    'final_amount', t.final_amount,
    'images', t.images,

    -- Access
    'access', t.access,
    'access_granted', t.access_granted,
    'availability', t.availability,

    -- Reschedule
    'reschedule_requested', t.reschedule_requested,
    'reschedule_date', t.reschedule_date,
    'reschedule_reason', t.reschedule_reason,
    'reschedule_status', t.reschedule_status,
    'reschedule_initiated_by', t.reschedule_initiated_by,

    -- OOH / Landlord allocation
    'ooh_dispatched', t.ooh_dispatched,
    'ooh_outcome', t.ooh_outcome,
    'ooh_notes', t.ooh_notes,
    'ooh_cost', t.ooh_cost,
    'landlord_allocated', t.landlord_allocated,
    'landlord_outcome', t.landlord_outcome,
    'landlord_notes', t.landlord_notes,
    'landlord_cost', t.landlord_cost,

    -- People
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
        'id', (elem->>'id')::uuid,
        'name', elem->>'name',
        'phone', elem->>'phone',
        'email', elem->>'email',
        'status', elem->>'status'
      )
      FROM c1_messages m, jsonb_array_elements(m.contractors) elem
      WHERE m.ticket_id = t.id
        AND elem->>'status' NOT IN ('withdrawn', 'declined', 'no_response')
      LIMIT 1
    ),

    -- Compliance-specific (NULL for non-compliance)
    'compliance', CASE WHEN t.compliance_certificate_id IS NOT NULL THEN jsonb_build_object(
      'cert_id', cc.id,
      'cert_type', cc.certificate_type,
      'expiry_date', cc.expiry_date,
      'status', cc.status,
      'document_url', cc.document_url,
      'issued_date', cc.issued_date,
      'certificate_number', cc.certificate_number,
      'issued_by', cc.issued_by
    ) ELSE NULL END,

    -- Rent-specific (NULL for non-rent)
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
        'due_date', due_date, 'amount_due', amount_due,
        'amount_paid', amount_paid, 'status', status
      ) ORDER BY due_date DESC)
      FROM c1_rent_ledger WHERE tenant_id = t.tenant_id
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
