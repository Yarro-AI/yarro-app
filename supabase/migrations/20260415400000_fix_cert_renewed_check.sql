-- Fix: Compliance ticket auto-closes immediately with cert_renewed.
-- The cert_renewed check was too broad: reminder_count = 0 AND expiry > today
-- matches the ORIGINAL cert before the cron increments reminder_count.
-- Fix: Also require cert expiry is beyond the ticket's deadline_date (a genuine renewal).

CREATE OR REPLACE FUNCTION public.compute_compliance_next_action(p_ticket_id uuid, p_ticket c1_tickets)
 RETURNS TABLE(next_action text, next_action_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cert_incomplete boolean := false;
  v_cert_renewed boolean := false;
  v_job_not_completed boolean;
  v_has_completion boolean;
  v_msg_stage text;
BEGIN
  -- Cert incomplete: no document or no expiry date
  IF p_ticket.compliance_certificate_id IS NOT NULL THEN
    SELECT (cc.document_url IS NULL OR cc.expiry_date IS NULL)
    INTO v_cert_incomplete
    FROM c1_compliance_certificates cc
    WHERE cc.id = p_ticket.compliance_certificate_id;

    IF v_cert_incomplete THEN
      RETURN QUERY SELECT 'needs_action'::text, 'cert_incomplete'::text;
      RETURN;
    END IF;
  END IF;

  -- Check if cert has been renewed:
  -- A genuine renewal means reminder_count was reset to 0 AND the cert expiry
  -- is beyond the ticket's deadline_date (i.e. a new cert was uploaded with a later date).
  IF p_ticket.compliance_certificate_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM c1_compliance_certificates cc
      WHERE cc.id = p_ticket.compliance_certificate_id
        AND cc.expiry_date > CURRENT_DATE
        AND cc.reminder_count = 0
        AND (p_ticket.deadline_date IS NULL OR cc.expiry_date > p_ticket.deadline_date)
    ) INTO v_cert_renewed;
  END IF;

  IF v_cert_renewed THEN
    RETURN QUERY SELECT 'completed'::text, 'cert_renewed'::text;
    RETURN;
  END IF;

  -- Job completion checks
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'needs_action'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Reschedule pending
  IF COALESCE(p_ticket.reschedule_requested, false)
     AND p_ticket.reschedule_status = 'pending' THEN
    RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
    RETURN;
  END IF;

  -- Scheduled
  IF p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'scheduled'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage INTO v_msg_stage
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  IF lower(v_msg_stage) = 'sent' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_booking'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'manager_approval'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'needs_action'::text, 'no_contractors'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'waiting'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Default: compliance needs dispatch
  RETURN QUERY SELECT 'needs_action'::text, 'compliance_needs_dispatch'::text;
END;
$function$;
