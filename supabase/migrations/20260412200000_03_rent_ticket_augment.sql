-- Sprint B, Step 3: Augment create_rent_arrears_ticket
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Changes:
--   - Auto-compute deadline_date from c1_rent_ledger when not passed
--   - Add AUTO_TICKET_RENT audit event for new tickets

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_deadline_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_id uuid;
  v_property_label text;
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

  -- Auto-compute deadline from earliest overdue rent entry if not provided
  IF p_deadline_date IS NULL THEN
    SELECT MIN(due_date) INTO p_deadline_date
    FROM c1_rent_ledger
    WHERE tenant_id = p_tenant_id AND status IN ('overdue', 'partial');
  END IF;

  -- Create new ticket
  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    verified_by, is_manual, handoff,
    waiting_since, deadline_date
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', 'high',
    'system', true, false,
    now(), p_deadline_date
  ) RETURNING id INTO v_ticket_id;

  -- Audit event (non-negotiable per architecture rules)
  SELECT address INTO v_property_label FROM c1_properties WHERE id = p_property_id;

  PERFORM c1_log_event(
    v_ticket_id, 'AUTO_TICKET_RENT', 'SYSTEM', NULL,
    v_property_label,
    jsonb_build_object('tenant_id', p_tenant_id, 'deadline_date', p_deadline_date)
  );

  RETURN v_ticket_id;
END;
$$;
