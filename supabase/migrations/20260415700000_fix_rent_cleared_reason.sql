-- Fix BUG-18: When rent is fully paid, ticket closes with next_action_reason = 'rent_overdue'
-- instead of 'rent_cleared'. Add next_action + next_action_reason to the close UPDATE.

DROP FUNCTION IF EXISTS public.record_rent_payment(uuid, uuid, numeric, text, text);

CREATE OR REPLACE FUNCTION public.record_rent_payment(p_rent_ledger_id uuid, p_pm_id uuid, p_amount numeric, p_payment_method text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id uuid;
  v_payment_id uuid;
BEGIN
  -- Ownership check
  SELECT tenant_id INTO v_tenant_id
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or access denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  -- Insert payment (trigger handles ledger update + status)
  INSERT INTO c1_rent_payments (rent_ledger_id, tenant_id, property_manager_id, amount, payment_method, notes)
  VALUES (p_rent_ledger_id, v_tenant_id, p_pm_id, p_amount, p_payment_method, p_notes)
  RETURNING id INTO v_payment_id;

  -- Auto-close rent arrears ticket if ALL arrears for this tenant are now cleared
  IF NOT EXISTS (
    SELECT 1 FROM c1_rent_ledger
    WHERE tenant_id = v_tenant_id
      AND status IN ('overdue', 'partial')
  ) THEN
    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = now(),
        next_action = 'completed',
        next_action_reason = 'rent_cleared'
    WHERE tenant_id = v_tenant_id
      AND category = 'rent_arrears'
      AND status = 'open';
  END IF;

  RETURN v_payment_id;
END;
$function$;
