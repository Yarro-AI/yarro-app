-- ============================================================
-- Demo-First Onboarding: is_demo flag + seed RPC + RPC updates
-- ============================================================

-- 1. Add is_demo column to relevant tables
ALTER TABLE c1_properties ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE c1_tenants ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE c1_contractors ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- 2. Seed demo data RPC
CREATE OR REPLACE FUNCTION public.onboarding_seed_demo(p_pm_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_property record;
  v_room1 record;
  v_room2 record;
  v_room3 record;
  v_tenant1 record;
  v_tenant2 record;
  v_contractor record;
  v_ticket record;
  v_convo record;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Skip if demo data already exists
  IF EXISTS (
    SELECT 1 FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true
  ) THEN
    RETURN json_build_object('seeded', false, 'reason', 'demo data already exists');
  END IF;

  -- Create demo property
  INSERT INTO c1_properties (address, city, property_manager_id, property_type, is_demo)
  VALUES ('14 Brixton Hill, London SW2 1QA', 'London', p_pm_id, 'hmo', true)
  RETURNING * INTO v_property;

  -- Create 3 rooms
  INSERT INTO c1_rooms (property_id, property_manager_id, room_number, room_name, monthly_rent, rent_due_day)
  VALUES (v_property.id, p_pm_id, '1', 'Room 1', 750, 1)
  RETURNING * INTO v_room1;

  INSERT INTO c1_rooms (property_id, property_manager_id, room_number, room_name, monthly_rent, rent_due_day)
  VALUES (v_property.id, p_pm_id, '2', 'Room 2', 700, 1)
  RETURNING * INTO v_room2;

  INSERT INTO c1_rooms (property_id, property_manager_id, room_number, room_name, monthly_rent, rent_due_day)
  VALUES (v_property.id, p_pm_id, '3', 'Room 3', 725, 1)
  RETURNING * INTO v_room3;

  -- Create 2 demo tenants
  INSERT INTO c1_tenants (full_name, phone, email, property_id, property_manager_id, room_id, is_demo)
  VALUES ('Sarah Mitchell', '447700200001', 'sarah.m@example.com', v_property.id, p_pm_id, v_room1.id, true)
  RETURNING * INTO v_tenant1;

  INSERT INTO c1_tenants (full_name, phone, email, property_id, property_manager_id, room_id, is_demo)
  VALUES ('James Cooper', '447700200002', 'james.c@example.com', v_property.id, p_pm_id, v_room2.id, true)
  RETURNING * INTO v_tenant2;

  -- Assign tenants to rooms
  UPDATE c1_rooms SET current_tenant_id = v_tenant1.id, tenancy_start_date = CURRENT_DATE - interval '3 months' WHERE id = v_room1.id;
  UPDATE c1_rooms SET current_tenant_id = v_tenant2.id, tenancy_start_date = CURRENT_DATE - interval '2 months' WHERE id = v_room2.id;

  -- Create demo contractor
  INSERT INTO c1_contractors (name, phone, email, contact_method, property_manager_id, is_demo)
  VALUES ('Mike''s Plumbing', '447700300001', 'mike@plumbing.example.com', 'whatsapp', p_pm_id, true)
  RETURNING * INTO v_contractor;

  -- Create demo conversation (pre-built log)
  INSERT INTO c1_conversations (
    phone, status, property_manager_id, property_id, tenant_id, stage, handoff,
    caller_name, caller_role, tenant_confirmed,
    log
  ) VALUES (
    '447700200001', 'closed', p_pm_id, v_property.id, v_tenant1.id, 'final_summary', false,
    'Sarah Mitchell', 'tenant', true,
    jsonb_build_array(
      jsonb_build_object('direction', 'inbound', 'message', 'Hi, the boiler in my flat isn''t working', 'timestamp', (now() - interval '2 hours')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Sorry to hear that, Sarah. When did this start?', 'timestamp', (now() - interval '1 hour 58 minutes')::text),
      jsonb_build_object('direction', 'inbound', 'message', 'This morning, no hot water at all', 'timestamp', (now() - interval '1 hour 55 minutes')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Can you send a photo of the boiler?', 'timestamp', (now() - interval '1 hour 53 minutes')::text),
      jsonb_build_object('direction', 'inbound', 'message', '[Photo attached]', 'timestamp', (now() - interval '1 hour 50 minutes')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Thanks — I''ve created a maintenance ticket and I''m finding a plumber for you now.', 'timestamp', (now() - interval '1 hour 48 minutes')::text)
    )
  ) RETURNING * INTO v_convo;

  -- Create demo ticket (direct insert, NOT c1_create_ticket)
  INSERT INTO c1_tickets (
    conversation_id, property_id, property_manager_id, tenant_id, room_id,
    issue_description, issue_title, category, priority, status, job_stage,
    date_logged, access, reporter_role, handoff, is_demo,
    images
  ) VALUES (
    v_convo.id, v_property.id, p_pm_id, v_tenant1.id, v_room1.id,
    'Boiler is not producing hot water since this morning. Tenant reports no heating either. Photo of boiler attached.',
    'Boiler not heating — Room 1',
    'Plumbing', 'Urgent', 'closed', 'completed',
    now() - interval '2 hours', 'IMMEDIATE', 'tenant', false, true,
    '[]'::jsonb
  ) RETURNING * INTO v_ticket;

  -- Add audit trail entries (the trigger creates the first one, we add the rest)
  INSERT INTO c1_ledger (ticket_id, event_type, actor_role, data, created_at) VALUES
    (v_ticket.id, 'CONTRACTOR_ASSIGNED', 'system', jsonb_build_object('contractor', 'Mike''s Plumbing', 'category', 'Plumbing'), now() - interval '1 hour 45 minutes'),
    (v_ticket.id, 'QUOTE_RECEIVED', 'contractor', jsonb_build_object('amount', 85, 'notes', 'Standard boiler repair'), now() - interval '1 hour 30 minutes'),
    (v_ticket.id, 'QUOTE_APPROVED', 'system', jsonb_build_object('approved_by', 'auto', 'amount', 85), now() - interval '1 hour 28 minutes'),
    (v_ticket.id, 'JOB_SCHEDULED', 'contractor', jsonb_build_object('date', (CURRENT_DATE + 1)::text, 'time', '14:00'), now() - interval '1 hour'),
    (v_ticket.id, 'JOB_COMPLETED', 'contractor', jsonb_build_object('notes', 'Replaced faulty thermostat. Boiler heating normally now.'), now() - interval '30 minutes');

  RETURN json_build_object(
    'seeded', true,
    'property_id', v_property.id,
    'ticket_id', v_ticket.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_seed_demo TO authenticated;

-- 3. Update onboarding_create_property to clean up demo data
CREATE OR REPLACE FUNCTION public.onboarding_create_property(
  p_pm_id uuid,
  p_address text,
  p_city text,
  p_postcode text,
  p_room_count int DEFAULT 1,
  p_property_type text DEFAULT 'hmo'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_property record;
  v_i int;
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Clean up demo data when adding first real property
  DELETE FROM c1_ledger WHERE ticket_id IN (
    SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true
  );
  DELETE FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true;
  DELETE FROM c1_conversations WHERE property_manager_id = p_pm_id AND property_id IN (
    SELECT id FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true
  );
  DELETE FROM c1_rooms WHERE property_manager_id = p_pm_id AND property_id IN (
    SELECT id FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true
  );
  DELETE FROM c1_tenants WHERE property_manager_id = p_pm_id AND is_demo = true;
  DELETE FROM c1_contractors WHERE property_manager_id = p_pm_id AND is_demo = true;
  DELETE FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true;

  -- Insert property
  INSERT INTO c1_properties (
    address, city, property_manager_id, property_type
  ) VALUES (
    p_address, p_city, p_pm_id, p_property_type
  )
  RETURNING * INTO v_property;

  -- Create rooms
  FOR v_i IN 1..GREATEST(p_room_count, 0) LOOP
    INSERT INTO c1_rooms (
      property_id, property_manager_id, room_number, room_name
    ) VALUES (
      v_property.id, p_pm_id, v_i, 'Room ' || v_i
    );
  END LOOP;

  -- Seed compliance requirements
  PERFORM compliance_set_property_type(v_property.id, p_pm_id, p_property_type);

  RETURN row_to_json(v_property);
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_create_property TO authenticated;

-- 4. Update checklist RPC — add "Add your property", filter by is_demo
CREATE OR REPLACE FUNCTION public.c1_get_onboarding_checklist(p_pm_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_first_property_id uuid;
  v_real_property_count int;
  v_tenant_count int;
  v_contractor_count int;
  v_cert_count int;
  v_all_done boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- First non-demo property for linking
  SELECT id INTO v_first_property_id
  FROM c1_properties
  WHERE property_manager_id = p_pm_id AND is_demo = false
  ORDER BY created_at ASC
  LIMIT 1;

  -- Counts excluding demo data
  SELECT count(*) INTO v_real_property_count
  FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = false;

  SELECT count(*) INTO v_tenant_count
  FROM c1_tenants WHERE property_manager_id = p_pm_id AND is_demo = false;

  SELECT count(*) INTO v_contractor_count
  FROM c1_contractors WHERE property_manager_id = p_pm_id AND is_demo = false;

  SELECT count(*) INTO v_cert_count
  FROM c1_compliance_certificates WHERE property_manager_id = p_pm_id;

  -- All done when all 4 items are complete
  v_all_done := (v_real_property_count > 0 AND v_tenant_count > 0 AND v_contractor_count > 0 AND v_cert_count > 0);

  IF v_all_done THEN
    UPDATE c1_property_managers
    SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
    WHERE id = p_pm_id;
  END IF;

  RETURN json_build_array(
    json_build_object(
      'key', 'add_property',
      'label', 'Add your property',
      'description', 'Set up your first property with rooms',
      'complete', v_real_property_count > 0,
      'count', v_real_property_count,
      'link_href', '/import'
    ),
    json_build_object(
      'key', 'add_tenants',
      'label', 'Add your tenants',
      'description', 'Assign tenants to rooms',
      'complete', v_tenant_count > 0,
      'count', v_tenant_count,
      'link_href', '/tenants'
    ),
    json_build_object(
      'key', 'add_contractors',
      'label', 'Add a contractor',
      'description', 'So Yarro can dispatch repairs',
      'complete', v_contractor_count > 0,
      'count', v_contractor_count,
      'link_href', '/contractors'
    ),
    json_build_object(
      'key', 'setup_compliance',
      'label', 'Set up compliance',
      'description', 'Upload certificates and set expiry dates',
      'complete', v_cert_count > 0,
      'count', v_cert_count,
      'link_href', CASE
        WHEN v_first_property_id IS NOT NULL
        THEN '/properties/' || v_first_property_id || '?tab=compliance'
        ELSE '/compliance'
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.c1_get_onboarding_checklist TO authenticated;
