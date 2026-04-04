-- ============================================================
-- PROTECTED RPC CHANGE: c1_compute_next_action → router
-- ============================================================
-- Safe Modification Protocol:
--   Backup: supabase/rollbacks/rollback_phase_c.sql
--   Approved by: Adam (Phase C of polymorphic dispatch plan)
--
-- Refactors the monolithic 150-line function into a ~30-line
-- router that dispatches to domain-specific sub-routines.
-- Signature unchanged: (p_ticket_id uuid) → TABLE(next_action, next_action_reason)
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_compute_next_action(p_ticket_id uuid)
 RETURNS TABLE(next_action text, next_action_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket c1_tickets%rowtype;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;

  -- ── Universal states (inline, always run first) ──────────────
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'new'::text, 'new'::text;
    RETURN;
  END IF;

  IF v_ticket.archived = true THEN
    IF v_ticket.handoff = true THEN
      RETURN QUERY SELECT 'dismissed'::text, 'dismissed'::text;
    ELSE
      RETURN QUERY SELECT 'archived'::text, 'archived'::text;
    END IF;
    RETURN;
  END IF;

  IF lower(v_ticket.status) = 'closed' THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  IF COALESCE(v_ticket.on_hold, false) = true THEN
    RETURN QUERY SELECT 'on_hold'::text, 'on_hold'::text;
    RETURN;
  END IF;

  -- ── Category dispatch (domain-specific lifecycles) ───────────
  IF v_ticket.category = 'compliance_renewal' THEN
    RETURN QUERY SELECT * FROM compute_compliance_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.category = 'rent_arrears' THEN
    RETURN QUERY SELECT * FROM compute_rent_arrears_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  -- ── Lifecycle flag dispatch ──────────────────────────────────
  -- Order matches original: landlord → pending_review → ooh → handoff
  IF COALESCE(v_ticket.landlord_allocated, false) = true AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT * FROM compute_landlord_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF COALESCE(v_ticket.pending_review, false) AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'pending_review'::text;
    RETURN;
  END IF;

  IF COALESCE(v_ticket.ooh_dispatched, false) AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT * FROM compute_ooh_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.handoff = true AND lower(v_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'handoff_review'::text;
    RETURN;
  END IF;

  -- ── Standard maintenance (catch-all) ─────────────────────────
  RETURN QUERY SELECT * FROM compute_maintenance_next_action(p_ticket_id, v_ticket);
END;
$function$;
