-- Sprint A, Sub-step 1h: Update CHECK constraint
-- Run AFTER backfill confirms no old values remain.
-- Added: cert_incomplete, awaiting_tenant, compliance_needs_dispatch, reschedule_pending
-- Removed: landlord_no_response, landlord_in_progress, ooh_in_progress, compliance_pending

-- Drop old constraint
ALTER TABLE c1_tickets DROP CONSTRAINT IF EXISTS chk_next_action_reason;

-- Add new constraint with updated values
ALTER TABLE c1_tickets ADD CONSTRAINT chk_next_action_reason
CHECK (next_action_reason IS NULL OR next_action_reason IN (
  -- Universal
  'new', 'archived', 'dismissed', 'completed', 'on_hold',
  -- Maintenance: lifecycle flags
  'pending_review', 'handoff_review',
  'allocated_to_landlord', 'landlord_needs_help', 'landlord_resolved', 'landlord_declined',
  'ooh_dispatched', 'ooh_resolved', 'ooh_unresolved',
  -- Maintenance: contractor flow
  'awaiting_contractor', 'awaiting_booking', 'scheduled', 'reschedule_pending',
  'awaiting_landlord', 'manager_approval', 'no_contractors', 'job_not_completed',
  -- Cross-category
  'awaiting_tenant',
  -- Compliance
  'compliance_needs_dispatch', 'cert_incomplete', 'cert_renewed',
  -- Rent
  'rent_overdue', 'rent_partial_payment', 'rent_cleared',
  -- Error
  'unknown_category'
));
