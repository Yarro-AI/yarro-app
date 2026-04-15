-- ═══════════════════════════════════════════════════════════════
-- Demo Approval Flow
-- ═══════════════════════════════════════════════════════════════
-- Separate table for interactive demo approval signals.
-- During onboarding simulation, the WhatsApp chat pauses at the
-- "getting a quote" stage. An SMS with a tap-to-approve link is
-- sent to the PM's phone. This table stores the token + approval
-- state, with Realtime enabled so the frontend resumes instantly.

-- 1. Table
CREATE TABLE IF NOT EXISTS public.demo_approvals (
  pm_id   uuid PRIMARY KEY REFERENCES c1_property_managers(id) ON DELETE CASCADE,
  token   text NOT NULL DEFAULT gen_random_uuid()::text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. RLS — PM can only see/update their own approval row
ALTER TABLE demo_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pm_own_approval_select" ON demo_approvals
  FOR SELECT USING (
    pm_id IN (SELECT id FROM c1_property_managers WHERE user_id = auth.uid())
  );

CREATE POLICY "pm_own_approval_update" ON demo_approvals
  FOR UPDATE USING (
    pm_id IN (SELECT id FROM c1_property_managers WHERE user_id = auth.uid())
  );

-- 3. Realtime — instant frontend notification when approved flips
ALTER PUBLICATION supabase_realtime ADD TABLE demo_approvals;

-- 4. Update wipe function to clean up demo_approvals
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

  -- Clean up approval signal
  DELETE FROM demo_approvals WHERE pm_id = p_pm_id;

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
