-- ============================================================
-- Room Layer — c1_rooms table + schema changes to tenants/tickets
-- ============================================================
-- HMO properties have multiple rooms, each with at most one tenant.
-- This migration creates the rooms table and adds room_id FKs to
-- existing tables for backwards-compatible room awareness.

-- 1. Create c1_rooms table
CREATE TABLE public.c1_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_manager_id uuid NOT NULL REFERENCES public.c1_property_managers(id),
  property_id uuid NOT NULL REFERENCES public.c1_properties(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  room_name text,
  floor text,
  current_tenant_id uuid REFERENCES public.c1_tenants(id) ON DELETE SET NULL,
  tenancy_start_date date,
  tenancy_end_date date,
  monthly_rent numeric(10,2),
  rent_due_day integer CHECK (rent_due_day >= 1 AND rent_due_day <= 28),
  rent_frequency text NOT NULL DEFAULT 'monthly' CHECK (rent_frequency IN ('monthly', 'weekly')),
  is_vacant boolean GENERATED ALWAYS AS (current_tenant_id IS NULL) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Unique constraint: no duplicate room numbers within a property
ALTER TABLE public.c1_rooms
  ADD CONSTRAINT c1_rooms_property_room_number_unique UNIQUE (property_id, room_number);

-- 3. Indexes for common query patterns
CREATE INDEX idx_c1_rooms_property_id ON public.c1_rooms(property_id);
CREATE INDEX idx_c1_rooms_current_tenant_id ON public.c1_rooms(current_tenant_id);
CREATE INDEX idx_c1_rooms_pm_vacant ON public.c1_rooms(property_manager_id, is_vacant);

-- 4. Auto-update updated_at on row change (reuses existing trigger function)
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.c1_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Row Level Security
ALTER TABLE public.c1_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rooms_select"
  ON public.c1_rooms
  AS permissive
  FOR SELECT
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rooms_insert"
  ON public.c1_rooms
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rooms_update"
  ON public.c1_rooms
  AS permissive
  FOR UPDATE
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()))
  WITH CHECK ((property_manager_id = public.get_pm_id()));

CREATE POLICY "rooms_delete"
  ON public.c1_rooms
  AS permissive
  FOR DELETE
  TO authenticated
  USING ((property_manager_id = public.get_pm_id()));

-- 6. Grants — matches pattern from c1_compliance_certificates
GRANT delete ON TABLE public.c1_rooms TO anon;
GRANT insert ON TABLE public.c1_rooms TO anon;
GRANT references ON TABLE public.c1_rooms TO anon;
GRANT select ON TABLE public.c1_rooms TO anon;
GRANT trigger ON TABLE public.c1_rooms TO anon;
GRANT truncate ON TABLE public.c1_rooms TO anon;
GRANT update ON TABLE public.c1_rooms TO anon;

GRANT delete ON TABLE public.c1_rooms TO authenticated;
GRANT insert ON TABLE public.c1_rooms TO authenticated;
GRANT references ON TABLE public.c1_rooms TO authenticated;
GRANT select ON TABLE public.c1_rooms TO authenticated;
GRANT trigger ON TABLE public.c1_rooms TO authenticated;
GRANT truncate ON TABLE public.c1_rooms TO authenticated;
GRANT update ON TABLE public.c1_rooms TO authenticated;

GRANT delete ON TABLE public.c1_rooms TO service_role;
GRANT insert ON TABLE public.c1_rooms TO service_role;
GRANT references ON TABLE public.c1_rooms TO service_role;
GRANT select ON TABLE public.c1_rooms TO service_role;
GRANT trigger ON TABLE public.c1_rooms TO service_role;
GRANT truncate ON TABLE public.c1_rooms TO service_role;
GRANT update ON TABLE public.c1_rooms TO service_role;

-- 7. Add room_id to c1_tenants (nullable — backwards compatible)
ALTER TABLE public.c1_tenants
  ADD COLUMN room_id uuid REFERENCES public.c1_rooms(id) ON DELETE SET NULL;

CREATE INDEX idx_c1_tenants_room_id ON public.c1_tenants(room_id);

-- 8. Add room_id to c1_tickets (nullable — backwards compatible)
ALTER TABLE public.c1_tickets
  ADD COLUMN room_id uuid REFERENCES public.c1_rooms(id) ON DELETE SET NULL;

CREATE INDEX idx_c1_tickets_room_id ON public.c1_tickets(room_id);
