-- ============================================================
-- Overdue Rent Chase-Up Messages
-- Adds 3 chase-up levels to the rent reminder system:
--   Level 4: +1 day overdue (gentle chase)
--   Level 5: +5 days overdue (firm chase)
--   Level 6: +10 days overdue (final chase)
-- ============================================================

-- ─── 1. Add chase columns to c1_rent_ledger ───────────────────────────────

ALTER TABLE c1_rent_ledger
  ADD COLUMN chase_1d_sent_at  timestamptz,
  ADD COLUMN chase_5d_sent_at  timestamptz,
  ADD COLUMN chase_10d_sent_at timestamptz;


-- ─── 2. Extend get_rent_reminders_due with chase-up levels ────────────────

CREATE OR REPLACE FUNCTION public.get_rent_reminders_due()
RETURNS TABLE (
  ledger_id uuid,
  room_id uuid,
  tenant_id uuid,
  property_manager_id uuid,
  property_id uuid,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  status text,
  reminder_level integer,
  tenant_name text,
  tenant_phone text,
  property_address text,
  room_number text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- Reminder 1: 3 days before due date
  SELECT
    rl.id AS ledger_id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    1 AS reminder_level,
    t.full_name AS tenant_name, t.phone AS tenant_phone,
    p.address AS property_address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE + 3
    AND rl.reminder_1_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Reminder 2: on due date
  SELECT
    rl.id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    2, t.full_name, t.phone, p.address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE
    AND rl.reminder_2_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Chase level 4: 1 day overdue (gentle chase)
  SELECT
    rl.id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    4, t.full_name, t.phone, p.address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 1
    AND rl.chase_1d_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Reminder 3: 3 days overdue
  SELECT
    rl.id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    3, t.full_name, t.phone, p.address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 3
    AND rl.reminder_3_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Chase level 5: 5 days overdue (firm chase)
  SELECT
    rl.id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    5, t.full_name, t.phone, p.address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 5
    AND rl.chase_5d_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  UNION ALL

  -- Chase level 6: 10 days overdue (final chase)
  SELECT
    rl.id, rl.room_id, rl.tenant_id, rl.property_manager_id,
    r.property_id, rl.due_date, rl.amount_due, rl.amount_paid, rl.status,
    6, t.full_name, t.phone, p.address, r.room_number
  FROM c1_rent_ledger rl
  JOIN c1_tenants t ON t.id = rl.tenant_id
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.due_date = CURRENT_DATE - 10
    AND rl.chase_10d_sent_at IS NULL
    AND rl.status NOT IN ('paid', 'cancelled')

  ORDER BY due_date ASC, reminder_level ASC;
$$;
