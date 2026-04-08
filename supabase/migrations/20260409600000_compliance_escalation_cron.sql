-- Compliance priority escalation + cert status sync
-- Runs daily at 07:55 UTC (before the 08:00 compliance reminder cron)
-- Ensures ticket priority and cert status reflect reality, not creation-time values.

-- Priority tiers:
--   Expired (any)        → Urgent
--   Expiring ≤ 14 days   → High
--   Expiring 14-30 days  → Medium
--   Expiring > 30 days   → Normal

CREATE OR REPLACE FUNCTION c1_compliance_escalate()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update ticket priority based on current cert expiry
  UPDATE c1_tickets t
  SET priority = CASE
    WHEN cc.expiry_date < CURRENT_DATE THEN 'Urgent'
    WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'High'
    WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'Medium'
    ELSE 'Normal'
  END
  FROM c1_compliance_certificates cc
  WHERE t.compliance_certificate_id = cc.id
    AND t.category = 'compliance_renewal'
    AND t.status = 'open'
    AND (t.archived IS NULL OR t.archived = false)
    AND cc.expiry_date IS NOT NULL
    AND t.priority IS DISTINCT FROM (
      CASE
        WHEN cc.expiry_date < CURRENT_DATE THEN 'Urgent'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '14 days' THEN 'High'
        WHEN cc.expiry_date <= CURRENT_DATE + interval '30 days' THEN 'Medium'
        ELSE 'Normal'
      END
    );

  -- 2. Sync cert status: mark expired certs that still say 'valid'
  UPDATE c1_compliance_certificates
  SET status = 'expired', updated_at = now()
  WHERE expiry_date IS NOT NULL
    AND expiry_date < CURRENT_DATE
    AND status = 'valid';
END;
$$;

-- Schedule daily at 07:55 UTC (before the 08:00 compliance reminder)
SELECT cron.schedule(
  'compliance-escalation-daily',
  '55 7 * * *',
  $$ SELECT c1_compliance_escalate() $$
);

-- One-time backfill for existing stale data
SELECT c1_compliance_escalate();
