-- ============================================================
-- Fix: contractor_mapping must use categories[] array, not category singular
-- ============================================================
-- Root cause: auto_sync_property_mappings() reads NEW.category (singular)
-- but the SSOT for what trades a contractor handles is the categories[]
-- array. A contractor with categories=["Electrician","Plumber","Gas"]
-- only got mapped under "Electrician" (the primary category field).
--
-- Fix: rewrite trigger to iterate categories[], fire on more columns,
-- backfill all existing mappings.
-- ============================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. Rewrite trigger function to use categories[] array
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_sync_property_mappings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prop_id uuid;
  v_cat text;
  v_categories text[];
  v_old_categories text[];
  v_all_categories text[];
  v_mapping jsonb;
  v_arr jsonb;
BEGIN
  -- Determine categories to use (SSOT: categories array, fallback to category singular)
  v_categories := COALESCE(NULLIF(NEW.categories, '{}'), ARRAY[NEW.category]);

  -- OLD categories for cleanup (on UPDATE, remove from old categories too)
  IF TG_OP = 'UPDATE' THEN
    v_old_categories := COALESCE(NULLIF(OLD.categories, '{}'), ARRAY[OLD.category]);
    -- Union of old + new to ensure cleanup of removed categories
    v_all_categories := ARRAY(
      SELECT DISTINCT unnest FROM unnest(v_old_categories || v_categories)
    );
  ELSE
    v_all_categories := v_categories;
  END IF;

  -- ═══ STEP 1: Remove contractor from ALL properties under ALL old+new categories ═══
  -- This ensures stale mappings are cleaned up when categories change
  FOR prop_id IN
    SELECT DISTINCT p.id
    FROM c1_properties p
    WHERE EXISTS (
      SELECT 1 FROM unnest(v_all_categories) cat
      WHERE p.contractor_mapping::jsonb ? cat
    )
  LOOP
    SELECT COALESCE(contractor_mapping::jsonb, '{}'::jsonb)
    INTO v_mapping
    FROM c1_properties WHERE id = prop_id;

    -- Remove this contractor from every category key
    FOREACH v_cat IN ARRAY v_all_categories
    LOOP
      IF v_mapping ? v_cat THEN
        v_arr := to_jsonb(ARRAY(
          SELECT elem FROM jsonb_array_elements_text(v_mapping -> v_cat) elem
          WHERE elem <> NEW.id::text
        ));
        IF jsonb_array_length(v_arr) = 0 THEN
          v_mapping := v_mapping - v_cat;
        ELSE
          v_mapping := jsonb_set(v_mapping, ARRAY[v_cat], v_arr);
        END IF;
      END IF;
    END LOOP;

    UPDATE c1_properties SET contractor_mapping = v_mapping WHERE id = prop_id;
  END LOOP;

  -- ═══ STEP 2: Add contractor to all linked properties under EVERY category ═══
  IF NEW.property_ids IS NOT NULL THEN
    FOREACH prop_id IN ARRAY NEW.property_ids
    LOOP
      SELECT COALESCE(contractor_mapping::jsonb, '{}'::jsonb)
      INTO v_mapping
      FROM c1_properties WHERE id = prop_id;

      FOREACH v_cat IN ARRAY v_categories
      LOOP
        v_arr := to_jsonb(ARRAY(
          SELECT DISTINCT unnest FROM unnest(
            COALESCE(
              ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_mapping -> v_cat, '[]'::jsonb))),
              '{}'::text[]
            ) || NEW.id::text
          )
        ));
        v_mapping := jsonb_set(v_mapping, ARRAY[v_cat], v_arr);
      END LOOP;

      UPDATE c1_properties SET contractor_mapping = v_mapping WHERE id = prop_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- 2. Update trigger to fire on categories and category changes too
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_auto_sync_property_mappings ON c1_contractors;

CREATE TRIGGER trg_auto_sync_property_mappings
  AFTER INSERT OR UPDATE OF property_ids, categories, category
  ON c1_contractors
  FOR EACH ROW
  EXECUTE FUNCTION auto_sync_property_mappings();


-- ═══════════════════════════════════════════════════════════════
-- 3. Backfill: rebuild all contractor_mapping from categories[]
-- ═══════════════════════════════════════════════════════════════
-- Force trigger to fire for every active contractor with properties linked.
-- The trigger will clean up old single-category mappings and rebuild with
-- the full categories array.

-- Direct rebuild: compute contractor_mapping from categories[] array
-- (trigger-based backfill doesn't work because UPDATE SET x=x doesn't fire UPDATE OF triggers)
UPDATE c1_properties p
SET contractor_mapping = COALESCE((
  SELECT jsonb_object_agg(cat, contractor_ids)
  FROM (
    SELECT cat, jsonb_agg(c.id::text) AS contractor_ids
    FROM c1_contractors c,
         unnest(COALESCE(NULLIF(c.categories, '{}'), ARRAY[c.category])) AS cat
    WHERE c.active = true
      AND p.id = ANY(c.property_ids)
    GROUP BY cat
  ) sub
), '{}'::jsonb);
