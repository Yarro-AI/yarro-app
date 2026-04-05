-- ============================================================
-- Fix: Import dedup — prevent duplicates on re-import
--
-- Problems:
-- 1. Property dedup is exact match only. "123 High St" ≠ "123 High St, M1 1AA"
-- 2. Tenant dedup only checks name+property, not phone
-- 3. Re-importing with slightly different address creates duplicates
--
-- Fixes:
-- 1. Property: try exact match → try contains match → try postcode-stripped match
-- 2. Tenant: also dedup by phone (same phone = same person, PM-wide)
-- 3. Property: on match, update address to the longer/more complete version
-- ============================================================


-- ─── Helper: strip UK postcode from end of address ──────────
CREATE OR REPLACE FUNCTION strip_uk_postcode(addr text)
RETURNS text AS $$
BEGIN
  -- Remove UK postcode pattern from end of string (with optional preceding comma/space)
  RETURN trim(regexp_replace(
    addr,
    '[,\s]*[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}\s*$',
    '',
    'i'
  ));
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ─── Updated bulk_import_unified with robust dedup ──────────
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

  -- Property fields
  v_address text;
  v_property_type text;
  v_property_id uuid;
  v_existing_property_id uuid;

  -- Room fields
  v_room_number text;
  v_room_name text;
  v_monthly_rent numeric;
  v_rent_due_day int;
  v_tenancy_start date;
  v_tenancy_end date;
  v_room_id uuid;
  v_room_current_tenant uuid;

  -- Tenant fields
  v_full_name text;
  v_phone text;
  v_email text;
  v_tenant_id uuid;
  v_existing_tenant_id uuid;

  -- Counters
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

    -- ── Extract fields ──
    v_address := trim(v_row->>'address');
    v_property_type := lower(trim(coalesce(v_row->>'property_type', '')));
    v_room_number := trim(v_row->>'room_number');
    v_room_name := nullif(trim(v_row->>'room_name'), '');
    v_full_name := trim(v_row->>'full_name');
    v_phone := normalize_uk_phone(v_row->>'phone');
    v_email := nullif(lower(trim(v_row->>'email')), '');

    -- Parse numeric/date fields safely
    BEGIN
      v_monthly_rent := nullif(trim(v_row->>'monthly_rent'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_monthly_rent := NULL;
    END;

    BEGIN
      v_rent_due_day := nullif(trim(v_row->>'rent_due_day'), '')::int;
      IF v_rent_due_day IS NOT NULL AND (v_rent_due_day < 1 OR v_rent_due_day > 28) THEN
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

    -- Normalize property_type
    IF v_property_type IN ('single_let', 'singlelet', 'single let') THEN
      v_property_type := 'single_let';
    ELSIF v_property_type = '' OR v_property_type IS NULL THEN
      v_property_type := 'hmo';
    ELSE
      v_property_type := 'hmo';
    END IF;

    -- ── Step 1: Property — find or create (robust dedup) ──
    IF v_address IS NULL OR v_address = '' THEN
      v_errored := v_errored + 1;
      v_results := v_results || jsonb_build_object(
        'row', v_idx, 'status', 'error', 'error', 'Address is required'
      );
      CONTINUE;
    END IF;

    v_existing_property_id := NULL;

    -- Try 1: Exact match (case-insensitive)
    SELECT id INTO v_existing_property_id
    FROM c1_properties
    WHERE property_manager_id = p_pm_id
      AND lower(trim(address)) = lower(v_address)
    LIMIT 1;

    -- Try 2: Match by address without postcode
    -- e.g., "123 High St, Manchester" matches "123 High St, Manchester, M1 1AA"
    IF v_existing_property_id IS NULL THEN
      SELECT id INTO v_existing_property_id
      FROM c1_properties
      WHERE property_manager_id = p_pm_id
        AND lower(strip_uk_postcode(address)) = lower(strip_uk_postcode(v_address))
        AND strip_uk_postcode(v_address) <> ''
      LIMIT 1;
    END IF;

    -- Try 3: Contains match — one contains the other
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

      -- Update address to the more complete version (longer = more data)
      UPDATE c1_properties
      SET address = CASE
        WHEN length(v_address) > length(address) THEN v_address
        ELSE address
      END,
      -- Fill in missing fields from new data
      city = COALESCE(c1_properties.city, nullif(trim(v_row->>'city'), '')),
      landlord_name = COALESCE(c1_properties.landlord_name, nullif(trim(v_row->>'landlord_name'), '')),
      landlord_phone = COALESCE(c1_properties.landlord_phone, normalize_uk_phone(v_row->>'landlord_phone')),
      landlord_email = COALESCE(c1_properties.landlord_email, nullif(trim(v_row->>'landlord_email'), ''))
      WHERE id = v_property_id;

      -- Use existing property's type
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
        p_pm_id,
        v_address,
        v_property_type,
        nullif(trim(v_row->>'city'), ''),
        nullif(trim(v_row->>'landlord_name'), ''),
        normalize_uk_phone(v_row->>'landlord_phone'),
        nullif(trim(v_row->>'landlord_email'), ''),
        v_batch_id,
        now()
      )
      RETURNING id INTO v_property_id;

      v_properties_created := v_properties_created + 1;
    END IF;

    -- ── Step 2: Room — property-type-aware ──
    v_room_id := NULL;

    IF v_property_type = 'single_let' THEN
      SELECT id INTO v_room_id
      FROM c1_rooms
      WHERE property_id = v_property_id
        AND property_manager_id = p_pm_id
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
        WHERE id = v_room_id
          AND created_at < now() - interval '1 second'
      ) THEN
        v_rooms_created := v_rooms_created + 1;
      END IF;
    END IF;

    -- ── Step 3: Tenant — create + room assignment (robust dedup) ──
    v_tenant_id := NULL;

    IF (v_full_name IS NOT NULL AND v_full_name <> '') OR
       (v_phone IS NOT NULL AND v_phone <> '') THEN

      v_existing_tenant_id := NULL;

      -- Dedup 1: Match by phone (PM-wide — same phone = same person)
      IF v_phone IS NOT NULL AND v_phone <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id
          AND phone = v_phone
        LIMIT 1;
      END IF;

      -- Dedup 2: Match by name at this property
      IF v_existing_tenant_id IS NULL AND v_full_name IS NOT NULL AND v_full_name <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id
          AND property_id = v_property_id
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;
      END IF;

      -- Dedup 3: Match by name PM-wide (same name across any property)
      IF v_existing_tenant_id IS NULL AND v_full_name IS NOT NULL AND v_full_name <> '' THEN
        SELECT id INTO v_existing_tenant_id
        FROM c1_tenants
        WHERE property_manager_id = p_pm_id
          AND lower(trim(full_name)) = lower(v_full_name)
        LIMIT 1;
      END IF;

      IF v_existing_tenant_id IS NOT NULL THEN
        -- Update existing tenant with any new data
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

        -- Still try room assignment if tenant doesn't have one
        IF v_room_id IS NOT NULL THEN
          DECLARE v_tenant_room uuid;
          BEGIN
            SELECT room_id INTO v_tenant_room FROM c1_tenants WHERE id = v_existing_tenant_id;
            IF v_tenant_room IS NULL THEN
              -- Lock room
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

      -- Insert new tenant
      INSERT INTO c1_tenants (
        property_manager_id, property_id, room_id,
        full_name, phone, email,
        _import_batch_id, _imported_at
      ) VALUES (
        p_pm_id, v_property_id, v_room_id,
        nullif(v_full_name, ''),
        v_phone,
        v_email,
        v_batch_id,
        now()
      )
      RETURNING id INTO v_tenant_id;

      -- Room assignment (dual-side update)
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

    -- Build result for this row
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
