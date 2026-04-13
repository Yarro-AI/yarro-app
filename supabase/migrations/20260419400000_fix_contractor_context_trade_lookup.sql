-- SSOT Finding #1: c1_contractor_context uses t.category instead of t.maintenance_trade
-- after the category/trade split (20260410400000).
--
-- t.category now holds the route ('maintenance'), not the trade ('Plumber').
-- contractor_mapping keys are trade names. Lookup fails → zero contractors → handoff.
--
-- Fix: COALESCE(t.maintenance_trade, t.category) in two places:
--   1. Contractor JSON 'category' field (for downstream SMS display)
--   2. contractor_mapping lookup key (for contractor matching)
--
-- Matches existing pattern in c1_create_manual_ticket (20260411600000, line 311).
-- ⚠️ PROTECTED RPC — approved by Adam (SSOT audit 2026-04-13, Finding #1).

CREATE OR REPLACE FUNCTION public.c1_contractor_context(ticket_uuid uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    contractor_records jsonb;
    manager_record jsonb;
    landlord_record jsonb;
BEGIN
    ----------------------------------------------------------------
    -- Contractor records for this ticket
    -- One JSON object per contractor, enriched with ticket context
    ----------------------------------------------------------------
    SELECT jsonb_agg(
        jsonb_build_object(
            -- Core contractor identity
            'id',               c.id,
            'name',             c.contractor_name,
            'phone',            c.contractor_phone,
            'email',            c.contractor_email,

            -- Job routing context
            'category',         COALESCE(t.maintenance_trade, t.category),
            'property_id',      t.property_id,
            'property_address', p.address,
            'issue_description',t.issue_description,
            'priority',         t.priority,
            'status',           'pending',

            -- Access context from ticket (for downstream SMS and logic)
            'access',           t.access,
            'access_granted',   t.access_granted,
            'availability',     t.availability,
            'reporter_role',    t.reporter_role
        )
    )
    INTO contractor_records
    FROM c1_tickets t
    JOIN c1_properties p
      ON p.id = t.property_id
    JOIN c1_contractors c
      ON c.id IN (
        SELECT value::uuid
        FROM jsonb_array_elements_text(p.contractor_mapping::jsonb -> COALESCE(t.maintenance_trade, t.category))
      )
    WHERE t.id = ticket_uuid;

    ----------------------------------------------------------------
    -- Property manager record for this ticket
    -- Used for PM quote approval SMS flow
    ----------------------------------------------------------------
    SELECT jsonb_build_object(
        'id',            pm.id,
        'business_name', pm.business_name,
        'phone',         pm.phone,
        'approval',      NULL
    )
    INTO manager_record
    FROM c1_tickets t
    JOIN c1_property_managers pm
      ON pm.id = t.property_manager_id
    WHERE t.id = ticket_uuid
    LIMIT 1;

    -- Landlord info (prefer c1_landlords, fallback to c1_properties)
    SELECT jsonb_build_object(
        'name',  COALESCE(l.full_name,  p.landlord_name),
        'email', COALESCE(l.email,      p.landlord_email),
        'phone', COALESCE(l.phone,      p.landlord_phone)
    )
    INTO landlord_record
    FROM c1_tickets t
    JOIN c1_properties p
      ON p.id = t.property_id
    LEFT JOIN c1_landlords l ON l.id = p.landlord_id
    WHERE t.id = ticket_uuid
    LIMIT 1;

    -- Guarded insert/update to avoid trigger recursion behavior changes
    PERFORM set_config('application_name','c1_contractor_context', true);

    INSERT INTO public.c1_messages (ticket_id, contractors, manager, landlord, stage)
    VALUES (
        ticket_uuid,
        COALESCE(contractor_records, '[]'::jsonb),
        COALESCE(manager_record, '{}'::jsonb),
        COALESCE(landlord_record, '{}'::jsonb),
        'waiting_contractor'
    )
    ON CONFLICT (ticket_id)
    DO UPDATE
    SET contractors = EXCLUDED.contractors::jsonb,
        manager     = EXCLUDED.manager::jsonb,
        landlord    = EXCLUDED.landlord::jsonb,
        stage       = 'waiting_contractor',
        updated_at  = now();

    PERFORM set_config('application_name','', true);
    PERFORM public.c1_message_next_action(ticket_uuid);

    ----------------------------------------------------------------
    -- Return one row per contractor JSON object
    -- This is what the Dispatcher webhook loops over
    ----------------------------------------------------------------
    RETURN QUERY
    SELECT jsonb_array_elements(contractor_records);
END;
$function$;
