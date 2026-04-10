-- Sprint A, Sub-step 1f: Update creation RPCs
-- ⚠️ PROTECTED RPCs — approved by Adam.
-- Changes:
--   - c1_create_ticket: remove job_stage, add waiting_since + handoff_reason
--   - c1_create_manual_ticket: remove job_stage, add waiting_since + deadline_date param
--   - create_rent_arrears_ticket: remove job_stage, add waiting_since + deadline_date
-- NOTE: job_stage column DROP is deferred to Sprint B (edge functions must deploy first)


-- ═══════════════════════════════════════════════════════════════
-- c1_create_ticket (WhatsApp intake)
-- ═══════════════════════════════════════════════════════════════

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
  v_maintenance_trade text;
  v_has_contractor boolean := false;
  v_should_handoff boolean := false;
  v_room_id uuid;
  v_handoff_reason text;
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

  -- Read both fields directly from caller — no split logic
  v_category := _issue->>'category';
  v_maintenance_trade := _issue->>'maintenance_trade';

  v_should_handoff := coalesce(v_convo.handoff, false);

  -- Resolve room_id from tenant
  select t.room_id into v_room_id
  from c1_tenants t
  inner join c1_rooms r on r.id = t.room_id
  where t.id = coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id);

  -- Contractor lookup uses maintenance_trade
  if v_property_id is not null and v_maintenance_trade is not null and v_maintenance_trade <> '' then
    select exists(
      select 1
      from c1_properties p
      where p.id = v_property_id
        and p.contractor_mapping is not null
        and p.contractor_mapping::jsonb ? v_maintenance_trade
        and jsonb_typeof(p.contractor_mapping::jsonb -> v_maintenance_trade) = 'array'
        and jsonb_array_length(p.contractor_mapping::jsonb -> v_maintenance_trade) > 0
    )
    into v_has_contractor;

    if not v_has_contractor then
      v_should_handoff := true;
      v_handoff_reason := 'no_contractor_mapped';
    end if;
  else
    if v_property_id is null then
      v_should_handoff := true;
      v_handoff_reason := 'property_not_matched';
    elsif v_maintenance_trade is null or v_maintenance_trade = '' then
      v_should_handoff := true;
      v_handoff_reason := 'category_unclear';
    end if;
  end if;

  -- Read handoff_reason from edge function if provided (overrides computed reason)
  if _issue->>'handoff_reason' is not null and _issue->>'handoff_reason' <> '' then
    v_handoff_reason := _issue->>'handoff_reason';
  end if;

  -- INSERT: write what was passed, no transformation
  -- job_stage removed, waiting_since + handoff_reason added
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
    access_granted,
    verified_by,
    access,
    availability,
    updates_recipient,
    handoff,
    reporter_role,
    room_id,
    waiting_since,
    handoff_reason
  )
  values (
    'open',
    timezone('utc', now()),
    coalesce(nullif(_issue->>'tenant_id','')::uuid, v_convo.tenant_id),
    v_property_id,
    _issue->>'issue_summary',
    _issue->>'issue_title',
    v_category,
    v_maintenance_trade,
    _issue->>'priority',
    v_images,
    v_convo.id,
    coalesce(nullif(_issue->>'property_manager_id','')::uuid, v_convo.property_manager_id),
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
    v_room_id,
    now(),
    CASE WHEN v_should_handoff THEN v_handoff_reason ELSE NULL END
  )
  returning *
  into v_ticket;

  return v_ticket;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════
-- c1_create_manual_ticket (PM-created)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.c1_create_manual_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid DEFAULT NULL,
  p_contractor_ids uuid[] DEFAULT NULL,
  p_issue_description text DEFAULT NULL,
  p_issue_title text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_maintenance_trade text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_access text DEFAULT NULL,
  p_availability text DEFAULT NULL,
  p_images jsonb DEFAULT '[]'::jsonb,
  p_compliance_certificate_id uuid DEFAULT NULL,
  p_deadline_date date DEFAULT NULL
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

  -- job_stage removed, waiting_since + deadline_date added
  INSERT INTO public.c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_description, issue_title, category, maintenance_trade, priority, images, verified_by,
    access, availability, reporter_role, handoff, is_manual, conversation_id,
    compliance_certificate_id, waiting_since, deadline_date
  )
  VALUES (
    'open', timezone('utc', now()), p_tenant_id, p_property_id, p_property_manager_id,
    trim(p_issue_description), NULLIF(trim(p_issue_title), ''), p_category, p_maintenance_trade, p_priority, COALESCE(p_images, '[]'::jsonb),
    'manual', COALESCE(trim(p_access), NULL),
    COALESCE(trim(p_availability), 'Not specified - please contact tenant'),
    'reporter_role', false, true, NULL,
    p_compliance_certificate_id, now(), p_deadline_date
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
        'category',         COALESCE(p_maintenance_trade, p_category),
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
-- create_rent_arrears_ticket
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_deadline_date date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
    -- Ticket already exists — update description with latest arrears info
    UPDATE c1_tickets
    SET issue_description = p_issue_description
    WHERE id = v_ticket_id;
    RETURN v_ticket_id;
  END IF;

  -- Create new ticket
  -- job_stage removed, waiting_since + deadline_date added
  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    verified_by, is_manual, handoff,
    waiting_since, deadline_date
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', 'high',
    'system', true, false,
    now(), p_deadline_date
  ) RETURNING id INTO v_ticket_id;

  RETURN v_ticket_id;
END;
$$;
