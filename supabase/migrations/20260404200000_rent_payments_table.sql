-- ============================================================
-- Rent Payments — audit trail for every payment received
-- ============================================================
-- Replaces single amount_paid column as source of truth.
-- Trigger auto-computes ledger totals on each payment insert.

-- 1. Create c1_rent_payments table
CREATE TABLE public.c1_rent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_ledger_id uuid NOT NULL REFERENCES public.c1_rent_ledger(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.c1_tenants(id),
  property_manager_id uuid NOT NULL REFERENCES public.c1_property_managers(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rent_payments_ledger ON public.c1_rent_payments(rent_ledger_id);
CREATE INDEX idx_rent_payments_tenant ON public.c1_rent_payments(tenant_id);

-- 2. Trigger: auto-compute ledger totals on payment insert
CREATE OR REPLACE FUNCTION public.trg_rent_payment_update_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid numeric;
  v_amount_due numeric;
  v_new_status text;
BEGIN
  -- Sum all payments for this ledger entry
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM c1_rent_payments WHERE rent_ledger_id = NEW.rent_ledger_id;

  SELECT amount_due INTO v_amount_due
  FROM c1_rent_ledger WHERE id = NEW.rent_ledger_id;

  -- Determine status
  IF v_total_paid >= v_amount_due THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'overdue';
  END IF;

  -- Update ledger entry
  UPDATE c1_rent_ledger
  SET amount_paid = v_total_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      status = v_new_status
  WHERE id = NEW.rent_ledger_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rent_payments_update
  AFTER INSERT ON public.c1_rent_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_rent_payment_update_ledger();

-- 3. record_rent_payment RPC (replaces mark_rent_paid)
CREATE OR REPLACE FUNCTION public.record_rent_payment(
  p_rent_ledger_id uuid,
  p_pm_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    SET status = 'closed', resolved_at = now()
    WHERE tenant_id = v_tenant_id
      AND category = 'rent_arrears'
      AND status = 'open';
  END IF;

  RETURN v_payment_id;
END;
$$;

-- 4. RLS
ALTER TABLE public.c1_rent_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rent_payments_select"
  ON public.c1_rent_payments AS permissive FOR SELECT TO authenticated
  USING ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rent_payments_insert"
  ON public.c1_rent_payments AS permissive FOR INSERT TO authenticated
  WITH CHECK ((property_manager_id = public.get_pm_id()));

-- 5. Grants
GRANT SELECT, INSERT ON TABLE public.c1_rent_payments TO authenticated;
GRANT SELECT, INSERT ON TABLE public.c1_rent_payments TO service_role;
