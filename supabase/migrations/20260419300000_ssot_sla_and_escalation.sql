-- ═══════════════════════════════════════════════════════════════════════════
-- SSOT Fix: Shared SLA function + smart maintenance escalation
--
-- 1. Extract SLA duration into compute_sla_due_at() — single source of truth
-- 2. Update trg_tickets_recompute_next_action to use it
-- 3. Update trg_priority_sla_reset to use it
-- 4. Fix maintenance escalation: check stuck/stalled, not raw age
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Shared SLA computation function ───────────────────────────────────
-- ONE place defines "what SLA duration does this ticket get?"
-- Both triggers call this. Change durations here, they update everywhere.

CREATE OR REPLACE FUNCTION public.compute_sla_due_at(
  p_next_action text,
  p_next_action_reason text,
  p_priority text
)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- SLA only applies when PM needs to act
  IF p_next_action != 'needs_action' THEN
    RETURN NULL;
  END IF;

  RETURN now() + CASE
    -- Emergency always gets shortest window
    WHEN lower(p_priority) = 'emergency'
      THEN interval '24 hours'
    -- Reason-based overrides (these are time-sensitive regardless of priority)
    WHEN p_next_action_reason IN ('handoff_review', 'pending_review', 'no_contractors')
      THEN interval '4 hours'
    WHEN p_next_action_reason = 'manager_approval'
      THEN interval '24 hours'
    WHEN p_next_action_reason = 'job_not_completed'
      THEN interval '24 hours'
    -- Priority-based defaults
    WHEN lower(p_priority) = 'urgent'
      THEN interval '48 hours'
    WHEN lower(p_priority) = 'high'
      THEN interval '48 hours'
    WHEN lower(p_priority) = 'medium'
      THEN interval '72 hours'
    ELSE interval '7 days'
  END;
END;
$$;


-- ─── 2. Update main trigger to use shared function ────────────────────────

CREATE OR REPLACE FUNCTION public.trg_tickets_recompute_next_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id uuid;
  v_result record;
  v_old_bucket text;
  v_old_reason text;
  v_priority text;
  v_property_label text;
BEGIN
  -- Self-recursion guard (session variable)
  IF current_setting('yarro.recomputing', true) = 'true' THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('yarro.recomputing', 'true', true);

  -- Resolve ticket ID from whichever table triggered
  IF TG_TABLE_NAME = 'c1_tickets' THEN
    v_ticket_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'c1_messages' THEN
    v_ticket_id := NEW.ticket_id;
  ELSIF TG_TABLE_NAME = 'c1_job_completions' THEN
    v_ticket_id := NEW.ticket_id;
  ELSE
    PERFORM set_config('yarro.recomputing', 'false', true);
    RETURN NEW;
  END IF;

  -- Read current state
  SELECT next_action, next_action_reason, priority
  INTO v_old_bucket, v_old_reason, v_priority
  FROM c1_tickets WHERE id = v_ticket_id;

  -- Compute new state via polymorphic router
  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  IF v_result IS NULL OR v_result.next_action IS NULL THEN
    PERFORM set_config('yarro.recomputing', 'false', true);
    RETURN NEW;
  END IF;

  -- INSERT auto-close guard: if ticket computes as 'completed' on INSERT,
  -- write state but skip auto-close (prevents cert_renewed race condition)
  IF TG_OP = 'INSERT' AND TG_TABLE_NAME = 'c1_tickets'
     AND v_result.next_action = 'completed' THEN

    UPDATE c1_tickets
    SET next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason,
        waiting_since = now(),
        sla_due_at = NULL
    WHERE id = v_ticket_id;

    PERFORM set_config('yarro.recomputing', 'false', true);
    RETURN NEW;
  END IF;

  -- Auto-close path
  IF v_result.next_action = 'completed' THEN
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

  -- 4-field write: uses shared SLA function (SSOT)
  UPDATE c1_tickets
  SET next_action = v_result.next_action,
      next_action_reason = v_result.next_action_reason,
      waiting_since = now(),
      sla_due_at = compute_sla_due_at(v_result.next_action, v_result.next_action_reason, v_priority)
  WHERE id = v_ticket_id
    AND (next_action IS DISTINCT FROM v_result.next_action
      OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);

  -- Log state change
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


-- ─── 3. Update SLA reset trigger to use shared function ───────────────────

CREATE OR REPLACE FUNCTION public.trg_priority_sla_reset()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF OLD.priority IS NOT DISTINCT FROM NEW.priority THEN
    RETURN NEW;
  END IF;

  IF NEW.next_action != 'needs_action' THEN
    RETURN NEW;
  END IF;

  -- Use shared SLA function (SSOT — same logic as main trigger)
  NEW.sla_due_at := compute_sla_due_at(NEW.next_action, NEW.next_action_reason, NEW.priority);

  RETURN NEW;
END;
$$;


-- ─── 4. Fix maintenance escalation: stuck/stalled, not raw age ────────────
-- A ticket that's actively being worked on (scheduled, contractor dispatched)
-- should NOT escalate just because it's old. Only stalled tickets escalate.
--
-- "Stalled" = in needs_action or waiting state AND either:
--   - waiting_since > 7 days (stuck waiting for something)
--   - next_action = 'needs_action' for > 7 days (PM hasn't acted)
--
-- Excludes: scheduled tickets, tickets with recent state changes

CREATE OR REPLACE FUNCTION public.escalate_maintenance_tickets()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket record;
  v_new_priority text;
  v_property_label text;
  v_days_stalled integer;
BEGIN
  FOR v_ticket IN
    SELECT t.id, t.priority, t.property_id, t.next_action, t.next_action_reason,
           t.waiting_since, t.date_logged,
           EXTRACT(DAY FROM now() - COALESCE(t.waiting_since, t.date_logged))::integer AS days_in_state
    FROM c1_tickets t
    WHERE t.category = 'maintenance'
      AND t.status = 'open'
      AND (t.archived IS NULL OR t.archived = false)
      AND COALESCE(t.on_hold, false) = false
      -- Exclude actively progressing tickets
      AND t.next_action_reason NOT IN ('scheduled', 'completed')
  LOOP
    v_days_stalled := v_ticket.days_in_state;

    -- Compute new priority from stall duration
    v_new_priority := CASE
      WHEN v_days_stalled >= 14 THEN 'Urgent'
      WHEN v_days_stalled >= 7  THEN 'High'
      ELSE NULL  -- no escalation
    END;

    IF v_new_priority IS NULL THEN CONTINUE; END IF;

    -- Don't downgrade: skip if already at or above target
    IF v_ticket.priority = 'Emergency' THEN CONTINUE; END IF;
    IF v_ticket.priority = 'Urgent' THEN CONTINUE; END IF;
    IF v_ticket.priority = 'High' AND v_new_priority = 'High' THEN CONTINUE; END IF;

    UPDATE c1_tickets
    SET priority = v_new_priority
    WHERE id = v_ticket.id;

    SELECT address INTO v_property_label
    FROM c1_properties WHERE id = v_ticket.property_id;

    PERFORM c1_log_event(
      v_ticket.id, 'PRIORITY_ESCALATED', 'system', NULL,
      v_property_label,
      jsonb_build_object(
        'from_priority', v_ticket.priority,
        'to_priority', v_new_priority,
        'reason', format('maintenance stalled %s days (state: %s/%s)',
          v_days_stalled, v_ticket.next_action, v_ticket.next_action_reason),
        'days_stalled', v_days_stalled,
        'current_state', v_ticket.next_action_reason
      )
    );
  END LOOP;
END;
$$;
