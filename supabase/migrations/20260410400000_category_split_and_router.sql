-- ============================================================
-- MAJOR REFACTOR: Category Split + Clean 3-Route Router
-- ============================================================
-- Safe Modification Protocol:
--   Backup: supabase/rollbacks/rollback_category_split_and_router.sql
--   Approved by: Adam (polymorphic router refactor for stability)
--
-- Protected RPCs modified:
--   - c1_compute_next_action (router)
--   - compute_maintenance_next_action (absorbs landlord/OOH)
--   - c1_create_ticket (RED zone — category split)
--   - c1_create_manual_ticket (category split)
--   - c1_ticket_context (add maintenance_trade)
--
-- Protected RPCs dropped:
--   - compute_landlord_next_action
--   - compute_ooh_next_action
--
-- THE LAW:
--   Router = pure dispatch. Zero business logic.
--   3 routes: maintenance, compliance_renewal, rent_arrears.
--   Unknown/NULL category = error (fail loud).
--   Each route owns its full lifecycle.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- PART A: Schema + Data Migration
-- ═══════════════════════════════════════════════════════════════

-- 1. Add maintenance_trade column
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS maintenance_trade text;

-- 2. Backfill: copy trade values from category for maintenance tickets
UPDATE c1_tickets
SET maintenance_trade = category
WHERE category IS NOT NULL
  AND category NOT IN ('compliance_renewal', 'rent_arrears');

-- 3. Normalize: set category to 'maintenance' for all trade-valued tickets
UPDATE c1_tickets
SET category = 'maintenance'
WHERE category NOT IN ('compliance_renewal', 'rent_arrears')
  AND category IS NOT NULL;

-- 4. Backfill NULL categories to 'maintenance' (safety)
UPDATE c1_tickets
SET category = 'maintenance'
WHERE category IS NULL;

-- 5. NOT NULL constraint
ALTER TABLE c1_tickets ALTER COLUMN category SET NOT NULL;


-- ═══════════════════════════════════════════════════════════════
-- PART B: Clean 3-Route Router
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_compute_next_action(p_ticket_id uuid)
 RETURNS TABLE(next_action text, next_action_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ticket c1_tickets%rowtype;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;

  -- ── Universal states (circuit breakers — all categories) ────
  IF NOT FOUND THEN
    RAISE WARNING 'c1_compute_next_action: ticket % not found', p_ticket_id;
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

  -- ── Three routes (explicit category match) ──────────────────
  IF v_ticket.category = 'compliance_renewal' THEN
    RETURN QUERY SELECT * FROM compute_compliance_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.category = 'rent_arrears' THEN
    RETURN QUERY SELECT * FROM compute_rent_arrears_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  IF v_ticket.category = 'maintenance' THEN
    RETURN QUERY SELECT * FROM compute_maintenance_next_action(p_ticket_id, v_ticket);
    RETURN;
  END IF;

  -- ── Fail loud — unknown or unexpected category ──────────────
  RAISE WARNING 'c1_compute_next_action: ticket % has unknown category: %',
    p_ticket_id, COALESCE(v_ticket.category, 'NULL');
  RETURN QUERY SELECT 'error'::text, 'unknown_category'::text;
END;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- PART C: Maintenance sub-routine (absorbs landlord/OOH/pending/handoff)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_maintenance_next_action(
  p_ticket_id uuid,
  p_ticket c1_tickets
)
RETURNS TABLE(next_action text, next_action_reason text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_job_not_completed boolean;
  v_has_completion boolean;
  v_msg_stage text;
  v_landlord_approval text;
BEGIN
  -- ── Lifecycle flags (moved from router — maintenance-specific) ──

  -- Pending review: new ticket from WhatsApp needs PM triage
  IF COALESCE(p_ticket.pending_review, false) AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'pending_review'::text;
    RETURN;
  END IF;

  -- Handoff: AI couldn't handle it, PM must review
  IF p_ticket.handoff = true AND lower(p_ticket.status) = 'open' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'handoff_review'::text;
    RETURN;
  END IF;

  -- Landlord allocated: PM assigned to landlord (was compute_landlord_next_action)
  IF COALESCE(p_ticket.landlord_allocated, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.landlord_outcome = 'need_help' THEN
      RETURN QUERY SELECT 'needs_attention'::text, 'landlord_needs_help'::text;
      RETURN;
    ELSIF p_ticket.landlord_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_attention'::text, 'landlord_resolved'::text;
      RETURN;
    ELSIF p_ticket.landlord_outcome = 'in_progress' THEN
      RETURN QUERY SELECT 'in_progress'::text, 'landlord_in_progress'::text;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'in_progress'::text, 'allocated_to_landlord'::text;
      RETURN;
    END IF;
  END IF;

  -- OOH dispatched: emergency contact (was compute_ooh_next_action)
  IF COALESCE(p_ticket.ooh_dispatched, false) AND lower(p_ticket.status) = 'open' THEN
    IF p_ticket.ooh_outcome = 'resolved' THEN
      RETURN QUERY SELECT 'needs_attention'::text, 'ooh_resolved'::text;
      RETURN;
    ELSIF p_ticket.ooh_outcome = 'unresolved' THEN
      RETURN QUERY SELECT 'needs_attention'::text, 'ooh_unresolved'::text;
      RETURN;
    ELSIF p_ticket.ooh_outcome = 'in_progress' THEN
      RETURN QUERY SELECT 'in_progress'::text, 'ooh_in_progress'::text;
      RETURN;
    ELSE
      RETURN QUERY SELECT 'needs_attention'::text, 'ooh_dispatched'::text;
      RETURN;
    END IF;
  END IF;

  -- ── Standard maintenance flow (unchanged) ───────────────────

  -- Job completion state
  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = false
  ) INTO v_job_not_completed;

  SELECT EXISTS(
    SELECT 1 FROM c1_job_completions jc WHERE jc.id = p_ticket_id AND jc.completed = true
  ) INTO v_has_completion;

  IF v_job_not_completed THEN
    RETURN QUERY SELECT 'follow_up'::text, 'job_not_completed'::text;
    RETURN;
  END IF;

  -- Landlord no response
  IF lower(p_ticket.job_stage) = 'landlord_no_response' OR lower(p_ticket.job_stage) = 'landlord no response' THEN
    RETURN QUERY SELECT 'follow_up'::text, 'landlord_no_response'::text;
    RETURN;
  END IF;

  -- Scheduled
  IF lower(p_ticket.job_stage) IN ('booked', 'scheduled') OR p_ticket.scheduled_date IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, 'scheduled'::text;
    RETURN;
  END IF;

  -- Awaiting booking
  IF lower(p_ticket.job_stage) = 'sent' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_booking'::text;
    RETURN;
  END IF;

  -- Completed via job_completions
  IF v_has_completion THEN
    RETURN QUERY SELECT 'completed'::text, 'completed'::text;
    RETURN;
  END IF;

  -- Message-based states
  SELECT m.stage, m.landlord->>'approval'
  INTO v_msg_stage, v_landlord_approval
  FROM c1_messages m WHERE m.ticket_id = p_ticket_id;

  IF lower(v_msg_stage) = 'awaiting_manager' THEN
    RETURN QUERY SELECT 'needs_attention'::text, 'manager_approval'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'no_contractors_left' THEN
    RETURN QUERY SELECT 'assign_contractor'::text, 'no_contractors'::text;
    RETURN;
  END IF;

  IF v_landlord_approval = 'false' THEN
    RETURN QUERY SELECT 'follow_up'::text, 'landlord_declined'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) = 'awaiting_landlord' THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_landlord'::text;
    RETURN;
  END IF;

  IF lower(v_msg_stage) IN ('waiting_contractor', 'contractor_notified') THEN
    RETURN QUERY SELECT 'in_progress'::text, 'awaiting_contractor'::text;
    RETURN;
  END IF;

  -- Default
  RETURN QUERY SELECT 'new'::text, 'new'::text;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- PART D: Drop standalone sub-routines
-- ═══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS compute_landlord_next_action(uuid, c1_tickets);
DROP FUNCTION IF EXISTS compute_ooh_next_action(uuid, c1_tickets);


-- ═══════════════════════════════════════════════════════════════
-- PART E: c1_create_ticket — category split
-- ═══════════════════════════════════════════════════════════════
-- CRITICAL: v_category keeps trade value for contractor JSONB lookup.
-- Only the INSERT changes: category='maintenance', maintenance_trade=trade.

CREATE OR REPLACE FUNCTION public.c1_create_ticket(_conversation_id uuid, _issue jsonb)
 RETURNS public.c1_tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_convo   public.c1_conversations;
  v_images  jsonb := '[]'::jsonb;
  v_access_granted boolean;
  v_ticket  public.c1_tickets;
  v_property_id uuid;
  v_category text;
  v_maintenance_trade text;  -- NEW: trade value for contractor matching
  v_has_contractor boolean := false;
  v_should_handoff boolean := false;
  v_room_id uuid;
begin
  select *
  into v_convo
  from public.c1_conversations
  where id = _conversation_id;

  if not found then
    raise exception 'Conversation % not found', _conversation_id;
  end if;

  if coalesce((_issue->>'has_images')::boolean, false) then
    select coalesce(jsonb_agg(distinct to_jsonb(url_val)), '[]'::jsonb)
    into v_images
    from (
      select jsonb_array_elements_text(e->'images') as url_val
      from jsonb_array_elements(v_convo.log) as e
      where jsonb_typeof(e->'images') = 'array'

      union

      select e->>'images' as url_val
      from jsonb_array_elements(v_convo.log) as e
      where jsonb_typeof(e->'images') = 'string'
        and e->>'images' <> ''
        and e->>'images' <> 'unprovided'
    ) sub
    where url_val is not null
      and url_val <> ''
      and url_val <> 'unprovided';
  end if;

  v_access_granted :=
    case _issue->>'access'
      when 'GRANTED' then true
      when 'REFUSED' then false
      else null
    end;

  v_property_id := coalesce(nullif(_issue->>'property_id','')::uuid, v_convo.property_id);
  v_category := _issue->>'category';  -- Trade value from AI (e.g. "Plumber")
  v_maintenance_trade := v_category;   -- Save trade for INSERT

  v_should_handoff := coalesce(v_convo.handoff, false);

  -- Resolve room_id from tenant
  select t.room_id into v_room_id
  from c1_tenants t
  inner join c1_rooms r on r.id = t.room_id
  where t.id = coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id);

  -- Contractor lookup uses v_category (still the trade value)
  if v_property_id is not null and v_category is not null and v_category <> '' then
    select exists(
      select 1
      from c1_properties p
      where p.id = v_property_id
        and p.contractor_mapping is not null
        and p.contractor_mapping::jsonb ? v_category
        and jsonb_typeof(p.contractor_mapping::jsonb -> v_category) = 'array'
        and jsonb_array_length(p.contractor_mapping::jsonb -> v_category) > 0
    )
    into v_has_contractor;

    if not v_has_contractor then
      v_should_handoff := true;
    end if;
  else
    if v_property_id is null or v_category is null or v_category = '' then
      v_should_handoff := true;
    end if;
  end if;

  -- INSERT: category = 'maintenance' (route), maintenance_trade = trade
  insert into public.c1_tickets (
    status,
    date_logged,
    tenant_id,
    property_id,
    issue_description,
    issue_title,
    category,
    maintenance_trade,
    priority,
    images,
    conversation_id,
    property_manager_id,
    job_stage,
    access_granted,
    verified_by,
    access,
    availability,
    updates_recipient,
    handoff,
    reporter_role,
    room_id
  )
  values (
    'open',
    timezone('utc', now()),
    coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id),
    v_property_id,
    _issue->>'issue_summary',
    _issue->>'issue_title',
    'maintenance',          -- Always maintenance (WhatsApp creates maintenance tickets)
    v_maintenance_trade,    -- Trade value ("Plumber", "Electrician", etc.)
    _issue->>'priority',
    v_images,
    v_convo.id,
    coalesce(nullif(_issue->>'property_manager_id','')::uuid, v_convo.property_manager_id),
    'created',
    v_access_granted,
    v_convo.verification_type,
    _issue->>'access',
    coalesce(
      nullif(_issue->>'availability',''),
      'The caller did not give any clear availability or access information.'
    ),
    coalesce(
      _issue->>'updates_recipient',
      v_convo.updates_recipient
    ),
    v_should_handoff,
    coalesce(
      _issue->>'caller_role',
      v_convo.caller_role
    ),
    v_room_id
  )
  returning *
  into v_ticket;

  return v_ticket;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- PART E2: c1_create_manual_ticket — category split
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_create_manual_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_contractor_ids uuid[] DEFAULT NULL,
  p_issue_description text DEFAULT NULL,
  p_issue_title text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_access text DEFAULT NULL,
  p_availability text DEFAULT NULL,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_compliance_certificate_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_ticket_id uuid;
  v_property record;
  v_tenant record;
  v_pm record;
  v_contractor record;
  v_contractor_obj jsonb;
  v_contractors_array jsonb := '[]'::jsonb;
  v_manager_obj jsonb;
  v_landlord_obj jsonb;
  v_contractor_count int := 0;
  v_idx int := 0;
  v_category_route text;       -- NEW: route value
  v_maintenance_trade text;    -- NEW: trade value
BEGIN
  -- Validate property
  SELECT id, address, landlord_name, landlord_email, landlord_phone,
         property_manager_id, auto_approve_limit
  INTO v_property
  FROM public.c1_properties
  WHERE id = p_property_id AND property_manager_id = p_property_manager_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property % not found or does not belong to PM %',
      p_property_id, p_property_manager_id;
  END IF;

  -- Validate tenant (only if provided)
  IF p_tenant_id IS NOT NULL THEN
    SELECT id, full_name, phone, email
    INTO v_tenant
    FROM public.c1_tenants
    WHERE id = p_tenant_id AND property_id = p_property_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant % not found or does not belong to property %',
        p_tenant_id, p_property_id;
    END IF;
  END IF;

  -- Validate PM
  SELECT id, name, phone, email, business_name
  INTO v_pm
  FROM public.c1_property_managers
  WHERE id = p_property_manager_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property manager % not found', p_property_manager_id;
  END IF;

  -- Validate contractors
  IF p_contractor_ids IS NULL OR array_length(p_contractor_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one contractor must be selected';
  END IF;

  FOR v_idx IN 1..array_length(p_contractor_ids, 1) LOOP
    SELECT id, contractor_name, contractor_phone, contractor_email, category
    INTO v_contractor
    FROM public.c1_contractors
    WHERE id = p_contractor_ids[v_idx]
      AND property_manager_id = p_property_manager_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contractor % not found, inactive, or does not belong to PM',
        p_contractor_ids[v_idx];
    END IF;

    v_contractor_count := v_contractor_count + 1;
  END LOOP;

  IF p_issue_description IS NULL OR trim(p_issue_description) = '' THEN
    RAISE EXCEPTION 'Issue description cannot be empty';
  END IF;

  IF p_category IS NULL OR trim(p_category) = '' THEN
    RAISE EXCEPTION 'Category cannot be empty';
  END IF;

  IF p_priority IS NULL OR trim(p_priority) = '' THEN
    RAISE EXCEPTION 'Priority cannot be empty';
  END IF;

  -- Category split: compliance/rent stay as-is, everything else → maintenance + trade
  IF p_category IN ('compliance_renewal', 'rent_arrears') THEN
    v_category_route := p_category;
    v_maintenance_trade := NULL;
  ELSE
    v_category_route := 'maintenance';
    v_maintenance_trade := p_category;
  END IF;

  -- Create ticket
  INSERT INTO public.c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_description, issue_title, category, maintenance_trade, priority, images, job_stage, verified_by,
    access, availability, reporter_role, handoff, is_manual, conversation_id,
    compliance_certificate_id
  )
  VALUES (
    'open', timezone('utc', now()), p_tenant_id, p_property_id, p_property_manager_id,
    trim(p_issue_description), NULLIF(trim(p_issue_title), ''), v_category_route, v_maintenance_trade, p_priority, COALESCE(p_images, '[]'::jsonb),
    'created', 'manual', COALESCE(trim(p_access), NULL),
    COALESCE(trim(p_availability), 'Not specified - please contact tenant'),
    'reporter_role', false, true, NULL,
    p_compliance_certificate_id
  )
  RETURNING id INTO v_ticket_id;

  -- Build contractors array
  FOR v_idx IN 1..array_length(p_contractor_ids, 1) LOOP
    SELECT
      jsonb_build_object(
        'id',               c.id,
        'name',             c.contractor_name,
        'phone',            c.contractor_phone,
        'email',            c.contractor_email,
        'category',         COALESCE(v_maintenance_trade, v_category_route),
        'property_id',      p_property_id,
        'property_address', v_property.address,
        'issue_description', trim(p_issue_description),
        'priority',         p_priority,
        'status',           'pending',
        'access',           COALESCE(trim(p_access), NULL),
        'access_granted',   CASE WHEN p_access IS NOT NULL THEN true ELSE NULL END,
        'availability',     COALESCE(trim(p_availability), 'Not specified - please contact tenant'),
        'reporter_role',    'manager'
      )
    INTO v_contractor_obj
    FROM public.c1_contractors c
    WHERE c.id = p_contractor_ids[v_idx];

    v_contractors_array := v_contractors_array || v_contractor_obj;
  END LOOP;

  -- Build manager object
  v_manager_obj := jsonb_build_object(
    'id',            v_pm.id,
    'name',          v_pm.name,
    'business_name', v_pm.business_name,
    'phone',         v_pm.phone,
    'email',         v_pm.email,
    'approval',      NULL
  );

  -- Build landlord object
  v_landlord_obj := jsonb_build_object(
    'name',   v_property.landlord_name,
    'email',  v_property.landlord_email,
    'phone',  v_property.landlord_phone
  );

  -- Insert into c1_messages
  PERFORM set_config('application_name', 'c1_create_manual_ticket', true);

  INSERT INTO public.c1_messages (
    ticket_id, contractors, manager, landlord, stage, suppress_webhook, created_at, updated_at
  )
  VALUES (
    v_ticket_id, v_contractors_array, v_manager_obj, v_landlord_obj,
    'waiting_contractor', true, now(), now()
  );

  PERFORM set_config('application_name', '', true);
  PERFORM public.c1_message_next_action(v_ticket_id);

  RETURN v_ticket_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create manual ticket: %', SQLERRM;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- PART E3: c1_ticket_context — add maintenance_trade
-- ═══════════════════════════════════════════════════════════════
-- Edge functions need trade value for contractor matching + display.
-- Adding maintenance_trade to return columns.
-- Must DROP first because return type is changing (new column).

DROP FUNCTION IF EXISTS public.c1_ticket_context(uuid);

CREATE OR REPLACE FUNCTION public.c1_ticket_context(ticket_uuid uuid)
 RETURNS TABLE(
   handoff boolean, is_matched_tenant boolean, has_images boolean,
   tenant_name text, tenant_phone text, tenant_email text, tenant_role_tag text, tenant_verified_by text,
   property_id uuid, property_address text, property_manager_id uuid,
   manager_name text, manager_phone text, manager_email text, business_name text,
   landlord_id uuid, landlord_name text, landlord_email text, landlord_phone text,
   access_instructions text, emergency_access_contact text,
   auto_approve_limit numeric, contractor_mapping jsonb,
   ticket_id uuid, ticket_status text, date_logged timestamp with time zone,
   issue_description text, category text, maintenance_trade text,
   priority text, job_stage text, access text, access_granted boolean,
   availability text, reporter_role text, updates_recipient text,
   caller_name text, caller_phone text, caller_role text, caller_tag text,
   recipient jsonb, update_contact jsonb, tenant_contact jsonb,
   conversation_id uuid, label text
 )
 LANGUAGE sql
 STABLE
AS $function$
  select
    t.handoff as handoff,
    (t.tenant_id is not null) as is_matched_tenant,
    coalesce(jsonb_array_length(t.images::jsonb) > 0, false) as has_images,

    ten.full_name   as tenant_name,
    ten.phone       as tenant_phone,
    ten.email       as tenant_email,
    ten.role_tag    as tenant_role_tag,
    ten.verified_by as tenant_verified_by,

    t.property_id              as property_id,
    p.address                  as property_address,
    t.property_manager_id      as property_manager_id,
    pm.name                    as manager_name,
    pm.phone                   as manager_phone,
    pm.email                   as manager_email,
    pm.business_name           as business_name,
    p.landlord_id              as landlord_id,
    COALESCE(l.full_name, p.landlord_name)   as landlord_name,
    COALESCE(l.email,     p.landlord_email)  as landlord_email,
    COALESCE(l.phone,     p.landlord_phone)  as landlord_phone,
    p.access_instructions      as access_instructions,
    p.emergency_access_contact as emergency_access_contact,

    p.auto_approve_limit        as auto_approve_limit,
    p.contractor_mapping::jsonb as contractor_mapping,

    t.id                as ticket_id,
    t.status            as ticket_status,
    t.date_logged       as date_logged,
    t.issue_description as issue_description,
    t.category          as category,
    t.maintenance_trade as maintenance_trade,  -- NEW
    t.priority          as priority,
    t.job_stage         as job_stage,
    t.access            as access,
    t.access_granted    as access_granted,
    t.availability      as availability,
    t.reporter_role     as reporter_role,
    t.updates_recipient as updates_recipient,

    convo.caller_name   as caller_name,
    convo.caller_phone  as caller_phone,
    convo.caller_role   as caller_role,
    convo.caller_tag    as caller_tag,

    case
      when t.updates_recipient = 'tenant' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
    end as recipient,

    case
      when t.updates_recipient = 'tenant' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      when t.updates_recipient = 'caller' then
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
      when t.updates_recipient is null
           and t.reporter_role = 'tenant'
           and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else
        jsonb_build_object(
          'type',  'caller',
          'name',  convo.caller_name,
          'phone', convo.caller_phone,
          'email', null
        )
    end as update_contact,

    case
      when t.reporter_role = 'behalf' and ten.id is not null then
        jsonb_build_object(
          'type',  'tenant',
          'name',  ten.full_name,
          'phone', ten.phone,
          'email', ten.email
        )
      else null
    end as tenant_contact,

    t.conversation_id as conversation_id,
    (convo.log -> 0 ->> 'label')::text as label

  from c1_tickets t
  left join c1_tenants ten
    on ten.id = t.tenant_id
  left join c1_conversations convo
    on convo.id = t.conversation_id
  left join c1_properties p
    on p.id = t.property_id
  left join c1_property_managers pm
    on pm.id = t.property_manager_id
  left join c1_landlords l
    on l.id = p.landlord_id
  where t.id = ticket_uuid;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- PART F: CHECK constraint on next_action_reason
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE c1_tickets ADD CONSTRAINT chk_next_action_reason
CHECK (next_action_reason IS NULL OR next_action_reason IN (
  -- Universal
  'new', 'archived', 'dismissed', 'completed', 'on_hold',
  -- Maintenance: lifecycle flags
  'pending_review', 'handoff_review',
  'allocated_to_landlord', 'landlord_needs_help', 'landlord_resolved', 'landlord_in_progress',
  'ooh_dispatched', 'ooh_resolved', 'ooh_unresolved', 'ooh_in_progress',
  -- Maintenance: contractor flow
  'awaiting_contractor', 'awaiting_booking', 'scheduled', 'awaiting_landlord',
  'manager_approval', 'no_contractors', 'landlord_declined', 'landlord_no_response',
  'job_not_completed',
  -- Compliance
  'compliance_pending', 'cert_renewed',
  -- Rent
  'rent_overdue', 'rent_partial_payment', 'rent_cleared',
  -- Error
  'unknown_category'
));
