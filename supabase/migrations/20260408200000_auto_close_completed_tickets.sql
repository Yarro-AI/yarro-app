-- ============================================================
-- Auto-close tickets when next_action = 'completed'
-- ============================================================
-- Bug fix: When c1_compute_next_action returns 'completed'
-- (e.g. cert_renewed, job completed), the ticket status was
-- left as 'open', causing ghost items on the dashboard.
--
-- This migration updates the trigger to auto-close tickets
-- when the computed next_action is 'completed'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_trigger_recompute_next_action()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket_id UUID;
  v_result RECORD;
BEGIN
  IF TG_TABLE_NAME = 'c1_tickets' THEN
    v_ticket_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'c1_messages' THEN
    v_ticket_id := NEW.ticket_id;
  ELSIF TG_TABLE_NAME = 'c1_job_completions' THEN
    v_ticket_id := NEW.id;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  -- Auto-close: if computed state is 'completed', close the ticket
  IF v_result.next_action = 'completed' THEN
    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = COALESCE(resolved_at, now()),
        next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason
    WHERE id = v_ticket_id
      AND lower(status) != 'closed';
    RETURN NEW;
  END IF;

  UPDATE c1_tickets
  SET next_action = v_result.next_action,
      next_action_reason = v_result.next_action_reason
  WHERE id = v_ticket_id
    AND (next_action IS DISTINCT FROM v_result.next_action
      OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);

  RETURN NEW;
END;
$function$;
