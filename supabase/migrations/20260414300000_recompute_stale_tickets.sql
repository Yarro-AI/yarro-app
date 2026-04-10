-- ============================================================
-- One-time recompute: fix stale next_action on open tickets
-- ============================================================
-- Problem: Some tickets have next_action that doesn't match their
-- next_action_reason (e.g. no_contractors with next_action='waiting').
-- These are stale from before the router was fixed.
--
-- Fix: Call c1_compute_next_action on every open, non-archived ticket
-- and write back the correct 4 fields.
-- ============================================================

DO $$
DECLARE
  v_ticket record;
  v_result record;
BEGIN
  FOR v_ticket IN
    SELECT id FROM c1_tickets
    WHERE status = 'open' AND archived = false
  LOOP
    SELECT * INTO v_result FROM public.c1_compute_next_action(v_ticket.id);
    IF v_result IS NOT NULL THEN
      UPDATE c1_tickets SET
        next_action        = v_result.next_action,
        next_action_reason = v_result.next_action_reason
      WHERE id = v_ticket.id
        AND (next_action IS DISTINCT FROM v_result.next_action
          OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);
    END IF;
  END LOOP;
END;
$$;
