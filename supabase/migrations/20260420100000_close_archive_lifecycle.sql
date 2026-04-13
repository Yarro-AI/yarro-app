-- ============================================================
-- SSOT Finding #6 + #8: Close vs Archive lifecycle
-- ============================================================
-- Problem: Closed and archived are conflated. Archive forces status='closed',
-- manual close sets next_action_reason='archived', events don't distinguish
-- PM from system, no restore/reopen path, message archive scattered.
--
-- Fix: 4 RPCs own all lifecycle transitions. Frontend calls RPCs, never
-- direct .update(). Events distinguish PM from SYSTEM with metadata.
-- Archive preserves status. 'manually_closed' reason for PM-initiated close.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Update CHECK constraint — add 'manually_closed'
-- ═══════════════════════════════════════════════════════════════

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
  -- Cross-category
  'awaiting_tenant',
  -- Compliance
  'compliance_needs_dispatch', 'cert_incomplete', 'cert_renewed',
  -- Rent
  'rent_overdue', 'rent_partial_payment', 'rent_cleared',
  -- Error
  'unknown_category'
));


-- ═══════════════════════════════════════════════════════════════
-- 2. c1_close_ticket — PM manually closes a ticket
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_close_ticket(
  p_ticket_id uuid,
  p_pm_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_property_label text;
BEGIN
  -- Validate ticket exists and belongs to PM
  SELECT t.*, p.address AS property_address
  INTO v_ticket
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  WHERE t.id = p_ticket_id
    AND t.property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  IF v_ticket.status = 'closed' THEN
    RAISE EXCEPTION 'Ticket is already closed';
  END IF;

  v_property_label := v_ticket.property_address;

  -- Close the ticket
  UPDATE c1_tickets
  SET status = 'closed',
      resolved_at = now(),
      next_action = 'completed',
      next_action_reason = 'manually_closed',
      sla_due_at = NULL,
      waiting_since = NULL,
      on_hold = false
  WHERE id = p_ticket_id;

  -- Log event with PM actor (trigger will skip because next_action_reason = 'manually_closed')
  INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
  VALUES (p_pm_id, p_ticket_id, 'TICKET_CLOSED', 'PM', NULL, v_property_label,
    jsonb_build_object('close_type', 'manual'));
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 3. c1_archive_ticket — PM archives a ticket (bins it)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_archive_ticket(
  p_ticket_id uuid,
  p_pm_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
BEGIN
  -- Validate ticket exists and belongs to PM
  SELECT id, conversation_id, archived
  INTO v_ticket
  FROM c1_tickets
  WHERE id = p_ticket_id
    AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  IF v_ticket.archived = true THEN
    RAISE EXCEPTION 'Ticket is already archived';
  END IF;

  -- Archive ticket (does NOT touch status — preserves lifecycle position)
  UPDATE c1_tickets
  SET archived = true,
      archived_at = now()
  WHERE id = p_ticket_id;

  -- Archive messages
  UPDATE c1_messages
  SET archived = true,
      archived_at = now()
  WHERE ticket_id = p_ticket_id;

  -- Archive conversation
  IF v_ticket.conversation_id IS NOT NULL THEN
    UPDATE c1_conversations
    SET archived = true,
        archived_at = now()
    WHERE id = v_ticket.conversation_id;
  END IF;

  -- Event is logged by trigger (trg_c1_events_on_ticket TICKET_ARCHIVED block)
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 4. c1_restore_ticket — PM restores an archived ticket
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_restore_ticket(
  p_ticket_id uuid,
  p_pm_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
BEGIN
  -- Validate ticket exists, belongs to PM, and is archived
  SELECT id, conversation_id, archived
  INTO v_ticket
  FROM c1_tickets
  WHERE id = p_ticket_id
    AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  IF COALESCE(v_ticket.archived, false) = false THEN
    RAISE EXCEPTION 'Ticket is not archived';
  END IF;

  -- Restore ticket
  UPDATE c1_tickets
  SET archived = false,
      archived_at = NULL
  WHERE id = p_ticket_id;

  -- Restore messages
  UPDATE c1_messages
  SET archived = false,
      archived_at = NULL
  WHERE ticket_id = p_ticket_id;

  -- Restore conversation
  IF v_ticket.conversation_id IS NOT NULL THEN
    UPDATE c1_conversations
    SET archived = false,
        archived_at = NULL
    WHERE id = v_ticket.conversation_id;
  END IF;

  -- Event is logged by trigger (trg_c1_events_on_ticket TICKET_RESTORED block)
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 5. c1_reopen_ticket — PM reopens a closed ticket
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_reopen_ticket(
  p_ticket_id uuid,
  p_pm_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_property_label text;
  v_previous_reason text;
BEGIN
  -- Validate ticket exists, belongs to PM, is closed, not archived
  SELECT t.*, p.address AS property_address
  INTO v_ticket
  FROM c1_tickets t
  JOIN c1_properties p ON p.id = t.property_id
  WHERE t.id = p_ticket_id
    AND t.property_manager_id = p_pm_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found or access denied';
  END IF;

  IF v_ticket.status != 'closed' THEN
    RAISE EXCEPTION 'Ticket is not closed';
  END IF;

  IF COALESCE(v_ticket.archived, false) = true THEN
    RAISE EXCEPTION 'Cannot reopen an archived ticket — restore it first';
  END IF;

  v_property_label := v_ticket.property_address;
  v_previous_reason := v_ticket.next_action_reason;

  -- Reopen: set status to open, clear resolved_at
  -- The recompute trigger (c1_trigger_recompute_next_action) fires automatically
  -- and sets correct next_action / next_action_reason based on current ticket state
  UPDATE c1_tickets
  SET status = 'open',
      resolved_at = NULL
  WHERE id = p_ticket_id;

  -- Log reopen event with previous reason for audit trail
  INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
  VALUES (p_pm_id, p_ticket_id, 'TICKET_REOPENED', 'PM', NULL, v_property_label,
    jsonb_build_object('previous_reason', v_previous_reason));
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 6. Update events trigger — distinguish manual from auto close
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_c1_events_on_ticket()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_property_label text;
  v_tenant_name text;
BEGIN
  IF NEW.property_manager_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.address INTO v_property_label
  FROM c1_properties p WHERE p.id = NEW.property_id;

  SELECT t.full_name INTO v_tenant_name
  FROM c1_tenants t WHERE t.id = NEW.tenant_id;

  -- ISSUE_CREATED: new ticket inserted
  IF TG_OP = 'INSERT' THEN
    INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
    VALUES (
      NEW.property_manager_id,
      NEW.id,
      'ISSUE_CREATED',
      CASE WHEN NEW.is_manual THEN 'PM' ELSE 'TENANT' END,
      COALESCE(v_tenant_name, 'Unknown'),
      v_property_label,
      jsonb_build_object('category', NEW.category, 'priority', NEW.priority)
    );

    IF NEW.handoff = true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'HANDOFF_CREATED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF COALESCE(NEW.pending_review, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'PENDING_REVIEW', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;
  END IF;

  -- UPDATE events
  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.pending_review, false) AND NOT COALESCE(OLD.pending_review, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'PENDING_REVIEW', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    -- TICKET_CLOSED: skip if manually_closed (c1_close_ticket RPC already logged with actor_type='PM')
    IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
      IF NEW.next_action_reason IS DISTINCT FROM 'manually_closed' THEN
        INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
        VALUES (NEW.property_manager_id, NEW.id, 'TICKET_CLOSED', 'SYSTEM', NULL, v_property_label,
          jsonb_build_object('close_type', 'auto', 'reason', NEW.next_action_reason));
      END IF;
    END IF;

    -- JOB_COMPLETED
    IF NEW.next_action_reason = 'completed' AND OLD.next_action_reason IS DISTINCT FROM 'completed' THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'JOB_COMPLETED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.scheduled_date IS NOT NULL AND OLD.scheduled_date IS NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'JOB_SCHEDULED', 'SYSTEM', NULL, v_property_label,
        jsonb_build_object('scheduled_date', NEW.scheduled_date));
    END IF;

    IF NEW.handoff = true AND (OLD.handoff IS DISTINCT FROM true) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'HANDOFF_CREATED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.on_hold = true AND OLD.on_hold IS DISTINCT FROM true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_ON_HOLD', 'PM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.on_hold = false AND OLD.on_hold = true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_RESUMED', 'PM', NULL, v_property_label, NULL);
    END IF;

    -- TICKET_ARCHIVED
    IF NEW.archived = true AND OLD.archived IS DISTINCT FROM true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_ARCHIVED', 'PM', NULL, v_property_label, NULL);
    END IF;

    -- TICKET_RESTORED (new)
    IF NEW.archived = false AND OLD.archived = true THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'TICKET_RESTORED', 'PM', NULL, v_property_label, NULL);
    END IF;

    -- ═══ OOH Events ═══

    IF COALESCE(NEW.ooh_dispatched, false) AND NOT COALESCE(OLD.ooh_dispatched, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'OOH_DISPATCHED', 'SYSTEM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.ooh_outcome_at IS DISTINCT FROM OLD.ooh_outcome_at AND NEW.ooh_outcome IS NOT NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id,
        CASE NEW.ooh_outcome
          WHEN 'resolved' THEN 'OOH_RESOLVED'
          WHEN 'unresolved' THEN 'OOH_UNRESOLVED'
          WHEN 'in_progress' THEN 'OOH_IN_PROGRESS'
        END,
        'OOH_CONTACT', NULL, v_property_label,
        jsonb_build_object('outcome', NEW.ooh_outcome, 'notes', NEW.ooh_notes, 'cost', NEW.ooh_cost));
    END IF;

    -- ═══ Landlord Allocation Events ═══

    IF COALESCE(NEW.landlord_allocated, false) AND NOT COALESCE(OLD.landlord_allocated, false) THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id, 'LANDLORD_ALLOCATED', 'PM', NULL, v_property_label, NULL);
    END IF;

    IF NEW.landlord_outcome_at IS DISTINCT FROM OLD.landlord_outcome_at AND NEW.landlord_outcome IS NOT NULL THEN
      INSERT INTO c1_events (portfolio_id, ticket_id, event_type, actor_type, actor_name, property_label, metadata)
      VALUES (NEW.property_manager_id, NEW.id,
        CASE NEW.landlord_outcome
          WHEN 'resolved' THEN 'LANDLORD_RESOLVED_ALLOC'
          WHEN 'in_progress' THEN 'LANDLORD_IN_PROGRESS'
          WHEN 'need_help' THEN 'LANDLORD_NEEDS_HELP'
        END,
        'LANDLORD', NULL, v_property_label,
        jsonb_build_object('outcome', NEW.landlord_outcome, 'notes', NEW.landlord_notes, 'cost', NEW.landlord_cost));
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'c1_events ticket trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;
