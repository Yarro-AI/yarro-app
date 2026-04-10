-- Sprint D, Part 4: Drop c1_ledger
-- c1_events is now the sole audit trail source.
-- Order: triggers → trigger functions → table

-- 1. Drop triggers that write to c1_ledger on ticket changes
DROP TRIGGER IF EXISTS trg_c1_ledger_insert ON c1_tickets;
DROP TRIGGER IF EXISTS trg_c1_ledger_update ON c1_tickets;

-- 2. Drop trigger functions
DROP FUNCTION IF EXISTS c1_ledger_on_ticket_insert();
DROP FUNCTION IF EXISTS c1_ledger_on_ticket_update();

-- 3. Drop the table
DROP TABLE IF EXISTS c1_ledger;

-- 4. Clean up c1_reset_account — remove c1_ledger deletion line
-- Original function deletes from c1_ledger; after drop this would error.
CREATE OR REPLACE FUNCTION public.c1_reset_account(p_pm_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tickets int; v_properties int; v_contractors int;
BEGIN
  SELECT count(*) INTO v_tickets FROM c1_tickets WHERE property_manager_id = p_pm_id;
  SELECT count(*) INTO v_properties FROM c1_properties WHERE property_manager_id = p_pm_id;
  SELECT count(*) INTO v_contractors FROM c1_contractors WHERE property_manager_id = p_pm_id;

  DELETE FROM c1_job_completions WHERE id IN (SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id);
  DELETE FROM c1_outbound_log WHERE ticket_id IN (SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id);
  DELETE FROM c1_events WHERE portfolio_id = p_pm_id;
  DELETE FROM c1_messages WHERE ticket_id IN (SELECT id FROM c1_tickets WHERE property_manager_id = p_pm_id);
  -- c1_ledger line removed: table dropped above
  DELETE FROM c1_tickets WHERE property_manager_id = p_pm_id;
  DELETE FROM c1_conversations WHERE property_manager_id = p_pm_id;
  DELETE FROM c1_tenants WHERE property_id IN (SELECT id FROM c1_properties WHERE property_manager_id = p_pm_id);
  DELETE FROM c1_contractors WHERE property_manager_id = p_pm_id;
  DELETE FROM c1_properties WHERE property_manager_id = p_pm_id;
  DELETE FROM c1_landlords WHERE property_manager_id = p_pm_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', jsonb_build_object(
      'tickets', v_tickets,
      'properties', v_properties,
      'contractors', v_contractors
    )
  );
END;
$function$;
