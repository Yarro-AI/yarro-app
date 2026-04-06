-- ============================================================
-- Regression Test Seed Data — Phase 3
-- PM: Adam Ekubia (aj.ekubia@gmail.com)
--
-- WARNING: NOT idempotent. Run on a clean account only.
-- To re-run: delete all data for this PM first.
-- ============================================================

-- PM ID (from fresh account signup)
DO $$
DECLARE
  pm_id uuid := 'f864c8b7-3f66-4e47-9e51-875e18693c81';

  -- Property IDs (deterministic for easy reference)
  prop_hmo uuid := 'aaaa0001-0001-0001-0001-000000000001';
  prop_demo uuid := 'aaaa0001-0001-0001-0001-000000000002';

  -- Landlord ID
  landlord_larry uuid := 'bbbb0001-0001-0001-0001-000000000001';

  -- Contractor IDs
  con_pete uuid := 'cccc0001-0001-0001-0001-000000000001';
  con_sam  uuid := 'cccc0001-0001-0001-0001-000000000002';

  -- Room IDs
  room_h1 uuid := 'dddd0001-0001-0001-0001-000000000001';
  room_h2 uuid := 'dddd0001-0001-0001-0001-000000000002';
  room_h3 uuid := 'dddd0001-0001-0001-0001-000000000003';
  room_d1 uuid := 'dddd0001-0001-0001-0001-000000000004';
  room_d2 uuid := 'dddd0001-0001-0001-0001-000000000005';

  -- Tenant IDs
  ten_alpha uuid := 'eeee0001-0001-0001-0001-000000000001';
  ten_beta  uuid := 'eeee0001-0001-0001-0001-000000000002';
  ten_gamma uuid := 'eeee0001-0001-0001-0001-000000000003';

BEGIN

  -- ============================================================
  -- 1. LANDLORD
  -- ============================================================
  INSERT INTO c1_landlords (id, property_manager_id, full_name, phone, email, contact_method)
  VALUES (
    landlord_larry, pm_id,
    'Test Landlord Larry',
    '447513381904',
    'adamjamesestates@gmail.com',
    'whatsapp'
  );

  -- ============================================================
  -- 2. PROPERTIES
  -- ============================================================
  INSERT INTO c1_properties (id, property_manager_id, address, city, property_type, auto_approve_limit, landlord_id, require_landlord_approval)
  VALUES
    (prop_hmo, pm_id, '10 Test Street, London SW1A 1AA', 'London', 'hmo', 200, landlord_larry, true),
    (prop_demo, pm_id, '25 Demo Road, Manchester M1 1AA', 'Manchester', 'hmo', 150, landlord_larry, false);

  -- ============================================================
  -- 3. CONTRACTORS
  -- ============================================================
  -- Pete: WhatsApp, Plumbing + General
  INSERT INTO c1_contractors (id, property_manager_id, contractor_name, contractor_phone, contractor_email, category, categories, contact_method, active, property_ids)
  VALUES (
    con_pete, pm_id,
    'Test Plumber Pete',
    '447447146935',
    'adam@yarro.ai',
    'Plumbing',
    ARRAY['Plumbing', 'General'],
    'whatsapp',
    true,
    ARRAY[prop_hmo, prop_demo]
  );

  -- Sam: Email, Electrical + Fire Safety
  INSERT INTO c1_contractors (id, property_manager_id, contractor_name, contractor_phone, contractor_email, category, categories, contact_method, active, property_ids)
  VALUES (
    con_sam, pm_id,
    'Test Sparky Sam',
    '447513381904',
    'adamjamesestates@gmail.com',
    'Electrical',
    ARRAY['Electrical', 'Fire Safety'],
    'email',
    true,
    ARRAY[prop_hmo, prop_demo]
  );

  -- ============================================================
  -- 4. TENANTS
  -- ============================================================
  -- Alpha: WhatsApp tenant at HMO-Test Room 1
  INSERT INTO c1_tenants (id, property_manager_id, full_name, phone, email, property_id, role_tag)
  VALUES (
    ten_alpha, pm_id,
    'Test Tenant Alpha',
    '447447146935',
    'aj.ekubia@gmail.com',
    prop_hmo,
    'tenant'
  );

  -- Beta: WhatsApp tenant at HMO-Test Room 2
  INSERT INTO c1_tenants (id, property_manager_id, full_name, phone, email, property_id, role_tag)
  VALUES (
    ten_beta, pm_id,
    'Test Tenant Beta',
    '447513381904',
    'adamjamesestates@gmail.com',
    prop_hmo,
    'tenant'
  );

  -- Gamma: Email tenant at Demo-2 Room 1
  INSERT INTO c1_tenants (id, property_manager_id, full_name, phone, email, property_id, role_tag)
  VALUES (
    ten_gamma, pm_id,
    'Test Tenant Gamma',
    '447513381904',
    'adam@yarro.ai',
    prop_demo,
    'tenant'
  );

  -- ============================================================
  -- 5. ROOMS (with tenant assignments)
  -- ============================================================
  -- HMO-Test: 3 rooms
  INSERT INTO c1_rooms (id, property_manager_id, property_id, room_number, room_name, monthly_rent, rent_due_day, current_tenant_id, tenancy_start_date, tenancy_status)
  VALUES
    (room_h1, pm_id, prop_hmo, '1', 'Front Room',   750.00,  1, ten_alpha, '2026-01-01', 'active'),
    (room_h2, pm_id, prop_hmo, '2', 'Middle Room',  950.00,  1, ten_beta,  '2026-02-01', 'active'),
    (room_h3, pm_id, prop_hmo, '3', 'Back Room',    800.00,  1, NULL,      NULL,         'inactive');

  -- Demo-2: 2 rooms
  INSERT INTO c1_rooms (id, property_manager_id, property_id, room_number, room_name, monthly_rent, rent_due_day, current_tenant_id, tenancy_start_date, tenancy_status)
  VALUES
    (room_d1, pm_id, prop_demo, '1', 'Main Room',   1000.00, 1, ten_gamma, '2026-03-01', 'active'),
    (room_d2, pm_id, prop_demo, '2', 'Second Room',  850.00, 1, NULL,      NULL,         'inactive');

  -- Set room_id back on tenants (bidirectional FK)
  UPDATE c1_tenants SET room_id = room_h1 WHERE id = ten_alpha;
  UPDATE c1_tenants SET room_id = room_h2 WHERE id = ten_beta;
  UPDATE c1_tenants SET room_id = room_d1 WHERE id = ten_gamma;

  -- ============================================================
  -- 6. COMPLIANCE CERTIFICATES
  -- ============================================================
  -- HMO-Test: expired, expiring, valid, 2x missing
  INSERT INTO c1_compliance_certificates (property_id, property_manager_id, certificate_type, expiry_date, issued_date, issued_by, status, notes)
  VALUES
    (prop_hmo, pm_id, 'gas_safety',    '2026-02-15', '2025-02-15', 'Gas Safe Engineer',  'expired',  'TEST: Expired gas cert'),
    (prop_hmo, pm_id, 'epc',           '2026-05-01', '2016-05-01', 'Energy Assessor',    'valid',    'TEST: Expiring in ~29 days'),
    (prop_hmo, pm_id, 'hmo_license',   '2026-12-01', '2021-12-01', 'Local Authority',    'valid',    'TEST: Valid HMO license');
  -- EICR and Fire Risk Assessment intentionally NOT inserted = "missing"

  -- Demo-2: valid + expiring
  INSERT INTO c1_compliance_certificates (property_id, property_manager_id, certificate_type, expiry_date, issued_date, issued_by, status, notes)
  VALUES
    (prop_demo, pm_id, 'gas_safety', '2027-01-15', '2026-01-15', 'Gas Safe Engineer', 'valid',   'TEST: Valid gas cert'),
    (prop_demo, pm_id, 'eicr',      '2026-04-20', '2021-04-20', 'Electrician',       'valid',   'TEST: Expiring in ~18 days');

  -- ============================================================
  -- 7. RENT LEDGER — April 2026 entries for occupied rooms
  -- ============================================================
  INSERT INTO c1_rent_ledger (property_manager_id, room_id, tenant_id, due_date, amount_due, status)
  VALUES
    (pm_id, room_h1, ten_alpha, '2026-04-01', 750.00,  'pending'),
    (pm_id, room_h2, ten_beta,  '2026-04-01', 950.00,  'pending'),
    (pm_id, room_d1, ten_gamma, '2026-04-01', 1000.00, 'pending');

  -- ============================================================
  -- SUMMARY
  -- ============================================================
  -- Properties:   2 (HMO-Test, Demo-2)
  -- Landlords:    1 (Test Landlord Larry — WhatsApp — both properties)
  -- Contractors:  2 (Pete=WhatsApp/Plumbing, Sam=Email/Electrical)
  -- Tenants:      3 (Alpha=WhatsApp, Beta=WhatsApp, Gamma=Email)
  -- Rooms:        5 (3 occupied, 2 vacant)
  -- Compliance:   5 certs (1 expired, 2 expiring, 2 valid, 2 missing)
  -- Rent ledger:  3 entries (April 2026, all pending)
  --
  -- Phone map:
  --   07447146935 → PM Adam, Tenant Alpha, Contractor Pete
  --   07513381904 → Landlord Larry, Tenant Beta, Tenant Gamma, Contractor Sam
  --
  -- Email map:
  --   aj.ekubia@gmail.com         → PM Adam, Tenant Alpha
  --   adamjamesestates@gmail.com  → Landlord Larry, Tenant Beta, Contractor Sam
  --   adam@yarro.ai               → Tenant Gamma, Contractor Pete

END;
$$;
