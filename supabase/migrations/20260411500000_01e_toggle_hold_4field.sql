-- Sprint A, Sub-step 1e: Update c1_toggle_hold to 4-field write
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Changes: recompute section now writes 4 fields (was 2)

CREATE OR REPLACE FUNCTION public.c1_toggle_hold(p_ticket_id uuid, p_on_hold boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ticket public.c1_tickets%rowtype;
  v_hold_duration interval;
  v_result RECORD;
  v_priority text;
BEGIN
  SELECT * INTO v_ticket FROM public.c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
  END IF;

  -- Already in requested state — no-op
  IF COALESCE(v_ticket.on_hold, false) = p_on_hold THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'on_hold', p_on_hold);
  END IF;

  IF p_on_hold THEN
    -- HOLD: record when we paused
    UPDATE public.c1_tickets
    SET on_hold = true,
        held_at = now()
    WHERE id = p_ticket_id;

  ELSE
    -- RESUME: accumulate hold duration, clear held_at
    v_hold_duration := COALESCE(now() - v_ticket.held_at, interval '0');

    UPDATE public.c1_tickets
    SET on_hold = false,
        held_at = NULL,
        total_hold_duration = COALESCE(total_hold_duration, interval '0') + v_hold_duration
    WHERE id = p_ticket_id;
  END IF;

  -- Recompute next action with 4-field write
  SELECT * INTO v_result FROM public.c1_compute_next_action(p_ticket_id);
  SELECT priority INTO v_priority FROM public.c1_tickets WHERE id = p_ticket_id;

  UPDATE public.c1_tickets
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
  WHERE c1_tickets.id = p_ticket_id;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'on_hold', p_on_hold,
    'hold_duration_added', CASE WHEN NOT p_on_hold THEN v_hold_duration::text ELSE null END,
    'ticket_id', p_ticket_id
  );
END;
$function$;
