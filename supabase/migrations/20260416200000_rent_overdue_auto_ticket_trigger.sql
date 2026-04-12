-- Instant rent ticket creation: when c1_rent_ledger.status changes to 'overdue',
-- automatically create a dashboard ticket via create_rent_arrears_ticket().
--
-- Previously tickets only appeared after the daily cron ran. This trigger
-- ensures the dashboard reflects overdue rent immediately.
--
-- Relies on:
--   - create_rent_arrears_ticket() — handles dedup (1 ticket per tenant), audit events
--   - trg_tickets_recompute_next_action — auto-fires on ticket INSERT to compute bucket/reason
--   - compute_rent_arrears_next_action — sub-routine that returns rent_overdue/rent_partial_payment/rent_cleared

-- ─── Trigger function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_rent_ledger_overdue_ticket()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tenant c1_tenants%rowtype;
  v_room c1_rooms%rowtype;
  v_days_overdue integer;
  v_title text;
  v_description text;
BEGIN
  -- Only fire when status changes TO 'overdue' (not FROM 'overdue')
  IF NEW.status != 'overdue' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'overdue' THEN
    RETURN NEW;  -- already overdue, no change
  END IF;

  -- Gather context
  SELECT * INTO v_tenant FROM c1_tenants WHERE id = NEW.tenant_id;
  SELECT * INTO v_room FROM c1_rooms WHERE id = NEW.room_id;

  v_days_overdue := (CURRENT_DATE - NEW.due_date);

  v_title := 'Rent arrears: ' || COALESCE(v_tenant.full_name, 'Unknown tenant');
  v_description := format(
    '£%s overdue since %s (%s days). Room %s.',
    NEW.amount_due::text,
    to_char(NEW.due_date, 'DD Mon YYYY'),
    v_days_overdue::text,
    COALESCE(v_room.room_number, '?')
  );

  -- create_rent_arrears_ticket handles dedup — safe to call multiple times
  PERFORM create_rent_arrears_ticket(
    p_property_manager_id := NEW.property_manager_id,
    p_property_id := v_room.property_id,
    p_tenant_id := NEW.tenant_id,
    p_issue_title := v_title,
    p_issue_description := v_description,
    p_deadline_date := NEW.due_date
  );

  RETURN NEW;
END;
$function$;

-- ─── Trigger ─────────────────────────────────────────────────────────────

CREATE TRIGGER trg_rent_ledger_overdue_ticket
  AFTER INSERT OR UPDATE OF status
  ON public.c1_rent_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_rent_ledger_overdue_ticket();
