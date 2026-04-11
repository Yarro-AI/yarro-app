-- Fix BUG-4: Two overloads of create_rent_arrears_ticket cause ambiguity.
-- Drop the old overload (with p_priority, returns TABLE, references job_stage).
-- Keep the newer one (with p_deadline_date, returns uuid, no job_stage).

DROP FUNCTION IF EXISTS public.create_rent_arrears_ticket(
  uuid, uuid, uuid, text, text, text
);
