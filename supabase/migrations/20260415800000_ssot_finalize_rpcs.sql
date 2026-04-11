-- SSOT: Move finalize-job state mutations from edge function into RPCs.
-- The edge function was directly writing to c1_tickets and c1_messages,
-- bypassing the trigger pipeline. These RPCs ensure all state transitions
-- go through the database layer with proper audit events.

-- ─── 1. c1_finalize_approved ─────────────────────────────────────────────
-- Called by yarro-scheduling edge function when auto-approve or landlord approves.
-- Sets ticket fields, advances message stage, and logs audit event.

CREATE OR REPLACE FUNCTION public.c1_finalize_approved(
  p_ticket_id uuid,
  p_contractor_id uuid,
  p_contractor_quote numeric DEFAULT NULL,
  p_final_amount numeric DEFAULT NULL,
  p_contractor_token text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_property_label text;
BEGIN
  -- Update ticket with approval details
  UPDATE c1_tickets SET
    contractor_id = p_contractor_id,
    contractor_quote = p_contractor_quote,
    final_amount = p_final_amount,
    landlord_approved_on = now(),
    contractor_token = COALESCE(p_contractor_token, contractor_token),
    contractor_token_at = CASE WHEN p_contractor_token IS NOT NULL THEN now() ELSE contractor_token_at END
  WHERE id = p_ticket_id;

  -- Advance message stage past awaiting_landlord so router recomputes correctly
  UPDATE c1_messages SET
    stage = 'sent',
    updated_at = now()
  WHERE ticket_id = p_ticket_id;

  -- Audit event
  SELECT address INTO v_property_label
  FROM c1_properties p
  JOIN c1_tickets t ON t.property_id = p.id
  WHERE t.id = p_ticket_id;

  PERFORM c1_log_event(
    p_ticket_id, 'QUOTE_APPROVED', 'SYSTEM', NULL,
    v_property_label,
    jsonb_build_object(
      'contractor_id', p_contractor_id,
      'quote', p_contractor_quote,
      'final_amount', p_final_amount
    )
  );

  RETURN jsonb_build_object('ok', true, 'ticket_id', p_ticket_id);
END;
$function$;


-- ─── 2. c1_finalize_declined ─────────────────────────────────────────────
-- Called by yarro-scheduling edge function when landlord declines.
-- Sets ticket to needs_action/landlord_declined and logs audit event.

CREATE OR REPLACE FUNCTION public.c1_finalize_declined(
  p_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_property_label text;
BEGIN
  -- Update ticket state — triggers c1_compute_next_action via trigger
  UPDATE c1_tickets SET
    next_action = 'needs_action',
    next_action_reason = 'landlord_declined',
    waiting_since = now(),
    sla_due_at = NULL
  WHERE id = p_ticket_id;

  -- Audit event
  SELECT address INTO v_property_label
  FROM c1_properties p
  JOIN c1_tickets t ON t.property_id = p.id
  WHERE t.id = p_ticket_id;

  PERFORM c1_log_event(
    p_ticket_id, 'LANDLORD_DECLINED', 'SYSTEM', NULL,
    v_property_label,
    jsonb_build_object('declined_at', now())
  );

  RETURN jsonb_build_object('ok', true, 'ticket_id', p_ticket_id);
END;
$function$;
