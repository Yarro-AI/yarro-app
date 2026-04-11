-- Fix BUG-11: c1_submit_contractor_schedule still references dropped job_stage column.
-- Remove job_stage = 'booked' from the UPDATE statement.
-- ⚠️ PROTECTED RPC — approved by Adam during E2E testing session 2026-04-11.

CREATE OR REPLACE FUNCTION public.c1_submit_contractor_schedule(
  p_token text,
  p_date timestamp with time zone,
  p_time_slot text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket_id uuid;
  v_pm_id uuid;
  v_already_scheduled timestamptz;
  v_lead_hours integer;
  v_hours_until numeric;
BEGIN
  SELECT t.id, t.scheduled_date, t.property_manager_id
  INTO v_ticket_id, v_already_scheduled, v_pm_id
  FROM c1_tickets t
  WHERE t.contractor_token = p_token;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  IF v_already_scheduled IS NOT NULL THEN
    RAISE EXCEPTION 'Job already scheduled';
  END IF;

  -- Enforce minimum booking lead time
  SELECT COALESCE(pm.min_booking_lead_hours, 3)
  INTO v_lead_hours
  FROM c1_property_managers pm
  WHERE pm.id = v_pm_id;

  v_hours_until := EXTRACT(EPOCH FROM (p_date - now())) / 3600;

  IF v_hours_until < v_lead_hours THEN
    RAISE EXCEPTION 'Selected slot is too soon. Please book at least % hours in advance.', v_lead_hours;
  END IF;

  -- job_stage removed (column dropped). State managed by c1_compute_next_action trigger.
  UPDATE c1_tickets SET
    scheduled_date = p_date,
    status = 'open'
  WHERE id = v_ticket_id;

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id, 'scheduled_date', p_date);
END;
$function$;
