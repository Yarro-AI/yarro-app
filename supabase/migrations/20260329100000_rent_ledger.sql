-- ============================================================
-- Rent Ledger — c1_rent_ledger table
-- ============================================================
-- One row per expected rent payment per room per period.
-- Tracks whether it was paid, how much, and when.
-- Generated monthly via create_rent_ledger_entries RPC.

-- 1. Create c1_rent_ledger table
CREATE TABLE public.c1_rent_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_manager_id uuid NOT NULL REFERENCES public.c1_property_managers(id),
  room_id uuid NOT NULL REFERENCES public.c1_rooms(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.c1_tenants(id),
  due_date date NOT NULL,
  amount_due numeric(10,2) NOT NULL,
  amount_paid numeric(10,2) DEFAULT 0,
  paid_at timestamptz,
  payment_method text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  reminder_1_sent_at timestamptz,
  reminder_2_sent_at timestamptz,
  reminder_3_sent_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Unique constraint: one ledger entry per room per due date
ALTER TABLE public.c1_rent_ledger
  ADD CONSTRAINT c1_rent_ledger_room_due_date_unique UNIQUE (room_id, due_date);

-- 3. Indexes for common query patterns
CREATE INDEX idx_c1_rent_ledger_pm_status_due
  ON public.c1_rent_ledger(property_manager_id, status, due_date);
CREATE INDEX idx_c1_rent_ledger_tenant
  ON public.c1_rent_ledger(tenant_id);

-- 4. Auto-update updated_at on row change (reuses existing trigger function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.c1_rent_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Row Level Security
ALTER TABLE public.c1_rent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rent_ledger_select"
  ON public.c1_rent_ledger
  AS permissive
  FOR SELECT
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rent_ledger_insert"
  ON public.c1_rent_ledger
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rent_ledger_update"
  ON public.c1_rent_ledger
  AS permissive
  FOR UPDATE
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()))
  WITH CHECK ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rent_ledger_delete"
  ON public.c1_rent_ledger
  AS permissive
  FOR DELETE
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()));

-- 6. Grants — matches pattern from c1_rooms
GRANT delete ON TABLE public.c1_rent_ledger TO anon;
GRANT insert ON TABLE public.c1_rent_ledger TO anon;
GRANT references ON TABLE public.c1_rent_ledger TO anon;
GRANT select ON TABLE public.c1_rent_ledger TO anon;
GRANT trigger ON TABLE public.c1_rent_ledger TO anon;
GRANT truncate ON TABLE public.c1_rent_ledger TO anon;
GRANT update ON TABLE public.c1_rent_ledger TO anon;

GRANT delete ON TABLE public.c1_rent_ledger TO authenticated;
GRANT insert ON TABLE public.c1_rent_ledger TO authenticated;
GRANT references ON TABLE public.c1_rent_ledger TO authenticated;
GRANT select ON TABLE public.c1_rent_ledger TO authenticated;
GRANT trigger ON TABLE public.c1_rent_ledger TO authenticated;
GRANT truncate ON TABLE public.c1_rent_ledger TO authenticated;
GRANT update ON TABLE public.c1_rent_ledger TO authenticated;

GRANT delete ON TABLE public.c1_rent_ledger TO service_role;
GRANT insert ON TABLE public.c1_rent_ledger TO service_role;
GRANT references ON TABLE public.c1_rent_ledger TO service_role;
GRANT select ON TABLE public.c1_rent_ledger TO service_role;
GRANT trigger ON TABLE public.c1_rent_ledger TO service_role;
GRANT truncate ON TABLE public.c1_rent_ledger TO service_role;
GRANT update ON TABLE public.c1_rent_ledger TO service_role;
