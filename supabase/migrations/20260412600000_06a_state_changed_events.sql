-- Sprint D, Part 1: Add STATE_CHANGED events to recompute trigger
-- ⚠️ PROTECTED — approved by Adam.
-- Changes:
--   - Read old bucket + reason before recompute
--   - Log STATE_CHANGED event when reason changes (same transaction)
--   - Works for all trigger sources (c1_tickets, c1_messages, c1_job_completions)

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

  -- Prevent recursive trigger execution
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Read current state BEFORE recompute (for STATE_CHANGED comparison)
  SELECT priority, next_action, next_action_reason
  INTO v_priority, v_old_bucket, v_old_reason
  FROM c1_tickets WHERE id = v_ticket_id;

  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  -- Auto-close: if computed state is 'completed', close the ticket
  IF v_result.next_action = 'completed' THEN
    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = COALESCE(resolved_at, now()),
        next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason,
        waiting_since = now(),
        sla_due_at = NULL  -- terminal state, no SLA
    WHERE id = v_ticket_id
      AND lower(status) != 'closed';

    -- Log state change for auto-close
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

  RETURN NEW;
END;
$function$;
