-- Fix: rent_due_day is NULL on most rooms, preventing rent ledger creation.
-- Default to day 1 when not specified. Backfill existing rooms.

-- 1. Backfill: set rent_due_day = 1 for all rooms that have rent but no due day
UPDATE c1_rooms
SET rent_due_day = 1
WHERE monthly_rent IS NOT NULL
  AND rent_due_day IS NULL;

-- 2. Set column default so future rooms get day 1 if not specified
ALTER TABLE c1_rooms ALTER COLUMN rent_due_day SET DEFAULT 1;
