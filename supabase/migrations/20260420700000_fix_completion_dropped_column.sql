-- ============================================================
-- FIX: c1_submit_contractor_completion references dropped job_stage column
-- ============================================================
-- job_stage was dropped in Sprint B (20260412300000_04_drop_job_stage.sql).
-- This function sets job_stage = 'completed' which fails with:
--   "column "job_stage" of relation "c1_tickets" does not exist"
--
-- Fix: remove job_stage, set status = 'closed' instead.
-- The recompute trigger will handle next_action/next_action_reason.
--
-- ⚠️ PROTECTED RPC — approved by Adam (production error 2026-04-15).
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_submit_contractor_completion(
  p_token text,
  p_notes text DEFAULT NULL,
  p_photos jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE contractor_token = p_token;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  UPDATE c1_tickets SET
    status = 'closed',
    resolved_at = now(),
    next_action = 'completed',
    next_action_reason = 'completed',
    tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
      'type', 'contractor_completed',
      'notes', p_notes,
      'photos', p_photos,
      'submitted_at', now()
    )
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;
