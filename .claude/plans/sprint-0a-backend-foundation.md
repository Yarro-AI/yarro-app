# Sprint A: Backend Foundation

> **Prereq:** Sprint 0 (docs) complete.
> **Output:** All tickets have correct bucket values, router returns new values, trigger writes 4 fields, priority scoring works, new columns populated.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Step 1
> **Architecture doc:** `docs/architecture/ticket-state-model.md`

---

## Sub-step 1a: Add new columns (pure additive, zero risk)

**Migration file:** `supabase/migrations/YYYYMMDD_01a_new_columns.sql`

```sql
-- New timing columns
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS contractor_sent_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS tenant_contacted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS deadline_date DATE DEFAULT NULL;

-- New state columns
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS awaiting_tenant BOOLEAN DEFAULT false;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS reschedule_initiated_by TEXT DEFAULT NULL;
ALTER TABLE c1_tickets ADD COLUMN IF NOT EXISTS handoff_reason TEXT DEFAULT NULL;
```

**Note:** `sla_due_at` already exists (currently managed by `trg_c1_set_sla`). No need to add it.

**Verify:** `supabase db push` succeeds. No existing queries break (all columns are nullable/defaulted).

---

## Sub-step 1b: Scoring function + SLA trigger consolidation

**Migration file:** `supabase/migrations/YYYYMMDD_01b_scoring_and_sla.sql`

### Drop existing SLA trigger (conflicts with new approach)

```sql
-- The existing trigger writes sla_due_at independently.
-- The recompute trigger will own this field going forward.
DROP TRIGGER IF EXISTS trg_c1_set_sla ON c1_tickets;
DROP FUNCTION IF EXISTS c1_set_sla_due_at();
```

**Current `c1_set_sla_due_at` behavior being replaced:**
- Emergency → 1 hour from date_logged
- Urgent → 2 hours
- High → 24 hours
- Medium → 7 days
- Low → 14 days

**New behavior** (in recompute trigger, sub-step 1c): SLA is reason-aware and legally grounded. See architecture doc section "sla_due_at — legally grounded defaults".

### New scoring function

```sql
CREATE OR REPLACE FUNCTION c1_compute_priority_score(
  p_priority text, p_deadline_date date,
  p_sla_due_at timestamptz, p_waiting_since timestamptz
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (
    -- Consequence weight
    CASE p_priority
      WHEN 'Emergency' THEN 400 WHEN 'Urgent' THEN 175
      WHEN 'High' THEN 100 WHEN 'Medium' THEN 50 ELSE 25
    END
    -- Time pressure (deadline)
    + CASE
      WHEN p_deadline_date IS NULL THEN 0
      WHEN p_deadline_date < CURRENT_DATE THEN 150
      WHEN p_deadline_date <= CURRENT_DATE + 1 THEN 100
      WHEN p_deadline_date <= CURRENT_DATE + 2 THEN 75
      WHEN p_deadline_date <= CURRENT_DATE + 7 THEN 25
      ELSE 0
    END
    -- SLA proximity
    + CASE
      WHEN p_sla_due_at IS NULL THEN 0
      WHEN p_sla_due_at < now() THEN 100
      WHEN p_sla_due_at <= now() + interval '1 hour' THEN 75
      WHEN p_sla_due_at <= now() + interval '4 hours' THEN 50
      WHEN p_sla_due_at <= now() + interval '24 hours' THEN 25
      ELSE 0
    END
    -- Age boost (capped at 48)
    + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(p_waiting_since, now()))) / 3600, 48)::int
  )
$$;
```

**Verify:** Call manually: `SELECT c1_compute_priority_score('Emergency', NULL, NULL, now() - interval '2 hours')` → should return ~402.

---

## Sub-step 1c: Router + sub-routines → new bucket values

**Migration file:** `supabase/migrations/YYYYMMDD_01c_router_bucket_values.sql`

**CRITICAL: All `CREATE OR REPLACE FUNCTION` for the router and sub-routines must come BEFORE the trigger update (1d). Order within this migration matters.**

### Router (`c1_compute_next_action`)

**Changes:**
- Add `awaiting_tenant` check after `on_hold`, before category dispatch
- Values returned by universal section are already correct (`archived`, `dismissed`, `completed`, `on_hold`, `error`)
- No structural changes to the dispatch pattern

**Add after the `on_hold` check (after current line ~93):**
```sql
-- Awaiting tenant: cross-category, after on_hold (on_hold wins if both true)
IF COALESCE(v_ticket.awaiting_tenant, false) = true AND lower(v_ticket.status) = 'open' THEN
  RETURN QUERY SELECT 'waiting'::text, 'awaiting_tenant'::text;
  RETURN;
END IF;
```

### `compute_maintenance_next_action`

**Replace old values with new bucket values:**

| Old return | New return | Line reference |
|-----------|-----------|---------------|
| `'needs_attention', 'pending_review'` | `'needs_action', 'pending_review'` | ~line 134 |
| `'needs_attention', 'handoff_review'` | `'needs_action', 'handoff_review'` | ~line 139 |
| `'needs_attention', 'landlord_needs_help'` | `'needs_action', 'landlord_needs_help'` | ~line 148 |
| `'needs_attention', 'landlord_resolved'` | `'needs_action', 'landlord_resolved'` | ~line 151 |
| `'in_progress', 'landlord_in_progress'` | **REMOVE** — replaced by acceptance metadata | ~line 154 |
| `'in_progress', 'allocated_to_landlord'` | `'waiting', 'allocated_to_landlord'` | ~line 157 |
| `'needs_attention', 'ooh_resolved'` | `'needs_action', 'ooh_resolved'` | ~line 163 |
| `'needs_attention', 'ooh_unresolved'` | `'needs_action', 'ooh_unresolved'` | ~line 166 |
| `'in_progress', 'ooh_in_progress'` | **REMOVE** — replaced by acceptance metadata | ~line 169 |
| `'needs_attention', 'ooh_dispatched'` | `'waiting', 'ooh_dispatched'` (bucket fix!) | ~line 172 |
| `'follow_up', 'job_not_completed'` | `'needs_action', 'job_not_completed'` | ~line 184 |
| `'follow_up', 'landlord_no_response'` | **REMOVE** — timeout replaces this | ~line 188-190 |
| `'in_progress', 'scheduled'` | `'scheduled', 'scheduled'` | ~line 193 |
| `'in_progress', 'awaiting_booking'` | `'waiting', 'awaiting_booking'` | ~line 198 |
| `'needs_attention', 'manager_approval'` | `'needs_action', 'manager_approval'` | ~line 207 |
| `'assign_contractor', 'no_contractors'` | `'needs_action', 'no_contractors'` | ~line 212 |
| `'follow_up', 'landlord_declined'` | `'needs_action', 'landlord_declined'` | ~line 218 |
| `'in_progress', 'awaiting_landlord'` | `'waiting', 'awaiting_landlord'` | ~line 222 |
| `'in_progress', 'awaiting_contractor'` | `'waiting', 'awaiting_contractor'` | ~line 227 |
| `'new', 'new'` | `'needs_action', 'new'` | ~line 231 |

**Remove `landlord_no_response` check entirely** (lines ~188-190):
```sql
-- DELETE THIS BLOCK:
IF lower(p_ticket.job_stage) = 'landlord_no_response' OR lower(p_ticket.job_stage) = 'landlord no response' THEN
  RETURN QUERY SELECT 'follow_up'::text, 'landlord_no_response'::text;
  RETURN;
END IF;
```

**Remove `landlord_in_progress` and `ooh_in_progress` returns.** Replace with:
- Landlord allocated with outcome `'in_progress'` → `'waiting', 'allocated_to_landlord'` (acceptance metadata handles the distinction)
- OOH dispatched with outcome `'in_progress'` → `'waiting', 'ooh_dispatched'` (same pattern)

**Remove `job_stage` checks** (3 locations):
1. `lower(p_ticket.job_stage) IN ('booked', 'scheduled')` → replace with `p_ticket.scheduled_date IS NOT NULL`
2. `lower(p_ticket.job_stage) = 'sent'` → keep `c1_messages.stage` check instead (it already handles this)
3. `landlord_no_response` via job_stage → removed entirely

**Add `reschedule_pending` check BEFORE `scheduled` check:**
```sql
-- Reschedule pending: must go before scheduled check
IF COALESCE(p_ticket.reschedule_requested, false)
   AND p_ticket.reschedule_status = 'pending' THEN
  RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
  RETURN;
END IF;
```

### `compute_compliance_next_action`

**Replace old values:**

| Old return | New return |
|-----------|-----------|
| `'follow_up', 'job_not_completed'` | `'needs_action', 'job_not_completed'` |
| `'in_progress', 'scheduled'` | `'scheduled', 'scheduled'` |
| `'in_progress', 'awaiting_booking'` | `'waiting', 'awaiting_booking'` |
| `'needs_attention', 'manager_approval'` | `'needs_action', 'manager_approval'` |
| `'needs_attention', 'no_contractors'` | `'needs_action', 'no_contractors'` |
| `'in_progress', 'awaiting_landlord'` | `'waiting', 'awaiting_landlord'` |
| `'in_progress', 'awaiting_contractor'` | `'waiting', 'awaiting_contractor'` |
| `'needs_attention', 'compliance_pending'` | `'needs_action', 'compliance_needs_dispatch'` |

**Add `cert_incomplete` check at TOP** (before cert_renewed check):
```sql
-- Incomplete cert: no document or no expiry date
IF p_ticket.compliance_certificate_id IS NOT NULL THEN
  SELECT (cc.document_url IS NULL OR cc.expiry_date IS NULL)
  INTO v_cert_incomplete
  FROM c1_compliance_certificates cc
  WHERE cc.id = p_ticket.compliance_certificate_id;
  
  IF v_cert_incomplete THEN
    RETURN QUERY SELECT 'needs_action'::text, 'cert_incomplete'::text;
    RETURN;
  END IF;
END IF;
```

**Add `reschedule_pending` check** (same as maintenance, before scheduled):
```sql
IF COALESCE(p_ticket.reschedule_requested, false)
   AND p_ticket.reschedule_status = 'pending' THEN
  RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
  RETURN;
END IF;
```

**Remove `job_stage` checks** (same pattern as maintenance — use `scheduled_date IS NOT NULL` and `c1_messages.stage`).

### `compute_rent_arrears_next_action`

**Replace old values:**

| Old return | New return |
|-----------|-----------|
| `'needs_attention', 'rent_partial_payment'` | `'needs_action', 'rent_partial_payment'` |
| `'needs_attention', 'rent_overdue'` | `'needs_action', 'rent_overdue'` |

**No structural changes** — rent sub-routine is simple and doesn't use job_stage.

### New RPCs

**`c1_set_awaiting_tenant(p_ticket_id uuid, p_awaiting boolean, p_reason text)`:**
```sql
CREATE OR REPLACE FUNCTION c1_set_awaiting_tenant(
  p_ticket_id uuid, p_awaiting boolean, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_property_label text;
BEGIN
  SELECT p.address INTO v_property_label
  FROM c1_tickets t JOIN c1_properties p ON t.property_id = p.id
  WHERE t.id = p_ticket_id;

  IF p_awaiting THEN
    UPDATE c1_tickets SET awaiting_tenant = true, tenant_contacted_at = now()
    WHERE id = p_ticket_id;
    PERFORM c1_log_event(p_ticket_id, 'PM_AWAITING_TENANT', 'PM', NULL, v_property_label,
      jsonb_build_object('reason', p_reason));
  ELSE
    UPDATE c1_tickets SET awaiting_tenant = false, tenant_contacted_at = NULL
    WHERE id = p_ticket_id;
    PERFORM c1_log_event(p_ticket_id, 'TENANT_RESPONDED', 'PM', NULL, v_property_label,
      jsonb_build_object('reason', p_reason));
  END IF;
END;
$$;
```

**`c1_submit_contractor_reschedule_request(p_token uuid, p_proposed_date timestamptz, p_reason text)`:**
Mirrors existing `c1_submit_reschedule_request` but for contractor-initiated reschedules. Sets `reschedule_initiated_by = 'contractor'`.

**`c1_mark_contractor_withdrawn(p_ticket_id uuid, p_contractor_id uuid, p_reason text)`:**
Marks contractor withdrawn in `c1_messages.contractors[]` JSONB, cycles to next or sets `no_contractors`. Logs `CONTRACTOR_WITHDRAWN` event. If last contractor, logs both events.

---

## Sub-step 1d: Trigger update — 4-field write + new watch list

**Migration file:** `supabase/migrations/YYYYMMDD_01d_trigger_4field_write.sql`

**MUST come AFTER 1c in the migration file** (router must exist with new values before trigger calls it).

### Update recompute trigger function

```sql
CREATE OR REPLACE FUNCTION public.c1_trigger_recompute_next_action()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_ticket_id UUID;
  v_result RECORD;
BEGIN
  IF TG_TABLE_NAME = 'c1_tickets' THEN
    v_ticket_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'c1_messages' THEN
    v_ticket_id := NEW.ticket_id;
  ELSIF TG_TABLE_NAME = 'c1_job_completions' THEN
    v_ticket_id := NEW.id;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_result FROM c1_compute_next_action(v_ticket_id);

  -- Auto-close: if computed state is 'completed', close the ticket
  IF v_result.next_action IN ('completed') THEN
    UPDATE c1_tickets
    SET status = 'closed',
        resolved_at = COALESCE(resolved_at, now()),
        next_action = v_result.next_action,
        next_action_reason = v_result.next_action_reason,
        waiting_since = now(),
        sla_due_at = NULL  -- terminal state, no SLA
    WHERE id = v_ticket_id
      AND lower(status) != 'closed';
    RETURN NEW;
  END IF;

  -- 4-field write: only when reason actually changes
  UPDATE c1_tickets
  SET next_action = v_result.next_action,
      next_action_reason = v_result.next_action_reason,
      waiting_since = now(),
      sla_due_at = CASE
        WHEN v_result.next_action = 'needs_action' THEN
          CASE
            WHEN (SELECT priority FROM c1_tickets WHERE id = v_ticket_id) = 'Emergency'
              THEN now() + interval '24 hours'
            WHEN v_result.next_action_reason IN ('handoff_review', 'pending_review', 'no_contractors')
              THEN now() + interval '4 hours'
            WHEN v_result.next_action_reason = 'manager_approval'
              THEN now() + interval '24 hours'
            WHEN v_result.next_action_reason = 'job_not_completed'
              THEN now() + interval '24 hours'
            WHEN (SELECT priority FROM c1_tickets WHERE id = v_ticket_id) = 'Urgent'
              THEN now() + interval '48 hours'
            WHEN (SELECT priority FROM c1_tickets WHERE id = v_ticket_id) = 'High'
              THEN now() + interval '48 hours'
            WHEN (SELECT priority FROM c1_tickets WHERE id = v_ticket_id) = 'Medium'
              THEN now() + interval '72 hours'
            ELSE now() + interval '7 days'
          END
        ELSE NULL  -- waiting/scheduled/terminal: no SLA
      END
  WHERE id = v_ticket_id
    AND (next_action IS DISTINCT FROM v_result.next_action
      OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);

  RETURN NEW;
END;
$function$;
```

### Update trigger column watch list

```sql
-- Drop and recreate the trigger with updated column list
DROP TRIGGER IF EXISTS trg_tickets_recompute_next_action ON c1_tickets;

CREATE TRIGGER trg_tickets_recompute_next_action
  AFTER INSERT OR UPDATE OF status, handoff, archived, pending_review,
    on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome,
    awaiting_tenant, reschedule_requested, reschedule_status, priority
  ON public.c1_tickets
  FOR EACH ROW
  EXECUTE FUNCTION c1_trigger_recompute_next_action();
```

**Key changes from current:**
- Added: `awaiting_tenant`, `reschedule_requested`, `reschedule_status`, `priority`
- Removed: `job_stage` (column will be dropped in 1f)

---

## Sub-step 1e: Update write sites (`c1_toggle_hold`)

**Migration file:** `supabase/migrations/YYYYMMDD_01e_toggle_hold_4field.sql`

Update `c1_toggle_hold` to write 4 fields:

```sql
-- Replace the recompute section (current lines ~7092-7096):
UPDATE public.c1_tickets
SET next_action = r.next_action,
    next_action_reason = r.next_action_reason,
    waiting_since = now(),
    sla_due_at = CASE
      WHEN r.next_action = 'needs_action' THEN
        -- ... same SLA CASE as trigger
      ELSE NULL
    END
FROM public.c1_compute_next_action(p_ticket_id) r
WHERE c1_tickets.id = p_ticket_id;
```

---

## Sub-step 1f: Update creation RPCs + remove `job_stage`

**Migration file:** `supabase/migrations/YYYYMMDD_01f_creation_rpcs_and_drop_jobstage.sql`

**IMPORTANT:** Edge functions must be deployed first (Sprint B, Step 4) to remove `job_stage` writes. If deploying Sprint A independently, defer the `DROP COLUMN` to Sprint B and only update the RPCs here.

### Update `c1_create_ticket`
- Remove `job_stage` from INSERT
- Add `waiting_since = now()`
- Add `handoff_reason` (from `_issue->>'handoff_reason'` when `handoff = true`)

### Update `c1_create_manual_ticket`
- Remove `job_stage = 'created'` from INSERT
- Add `waiting_since = now()`
- Add `deadline_date` parameter (set by caller for compliance/rent tickets)

### Update `create_rent_arrears_ticket`
- Remove `job_stage = 'created'` from INSERT
- Add `waiting_since = now()`
- Add `deadline_date` (from rent due date — needs a new parameter or joined from `c1_rent_ledger`)

### Update portal RPCs (⚠️ PROTECTED — requires Adam's approval)
- `c1_get_contractor_ticket`: replace `'job_stage', t.job_stage` → `'next_action_reason', t.next_action_reason`
- `c1_get_tenant_ticket`: same replacement
- `c1_get_landlord_ticket`: same replacement

### Drop `job_stage` column (ONLY after edge functions are deployed)
```sql
ALTER TABLE c1_tickets DROP COLUMN IF EXISTS job_stage;
```

---

## Sub-step 1g: Data backfill

**Migration file:** `supabase/migrations/YYYYMMDD_01g_backfill.sql`

**Order matters. Run sequentially.**

```sql
-- 1. Backfill open tickets via router recompute
-- (router + sub-routines already deployed in 1c, trigger in 1d)
-- Force recompute by touching a watched column:
UPDATE c1_tickets SET status = status WHERE status != 'closed' AND archived = false;

-- 2. Backfill terminal tickets (simple value map)
UPDATE c1_tickets SET next_action = 'needs_action'
WHERE next_action IN ('needs_attention', 'assign_contractor', 'follow_up', 'new');

UPDATE c1_tickets SET next_action = 'waiting'
WHERE next_action = 'in_progress' AND next_action_reason != 'scheduled';

UPDATE c1_tickets SET next_action = 'scheduled'
WHERE next_action = 'in_progress' AND next_action_reason = 'scheduled';

-- 3. Rename compliance_pending on ALL tickets
UPDATE c1_tickets SET next_action_reason = 'compliance_needs_dispatch'
WHERE next_action_reason = 'compliance_pending';

-- 4. Backfill waiting_since
UPDATE c1_tickets SET waiting_since = COALESCE(updated_at, date_logged)
WHERE waiting_since IS NULL;

-- 5. Backfill deadline_date (compliance)
UPDATE c1_tickets t SET deadline_date = cc.expiry_date
FROM c1_compliance_certificates cc
WHERE t.compliance_certificate_id = cc.id
  AND t.category = 'compliance_renewal'
  AND t.deadline_date IS NULL;

-- 6. Backfill deadline_date (rent)
UPDATE c1_tickets t SET deadline_date = rl.due_date
FROM c1_rent_ledger rl
WHERE t.category = 'rent_arrears'
  AND t.tenant_id = rl.tenant_id
  AND rl.status IN ('overdue', 'partial')
  AND t.deadline_date IS NULL;

-- 7. Null out sla_due_at for waiting/scheduled tickets (prevent stale values)
UPDATE c1_tickets SET sla_due_at = NULL
WHERE next_action IN ('waiting', 'scheduled', 'completed', 'archived', 'dismissed', 'on_hold');
```

---

## Sub-step 1h: Update CHECK constraint

**Migration file:** `supabase/migrations/YYYYMMDD_01h_check_constraint.sql`

**Run AFTER backfill confirms no old values remain.**

```sql
-- Drop old constraint
ALTER TABLE c1_tickets DROP CONSTRAINT IF EXISTS chk_next_action_reason;

-- Add new constraint
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
```

**Values added:** `cert_incomplete`, `awaiting_tenant`, `compliance_needs_dispatch`, `reschedule_pending`
**Values removed:** `landlord_no_response`, `landlord_in_progress`, `ooh_in_progress`, `compliance_pending`

---

## Verification

**After all sub-steps:**

- [ ] `supabase db push` succeeds for all migrations
- [ ] `supabase gen types` regenerates TypeScript types
- [ ] No ticket has `next_action` values: `needs_attention`, `assign_contractor`, `follow_up`, `in_progress`
- [ ] No ticket has `next_action_reason` values: `landlord_no_response`, `landlord_in_progress`, `ooh_in_progress`, `compliance_pending`
- [ ] All open tickets have `waiting_since` populated
- [ ] Compliance tickets have `deadline_date` from cert expiry
- [ ] Rent tickets have `deadline_date` from rent due date
- [ ] `sla_due_at` is NULL for all `waiting`/`scheduled`/terminal tickets
- [ ] `sla_due_at` is set for all `needs_action` tickets
- [ ] `c1_compute_priority_score()` returns sensible values
- [ ] Trigger fires on `awaiting_tenant`, `reschedule_requested`, `reschedule_status`, `priority` changes
- [ ] `trg_c1_set_sla` trigger no longer exists
- [ ] Router returns `'waiting', 'ooh_dispatched'` (not `needs_action`)
- [ ] CHECK constraint rejects old values, accepts new values

**Rollback:** Since all data is seed data, rollback = `supabase db reset` if needed. For partial rollback, each sub-step can be reversed independently (DROP columns, restore old function definitions from `supabase/core-rpcs/` backups).
