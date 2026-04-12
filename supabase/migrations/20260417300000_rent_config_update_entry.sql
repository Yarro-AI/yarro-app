-- Fix: When room rent amount or due day changes mid-month, the existing
-- ledger entry keeps the old values. ON CONFLICT DO NOTHING silently skips.
--
-- Fix: Change to ON CONFLICT DO UPDATE for unpaid entries. Paid/partial entries
-- are historical and should not be modified.

-- Update trg_room_rent_configured to use UPSERT instead of silent skip
CREATE OR REPLACE FUNCTION public.trg_room_rent_configured()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_property_label text;
BEGIN
  IF NEW.current_tenant_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.monthly_rent IS NULL OR NEW.rent_due_day IS NULL THEN RETURN NEW; END IF;
  IF OLD.monthly_rent IS NOT DISTINCT FROM NEW.monthly_rent
     AND OLD.rent_due_day IS NOT DISTINCT FROM NEW.rent_due_day THEN
    RETURN NEW;
  END IF;

  v_due_date := compute_rent_due_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    NEW.rent_due_day
  );

  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  -- UPSERT: create entry or update existing unpaid entry with new rent config.
  -- Paid/partial entries are untouched (they represent real payment history).
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO UPDATE SET
    amount_due = EXCLUDED.amount_due,
    status = CASE
      WHEN c1_rent_ledger.status IN ('paid', 'partial') THEN c1_rent_ledger.status
      ELSE EXCLUDED.status
    END
  WHERE c1_rent_ledger.status IN ('pending', 'overdue');

  -- Void stale entries from old rent config (e.g., due day changed from 1 to 15)
  PERFORM void_stale_rent_entries_for_room(NEW.id, NEW.current_tenant_id, v_due_date);

  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id, 'RENT_CONFIG_UPDATED', v_property_label,
    jsonb_build_object('room_id', NEW.id, 'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id, 'due_date', v_due_date,
      'new_amount', NEW.monthly_rent, 'old_amount', OLD.monthly_rent,
      'new_due_day', NEW.rent_due_day, 'old_due_day', OLD.rent_due_day)
  );

  RETURN NEW;
END;
$function$;


-- Handle due day changes: when due day changes from 1 to 15, a new entry is created
-- at the 15th. The old entry at the 1st needs to be voided so it doesn't show as a
-- second obligation. We mark it 'cancelled' (not deleted — data preservation).

CREATE OR REPLACE FUNCTION public.void_stale_rent_entries_for_room(
  p_room_id uuid,
  p_tenant_id uuid,
  p_current_due_date date
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Cancel any unpaid entries for this room+tenant in the same month
  -- that DON'T match the current due date (stale from old rent config)
  UPDATE c1_rent_ledger
  SET status = 'cancelled'
  WHERE room_id = p_room_id
    AND tenant_id = p_tenant_id
    AND due_date != p_current_due_date
    AND due_date >= date_trunc('month', p_current_due_date)::date
    AND due_date < (date_trunc('month', p_current_due_date) + interval '1 month')::date
    AND status IN ('pending', 'overdue');
END;
$$;
