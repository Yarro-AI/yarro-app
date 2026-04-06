-- =============================================================
-- Yarro PM — WhatsApp Message Testing Seed Data
-- Run AFTER seed-full-demo.sql in Supabase SQL Editor
-- =============================================================
-- Creates test data for firing every WhatsApp/email message scenario.
-- Uses CURRENT_DATE offsets so entries work regardless of when run.
-- =============================================================

DO $$
DECLARE
  v_pm_id uuid;

  -- Looked up from seed-full-demo.sql entities
  v_ll1_id uuid;   -- James Okafor (WhatsApp)
  v_ll2_id uuid;   -- Sarah Mitchell (email)
  v_con1_id uuid;  -- British Gas (WhatsApp)
  v_con2_id uuid;  -- Spark Electrical (will set to email)
  v_con3_id uuid;  -- AllFix Maintenance (WhatsApp)

  v_prop1_id uuid; -- 14 Brixton Hill (James, require_landlord_approval=true)
  v_prop3_id uuid; -- 28 Coldharbour Lane (Sarah, require_landlord_approval=false)

  -- Tenants
  v_t1 uuid;   -- Amara Diallo (Prop 1)
  v_t3 uuid;   -- Chloe Nguyen (Prop 1)
  v_t4 uuid;   -- Daniel Mensah (Prop 1)
  v_t8 uuid;   -- Prop 3 tenant

  -- Rooms
  v_r1a uuid;  -- Prop 1, Room A (Amara)
  v_r1c uuid;  -- Prop 1, Room C (Chloe)
  v_r1d uuid;  -- Prop 1, Room D (Daniel)
  v_r3a uuid;  -- Prop 3, Room A

  -- Test tickets
  v_ticket_a uuid := gen_random_uuid();
  v_ticket_b uuid := gen_random_uuid();
  v_ticket_c uuid := gen_random_uuid();

BEGIN
  -- -------------------------------------------------------
  -- 1. Look up PM
  -- -------------------------------------------------------
  SELECT id INTO v_pm_id
  FROM public.c1_property_managers
  WHERE id = '78d307b5-659a-468b-ab3a-99e3ed5bc2cd';

  IF v_pm_id IS NULL THEN
    RAISE EXCEPTION 'PM not found. Run seed-full-demo.sql first.';
  END IF;

  -- -------------------------------------------------------
  -- 2. Look up entities by name
  -- -------------------------------------------------------
  SELECT id INTO v_ll1_id FROM c1_landlords WHERE full_name = 'James Okafor' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_ll2_id FROM c1_landlords WHERE full_name = 'Sarah Mitchell' AND property_manager_id = v_pm_id LIMIT 1;

  SELECT id INTO v_con1_id FROM c1_contractors WHERE contractor_name = 'British Gas' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_con2_id FROM c1_contractors WHERE contractor_name = 'Spark Electrical Ltd' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_con3_id FROM c1_contractors WHERE contractor_name = 'AllFix Maintenance' AND property_manager_id = v_pm_id LIMIT 1;

  SELECT id INTO v_prop1_id FROM c1_properties WHERE address LIKE '14 Brixton Hill%' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_prop3_id FROM c1_properties WHERE address LIKE '28 Coldharbour%' AND property_manager_id = v_pm_id LIMIT 1;

  SELECT id INTO v_t1 FROM c1_tenants WHERE full_name = 'Amara Diallo' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_t3 FROM c1_tenants WHERE full_name = 'Chloe Nguyen' AND property_manager_id = v_pm_id LIMIT 1;
  SELECT id INTO v_t4 FROM c1_tenants WHERE full_name = 'Daniel Mensah' AND property_manager_id = v_pm_id LIMIT 1;

  -- Prop 3 tenant (first one found)
  SELECT t.id INTO v_t8 FROM c1_tenants t WHERE t.property_id = v_prop3_id AND t.property_manager_id = v_pm_id LIMIT 1;

  -- Rooms (by tenant assignment)
  SELECT r.id INTO v_r1a FROM c1_rooms r WHERE r.current_tenant_id = v_t1 LIMIT 1;
  SELECT r.id INTO v_r1c FROM c1_rooms r WHERE r.current_tenant_id = v_t3 LIMIT 1;
  SELECT r.id INTO v_r1d FROM c1_rooms r WHERE r.current_tenant_id = v_t4 LIMIT 1;
  SELECT r.id INTO v_r3a FROM c1_rooms r WHERE r.current_tenant_id = v_t8 LIMIT 1;

  -- Guard
  IF v_ll1_id IS NULL OR v_con1_id IS NULL OR v_prop1_id IS NULL OR v_t1 IS NULL THEN
    RAISE EXCEPTION 'Seed-full-demo.sql entities not found. Run it first.';
  END IF;

  RAISE NOTICE 'Entities resolved. Creating test data...';

  -- -------------------------------------------------------
  -- A. Set Spark Electrical to email preference
  -- -------------------------------------------------------
  UPDATE c1_contractors
  SET contact_method = 'email'
  WHERE id = v_con2_id;

  RAISE NOTICE 'Spark Electrical set to contact_method=email';

  -- -------------------------------------------------------
  -- B. Rent ledger entries at exact CURRENT_DATE offsets
  --    (so get_rent_reminders_due() returns all 3 levels)
  -- -------------------------------------------------------

  -- Level 1: due in 3 days → reminder fires today
  INSERT INTO c1_rent_ledger (property_manager_id, room_id, tenant_id, due_date, amount_due, amount_paid, status)
  VALUES (v_pm_id, v_r1a, v_t1, CURRENT_DATE + 3, 750, 0, 'pending');

  -- Level 2: due today → reminder fires today
  INSERT INTO c1_rent_ledger (property_manager_id, room_id, tenant_id, due_date, amount_due, amount_paid, status)
  VALUES (v_pm_id, v_r1c, v_t3, CURRENT_DATE, 900, 0, 'pending');

  -- Level 3: due 3 days ago → overdue reminder fires today
  INSERT INTO c1_rent_ledger (property_manager_id, room_id, tenant_id, due_date, amount_due, amount_paid, status)
  VALUES (v_pm_id, v_r1d, v_t4, CURRENT_DATE - 3, 700, 0, 'pending');

  -- Escalation test: fully exhausted (all 3 reminders sent > 7 days ago)
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date,
    amount_due, amount_paid, status,
    reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at
  ) VALUES (
    v_pm_id, v_r1a, v_t1, CURRENT_DATE - 30,
    750, 0, 'overdue',
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '22 days',
    NOW() - INTERVAL '19 days'
  );

  RAISE NOTICE 'Rent ledger test entries created (levels 1-3 + escalation)';

  -- -------------------------------------------------------
  -- C. Test tickets at various lifecycle stages
  -- -------------------------------------------------------

  -- Ticket A: open, job_stage='Sent', assigned to British Gas (Prop 1 / James Okafor)
  INSERT INTO c1_tickets (
    id, property_manager_id, property_id, tenant_id, contractor_id,
    issue_title, issue_description, category, priority,
    status, job_stage, date_logged, tenant_token, images, archived
  ) VALUES (
    v_ticket_a, v_pm_id, v_prop1_id, v_t1, v_con1_id,
    'Gas hob not igniting', 'The front-left burner on the gas hob clicks but does not ignite. All other burners work fine.',
    'gas_engineer', 'Standard',
    'open', 'Sent', NOW() - INTERVAL '2 days',
    encode(gen_random_bytes(12), 'hex'), '[]'::jsonb, false
  );

  INSERT INTO c1_messages (ticket_id, manager, contractors, landlord, stage)
  VALUES (
    v_ticket_a,
    jsonb_build_object('id', v_pm_id, 'phone', '447447146935', 'business_name', 'Yarro Property Management'),
    jsonb_build_array(jsonb_build_object(
      'id', v_con1_id,
      'phone', '+447700300001',
      'name', 'British Gas',
      'category', 'gas_engineer',
      'status', 'sent',
      'portal_token', encode(gen_random_bytes(12), 'hex')
    )),
    jsonb_build_object('id', v_ll1_id, 'phone', '+447700100001', 'name', 'James Okafor'),
    'waiting_contractor'
  );

  -- Ticket B: open, scheduled for today, job_stage='Booked' (Prop 1 / British Gas)
  INSERT INTO c1_tickets (
    id, property_manager_id, property_id, tenant_id, contractor_id,
    issue_title, issue_description, category, priority,
    status, job_stage, scheduled_date, date_logged,
    contractor_token, tenant_token, images, archived
  ) VALUES (
    v_ticket_b, v_pm_id, v_prop1_id, v_t3, v_con1_id,
    'Radiator not heating', 'Radiator in bedroom stays cold even when heating is on. All other radiators work.',
    'gas_engineer', 'Standard',
    'open', 'Booked', CURRENT_DATE, NOW() - INTERVAL '5 days',
    encode(gen_random_bytes(12), 'hex'),
    encode(gen_random_bytes(12), 'hex'), '[]'::jsonb, false
  );

  INSERT INTO c1_messages (ticket_id, manager, contractors, landlord, stage)
  VALUES (
    v_ticket_b,
    jsonb_build_object('id', v_pm_id, 'phone', '447447146935', 'business_name', 'Yarro Property Management'),
    jsonb_build_array(jsonb_build_object(
      'id', v_con1_id,
      'phone', '+447700300001',
      'name', 'British Gas',
      'category', 'gas_engineer',
      'status', 'replied',
      'quote_amount', '£85',
      'portal_token', encode(gen_random_bytes(12), 'hex')
    )),
    jsonb_build_object('id', v_ll1_id, 'phone', '+447700100001', 'name', 'James Okafor'),
    'scheduled'
  );

  -- Ticket C: open, scheduled yesterday, job_stage='Booked' (Prop 3 / Sarah Mitchell / Spark Electrical)
  -- This ticket is on Sarah Mitchell's property (email landlord) with Spark Electrical (email contractor)
  INSERT INTO c1_tickets (
    id, property_manager_id, property_id, tenant_id, contractor_id,
    issue_title, issue_description, category, priority,
    status, job_stage, scheduled_date, date_logged,
    contractor_token, tenant_token, images, archived
  ) VALUES (
    v_ticket_c, v_pm_id, v_prop3_id, v_t8, v_con2_id,
    'Faulty light switch', 'Light switch in hallway sparks when toggled. Intermittent issue.',
    'electrician', 'Urgent',
    'open', 'Booked', CURRENT_DATE - 1, NOW() - INTERVAL '4 days',
    encode(gen_random_bytes(12), 'hex'),
    encode(gen_random_bytes(12), 'hex'), '[]'::jsonb, false
  );

  INSERT INTO c1_messages (ticket_id, manager, contractors, landlord, stage)
  VALUES (
    v_ticket_c,
    jsonb_build_object('id', v_pm_id, 'phone', '447447146935', 'business_name', 'Yarro Property Management'),
    jsonb_build_array(jsonb_build_object(
      'id', v_con2_id,
      'phone', '+447700300002',
      'name', 'Spark Electrical Ltd',
      'category', 'electrician',
      'status', 'replied',
      'quote_amount', '£150',
      'portal_token', encode(gen_random_bytes(12), 'hex')
    )),
    jsonb_build_object('id', v_ll2_id, 'phone', '+447700100002', 'name', 'Sarah Mitchell'),
    'scheduled'
  );

  RAISE NOTICE 'Test tickets created: A (Sent), B (Booked today), C (Booked yesterday, email entities)';

  -- -------------------------------------------------------
  -- D. Reset compliance cert reminder state
  -- -------------------------------------------------------
  UPDATE c1_compliance_certificates
  SET reminder_count = 0, last_reminder_at = NULL, reminder_sent_at = NULL
  WHERE property_manager_id = v_pm_id;

  RAISE NOTICE 'Compliance cert reminders reset';

  -- -------------------------------------------------------
  -- E. Phone number swap placeholder
  -- -------------------------------------------------------
  -- Real test contact: Adam (07447146935 / adam@yarro.ai)
  UPDATE c1_tenants SET phone = '447447146935', email = 'adam@yarro.ai' WHERE id = v_t1;
  UPDATE c1_contractors SET contractor_phone = '447447146935', contractor_email = 'adam@yarro.ai' WHERE id = v_con1_id;
  UPDATE c1_landlords SET phone = '447447146935', email = 'adam@yarro.ai' WHERE id = v_ll1_id;
  UPDATE c1_property_managers SET phone = '447447146935' WHERE id = v_pm_id;

  RAISE NOTICE 'Done. Real phone/email set to Adam (07447146935 / adam@yarro.ai)';

  -- -------------------------------------------------------
  -- Summary: output ticket IDs for curl commands
  -- -------------------------------------------------------
  RAISE NOTICE 'Ticket A (Sent):            %', v_ticket_a;
  RAISE NOTICE 'Ticket B (Booked today):    %', v_ticket_b;
  RAISE NOTICE 'Ticket C (Booked yesterday, email): %', v_ticket_c;

END $$;
