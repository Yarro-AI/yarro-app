-- ============================================================
-- FIX: c1_submit_tenant_confirmation uses invalid next_action_reason
-- ============================================================
-- When tenant clicks "not resolved", the RPC sets next_action_reason to
-- 'tenant_disputed_completion' which is not in the CHECK constraint.
--
-- Fix: use 'job_not_completed' (already in constraint) and reopen the
-- ticket so it appears on the PM dashboard for review.
--
-- ⚠️ PROTECTED RPC — approved by Adam (production error 2026-04-15).
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_submit_tenant_confirmation(
  p_token text,
  p_resolved boolean,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_token = p_token;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  IF p_resolved THEN
    -- Tenant confirms resolved — no state change needed, just log
    UPDATE c1_tickets SET
      confirmation_date = now(),
      tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
        'type', 'confirmed_resolved',
        'notes', p_notes,
        'submitted_at', now()
      )
    WHERE id = v_ticket_id;
  ELSE
    -- Tenant disputes — reopen ticket for PM review
    -- Clear scheduled_date so router doesn't put it back in 'scheduled'
    -- Preserve all completion data (photos, notes) in tenant_updates history
    UPDATE c1_tickets SET
      status = 'open',
      resolved_at = NULL,
      scheduled_date = NULL,
      confirmation_date = now(),
      next_action = 'needs_action',
      next_action_reason = 'job_not_completed',
      tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
        'type', 'disputed',
        'notes', p_notes,
        'submitted_at', now()
      )
    WHERE id = v_ticket_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id, 'resolved', p_resolved);
END;
$$;
