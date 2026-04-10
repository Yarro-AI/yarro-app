-- Fix: compliance_submit_contractor_renewal references dropped job_stage + non-existent updated_at
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Changes:
--   - Remove job_stage = 'completed' (column dropped)
--   - Remove updated_at = now() (column doesn't exist on c1_tickets)
--   - Set status = 'closed' so the recompute trigger handles terminal state

CREATE OR REPLACE FUNCTION public.compliance_submit_contractor_renewal(
  p_token text,
  p_document_url text,
  p_expiry_date date,
  p_issued_by text DEFAULT NULL,
  p_certificate_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
  v_cert_id uuid;
BEGIN
  -- Validate token and get ticket + cert linkage
  SELECT t.id, t.compliance_certificate_id
  INTO v_ticket_id, v_cert_id
  FROM c1_tickets t
  WHERE t.contractor_token = p_token;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  IF v_cert_id IS NULL THEN
    RAISE EXCEPTION 'This ticket is not linked to a compliance certificate';
  END IF;

  -- Update cert record with new data + reset reminders
  UPDATE c1_compliance_certificates SET
    document_url = p_document_url,
    expiry_date = p_expiry_date,
    issued_by = COALESCE(p_issued_by, issued_by),
    certificate_number = COALESCE(p_certificate_number, certificate_number),
    notes = COALESCE(p_notes, notes),
    reminder_count = 0,
    last_reminder_at = NULL,
    reminder_sent_at = NULL,
    updated_at = now()
  WHERE id = v_cert_id;

  -- Close the ticket (trigger handles next_action/next_action_reason via status change)
  UPDATE c1_tickets SET
    status = 'closed',
    resolved_at = now(),
    next_action_reason = 'cert_renewed',
    tenant_updates = COALESCE(tenant_updates, '[]'::jsonb) || jsonb_build_object(
      'type', 'compliance_renewal_completed',
      'document_url', p_document_url,
      'expiry_date', p_expiry_date::text,
      'issued_by', p_issued_by,
      'certificate_number', p_certificate_number,
      'notes', p_notes,
      'submitted_at', now()
    )
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object(
    'success', true,
    'ticket_id', v_ticket_id,
    'cert_id', v_cert_id
  );
END;
$$;
