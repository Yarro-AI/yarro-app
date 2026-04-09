-- Rollback: restore c1_create_ticket + c1_create_manual_ticket with split logic
-- From 20260410400000_category_split_and_router.sql

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
