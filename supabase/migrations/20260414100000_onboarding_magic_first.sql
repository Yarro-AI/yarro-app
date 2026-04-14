-- ============================================================
-- Magic-First Onboarding: new columns + fix demo seed
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. Add onboarding columns to c1_property_managers
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE c1_property_managers
  ADD COLUMN IF NOT EXISTS onboarding_segment text,
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'account';

COMMENT ON COLUMN c1_property_managers.onboarding_segment IS 'Pain-point choice: maintenance / rent / compliance';
COMMENT ON COLUMN c1_property_managers.onboarding_step IS 'Onboarding progress SSOT: account → segment → simulation → complete';


-- ═══════════════════════════════════════════════════════════════
-- 2. Fix onboarding_seed_demo — create OPEN ticket (not closed)
-- ═══════════════════════════════════════════════════════════════
-- The dashboard RPC c1_get_dashboard_todo only shows open tickets
-- with next_action set. A closed demo ticket produces an empty
-- dashboard, defeating the "pre-populated" promise.

CREATE OR REPLACE FUNCTION public.onboarding_seed_demo(
  p_pm_id uuid,
  p_issue_title text DEFAULT 'Boiler not heating',
  p_issue_description text DEFAULT 'No hot water since this morning. Tenant reports no heating either.',
  p_category text DEFAULT 'Plumbing',
  p_priority text DEFAULT 'Urgent'
)
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
  -- Verify PM exists
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id
  ) THEN
    RAISE EXCEPTION 'PM not found';
  END IF;

  -- Skip if demo data already exists (idempotent)
  IF EXISTS (
    SELECT 1 FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true
  ) THEN
    RETURN json_build_object('seeded', false, 'reason', 'demo data already exists');
  END IF;

  -- Create demo property
  INSERT INTO c1_properties (address, city, property_manager_id, property_type, is_demo)
  VALUES ('123 Demo Street, London SW1A 1AA', 'London', p_pm_id, 'hmo', true)
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
  VALUES ('Jane Doe', '447700200001', 'jane.doe@example.com', v_property.id, p_pm_id, v_room1.id, true)
  RETURNING * INTO v_tenant1;

  INSERT INTO c1_tenants (full_name, phone, email, property_id, property_manager_id, room_id, is_demo)
  VALUES ('John Smith', '447700200002', 'john.smith@example.com', v_property.id, p_pm_id, v_room2.id, true)
  RETURNING * INTO v_tenant2;

  -- Assign tenants to rooms
  UPDATE c1_rooms SET current_tenant_id = v_tenant1.id, tenancy_start_date = CURRENT_DATE - interval '3 months' WHERE id = v_room1.id;
  UPDATE c1_rooms SET current_tenant_id = v_tenant2.id, tenancy_start_date = CURRENT_DATE - interval '2 months' WHERE id = v_room2.id;

  -- Create demo contractor
  INSERT INTO c1_contractors (contractor_name, contractor_phone, contractor_email, contact_method, category, property_manager_id, is_demo)
  VALUES ('Demo Repairs Ltd', '447700300001', 'mike@plumbing.example.com', 'whatsapp', 'Plumbing', p_pm_id, true)
  RETURNING * INTO v_contractor;

  -- Create demo conversation (pre-built log)
  INSERT INTO c1_conversations (
    phone, status, property_manager_id, property_id, tenant_id, stage, handoff,
    caller_name, caller_role, tenant_confirmed,
    log
  ) VALUES (
    '447700200001', 'closed', p_pm_id, v_property.id, v_tenant1.id, 'final_summary', false,
    'Jane Doe', 'tenant', true,
    jsonb_build_array(
      jsonb_build_object('direction', 'inbound', 'message', 'Hi, I need to report an issue — ' || p_issue_description, 'timestamp', (now() - interval '2 hours')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Sorry to hear that. Can you tell me more about the problem?', 'timestamp', (now() - interval '1 hour 58 minutes')::text),
      jsonb_build_object('direction', 'inbound', 'message', p_issue_description, 'timestamp', (now() - interval '1 hour 55 minutes')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Can you send a photo?', 'timestamp', (now() - interval '1 hour 53 minutes')::text),
      jsonb_build_object('direction', 'inbound', 'message', '[Photo attached]', 'timestamp', (now() - interval '1 hour 50 minutes')::text),
      jsonb_build_object('direction', 'outbound', 'message', 'Thanks — I''ve created a ' || p_category || ' ticket and I''m finding a contractor for you now.', 'timestamp', (now() - interval '1 hour 48 minutes')::text)
    )
  ) RETURNING * INTO v_convo;

  -- Create demo ticket as OPEN with proper state fields
  -- This makes it appear in c1_get_dashboard_todo as a real actionable item
  INSERT INTO c1_tickets (
    conversation_id, property_id, property_manager_id, tenant_id, room_id,
    issue_description, issue_title, category, maintenance_trade, priority,
    status, next_action, next_action_reason,
    sla_due_at, waiting_since,
    date_logged, access, reporter_role, handoff, is_demo,
    images
  ) VALUES (
    v_convo.id, v_property.id, p_pm_id, v_tenant1.id, v_room1.id,
    p_issue_description,
    p_issue_title || ' — Room 1',
    'maintenance', p_category, p_priority,
    'open', 'needs_action', 'new',
    now() + interval '2 hours', now(),
    now(), 'IMMEDIATE', 'tenant', false, true,
    '[]'::jsonb
  ) RETURNING * INTO v_ticket;

  -- Mark onboarding step as segment (account is done, awaiting pain-point pick)
  UPDATE c1_property_managers
  SET onboarding_step = 'segment'
  WHERE id = p_pm_id;

  RETURN json_build_object(
    'seeded', true,
    'property_id', v_property.id,
    'ticket_id', v_ticket.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_seed_demo TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- 3. Wipe demo data — clean break before real onboarding
-- ═══════════════════════════════════════════════════════════════
-- Called when user finishes the simulation and clicks "Let's make it real".
-- Deletes all is_demo=true rows in FK-safe order so the user starts
-- real onboarding with a completely clean slate.

CREATE OR REPLACE FUNCTION public.onboarding_wipe_demo(p_pm_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM c1_property_managers WHERE id = p_pm_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Delete in FK-safe order (leaf tables first)
  DELETE FROM c1_events WHERE ticket_id IN (
    SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true);

  DELETE FROM c1_outbound_log WHERE ticket_id IN (
    SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true);

  DELETE FROM c1_messages WHERE ticket_id IN (
    SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true);

  DELETE FROM c1_tickets WHERE property_manager_id = p_pm_id AND is_demo = true;

  DELETE FROM c1_conversations WHERE property_manager_id = p_pm_id
    AND tenant_id IN (
      SELECT id FROM c1_tenants WHERE property_manager_id = p_pm_id AND is_demo = true);

  DELETE FROM c1_rent_ledger WHERE room_id IN (
    SELECT id FROM c1_rooms WHERE property_id IN (
      SELECT id FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true));

  -- Unlink demo tenants from rooms before deleting rooms (avoids trigger on is_vacant)
  UPDATE c1_tenants SET room_id = NULL
    WHERE property_manager_id = p_pm_id AND is_demo = true;

  DELETE FROM c1_rooms WHERE property_id IN (
    SELECT id FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true);

  DELETE FROM c1_tenants WHERE property_manager_id = p_pm_id AND is_demo = true;
  DELETE FROM c1_contractors WHERE property_manager_id = p_pm_id AND is_demo = true;
  DELETE FROM c1_properties WHERE property_manager_id = p_pm_id AND is_demo = true;

  -- Mark onboarding as complete
  UPDATE c1_property_managers
  SET onboarding_step = 'complete'
  WHERE id = p_pm_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.onboarding_wipe_demo TO authenticated;
