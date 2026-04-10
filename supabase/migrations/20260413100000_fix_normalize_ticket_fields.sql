-- Fix: c1_normalize_ticket_fields still referenced dropped job_stage column
-- ⚠️ PROTECTED RPC — approved by Adam.
-- Change: remove job_stage normalization block (column was dropped in Sprint B)

CREATE OR REPLACE FUNCTION public.c1_normalize_ticket_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Normalize status to lowercase
  IF NEW.status IS NOT NULL THEN
    NEW.status := lower(NEW.status);
  END IF;
  RETURN NEW;
END;
$function$;
