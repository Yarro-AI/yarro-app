-- ============================================================
-- One-off backfill: close tickets stuck with next_action = 'completed'
-- ============================================================
-- The auto-close trigger (20260408200000) only fires on future
-- changes. This migration closes existing tickets that have
-- next_action = 'completed' but status still 'open'.
-- ============================================================

UPDATE c1_tickets
SET status = 'closed',
    resolved_at = COALESCE(resolved_at, now())
WHERE next_action = 'completed'
  AND lower(status) != 'closed';
