-- Migration A: Trigger Hardening
--
-- 1. Replace pg_trigger_depth() > 1 with session-variable self-recursion guard.
--    The old guard blocked ALL nested triggers. The new guard only blocks the
--    trigger from re-entering itself. This fixes the rent ticket chain:
--    room trigger → ledger trigger → ticket INSERT → recompute trigger (now fires).
--
-- 2. Add INSERT auto-close guard. A ticket that computes as 'completed' on
--    the same INSERT that created it is always a logic error. Write the state
--    but skip auto-close, log a warning.
--
-- 3. Remove explicit compute workaround from create_rent_arrears_ticket
--    (no longer needed — the trigger fires correctly at any depth).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Replace c1_trigger_recompute_next_action
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_trigger_recompute_next_action()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket_id UUID;
  v_result RECORD;
  v_priority text;
  v_old_bucket text;
  v_old_reason text;
  v_property_label text;
BEGIN
  IF TG_TABLE_NAME = 'c1_tickets' THEN
    v_ticket_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'c1_messages' THEN
    v_ticket_id := NEW.ticket_id;
  ELSIF TG_TABLE_NAME = 'c1_job_completions' THEN
    v_ticket_id := NEW.id;
  END IF;

  -- Self-recursion guard (replaces pg_trigger_depth() > 1).
  -- Allows the trigger to fire at any depth in a trigger chain,
  -- but prevents re-entering itself when its own UPDATE fires this trigger again.
  IF current_setting('yarro.recomputing', true) = 'true' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('yarro.recomputing', 'true', true);

  -- Read current state BEFORE recompute (for STATE_CHANGED comparison)
  SELECT priority, next_action, next_action_reason
  INTO v_priority, v_old_bucket, v_old_reason
  FROM c1_tickets WHERE id = v_ticket_id;

  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  -- Auto-close: if computed state is 'completed', close the ticket
  IF v_result.next_action = 'completed' THEN
    -- INSERT guard: a ticket that computes as completed on creation is a logic error.
    -- Write the state for debugging but do NOT auto-close.
    IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'c1_tickets' THEN
      RAISE WARNING 'Ticket % computed as completed on INSERT (reason: %), skipping auto-close',
        v_ticket_id, v_result.next_action_reason;

      UPDATE c1_tickets
      SET next_action = v_result.next_action,
          next_action_reason = v_result.next_action_reason
      WHERE id = v_ticket_id;

      PERFORM set_config('yarro.recomputing', 'false', true);
      RETURN NEW;
    END IF;

    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = COALESCE(resolved_at, now()),
        next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason,
        waiting_since = now(),
        sla_due_at = NULL
    WHERE id = v_ticket_id
      AND lower(status) != 'closed';

    IF v_old_reason IS DISTINCT FROM v_result.next_action_reason THEN
      SELECT p.address INTO v_property_label
      FROM c1_properties p
      JOIN c1_tickets t ON t.property_id = p.id
      WHERE t.id = v_ticket_id;

      PERFORM c1_log_event(
        v_ticket_id, 'STATE_CHANGED', 'system', NULL, v_property_label,
        jsonb_build_object(
          'from_bucket', v_old_bucket,
          'to_bucket', v_result.next_action,
          'from_reason', v_old_reason,
          'to_reason', v_result.next_action_reason
        )
      );
    END IF;

    PERFORM set_config('yarro.recomputing', 'false', true);
    RETURN NEW;
  END IF;

  -- 4-field write: only when reason actually changes
  UPDATE c1_tickets
  SET next_action = v_result.next_action,
      next_action_reason = v_result.next_action_reason,
      waiting_since = now(),
      sla_due_at = CASE
        WHEN v_result.next_action = 'needs_action' THEN
          CASE
            WHEN v_priority = 'Emergency'
              THEN now() + interval '24 hours'
            WHEN v_result.next_action_reason IN ('handoff_review', 'pending_review', 'no_contractors')
              THEN now() + interval '4 hours'
            WHEN v_result.next_action_reason = 'manager_approval'
              THEN now() + interval '24 hours'
            WHEN v_result.next_action_reason = 'job_not_completed'
              THEN now() + interval '24 hours'
            WHEN v_priority = 'Urgent'
              THEN now() + interval '48 hours'
            WHEN v_priority = 'High'
              THEN now() + interval '48 hours'
            WHEN v_priority = 'Medium'
              THEN now() + interval '72 hours'
            ELSE now() + interval '7 days'
          END
        ELSE NULL
      END
  WHERE id = v_ticket_id
    AND (next_action IS DISTINCT FROM v_result.next_action
      OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);

  -- Log state change (only when reason actually changed)
  IF v_old_reason IS DISTINCT FROM v_result.next_action_reason THEN
    SELECT p.address INTO v_property_label
    FROM c1_properties p
    JOIN c1_tickets t ON t.property_id = p.id
    WHERE t.id = v_ticket_id;

    PERFORM c1_log_event(
      v_ticket_id, 'STATE_CHANGED', 'system', NULL, v_property_label,
      jsonb_build_object(
        'from_bucket', v_old_bucket,
        'to_bucket', v_result.next_action,
        'from_reason', v_old_reason,
        'to_reason', v_result.next_action_reason
      )
    );
  END IF;

  PERFORM set_config('yarro.recomputing', 'false', true);
  RETURN NEW;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Simplify create_rent_arrears_ticket — remove explicit compute workaround
-- ═══════════════════════════════════════════════════════════════════════════

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
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
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
  -- The INSERT fires trg_tickets_recompute_next_action which now works
  -- at any trigger depth (session-variable guard replaces depth guard).
  -- No explicit c1_compute_next_action call needed.
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
