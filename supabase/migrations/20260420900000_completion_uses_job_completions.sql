-- ============================================================
-- FIX: Completion + dispute must write to c1_job_completions
-- ============================================================
-- The maintenance sub-routine checks c1_job_completions to determine
-- job_not_completed state (lines 163-174 in compute_maintenance_next_action).
-- But c1_submit_contractor_completion and c1_submit_tenant_confirmation
-- don't write to this table — they only update c1_tickets directly.
-- The recompute trigger then overrides with stale c1_messages.stage state.
--
-- Fix: both RPCs now write to c1_job_completions so the router's existing
-- checks work correctly. Tenant dispute inserts completed=false, which
-- the router returns as needs_action/job_not_completed.
--
-- ⚠️ PROTECTED RPCs — approved by Adam (production error 2026-04-15).
-- ============================================================


-- 1. Contractor completion: write to c1_job_completions + close ticket

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
  v_contractor_id uuid;
  v_property_id uuid;
  v_tenant_id uuid;
BEGIN
  SELECT id, contractor_id, property_id, tenant_id
  INTO v_ticket_id, v_contractor_id, v_property_id, v_tenant_id
  FROM c1_tickets
  WHERE contractor_token = p_token;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  -- Write to c1_job_completions (SSOT for completion state)
  INSERT INTO c1_job_completions (
    id, received_at, completed, notes, media_urls,
    contractor_id, property_id, tenant_id, source
  ) VALUES (
    v_ticket_id, now(), true, p_notes, COALESCE(p_photos, '[]'::jsonb),
    v_contractor_id, v_property_id, v_tenant_id, 'portal'
  )
  ON CONFLICT (id) DO UPDATE SET
    completed = true,
    received_at = now(),
    notes = COALESCE(p_notes, c1_job_completions.notes),
    media_urls = COALESCE(p_photos, c1_job_completions.media_urls),
    source = 'portal';

  -- Close ticket (trigger will recompute and confirm completed state)
  UPDATE c1_tickets SET
    status = 'closed',
    resolved_at = now(),
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


-- 2. Tenant confirmation: dispute writes completed=false to c1_job_completions

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
    -- Tenant confirms resolved — log confirmation, no state change
    UPDATE c1_tickets SET
      confirmation_date = now(),
      tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
        'type', 'confirmed_resolved',
        'notes', p_notes,
        'submitted_at', now()
      )
    WHERE id = v_ticket_id;
  ELSE
    -- Tenant disputes — preserve completion data in attempts[], then set completed=false
    -- The router checks completed=false and returns needs_action/job_not_completed
    UPDATE c1_job_completions SET
      attempts = COALESCE(attempts, '[]'::jsonb) || jsonb_build_object(
        'completed_at', received_at,
        'completed', true,
        'notes', notes,
        'photos', media_urls,
        'disputed_at', now(),
        'dispute_reason', COALESCE(p_notes, 'Tenant reported job not resolved')
      ),
      completed = false,
      reason = COALESCE(p_notes, 'Tenant reported job not resolved')
    WHERE id = v_ticket_id;

    -- If no job_completions row exists yet, insert one
    IF NOT FOUND THEN
      INSERT INTO c1_job_completions (id, received_at, completed, reason, source)
      VALUES (v_ticket_id, now(), false, COALESCE(p_notes, 'Tenant reported job not resolved'), 'tenant_dispute');
    END IF;

    -- Reopen ticket — clear scheduled_date so router doesn't override
    -- History preserved: tenant_updates has full completion + dispute trail
    UPDATE c1_tickets SET
      status = 'open',
      resolved_at = NULL,
      scheduled_date = NULL,
      confirmation_date = now(),
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
