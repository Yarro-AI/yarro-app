-- ============================================================
-- FIX: c1_job_reminder_list references dropped job_stage column
-- ============================================================
-- job_stage was dropped in Sprint B. This function has been silently
-- failing since then — no job reminders have been sent.
-- Fix: replace job_stage = 'booked' with next_action_reason = 'scheduled'.
--
-- ⚠️ PROTECTED RPC — approved by Adam (production error 2026-04-14).
-- ============================================================

CREATE OR REPLACE FUNCTION public.c1_job_reminder_list(p_run_date date)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec              record;
  access_text      text;
  start_utc        timestamptz;
  end_utc          timestamptz;
  start_local      timestamptz;
  end_local        timestamptz;
  formatted_time   text;
  formatted_window text;
  arrival_slot     text;
BEGIN
  FOR rec IN
    SELECT
      t.id,
      t.scheduled_date,
      t.access_granted,
      t.contractor_token,
      t.contractor_id,
      t.tenant_token,
      t.category,
      COALESCE(t.issue_title, t.issue_description) AS issue_title,
      p.address          AS property_address,
      p.access_instructions,
      pm.phone           AS pm_phone,
      c.contractor_phone AS contractor_phone,
      c.contractor_name  AS contractor_name,
      c.category         AS contractor_category,
      ten.full_name      AS tenant_name,
      ten.phone          AS tenant_phone
    FROM public.c1_tickets t
    JOIN public.c1_properties p ON p.id = t.property_id
    JOIN public.c1_property_managers pm ON pm.id = t.property_manager_id
    LEFT JOIN public.c1_contractors c ON c.id = t.contractor_id
    LEFT JOIN public.c1_tenants ten ON ten.id = t.tenant_id
    WHERE t.status = 'open'
      AND t.next_action_reason = 'scheduled'
      AND t.scheduled_date::date = p_run_date
      AND (t.on_hold IS NULL OR t.on_hold = false)
  LOOP
    IF rec.access_granted THEN
      access_text := nullif(trim(coalesce(rec.access_instructions, '')), '');
      IF access_text IS NULL THEN
        access_text := 'Access granted. Instructions will be shared directly if needed.';
      END IF;
    ELSE
      access_text :=
        'Access to be arranged with tenant. If the tenant does not answer, contact the property manager on '
        || coalesce(rec.pm_phone, '[number]') || '.';
    END IF;

    IF rec.scheduled_date IS NOT NULL THEN
      start_utc := rec.scheduled_date;
      end_utc   := rec.scheduled_date + interval '1 hour';
      start_local := timezone('Europe/London', start_utc);
      end_local   := timezone('Europe/London', end_utc);
      formatted_time := to_char(start_local, 'HH24:MI DD/MM/YY');
      formatted_window :=
        to_char(start_local, 'HH24:MI') || '-' ||
        to_char(end_local,   'HH24:MI') || ' ' ||
        to_char(start_local, 'DD/MM/YY');
      IF extract(hour from start_local) < 12 THEN
        arrival_slot := 'Morning';
      ELSE
        arrival_slot := 'Afternoon';
      END IF;
    ELSE
      formatted_time   := null;
      formatted_window := null;
      arrival_slot     := null;
    END IF;

    RETURN NEXT jsonb_build_object(
      'ticket_id',         rec.id,
      'scheduled_date',    rec.scheduled_date,
      'property_address',  rec.property_address,
      'contractor_phone',  rec.contractor_phone,
      'contractor_id',     rec.contractor_id,
      'contractor_name',   rec.contractor_name,
      'contractor_category', COALESCE(rec.contractor_category, rec.category),
      'tenant_name',       rec.tenant_name,
      'tenant_phone',      rec.tenant_phone,
      'tenant_token',      rec.tenant_token,
      'access_text',       access_text,
      'formatted_time',    formatted_time,
      'formatted_window',  formatted_window,
      'issue_title',       rec.issue_title,
      'contractor_token',  rec.contractor_token,
      'arrival_slot',      arrival_slot
    );
  END LOOP;
  RETURN;
END;
$function$;
