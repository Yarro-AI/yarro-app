-- ============================================================
-- Compliance Single Source of Truth
--
-- 1. Drops the auto-populate trigger (requirements become opt-in)
-- 2. Rewrites compliance_get_summary to aggregate FROM
--    compliance_get_all_statuses — one CASE logic, zero drift
--
-- Note: existing c1_compliance_requirements rows are preserved.
-- Users manage them via the compliance config sheet.
-- compliance_set_property_type (called by onboarding) still
-- inserts defaults independently — that's an explicit code path.
-- ============================================================

-- ─── 1. Drop auto-populate trigger + function ─────────────────
DROP TRIGGER IF EXISTS trg_compliance_auto_populate ON c1_properties;
DROP FUNCTION IF EXISTS public.compliance_auto_populate_requirements();

-- ─── 2. Rewrite compliance_get_summary (PROTECTED RPC) ────────
-- Now aggregates FROM compliance_get_all_statuses instead of
-- maintaining its own CASE logic. Status names align:
-- expiring_soon (not expiring_unscheduled).
-- total_properties counts only properties with requirements
-- (properties with no requirements are not "in scope").

CREATE OR REPLACE FUNCTION public.compliance_get_summary(
  p_pm_id uuid
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH statuses AS (
    SELECT * FROM compliance_get_all_statuses(p_pm_id)
  ),
  property_compliance AS (
    SELECT
      property_id,
      CASE
        WHEN COUNT(*) FILTER (
          WHERE display_status IN ('missing', 'expired', 'expiring_soon', 'review')
        ) = 0 THEN true
        ELSE false
      END AS is_compliant
    FROM statuses
    GROUP BY property_id
  )
  SELECT json_build_object(
    'actions_needed',
      (SELECT COUNT(*) FROM statuses WHERE display_status IN ('missing', 'expired', 'expiring_soon', 'review')),
    'expired',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expired'),
    'expiring_soon',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'expiring_soon'),
    'review',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'review'),
    'missing',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'missing'),
    'renewal_scheduled',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'renewal_scheduled'),
    'valid',
      (SELECT COUNT(*) FROM statuses WHERE display_status = 'valid'),
    'compliant_properties',
      (SELECT COUNT(*) FROM property_compliance WHERE is_compliant = true),
    'total_properties',
      (SELECT COUNT(DISTINCT property_id) FROM statuses),
    'total_required',
      (SELECT COUNT(*) FROM statuses)
  );
$$;
