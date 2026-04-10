-- Drop the old c1_create_manual_ticket overload (without p_deadline_date).
-- The version WITH p_deadline_date (from 01f_creation_rpcs) is the correct one
-- per architecture spec § Priority Scoring — deadline_date drives time_pressure.
-- Two overloads with all-default params cause Supabase ambiguous function errors.

DROP FUNCTION IF EXISTS public.c1_create_manual_ticket(
  uuid, uuid, uuid, uuid[], text, text, text, text, text, text, text, jsonb, uuid
);
