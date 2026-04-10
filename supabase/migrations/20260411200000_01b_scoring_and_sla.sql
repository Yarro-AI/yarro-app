-- Sprint A, Sub-step 1b: Scoring function + SLA trigger consolidation
-- Drop existing SLA trigger (conflicts with new 4-field write approach).
-- Create shared priority scoring function.

-- ── Drop existing SLA trigger ──────────────────────────────────────
-- The existing trigger writes sla_due_at independently based on priority only.
-- The recompute trigger will own this field going forward (reason-aware, legally grounded).
DROP TRIGGER IF EXISTS trg_c1_set_sla ON c1_tickets;
DROP FUNCTION IF EXISTS c1_set_sla_due_at();

-- ── New scoring function ───────────────────────────────────────────
-- Shared by dashboard RPC and ticket detail RPC. One function, identical scores.
-- See architecture doc § "Priority Scoring" for rationale.
CREATE OR REPLACE FUNCTION c1_compute_priority_score(
  p_priority text,
  p_deadline_date date,
  p_sla_due_at timestamptz,
  p_waiting_since timestamptz
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (
    -- Component 1: Consequence weight (severity base)
    CASE p_priority
      WHEN 'Emergency' THEN 400
      WHEN 'Urgent'    THEN 175
      WHEN 'High'      THEN 100
      WHEN 'Medium'    THEN 50
      ELSE 25
    END
    -- Component 2: Time pressure (external deadline proximity)
    + CASE
        WHEN p_deadline_date IS NULL THEN 0
        WHEN p_deadline_date < CURRENT_DATE THEN 150
        WHEN p_deadline_date <= CURRENT_DATE + 1 THEN 100
        WHEN p_deadline_date <= CURRENT_DATE + 2 THEN 75
        WHEN p_deadline_date <= CURRENT_DATE + 7 THEN 25
        ELSE 0
      END
    -- Component 3: SLA proximity (PM response window)
    + CASE
        WHEN p_sla_due_at IS NULL THEN 0
        WHEN p_sla_due_at < now() THEN 100
        WHEN p_sla_due_at <= now() + interval '1 hour' THEN 75
        WHEN p_sla_due_at <= now() + interval '4 hours' THEN 50
        WHEN p_sla_due_at <= now() + interval '24 hours' THEN 25
        ELSE 0
      END
    -- Component 4: Age boost (capped at 48h to prevent ancient low-priority items outranking fresh high-priority)
    + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(p_waiting_since, now()))) / 3600, 48)::int
  )
$$;
