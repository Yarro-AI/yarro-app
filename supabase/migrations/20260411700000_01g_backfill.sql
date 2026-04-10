-- Sprint A, Sub-step 1g: Data backfill
-- Order matters. Run sequentially.
-- All data is seed data — safe to modify.

-- 1. Backfill open tickets via router recompute.
-- The router (1c) and trigger (1d) are already deployed with new values.
-- Touching a watched column forces the trigger to fire and recompute.
UPDATE c1_tickets SET status = status WHERE status != 'closed' AND archived = false;

-- 2. Backfill terminal/closed tickets (simple value map).
-- These won't be recomputed by the trigger since they're closed/archived.
UPDATE c1_tickets SET next_action = 'needs_action'
WHERE next_action IN ('needs_attention', 'assign_contractor', 'follow_up', 'new');

UPDATE c1_tickets SET next_action = 'waiting'
WHERE next_action = 'in_progress' AND next_action_reason != 'scheduled';

UPDATE c1_tickets SET next_action = 'scheduled'
WHERE next_action = 'in_progress' AND next_action_reason = 'scheduled';

-- 3. Rename compliance_pending → compliance_needs_dispatch on ALL tickets (open + closed)
UPDATE c1_tickets SET next_action_reason = 'compliance_needs_dispatch'
WHERE next_action_reason = 'compliance_pending';

-- 4. Remove stale reason values from closed/archived tickets
UPDATE c1_tickets SET next_action_reason = 'allocated_to_landlord'
WHERE next_action_reason = 'landlord_in_progress';

UPDATE c1_tickets SET next_action_reason = 'ooh_dispatched'
WHERE next_action_reason = 'ooh_in_progress';

-- landlord_no_response → awaiting_landlord (the timeout model replaces this)
UPDATE c1_tickets SET next_action_reason = 'awaiting_landlord'
WHERE next_action_reason = 'landlord_no_response';

-- 5. Backfill waiting_since (existing open tickets need this for age_boost in scoring)
-- c1_tickets has no updated_at column — use date_logged as the best available timestamp
UPDATE c1_tickets SET waiting_since = date_logged
WHERE waiting_since IS NULL;

-- 6. Backfill deadline_date (compliance — from cert expiry)
UPDATE c1_tickets t SET deadline_date = cc.expiry_date
FROM c1_compliance_certificates cc
WHERE t.compliance_certificate_id = cc.id
  AND t.category = 'compliance_renewal'
  AND t.deadline_date IS NULL;

-- 7. Backfill deadline_date (rent — from rent due date)
UPDATE c1_tickets t SET deadline_date = rl.due_date
FROM c1_rent_ledger rl
WHERE t.category = 'rent_arrears'
  AND t.tenant_id = rl.tenant_id
  AND rl.status IN ('overdue', 'partial')
  AND t.deadline_date IS NULL;

-- 8. Null out sla_due_at for waiting/scheduled/terminal tickets
-- Prevents stale SLA values from appearing in breach queries.
UPDATE c1_tickets SET sla_due_at = NULL
WHERE next_action IN ('waiting', 'scheduled', 'completed', 'archived', 'dismissed', 'on_hold');
