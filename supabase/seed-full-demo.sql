-- =============================================================
-- Yarro PM — Full Demo Seed Data
-- Run in Supabase SQL Editor (one-shot)
-- =============================================================
-- Creates: 2 landlords, 3 contractors, 4 properties (16 rooms),
--          14 tenants, compliance certs + requirements,
--          3 months of rent ledger entries at mixed statuses
-- Assumes: You have at least one row in c1_property_managers
-- =============================================================

DO $$
DECLARE
  v_pm_id uuid;

  -- Landlords
  v_ll1_id uuid := gen_random_uuid();
  v_ll2_id uuid := gen_random_uuid();

  -- Contractors
  v_con1_id uuid := gen_random_uuid();
  v_con2_id uuid := gen_random_uuid();
  v_con3_id uuid := gen_random_uuid();

  -- Properties
  v_prop1_id uuid := gen_random_uuid();
  v_prop2_id uuid := gen_random_uuid();
  v_prop3_id uuid := gen_random_uuid();
  v_prop4_id uuid := gen_random_uuid();

  -- Property 1 rooms (5 rooms — 14 Brixton Hill)
  v_r1a uuid := gen_random_uuid();
  v_r1b uuid := gen_random_uuid();
  v_r1c uuid := gen_random_uuid();
  v_r1d uuid := gen_random_uuid();
  v_r1e uuid := gen_random_uuid();

  -- Property 2 rooms (4 rooms — 87 Acre Lane)
  v_r2a uuid := gen_random_uuid();
  v_r2b uuid := gen_random_uuid();
  v_r2c uuid := gen_random_uuid();
  v_r2d uuid := gen_random_uuid();

  -- Property 3 rooms (4 rooms — 22 Coldharbour Lane)
  v_r3a uuid := gen_random_uuid();
  v_r3b uuid := gen_random_uuid();
  v_r3c uuid := gen_random_uuid();
  v_r3d uuid := gen_random_uuid();

  -- Property 4 rooms (3 rooms — 5 Tulse Hill)
  v_r4a uuid := gen_random_uuid();
  v_r4b uuid := gen_random_uuid();
  v_r4c uuid := gen_random_uuid();

  -- Tenants (14 total)
  v_t1  uuid := gen_random_uuid();
  v_t2  uuid := gen_random_uuid();
  v_t3  uuid := gen_random_uuid();
  v_t4  uuid := gen_random_uuid();
  v_t5  uuid := gen_random_uuid();
  v_t6  uuid := gen_random_uuid();
  v_t7  uuid := gen_random_uuid();
  v_t8  uuid := gen_random_uuid();
  v_t9  uuid := gen_random_uuid();
  v_t10 uuid := gen_random_uuid();
  v_t11 uuid := gen_random_uuid();
  v_t12 uuid := gen_random_uuid();
  v_t13 uuid := gen_random_uuid();
  v_t14 uuid := gen_random_uuid();

BEGIN
  -- -------------------------------------------------------
  -- 1. Get PM ID
  -- -------------------------------------------------------
  SELECT id INTO v_pm_id
  FROM public.c1_property_managers
  WHERE id = '78d307b5-659a-468b-ab3a-99e3ed5bc2cd';

  IF v_pm_id IS NULL THEN
    RAISE EXCEPTION 'No property manager found. Sign in first.';
  END IF;

  RAISE NOTICE 'Using PM: %', v_pm_id;

  -- -------------------------------------------------------
  -- 1b. Clean up existing data (order matters for FK deps)
  -- -------------------------------------------------------
  -- Delete in FK-safe order: children before parents
  DELETE FROM public.c1_rent_ledger              WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_compliance_certificates  WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_compliance_requirements  WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_events                   WHERE portfolio_id = v_pm_id;
  DELETE FROM public.c1_feedback                 WHERE property_manager_id = v_pm_id;
  -- Job completions FK is id → c1_tickets.id (1:1), messages FK is ticket_id
  DELETE FROM public.c1_job_completions WHERE id IN (SELECT id FROM public.c1_tickets WHERE property_manager_id = v_pm_id);
  DELETE FROM public.c1_messages        WHERE ticket_id IN (SELECT id FROM public.c1_tickets WHERE property_manager_id = v_pm_id);
  DELETE FROM public.c1_ledger          WHERE ticket_id IN (SELECT id FROM public.c1_tickets WHERE property_manager_id = v_pm_id);
  DELETE FROM public.c1_outbound_log    WHERE ticket_id IN (SELECT id FROM public.c1_tickets WHERE property_manager_id = v_pm_id);
  DELETE FROM public.c1_tickets                  WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_conversations            WHERE property_manager_id = v_pm_id;
  UPDATE public.c1_tenants SET room_id = NULL    WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_rooms                    WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_tenants                  WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_properties               WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_contractors              WHERE property_manager_id = v_pm_id;
  DELETE FROM public.c1_landlords                WHERE property_manager_id = v_pm_id;

  RAISE NOTICE 'Cleaned up existing data for PM: %', v_pm_id;

  -- -------------------------------------------------------
  -- 2. Landlords
  -- -------------------------------------------------------
  INSERT INTO public.c1_landlords (id, full_name, email, phone, contact_method, property_manager_id)
  VALUES
    (v_ll1_id, 'James Okafor',   'james.okafor@example.com',   '447700100001', 'whatsapp', v_pm_id),
    (v_ll2_id, 'Sarah Mitchell', 'sarah.mitchell@example.com', '447700100002', 'email',    v_pm_id);

  RAISE NOTICE 'Created 2 landlords';

  -- -------------------------------------------------------
  -- 3. Contractors
  -- -------------------------------------------------------
  INSERT INTO public.c1_contractors (
    id, contractor_name, contractor_email, contractor_phone,
    category, categories, active, property_manager_id, contact_method
  ) VALUES
    (v_con1_id, 'British Gas',          'bookings@britishgas.example',  '447700300001',
     'gas_engineer', ARRAY['gas_engineer'], true, v_pm_id, 'whatsapp'),
    (v_con2_id, 'Spark Electrical Ltd', 'info@sparkelectrical.example', '447700300002',
     'electrician',  ARRAY['electrician','pat_tester'], true, v_pm_id, 'whatsapp'),
    (v_con3_id, 'AllFix Maintenance',   'jobs@allfix.example',          '447700300003',
     'general',      ARRAY['general','plumber','locksmith'], true, v_pm_id, 'whatsapp');

  RAISE NOTICE 'Created 3 contractors';

  -- -------------------------------------------------------
  -- 4. Properties (4 HMOs across South London)
  -- -------------------------------------------------------
  INSERT INTO public.c1_properties (
    id, address, city, property_manager_id, property_type,
    landlord_id, landlord_name, landlord_email, landlord_phone,
    require_landlord_approval, auto_approve_limit
  ) VALUES
    (v_prop1_id, '14 Brixton Hill, London SW2 1QA',           'London', v_pm_id, 'hmo',
     v_ll1_id, 'James Okafor', 'james.okafor@example.com', '447700100001', true, 150),
    (v_prop2_id, '93 Acre Lane, London SW2 5TN',            'London', v_pm_id, 'hmo',
     v_ll1_id, 'James Okafor', 'james.okafor@example.com', '447700100001', true, 200),
    (v_prop3_id, '28 Coldharbour Lane, London SE5 9PR',     'London', v_pm_id, 'hmo',
     v_ll2_id, 'Sarah Mitchell', 'sarah.mitchell@example.com', '447700100002', false, 300),
    (v_prop4_id, '11 Tulse Hill, London SW2 2QS',           'London', v_pm_id, 'hmo',
     v_ll2_id, 'Sarah Mitchell', 'sarah.mitchell@example.com', '447700100002', false, 250);

  RAISE NOTICE 'Created 4 properties';

  -- -------------------------------------------------------
  -- 5. Tenants (14 total — created without room_id first)
  -- -------------------------------------------------------
  INSERT INTO public.c1_tenants (id, full_name, email, phone, property_id, property_manager_id)
  VALUES
    -- Property 1 tenants (4 of 5 rooms occupied)
    (v_t1,  'Amara Diallo',    'amara.diallo@example.com',    '447700200001', v_prop1_id, v_pm_id),
    (v_t2,  'Ben Carter',      'ben.carter@example.com',      '447700200002', v_prop1_id, v_pm_id),
    (v_t3,  'Chloe Nguyen',    'chloe.nguyen@example.com',    '447700200003', v_prop1_id, v_pm_id),
    (v_t4,  'Daniel Mensah',   'daniel.mensah@example.com',   '447700200004', v_prop1_id, v_pm_id),
    -- Property 2 tenants (3 of 4 rooms occupied)
    (v_t5,  'Elena Rodriguez', 'elena.rodriguez@example.com', '447700200005', v_prop2_id, v_pm_id),
    (v_t6,  'Femi Adebayo',    'femi.adebayo@example.com',    '447700200006', v_prop2_id, v_pm_id),
    (v_t7,  'Grace Kim',       'grace.kim@example.com',       '447700200007', v_prop2_id, v_pm_id),
    -- Property 3 tenants (4 of 4 rooms occupied — fully let)
    (v_t8,  'Hassan Ali',      'hassan.ali@example.com',      '447700200008', v_prop3_id, v_pm_id),
    (v_t9,  'Isla Campbell',   'isla.campbell@example.com',    '447700200009', v_prop3_id, v_pm_id),
    (v_t10, 'Jake Williams',   'jake.williams@example.com',   '447700200010', v_prop3_id, v_pm_id),
    (v_t11, 'Keiko Tanaka',    'keiko.tanaka@example.com',    '447700200011', v_prop3_id, v_pm_id),
    -- Property 4 tenants (2 of 3 rooms occupied)
    (v_t12, 'Liam O''Brien',   'liam.obrien@example.com',     '447700200012', v_prop4_id, v_pm_id),
    (v_t13, 'Maya Patel',      'maya.patel@example.com',      '447700200013', v_prop4_id, v_pm_id),
    (v_t14, 'Noah Adams',      'noah.adams@example.com',      '447700200014', v_prop4_id, v_pm_id);

  RAISE NOTICE 'Created 14 tenants';

  -- -------------------------------------------------------
  -- 6. Rooms (16 total across 4 properties)
  -- -------------------------------------------------------

  -- Property 1: 14 Brixton Hill — 5 rooms, rent due 1st
  INSERT INTO public.c1_rooms (
    id, property_manager_id, property_id, room_number, room_name, floor,
    current_tenant_id, tenancy_start_date, tenancy_end_date,
    monthly_rent, rent_due_day, rent_frequency
  ) VALUES
    (v_r1a, v_pm_id, v_prop1_id, '1', 'Front Single',    'Ground', v_t1,  '2025-09-01', '2026-08-31',  750, 1, 'monthly'),
    (v_r1b, v_pm_id, v_prop1_id, '2', 'Rear Double',     'Ground', v_t2,  '2025-11-15', '2026-11-14',  950, 1, 'monthly'),
    (v_r1c, v_pm_id, v_prop1_id, '3', 'Front Double',    'First',  v_t3,  '2026-01-01', '2026-12-31',  900, 1, 'monthly'),
    (v_r1d, v_pm_id, v_prop1_id, '4', 'Rear Single',     'First',  v_t4,  '2026-02-01', '2027-01-31',  700, 1, 'monthly'),
    (v_r1e, v_pm_id, v_prop1_id, '5', 'Loft Conversion', 'Second', NULL,  NULL,         NULL,          850, 1, 'monthly');

  -- Property 2: 87 Acre Lane — 4 rooms, rent due 5th
  INSERT INTO public.c1_rooms (
    id, property_manager_id, property_id, room_number, room_name, floor,
    current_tenant_id, tenancy_start_date, tenancy_end_date,
    monthly_rent, rent_due_day, rent_frequency
  ) VALUES
    (v_r2a, v_pm_id, v_prop2_id, 'A', 'Master Suite',  'First',  v_t5,  '2025-10-01', '2026-09-30',  1100, 5, 'monthly'),
    (v_r2b, v_pm_id, v_prop2_id, 'B', 'Double Room',   'First',  v_t6,  '2026-01-15', '2027-01-14',   950, 5, 'monthly'),
    (v_r2c, v_pm_id, v_prop2_id, 'C', 'Single Room',   'Ground', v_t7,  '2025-08-01', '2026-07-31',   750, 5, 'monthly'),
    (v_r2d, v_pm_id, v_prop2_id, 'D', 'Garden Studio', 'Ground', NULL,  NULL,         NULL,           800, 5, 'monthly');

  -- Property 3: 22 Coldharbour Lane — 4 rooms, rent due 10th
  INSERT INTO public.c1_rooms (
    id, property_manager_id, property_id, room_number, room_name, floor,
    current_tenant_id, tenancy_start_date, tenancy_end_date,
    monthly_rent, rent_due_day, rent_frequency
  ) VALUES
    (v_r3a, v_pm_id, v_prop3_id, '1', 'Front Room',  'Ground', v_t8,  '2025-07-01', '2026-06-30', 1100, 10, 'monthly'),
    (v_r3b, v_pm_id, v_prop3_id, '2', 'Middle Room', 'Ground', v_t9,  '2025-12-01', '2026-11-30', 1050, 10, 'monthly'),
    (v_r3c, v_pm_id, v_prop3_id, '3', 'Back Room',   'First',  v_t10, '2026-02-15', '2027-02-14',  980, 10, 'monthly'),
    (v_r3d, v_pm_id, v_prop3_id, '4', 'Top Floor',   'Second', v_t11, '2025-11-01', '2026-10-31',  900, 10, 'monthly');

  -- Property 4: 5 Tulse Hill — 3 rooms, rent due 15th
  INSERT INTO public.c1_rooms (
    id, property_manager_id, property_id, room_number, room_name, floor,
    current_tenant_id, tenancy_start_date, tenancy_end_date,
    monthly_rent, rent_due_day, rent_frequency
  ) VALUES
    (v_r4a, v_pm_id, v_prop4_id, '1', 'Large Double',  'Ground', v_t12, '2025-06-01', '2026-05-31', 1200, 15, 'monthly'),
    (v_r4b, v_pm_id, v_prop4_id, '2', 'Small Double',  'First',  v_t13, '2026-01-01', '2026-12-31', 1000, 15, 'monthly'),
    (v_r4c, v_pm_id, v_prop4_id, '3', 'En-Suite Room', 'First',  v_t14, '2026-03-01', '2027-02-28', 1350, 15, 'monthly');

  RAISE NOTICE 'Created 16 rooms (13 occupied, 3 vacant)';

  -- -------------------------------------------------------
  -- 6b. Back-fill room_id on tenants (dual-sync)
  -- -------------------------------------------------------
  UPDATE public.c1_tenants SET room_id = v_r1a WHERE id = v_t1;
  UPDATE public.c1_tenants SET room_id = v_r1b WHERE id = v_t2;
  UPDATE public.c1_tenants SET room_id = v_r1c WHERE id = v_t3;
  UPDATE public.c1_tenants SET room_id = v_r1d WHERE id = v_t4;
  UPDATE public.c1_tenants SET room_id = v_r2a WHERE id = v_t5;
  UPDATE public.c1_tenants SET room_id = v_r2b WHERE id = v_t6;
  UPDATE public.c1_tenants SET room_id = v_r2c WHERE id = v_t7;
  UPDATE public.c1_tenants SET room_id = v_r3a WHERE id = v_t8;
  UPDATE public.c1_tenants SET room_id = v_r3b WHERE id = v_t9;
  UPDATE public.c1_tenants SET room_id = v_r3c WHERE id = v_t10;
  UPDATE public.c1_tenants SET room_id = v_r3d WHERE id = v_t11;
  UPDATE public.c1_tenants SET room_id = v_r4a WHERE id = v_t12;
  UPDATE public.c1_tenants SET room_id = v_r4b WHERE id = v_t13;
  UPDATE public.c1_tenants SET room_id = v_r4c WHERE id = v_t14;

  RAISE NOTICE 'Back-filled room_id on 14 tenants';

  -- -------------------------------------------------------
  -- 7. Compliance requirements (per property)
  -- -------------------------------------------------------
  -- All 4 properties need the HMO essentials
  INSERT INTO public.c1_compliance_requirements (property_id, property_manager_id, certificate_type, is_required)
  SELECT p.id, v_pm_id, cert.type::certificate_type, true
  FROM (VALUES (v_prop1_id), (v_prop2_id), (v_prop3_id), (v_prop4_id)) AS p(id)
  CROSS JOIN (VALUES
    ('hmo_license'), ('gas_safety'), ('eicr'), ('epc'),
    ('fire_risk'), ('smoke_alarms'), ('co_alarms')
  ) AS cert(type);

  RAISE NOTICE 'Created compliance requirements (7 types x 4 properties)';

  -- -------------------------------------------------------
  -- 8. Compliance certificates — varied statuses per property
  -- -------------------------------------------------------

  -- Property 1: 14 Brixton Hill — mostly compliant, 1 expired, 2 missing
  INSERT INTO public.c1_compliance_certificates (
    property_id, property_manager_id, certificate_type,
    issued_date, expiry_date, certificate_number, issued_by,
    status, reminder_days_before, document_url, contractor_id
  ) VALUES
    (v_prop1_id, v_pm_id, 'gas_safety',  '2025-12-15', '2026-12-15', 'GS-2025-4821',      'British Gas',             'valid', 60, 'https://placeholder.example/gs1.pdf', v_con1_id),
    (v_prop1_id, v_pm_id, 'eicr',        '2021-10-20', '2026-10-20', 'EICR-2021-7734',     'Spark Electrical Ltd',    'valid', 90, 'https://placeholder.example/eicr1.pdf', v_con2_id),
    (v_prop1_id, v_pm_id, 'hmo_license', '2021-05-12', '2026-05-12', 'HMO/LB/2021/0394',   'Lambeth Council',         'valid', 60, 'https://placeholder.example/hmo1.pdf', NULL),
    (v_prop1_id, v_pm_id, 'epc',         '2016-02-28', '2026-02-28', 'EPC-8823-2244-0100',  'EPC Direct',              'valid', 60, 'https://placeholder.example/epc1.pdf', NULL),
    (v_prop1_id, v_pm_id, 'fire_risk',   '2025-06-01', '2026-06-01', 'FRA-2025-1100',       'SafeGuard Assessments',   'valid', 60, NULL, NULL);
  -- smoke_alarms + co_alarms → missing (no cert record)

  -- Property 2: 87 Acre Lane — good shape, 1 expiring soon
  INSERT INTO public.c1_compliance_certificates (
    property_id, property_manager_id, certificate_type,
    issued_date, expiry_date, certificate_number, issued_by,
    status, reminder_days_before, document_url, contractor_id
  ) VALUES
    (v_prop2_id, v_pm_id, 'gas_safety',  '2026-01-10', '2027-01-10', 'GS-2026-5001',      'British Gas',           'valid', 60, 'https://placeholder.example/gs2.pdf', v_con1_id),
    (v_prop2_id, v_pm_id, 'eicr',        '2023-03-15', '2028-03-15', 'EICR-2023-8890',     'Spark Electrical Ltd',  'valid', 90, 'https://placeholder.example/eicr2.pdf', v_con2_id),
    (v_prop2_id, v_pm_id, 'hmo_license', '2024-08-01', '2029-08-01', 'HMO/LB/2024/0712',   'Lambeth Council',       'valid', 60, 'https://placeholder.example/hmo2.pdf', NULL),
    (v_prop2_id, v_pm_id, 'epc',         '2022-06-20', '2032-06-20', 'EPC-9912-3344-0200',  'Energy Cert UK',        'valid', 60, 'https://placeholder.example/epc2.pdf', NULL),
    (v_prop2_id, v_pm_id, 'fire_risk',   '2025-04-15', '2026-04-15', 'FRA-2025-2200',       'SafeGuard Assessments', 'valid', 60, 'https://placeholder.example/fra2.pdf', NULL),
    (v_prop2_id, v_pm_id, 'smoke_alarms','2026-02-01', '2027-02-01', 'SA-2026-001',         'AllFix Maintenance',    'valid', 30, 'https://placeholder.example/sa2.pdf', v_con3_id),
    (v_prop2_id, v_pm_id, 'co_alarms',   '2026-02-01', '2027-02-01', 'CO-2026-001',         'AllFix Maintenance',    'valid', 30, 'https://placeholder.example/co2.pdf', v_con3_id);

  -- Property 3: 22 Coldharbour Lane — some issues
  INSERT INTO public.c1_compliance_certificates (
    property_id, property_manager_id, certificate_type,
    issued_date, expiry_date, certificate_number, issued_by,
    status, reminder_days_before, document_url, contractor_id
  ) VALUES
    (v_prop3_id, v_pm_id, 'gas_safety',  '2025-08-20', '2026-08-20', 'GS-2025-6100',      'British Gas',           'valid', 60, 'https://placeholder.example/gs3.pdf', v_con1_id),
    (v_prop3_id, v_pm_id, 'eicr',        '2020-11-01', '2025-11-01', 'EICR-2020-3300',     'Spark Electrical Ltd',  'valid', 90, 'https://placeholder.example/eicr3.pdf', v_con2_id),
    (v_prop3_id, v_pm_id, 'hmo_license', '2023-02-01', '2028-02-01', 'HMO/SWK/2023/0055',  'Southwark Council',     'valid', 60, 'https://placeholder.example/hmo3.pdf', NULL),
    (v_prop3_id, v_pm_id, 'epc',         '2019-09-10', '2029-09-10', 'EPC-5501-7788-0300',  'Green Cert Ltd',        'valid', 60, 'https://placeholder.example/epc3.pdf', NULL);
  -- fire_risk, smoke_alarms, co_alarms → missing

  -- Property 4: 5 Tulse Hill — mostly missing (new property)
  INSERT INTO public.c1_compliance_certificates (
    property_id, property_manager_id, certificate_type,
    issued_date, expiry_date, certificate_number, issued_by,
    status, reminder_days_before, document_url, contractor_id
  ) VALUES
    (v_prop4_id, v_pm_id, 'gas_safety',  '2026-03-01', '2027-03-01', 'GS-2026-7200', 'British Gas', 'valid', 60, 'https://placeholder.example/gs4.pdf', v_con1_id),
    (v_prop4_id, v_pm_id, 'epc',         '2025-11-15', '2035-11-15', 'EPC-2200-9900-0400', 'EPC Direct', 'valid', 60, 'https://placeholder.example/epc4.pdf', NULL);
  -- hmo_license, eicr, fire_risk, smoke_alarms, co_alarms → missing

  RAISE NOTICE 'Created compliance certificates across 4 properties';

  -- -------------------------------------------------------
  -- 9. Rent ledger entries — 3 months of history
  --    Feb 2026: all paid (historical)
  --    Mar 2026: mostly paid, some late/partial
  --    Apr 2026: current month — mixed statuses
  -- -------------------------------------------------------

  -- ===== FEBRUARY 2026 — All paid (clean month) =====
  INSERT INTO public.c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date,
    amount_due, amount_paid, paid_at, payment_method, status
  ) VALUES
    -- Prop 1 (due 1st)
    (v_pm_id, v_r1a, v_t1,  '2026-02-01',  750, 750, '2026-02-01 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r1b, v_t2,  '2026-02-01',  950, 950, '2026-01-31 16:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r1c, v_t3,  '2026-02-01',  900, 900, '2026-02-01 10:30:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r1d, v_t4,  '2026-02-01',  700, 700, '2026-02-02 14:00:00+00', 'Bank transfer', 'paid'),
    -- Prop 2 (due 5th)
    (v_pm_id, v_r2a, v_t5,  '2026-02-05', 1100, 1100, '2026-02-05 08:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r2b, v_t6,  '2026-02-05',  950,  950, '2026-02-05 09:15:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r2c, v_t7,  '2026-02-05',  750,  750, '2026-02-04 17:00:00+00', 'Standing order', 'paid'),
    -- Prop 3 (due 10th)
    (v_pm_id, v_r3a, v_t8,  '2026-02-10', 1100, 1100, '2026-02-10 10:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r3b, v_t9,  '2026-02-10', 1050, 1050, '2026-02-10 11:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r3c, v_t10, '2026-02-10',  980,  980, '2026-02-15 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r3d, v_t11, '2026-02-10',  900,  900, '2026-02-09 18:00:00+00', 'Standing order', 'paid'),
    -- Prop 4 (due 15th)
    (v_pm_id, v_r4a, v_t12, '2026-02-15', 1200, 1200, '2026-02-15 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r4b, v_t13, '2026-02-15', 1000, 1000, '2026-02-14 20:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r4c, v_t14, '2026-02-15', 1350, 1350, '2026-02-15 12:00:00+00', 'Bank transfer', 'paid');

  RAISE NOTICE 'February 2026: 14 entries, all paid';

  -- ===== MARCH 2026 — Mostly paid, 2 late, 1 partial =====
  INSERT INTO public.c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date,
    amount_due, amount_paid, paid_at, payment_method, status
  ) VALUES
    -- Prop 1
    (v_pm_id, v_r1a, v_t1,  '2026-03-01',  750,  750, '2026-03-01 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r1b, v_t2,  '2026-03-01',  950,  950, '2026-03-01 08:30:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r1c, v_t3,  '2026-03-01',  900,  900, '2026-03-03 16:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r1d, v_t4,  '2026-03-01',  700,  500, '2026-03-08 10:00:00+00', 'Cash', 'partial'),
    -- Prop 2
    (v_pm_id, v_r2a, v_t5,  '2026-03-05', 1100, 1100, '2026-03-05 08:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r2b, v_t6,  '2026-03-05',  950,  950, '2026-03-10 14:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r2c, v_t7,  '2026-03-05',  750,  750, '2026-03-05 09:00:00+00', 'Standing order', 'paid'),
    -- Prop 3
    (v_pm_id, v_r3a, v_t8,  '2026-03-10', 1100, 1100, '2026-03-10 10:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r3b, v_t9,  '2026-03-10', 1050, 1050, '2026-03-12 11:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r3c, v_t10, '2026-03-10',  980,  980, '2026-03-18 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r3d, v_t11, '2026-03-10',  900,  900, '2026-03-10 07:00:00+00', 'Standing order', 'paid'),
    -- Prop 4
    (v_pm_id, v_r4a, v_t12, '2026-03-15', 1200, 1200, '2026-03-15 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r4b, v_t13, '2026-03-15', 1000, 1000, '2026-03-20 15:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r4c, v_t14, '2026-03-15', 1350, 1350, '2026-03-15 12:00:00+00', 'Bank transfer', 'paid');

  RAISE NOTICE 'March 2026: 14 entries — 13 paid, 1 partial (Daniel Mensah £500/£700)';

  -- ===== APRIL 2026 — Current month: mixed statuses =====
  INSERT INTO public.c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date,
    amount_due, amount_paid, paid_at, payment_method, status
  ) VALUES
    -- Prop 1 (due 1st — already past due)
    (v_pm_id, v_r1a, v_t1,  '2026-04-01',  750,  750, '2026-04-01 09:00:00+00', 'Bank transfer', 'paid'),
    (v_pm_id, v_r1b, v_t2,  '2026-04-01',  950,  950, '2026-04-01 08:30:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r1c, v_t3,  '2026-04-01',  900,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r1d, v_t4,  '2026-04-01',  700,    0, NULL, NULL, 'pending'),
    -- Prop 2 (due 5th — past due if today is April 3+)
    (v_pm_id, v_r2a, v_t5,  '2026-04-05', 1100, 1100, '2026-04-03 08:00:00+00', 'Standing order', 'paid'),
    (v_pm_id, v_r2b, v_t6,  '2026-04-05',  950,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r2c, v_t7,  '2026-04-05',  750,  400, '2026-04-03 15:00:00+00', 'Cash', 'partial'),
    -- Prop 3 (due 10th — still upcoming)
    (v_pm_id, v_r3a, v_t8,  '2026-04-10', 1100,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r3b, v_t9,  '2026-04-10', 1050,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r3c, v_t10, '2026-04-10',  980,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r3d, v_t11, '2026-04-10',  900,    0, NULL, NULL, 'pending'),
    -- Prop 4 (due 15th — still upcoming)
    (v_pm_id, v_r4a, v_t12, '2026-04-15', 1200,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r4b, v_t13, '2026-04-15', 1000,    0, NULL, NULL, 'pending'),
    (v_pm_id, v_r4c, v_t14, '2026-04-15', 1350,    0, NULL, NULL, 'pending');

  RAISE NOTICE 'April 2026: 14 entries — 3 paid, 1 partial, 10 pending';
  RAISE NOTICE '';
  RAISE NOTICE '=== SEED COMPLETE ===';
  RAISE NOTICE '4 properties, 16 rooms (13 occupied, 3 vacant)';
  RAISE NOTICE '14 tenants, 2 landlords, 3 contractors';
  RAISE NOTICE '42 rent ledger entries across Feb/Mar/Apr 2026';
  RAISE NOTICE 'Compliance: mixed statuses across all properties';

END $$;
