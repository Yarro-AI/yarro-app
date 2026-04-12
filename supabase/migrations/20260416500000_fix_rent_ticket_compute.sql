-- Fix: Rent arrears tickets created with next_action = NULL.
--
-- Root cause: trigger chain depth. When a tenant is assigned:
--   trg_room_tenant_assigned (depth 1) → creates ledger entry
--   trg_rent_ledger_overdue_ticket (depth 2) → calls create_rent_arrears_ticket
--   create_rent_arrears_ticket → inserts ticket
--   trg_tickets_recompute_next_action (depth 3) → pg_trigger_depth() > 1 → SKIPS
--
-- Fix: create_rent_arrears_ticket explicitly computes and sets next_action
-- after inserting the ticket, so it doesn't rely on the trigger.

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_deadline_date date DEFAULT NULL::date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id uuid;
  v_property_label text;
  v_result RECORD;
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

  -- Explicitly compute next_action (trigger may skip due to pg_trigger_depth)
  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  IF v_result IS NOT NULL AND v_result.next_action IS NOT NULL THEN
    UPDATE c1_tickets
    SET next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason
    WHERE id = v_ticket_id;
  END IF;

  -- Audit event
  SELECT address INTO v_property_label FROM c1_properties WHERE id = p_property_id;

  PERFORM c1_log_event(
    v_ticket_id, 'AUTO_TICKET_RENT', 'SYSTEM', NULL,
    v_property_label,
    jsonb_build_object('tenant_id', p_tenant_id, 'deadline_date', p_deadline_date)
  );

  RETURN v_ticket_id;
END;
$function$;
