-- Sprint A, Sub-step 1a: Add new columns (pure additive, zero risk)
-- All columns are nullable/defaulted — no existing queries break.

-- New timing columns
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS contractor_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS tenant_contacted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS deadline_date DATE DEFAULT NULL;

-- New state columns
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS awaiting_tenant BOOLEAN DEFAULT false;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS reschedule_initiated_by TEXT DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS handoff_reason TEXT DEFAULT NULL;
