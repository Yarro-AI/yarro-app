-- Sprint A, Sub-step 1d: Trigger 4-field write + new watch list
-- ⚠️ PROTECTED — must come AFTER 1c (router must exist with new values first).
-- Changes:
--   - Trigger now writes 4 fields: next_action, next_action_reason, waiting_since, sla_due_at
--   - SLA is reason-aware and legally grounded
--   - Watch list: add awaiting_tenant, reschedule_requested, reschedule_status, priority
--   - Watch list: remove job_stage (column will be dropped in Sprint B)

CREATE OR REPLACE FUNCTION public.c1_trigger_recompute_next_action()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket_id UUID;
  v_result RECORD;
  v_priority text;
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

  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  -- Read current priority for SLA calculation
  SELECT priority INTO v_priority FROM c1_tickets WHERE id = v_ticket_id;

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
    RETURN NEW;
  END IF;

  -- 4-field write: only when reason actually changes
  UPDATE c1_tickets
  SET next_action = v_result.next_action,
      next_action_reason = v_result.next_action_reason,
      waiting_since = now(),
      sla_due_at = CASE
        -- needs_action states get an SLA (legally grounded defaults)
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
        -- waiting/scheduled/terminal states: NULL (PM is not the actor, no SLA applies)
        ELSE NULL
      END
  WHERE id = v_ticket_id
    AND (next_action IS DISTINCT FROM v_result.next_action
      OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);

  RETURN NEW;
END;
$function$;


-- ── Update trigger column watch list ───────────────────────────
-- Drop and recreate with new column list.
-- Added: awaiting_tenant, reschedule_requested, reschedule_status, priority
-- Removed: job_stage (will be dropped in Sprint B)

DROP TRIGGER IF EXISTS trg_tickets_recompute_next_action ON c1_tickets;

CREATE TRIGGER trg_tickets_recompute_next_action
  AFTER INSERT OR UPDATE OF status, handoff, archived, pending_review,
    on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome,
    awaiting_tenant, reschedule_requested, reschedule_status, priority
  ON public.c1_tickets
  FOR EACH ROW
  EXECUTE FUNCTION c1_trigger_recompute_next_action();
