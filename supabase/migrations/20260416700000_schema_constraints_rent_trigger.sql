-- Migration B: Schema Constraints + Rent Config Trigger
--
-- 1. Add CHECK constraint on c1_messages.stage — no more unconstrained free text.
-- 2. Add trigger on c1_rooms AFTER UPDATE OF monthly_rent, rent_due_day —
--    auto-creates ledger entry when rent is configured on an occupied room.
--    Covers the gap where rent is set AFTER tenant assignment.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CHECK constraint on c1_messages.stage
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE c1_messages ADD CONSTRAINT chk_message_stage
CHECK (stage IS NULL OR stage IN (
  'sent',
  'waiting_contractor',
  'contractor_notified',
  'awaiting_manager',
  'awaiting_landlord',
  'landlord_skipped',
  'no_contractors_left',
  'scheduled',
  'closed'
));


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Trigger: auto-create ledger entry when rent configured on occupied room
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_room_rent_configured()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_due_date date;
  v_status text;
  v_property_label text;
BEGIN
  -- Guard: room must be occupied
  IF NEW.current_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard: rent must now be configured (both monthly_rent and rent_due_day set)
  IF NEW.monthly_rent IS NULL OR NEW.rent_due_day IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard: something actually changed
  IF OLD.monthly_rent IS NOT DISTINCT FROM NEW.monthly_rent
     AND OLD.rent_due_day IS NOT DISTINCT FROM NEW.rent_due_day THEN
    RETURN NEW;
  END IF;

  -- Calculate due date for current month
  v_due_date := make_date(
    EXTRACT(YEAR FROM CURRENT_DATE)::integer,
    EXTRACT(MONTH FROM CURRENT_DATE)::integer,
    COALESCE(NEW.rent_due_day, 1)
  );

  v_status := CASE WHEN v_due_date < CURRENT_DATE THEN 'overdue' ELSE 'pending' END;

  -- Insert ledger entry (idempotent)
  INSERT INTO c1_rent_ledger (
    property_manager_id, room_id, tenant_id, due_date, amount_due, status
  ) VALUES (
    NEW.property_manager_id, NEW.id, NEW.current_tenant_id,
    v_due_date, NEW.monthly_rent, v_status
  )
  ON CONFLICT (room_id, tenant_id, due_date) DO NOTHING;

  -- Audit event
  SELECT address INTO v_property_label FROM c1_properties WHERE id = NEW.property_id;

  PERFORM c1_log_system_event(
    NEW.property_manager_id,
    'RENT_LEDGER_AUTO_CREATED',
    v_property_label,
    jsonb_build_object(
      'room_id', NEW.id,
      'room_number', NEW.room_number,
      'tenant_id', NEW.current_tenant_id,
      'due_date', v_due_date,
      'amount_due', NEW.monthly_rent,
      'trigger', 'rent_configured'
    )
  );

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_room_rent_configured
  AFTER UPDATE OF monthly_rent, rent_due_day
  ON public.c1_rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_room_rent_configured();
