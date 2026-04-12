-- Migration 1: Payment guards + query filters + validation + realtime
-- Fixes: BUG-12 (overpayment), BUG-13 (cancelled visible), BUG-1 (due day 0-31), BUGs 10-11 (realtime)


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-12: record_rent_payment — guard against already-paid + cap overpayment
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_rent_payment(
  p_rent_ledger_id uuid,
  p_pm_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_tenant_id uuid;
  v_current_status text;
  v_amount_due numeric;
  v_amount_paid numeric;
  v_remaining numeric;
  v_payment_id uuid;
  v_property_label text;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  -- Ownership check + read current state in one query
  SELECT tenant_id, status, amount_due, COALESCE(amount_paid, 0)
  INTO v_tenant_id, v_current_status, v_amount_due, v_amount_paid
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or access denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  -- Guard: reject payment on already-paid entries
  IF v_current_status = 'paid' THEN
    RAISE EXCEPTION 'Entry is already fully paid';
  END IF;

  -- Guard: reject overpayment
  v_remaining := v_amount_due - v_amount_paid;
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Amount exceeds remaining balance of %.2f', v_remaining;
  END IF;

  -- Insert payment (trigger handles ledger update + status)
  INSERT INTO c1_rent_payments (rent_ledger_id, tenant_id, property_manager_id, amount, payment_method, notes)
  VALUES (p_rent_ledger_id, v_tenant_id, p_pm_id, p_amount, p_payment_method, p_notes)
  RETURNING id INTO v_payment_id;

  -- Read back updated ledger state
  SELECT COALESCE(amount_paid, 0), status
  INTO v_new_paid, v_new_status
  FROM c1_rent_ledger WHERE id = p_rent_ledger_id;

  -- Audit event
  SELECT p.address INTO v_property_label
  FROM c1_rent_ledger rl
  JOIN c1_rooms r ON r.id = rl.room_id
  JOIN c1_properties p ON p.id = r.property_id
  WHERE rl.id = p_rent_ledger_id;

  PERFORM c1_log_system_event(
    p_pm_id,
    'RENT_PAYMENT_RECORDED',
    v_property_label,
    jsonb_build_object(
      'ledger_id', p_rent_ledger_id,
      'tenant_id', v_tenant_id,
      'amount', p_amount,
      'total_paid', v_new_paid,
      'new_status', v_new_status,
      'payment_method', p_payment_method
    )
  );

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


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-12: trg_rent_payment_update_ledger — cap amount_paid at amount_due
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Safety net: cap total_paid at amount_due
  v_total_paid := LEAST(v_total_paid, v_amount_due);

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


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-13: Exclude cancelled entries from rent query RPCs
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. get_rent_ledger_for_month — main /rent page
DROP FUNCTION IF EXISTS public.get_rent_ledger_for_month(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_rent_ledger_for_month(
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE(
  rent_ledger_id uuid,
  tenant_id uuid,
  tenant_name text,
  property_id uuid,
  property_address text,
  room_number text,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  effective_status text,
  is_former_tenant boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT * FROM (
    -- Current month entries (exclude cancelled)
    SELECT
      rl.id AS rent_ledger_id,
      rl.tenant_id,
      t.full_name AS tenant_name,
      p.id AS property_id,
      p.address AS property_address,
      r.room_number,
      rl.due_date,
      rl.amount_due,
      rl.amount_paid,
      CASE
        WHEN rl.status = 'paid' THEN 'paid'
        WHEN rl.status = 'partial' THEN 'partial'
        WHEN rl.status = 'overdue' THEN 'overdue'
        WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
        ELSE rl.status
      END AS effective_status,
      (r.current_tenant_id IS DISTINCT FROM rl.tenant_id) AS is_former_tenant
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date >= make_date(p_year, p_month, 1)
      AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
      AND rl.status != 'cancelled'
      -- Filter: current tenant OR outstanding debt from former tenant
      AND (
        r.current_tenant_id = rl.tenant_id
        OR rl.status IN ('overdue', 'partial')
      )

    UNION ALL

    -- Arrears from previous months (only outstanding, since PM signup)
    SELECT
      rl.id AS rent_ledger_id,
      rl.tenant_id,
      t.full_name AS tenant_name,
      p.id AS property_id,
      p.address AS property_address,
      r.room_number,
      rl.due_date,
      rl.amount_due,
      rl.amount_paid,
      'arrears' AS effective_status,
      (r.current_tenant_id IS DISTINCT FROM rl.tenant_id) AS is_former_tenant
    FROM c1_rent_ledger rl
    JOIN c1_tenants t ON t.id = rl.tenant_id
    JOIN c1_rooms r ON r.id = rl.room_id
    JOIN c1_properties p ON p.id = r.property_id
    JOIN c1_property_managers pm ON pm.id = rl.property_manager_id
    WHERE rl.property_manager_id = p_pm_id
      AND rl.due_date < make_date(p_year, p_month, 1)
      AND rl.due_date >= pm.created_at::date
      AND rl.status IN ('pending', 'partial', 'overdue')
  ) AS combined
  ORDER BY
    is_former_tenant,
    CASE combined.effective_status
      WHEN 'arrears' THEN 0
      WHEN 'overdue' THEN 1
      WHEN 'partial' THEN 2
      WHEN 'pending' THEN 3
      WHEN 'paid' THEN 4
      ELSE 5
    END,
    combined.due_date,
    combined.property_address,
    combined.room_number;
$function$;


-- 2. get_rent_summary_for_property — property detail rent tab
DROP FUNCTION IF EXISTS public.get_rent_summary_for_property(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_rent_summary_for_property(
  p_property_id uuid,
  p_pm_id uuid,
  p_month integer,
  p_year integer
)
RETURNS TABLE(
  room_id uuid,
  room_number text,
  room_name text,
  is_vacant boolean,
  tenant_id uuid,
  tenant_name text,
  rent_ledger_id uuid,
  due_date date,
  amount_due numeric,
  amount_paid numeric,
  paid_at timestamptz,
  payment_method text,
  effective_status text,
  notes text,
  is_former_tenant boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT
    r.id AS room_id,
    r.room_number,
    r.room_name,
    r.is_vacant,
    rl.tenant_id,
    t.full_name AS tenant_name,
    rl.id AS rent_ledger_id,
    rl.due_date,
    rl.amount_due,
    rl.amount_paid,
    rl.paid_at,
    rl.payment_method,
    CASE
      WHEN rl.id IS NULL THEN
        CASE WHEN r.current_tenant_id IS NULL THEN 'vacant' ELSE 'no_entry' END
      WHEN rl.status = 'paid' THEN 'paid'
      WHEN rl.status = 'partial' THEN 'partial'
      WHEN rl.status = 'overdue' THEN 'overdue'
      WHEN rl.status = 'pending' AND rl.due_date < CURRENT_DATE THEN 'overdue'
      ELSE rl.status
    END AS effective_status,
    rl.notes,
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false) AS is_former_tenant
  FROM c1_rooms r
  LEFT JOIN c1_rent_ledger rl ON rl.room_id = r.id
    AND rl.due_date >= make_date(p_year, p_month, 1)
    AND rl.due_date < (make_date(p_year, p_month, 1) + interval '1 month')::date
    AND rl.status != 'cancelled'
    -- Filter: current tenant OR outstanding from former
    AND (
      r.current_tenant_id = rl.tenant_id
      OR rl.status IN ('overdue', 'partial')
    )
  LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
  WHERE r.property_id = p_property_id
    AND r.property_manager_id = p_pm_id
  ORDER BY
    COALESCE(r.current_tenant_id IS DISTINCT FROM rl.tenant_id, false),
    r.room_number::integer,
    rl.due_date;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-1: Relax rent_due_day validation in RPCs from 1-28 to 0-31
-- ═══════════════════════════════════════════════════════════════════════════

-- room_upsert — update validation (drop first to allow param name changes)
DROP FUNCTION IF EXISTS public.room_upsert(uuid, uuid, text, text, text, numeric, integer, text, uuid);
CREATE OR REPLACE FUNCTION public.room_upsert(
  p_property_id uuid,
  p_pm_id uuid,
  p_room_number text,
  p_room_name text DEFAULT NULL,
  p_floor text DEFAULT NULL,
  p_monthly_rent numeric DEFAULT NULL,
  p_rent_due_day integer DEFAULT NULL,
  p_rent_frequency text DEFAULT 'monthly',
  p_room_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validate rent_due_day if provided (0 = last day of month, 1-31 = specific day)
  IF p_rent_due_day IS NOT NULL AND (p_rent_due_day < 0 OR p_rent_due_day > 31) THEN
    RAISE EXCEPTION 'Rent due day must be between 0 and 31 (0 = last day of month)';
  END IF;

  -- Validate rent_frequency
  IF p_rent_frequency NOT IN ('monthly', 'weekly') THEN
    RAISE EXCEPTION 'Rent frequency must be monthly or weekly';
  END IF;

  IF p_room_id IS NOT NULL THEN
    -- Update existing room
    UPDATE c1_rooms SET
      room_number = p_room_number,
      room_name = p_room_name,
      floor = p_floor,
      monthly_rent = p_monthly_rent,
      rent_due_day = p_rent_due_day,
      rent_frequency = p_rent_frequency
    WHERE id = p_room_id
      AND property_id = p_property_id
      AND property_manager_id = p_pm_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Room not found or access denied';
    END IF;
  ELSE
    -- Insert new room
    INSERT INTO c1_rooms (
      property_id, property_manager_id, room_number, room_name,
      floor, monthly_rent, rent_due_day, rent_frequency
    ) VALUES (
      p_property_id, p_pm_id, p_room_number, p_room_name,
      p_floor, p_monthly_rent, p_rent_due_day, p_rent_frequency
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUGs 10-11: Enable realtime on c1_rent_ledger
-- ═══════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE c1_rent_ledger;


-- ═══════════════════════════════════════════════════════════════════════════
-- BUG-1 (continued): bulk_import_unified — relax rent_due_day validation
-- Full function rewrite required (PL/pgSQL doesn't support partial updates)
-- Only change: line with "v_rent_due_day < 1 OR v_rent_due_day > 28" → "< 0 OR > 31"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bulk_import_unified(
  p_pm_id uuid,
  p_data jsonb
)
RETURNS jsonb AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_results jsonb := '[]'::jsonb;
  v_row jsonb;
  v_idx int := 0;
  v_address text;
  v_property_type text;
  v_property_id uuid;
  v_existing_property_id uuid;
  v_room_number text;
  v_room_name text;
  v_monthly_rent numeric;
  v_rent_due_day int;
  v_tenancy_start date;
  v_tenancy_end date;
  v_room_id uuid;
  v_room_current_tenant uuid;
  v_full_name text;
  v_phone text;
  v_email text;
  v_tenant_id uuid;
  v_existing_tenant_id uuid;
  v_properties_created int := 0;
  v_properties_existing int := 0;
  v_rooms_created int := 0;
  v_tenants_created int := 0;
  v_tenants_need_room int := 0;
  v_skipped int := 0;
  v_errored int := 0;
  v_needs_room boolean;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_idx := v_idx + 1;
    v_needs_room := false;

    v_address := trim(v_row->>'address');
    v_property_type := lower(trim(coalesce(v_row->>'property_type', '')));
    v_room_number := trim(v_row->>'room_number');
    v_room_name := nullif(trim(v_row->>'room_name'), '');
    v_full_name := trim(v_row->>'full_name');
    v_phone := normalize_uk_phone(v_row->>'phone');
    v_email := nullif(lower(trim(v_row->>'email')), '');

    BEGIN
      v_monthly_rent := nullif(trim(v_row->>'monthly_rent'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_monthly_rent := NULL;
    END;

    BEGIN
      v_rent_due_day := nullif(trim(v_row->>'rent_due_day'), '')::int;
      -- BUG-1 FIX: Accept 0-31 (was 1-28). 0 = last day of month, 29-31 = clamped.
      IF v_rent_due_day IS NOT NULL AND (v_rent_due_day < 0 OR v_rent_due_day > 31) THEN
        v_rent_due_day := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rent_due_day := NULL;
    END;

    BEGIN
      v_tenancy_start := nullif(trim(v_row->>'tenancy_start_date'), '')::date;
    EXCEPTION WHEN OTHERS THEN
      v_tenancy_start := NULL;
    END;

    BEGIN
      v_tenancy_end := nullif(trim(v_row->>'tenancy_end_date'), '')::date;
    EXCEPTION WHEN OTHERS THEN
      v_tenancy_end := NULL;
    END;

    IF v_property_type IN ('single_let', 'singlelet', 'single let') THEN
      v_property_type := 'single_let';
    ELSIF v_property_type = '' OR v_property_type IS NULL THEN
      v_property_type := 'hmo';
    ELSE
      v_property_type := 'hmo';
    END IF;

    IF v_address IS NULL OR v_address = '' THEN
      v_errored := v_errored + 1;
      v_results := v_results || jsonb_build_object(
        'row', v_idx, 'status', 'error', 'error', 'Address is required'
      );
      CONTINUE;
    END IF;

    v_existing_property_id := NULL;

    SELECT id INTO v_existing_property_id
    FROM c1_properties
    WHERE property_manager_id = p_pm_id
      AND lower(trim(address)) = lower(v_address)
    LIMIT 1;

    IF v_existing_property_id IS NULL THEN
      SELECT id INTO v_existing_property_id
      FROM c1_properties
      WHERE property_manager_id = p_pm_id
        AND lower(strip_uk_postcode(address)) = lower(strip_uk_postcode(v_address))
        AND strip_uk_postcode(v_address) <> ''
      LIMIT 1;
    END IF;

    IF v_existing_property_id IS NULL THEN
      SELECT id INTO v_existing_property_id
      FROM c1_properties
      WHERE property_manager_id = p_pm_id
        AND (
          lower(address) LIKE '%' || lower(strip_uk_postcode(v_address)) || '%'
          OR lower(v_address) LIKE '%' || lower(strip_uk_postcode(address)) || '%'
        )
        AND strip_uk_postcode(v_address) <> ''
        AND length(strip_uk_postcode(v_address)) > 5
      LIMIT 1;
    END IF;

    IF v_existing_property_id IS NOT NULL THEN
      v_property_id := v_existing_property_id;
      v_properties_existing := v_properties_existing + 1;

      UPDATE c1_properties
      SET address = CASE
        WHEN length(v_address) > length(address) THEN v_address
        ELSE address
      END,
      city = COALESCE(c1_properties.city, nullif(trim(v_row->>'city'), '')),
      landlord_name = COALESCE(c1_properties.landlord_name, nullif(trim(v_row->>'landlord_name'), '')),
      landlord_phone = COALESCE(c1_properties.landlord_phone, normalize_uk_phone(v_row->>'landlord_phone')),
      landlord_email = COALESCE(c1_properties.landlord_email, nullif(trim(v_row->>'landlord_email'), ''))
      WHERE id = v_property_id;

      SELECT property_type INTO v_property_type
      FROM c1_properties WHERE id = v_property_id;
      IF v_property_type IS NULL OR v_property_type = '' THEN
        v_property_type := 'hmo';
      END IF;
    ELSE
      INSERT INTO c1_properties (
        property_manager_id, address, property_type, city,
        landlord_name, landlord_phone, landlord_email,
        _import_batch_id, _imported_at
      ) VALUES (
        p_pm_id, v_address, v_property_type,
        nullif(trim(v_row->>'city'), ''),
        nullif(trim(v_row->>'landlord_name'), ''),
        normalize_uk_phone(v_row->>'landlord_phone'),
        nullif(trim(v_row->>'landlord_email'), ''),
        v_batch_id, now()
      )
      RETURNING id INTO v_property_id;
      v_properties_created := v_properties_created + 1;
    END IF;

    v_room_id := NULL;

    IF v_property_type = 'single_let' THEN
      SELECT id INTO v_room_id
      FROM c1_rooms
      WHERE property_id = v_property_id AND property_manager_id = p_pm_id
      LIMIT 1;

      IF v_room_id IS NULL THEN
        INSERT INTO c1_rooms (
          property_manager_id, property_id, room_number,
          monthly_rent, rent_due_day, rent_frequency,
          created_at, updated_at
        ) VALUES (
          p_pm_id, v_property_id, 'Room 1',
          v_monthly_rent, v_rent_due_day, 'monthly',
          now(), now()
        )
        RETURNING id INTO v_room_id;
        v_rooms_created := v_rooms_created + 1;
      END IF;

    ELSIF v_room_number IS NOT NULL AND v_room_number <> '' THEN
      INSERT INTO c1_rooms (
        property_manager_id, property_id, room_number, room_name,
        monthly_rent, rent_due_day, rent_frequency,
        created_at, updated_at
      ) VALUES (
        p_pm_id, v_property_id, v_room_number, v_room_name,
        v_monthly_rent, v_rent_due_day, 'monthly',
        now(), now()
      )
      ON CONFLICT (property_id, room_number)
      DO UPDATE SET
        room_name = COALESCE(EXCLUDED.room_name, c1_rooms.room_name),
        monthly_rent = COALESCE(EXCLUDED.monthly_rent, c1_rooms.monthly_rent),
        rent_due_day = COALESCE(EXCLUDED.rent_due_day, c1_rooms.rent_due_day),
        updated_at = now()
      RETURNING id INTO v_room_id;

      IF NOT EXISTS (
        SELECT 1 FROM c1_rooms
        WHERE id = v_room_id AND created_at < now() - interval '1 second'
      ) THEN
        v_rooms_created := v_rooms_created + 1;
      END IF;
    END IF;

    v_tenant_id := NULL;

    IF (v_full_name IS NOT NULL AND v_full_name <> '') OR
       (v_phone IS NOT NULL AND v_phone <> '') THEN

      v_existing_tenant_id := NULL;

      IF v_phone IS NOT NULL AND v_phone <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id AND phone = v_phone
        LIMIT 1;
      END IF;

      IF v_existing_tenant_id IS NULL AND v_full_name IS NOT NULL AND v_full_name <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id
          AND property_id = v_property_id
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;
      END IF;

      IF v_existing_tenant_id IS NULL AND v_full_name IS NOT NULL AND v_full_name <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;
      END IF;

      IF v_existing_tenant_id IS NOT NULL THEN
        UPDATE c1_tenants
        SET
          property_id = COALESCE(c1_tenants.property_id, v_property_id),
          phone = COALESCE(c1_tenants.phone, v_phone),
          email = COALESCE(c1_tenants.email, v_email),
          full_name = COALESCE(c1_tenants.full_name, nullif(v_full_name, ''))
        WHERE id = v_existing_tenant_id;

        v_tenant_id := v_existing_tenant_id;
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object(
          'row', v_idx, 'status', 'skipped',
          'error', 'Tenant already exists (updated with new data)',
          'id', v_existing_tenant_id
        );

        IF v_room_id IS NOT NULL THEN
          DECLARE v_tenant_room uuid;
          BEGIN
            SELECT room_id INTO v_tenant_room FROM c1_tenants WHERE id = v_existing_tenant_id;
            IF v_tenant_room IS NULL THEN
              SELECT current_tenant_id INTO v_room_current_tenant
              FROM c1_rooms WHERE id = v_room_id FOR UPDATE;

              IF v_room_current_tenant IS NULL THEN
                UPDATE c1_rooms
                SET current_tenant_id = v_existing_tenant_id,
                    tenancy_start_date = coalesce(v_tenancy_start, CURRENT_DATE),
                    tenancy_end_date = v_tenancy_end
                WHERE id = v_room_id;
                UPDATE c1_tenants SET room_id = v_room_id WHERE id = v_existing_tenant_id;
              END IF;
            END IF;
          END;
        END IF;

        CONTINUE;
      END IF;

      INSERT INTO c1_tenants (
        property_manager_id, property_id, room_id,
        full_name, phone, email,
        _import_batch_id, _imported_at
      ) VALUES (
        p_pm_id, v_property_id, v_room_id,
        nullif(v_full_name, ''), v_phone, v_email,
        v_batch_id, now()
      )
      RETURNING id INTO v_tenant_id;

      IF v_room_id IS NOT NULL AND v_tenant_id IS NOT NULL THEN
        SELECT current_tenant_id INTO v_room_current_tenant
        FROM c1_rooms WHERE id = v_room_id FOR UPDATE;

        IF v_room_current_tenant IS NOT NULL AND v_room_current_tenant != v_tenant_id THEN
          UPDATE c1_tenants SET room_id = NULL WHERE id = v_tenant_id;

          v_tenants_created := v_tenants_created + 1;
          v_tenants_need_room := v_tenants_need_room + 1;
          v_errored := v_errored + 1;
          v_results := v_results || jsonb_build_object(
            'row', v_idx, 'status', 'error',
            'error', format('Room %s at %s already has a tenant — assign manually',
                           coalesce(v_room_number, 'Room 1'), v_address),
            'tenant_id', v_tenant_id,
            'needs_room_assignment', true
          );
          CONTINUE;
        END IF;

        UPDATE c1_rooms
        SET current_tenant_id = v_tenant_id,
            tenancy_start_date = coalesce(v_tenancy_start, CURRENT_DATE),
            tenancy_end_date = v_tenancy_end
        WHERE id = v_room_id;
      END IF;

      v_tenants_created := v_tenants_created + 1;

      IF v_room_id IS NULL THEN
        v_needs_room := true;
        v_tenants_need_room := v_tenants_need_room + 1;
      END IF;
    END IF;

    v_results := v_results || jsonb_build_object(
      'row', v_idx,
      'status', CASE
        WHEN v_existing_property_id IS NOT NULL AND v_tenant_id IS NULL THEN 'skipped'
        ELSE 'created'
      END,
      'property_id', v_property_id,
      'room_id', v_room_id,
      'tenant_id', v_tenant_id,
      'needs_room_assignment', coalesce(v_needs_room, false)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'results', v_results,
    'total', v_idx,
    'created', v_properties_created + v_tenants_created,
    'properties_created', v_properties_created,
    'properties_existing', v_properties_existing,
    'rooms_created', v_rooms_created,
    'tenants_created', v_tenants_created,
    'tenants_need_room', v_tenants_need_room,
    'skipped', v_skipped,
    'errors', v_errored
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
