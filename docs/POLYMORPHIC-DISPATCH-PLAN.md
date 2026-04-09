> **Living Document.** This is the architectural reference for the polymorphic dispatch system. Update this document when sub-routines change, new sub-routines are added, or the CHECK constraint is modified.

# Polymorphic Ticket Dispatch — Full Architecture

## Context

`c1_compute_next_action` is a 150-line protected RPC that calculates every ticket's state. It's category-agnostic today — all tickets flow through the same 11 branches. Compliance already has exceptions scattered elsewhere, and rent has no escalation path after reminders exhaust.

We're refactoring the function into a **~30-line router** that dispatches to domain-specific sub-routines. This makes every flow independently extensible without touching the protected core again. We're also adding rent arrears escalation with a proper payments ledger for audit trail and consolidated per-tenant tickets.

**Principles:**
- Universal states (archived, closed, on_hold) stay inline
- Everything else gets its own sub-routine — except handoff and pending_review (single-state flags)
- Plan for scale and stability, not quick fixes
- Automate the happy path, ticket the exceptions

---

## Target Architecture

### `c1_compute_next_action` — The Router

```sql
-- ── Universal states (inline, always run first) ──────────────
IF NOT FOUND           → 'new' / 'new'
IF archived + handoff  → 'dismissed' / 'dismissed'
IF archived            → 'archived' / 'archived'
IF closed              → 'completed' / 'completed'
IF on_hold             → 'on_hold' / 'on_hold'

-- ── Category dispatch (domain-specific lifecycles) ───────────
-- ── 3 explicit routes (THE LAW) ──────────────────────────────
IF category = 'compliance_renewal' → compute_compliance_next_action()
IF category = 'rent_arrears'       → compute_rent_arrears_next_action()
IF category = 'maintenance'        → compute_maintenance_next_action()
  -- (maintenance owns: landlord, OOH, handoff, pending_review, contractor flow)

-- ── Fail loud ────────────────────────────────────────────────
ELSE → 'error' / 'unknown_category'  (RAISE WARNING)
```

### Design decisions

**Category dispatch runs before lifecycle flags.** A `compliance_renewal` ticket that's also `landlord_allocated` routes to the compliance handler, not the landlord handler. Intentional — compliance renewals follow their own lifecycle. Same for rent arrears. Validated by test case 46.

**`status = 'open'` guard preserved on all lifecycle flag dispatches.** The original function checks this on landlord_allocated, ooh_dispatched, handoff, and pending_review. If status is somehow not 'open' or 'closed', those branches are skipped and we fall through to maintenance. The router preserves this exact behavior. Validated by test case 52.

### Extraction rules

| Sub-routine | Extract? | Reason |
|---|---|---|
| Compliance | Yes | Cert verification, 72h timeout, renewal detection — will grow |
| Rent arrears | Yes | Payment tracking, escalation tiers, formal notice — will grow |
| Landlord | Yes | Auto-dispatch on need_help, cost tracking, timeout — will grow |
| OOH | Yes | Spend caps, landlord notification, post-incident — will grow |
| Maintenance | Yes | Already the biggest branch (~50 lines), contractor dispatch core |
| Handoff | No | 3-line single-state flag, no progression |
| Pending review | No | 3-line single-state flag, no progression |

---

## Sub-routine Definitions

### 1. `compute_compliance_next_action(p_ticket_id, p_ticket)`

```
States returned:
├─ cert renewed (new expiry, reminder_count reset)  → 'completed' / 'cert_renewed'
├─ job not completed (c1_job_completions)            → 'follow_up' / 'job_not_completed'
├─ job completed (c1_job_completions)                → 'completed' / 'completed'
├─ awaiting_manager (c1_messages.stage)              → 'needs_attention' / 'manager_approval'
├─ no_contractors_left (c1_messages.stage)           → 'needs_attention' / 'no_contractors'
├─ awaiting_landlord (c1_messages.stage)             → 'in_progress' / 'awaiting_landlord'
├─ waiting_contractor (c1_messages.stage)            → 'in_progress' / 'awaiting_contractor'
├─ scheduled (job_stage or scheduled_date)           → 'in_progress' / 'scheduled'
├─ sent (job_stage)                                  → 'in_progress' / 'awaiting_booking'
└─ default                                           → 'needs_attention' / 'compliance_pending'
```

Reads from: `c1_compliance_certificates`, `c1_job_completions`, `c1_messages`

**Note:** Replicates `c1_messages.stage` checks from maintenance. Intentional — each handler owns its full lifecycle. If adding a new `c1_messages.stage`, update both handlers.

**Known migration effect:** Existing idle compliance tickets currently show `'new' / 'new'` (fall-through default). After migration they'll show `'needs_attention' / 'compliance_pending'`. This is more correct but will visibly change the PM's dashboard. Expected behavior — note in Phase E verification.

### 2. `compute_rent_arrears_next_action(p_ticket_id, p_ticket)`

Rent arrears tickets are **consolidated per tenant** — one ticket tracks all overdue entries for a tenant. The sub-routine queries the full arrears picture.

```sql
-- Query all overdue/partial entries for this tenant
SELECT
  COUNT(*) AS months_overdue,
  SUM(amount_due - COALESCE(amount_paid, 0)) AS total_arrears,
  MIN(due_date) AS earliest_overdue
FROM c1_rent_ledger
WHERE tenant_id = p_ticket.tenant_id
  AND status IN ('overdue', 'partial');
```

```
States returned:
├─ no overdue entries remain   → 'completed' / 'rent_cleared'
├─ total_arrears > 0, partial  → 'needs_attention' / 'rent_partial_payment'
└─ total_arrears > 0, overdue  → 'needs_attention' / 'rent_overdue'
```

Reads from: `c1_rent_ledger` (aggregation query on tenant_id)

**No `rent_ledger_id` FK needed** — the ticket links to the tenant via the existing `tenant_id` column on `c1_tickets`. The sub-routine dynamically queries all arrears.

**Future additions:**
- Escalation tiers based on `months_overdue` (1 month = soft, 3 months = formal notice)
- `total_arrears` threshold for automatic priority escalation
- Payment plan tracking

### 3. `compute_landlord_next_action(p_ticket_id, p_ticket)`

```
States returned:
├─ outcome = 'need_help'    → 'needs_attention' / 'landlord_needs_help'
├─ outcome = 'resolved'     → 'needs_attention' / 'landlord_resolved'
├─ outcome = 'in_progress'  → 'in_progress' / 'landlord_in_progress'
└─ default (no outcome yet) → 'in_progress' / 'allocated_to_landlord'
```

Reads from: `c1_tickets` (p_ticket passed in — no extra query)

### 4. `compute_ooh_next_action(p_ticket_id, p_ticket)`

```
States returned:
├─ outcome = 'resolved'     → 'needs_attention' / 'ooh_resolved'
├─ outcome = 'unresolved'   → 'needs_attention' / 'ooh_unresolved'
├─ outcome = 'in_progress'  → 'in_progress' / 'ooh_in_progress'
└─ default (no outcome yet) → 'needs_attention' / 'ooh_dispatched'
```

Reads from: `c1_tickets` (p_ticket passed in — no extra query)

### 5. `compute_maintenance_next_action(p_ticket_id, p_ticket)`

Direct extraction of current Branches 9-11 + default. Zero logic change.

```
States returned:
├─ job_not_completed (c1_job_completions)      → 'follow_up' / 'job_not_completed'
├─ landlord_no_response (job_stage)            → 'follow_up' / 'landlord_no_response'
├─ scheduled (job_stage or scheduled_date)     → 'in_progress' / 'scheduled'
├─ sent (job_stage)                            → 'in_progress' / 'awaiting_booking'
├─ completed (c1_job_completions)              → 'completed' / 'completed'
├─ awaiting_manager (c1_messages.stage)        → 'needs_attention' / 'manager_approval'
├─ no_contractors_left (c1_messages.stage)     → 'assign_contractor' / 'no_contractors'
├─ landlord_declined (c1_messages.landlord)    → 'follow_up' / 'landlord_declined'
├─ awaiting_landlord (c1_messages.stage)       → 'in_progress' / 'awaiting_landlord'
├─ waiting_contractor (c1_messages.stage)      → 'in_progress' / 'awaiting_contractor'
└─ default                                     → 'new' / 'new'
```

### Row-type parameter strategy

Sub-routines accept `p_ticket c1_tickets` (PL/pgSQL composite type). No existing function uses this pattern. **Build `compute_landlord_next_action` first** in Phase B to validate before creating the other 4.

### Security model

All 5 sub-routines are `SECURITY DEFINER`. They read from RLS-protected tables (`c1_rent_ledger`, `c1_compliance_certificates`, `c1_messages`, `c1_job_completions`). SECURITY DEFINER ensures they work correctly both when called from the parent function and when tested in isolation.

For Phase B testing in SQL editor:
```sql
BEGIN;
  SET ROLE postgres;  -- matches SECURITY DEFINER context
  SELECT * FROM compute_landlord_next_action('ticket_uuid', (SELECT * FROM c1_tickets WHERE id = 'ticket_uuid'));
ROLLBACK;  -- prevents test data pollution
```

---

## Rent Arrears: Complete Flow

### New table: `c1_rent_payments`

Full audit trail for every payment received. Replaces the single `amount_paid` column as the source of truth.

```sql
CREATE TABLE c1_rent_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_ledger_id uuid NOT NULL REFERENCES c1_rent_ledger(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES c1_tenants(id),
  property_manager_id uuid NOT NULL REFERENCES c1_property_managers(id),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rent_payments_ledger ON c1_rent_payments(rent_ledger_id);
CREATE INDEX idx_rent_payments_tenant ON c1_rent_payments(tenant_id);
```

### Trigger: auto-compute ledger totals on payment

```sql
CREATE OR REPLACE FUNCTION trg_rent_payment_update_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid numeric;
  v_amount_due numeric;
  v_new_status text;
BEGIN
  -- Sum all payments for this ledger entry
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM c1_rent_payments WHERE rent_ledger_id = NEW.rent_ledger_id;

  SELECT amount_due INTO v_amount_due
  FROM c1_rent_ledger WHERE id = NEW.rent_ledger_id;

  -- Determine status
  IF v_total_paid >= v_amount_due THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'overdue'; -- shouldn't happen, but safety
  END IF;

  -- Update ledger entry
  UPDATE c1_rent_ledger
  SET amount_paid = v_total_paid,
      paid_at = CASE WHEN v_new_status = 'paid' THEN now() ELSE paid_at END,
      status = v_new_status
  WHERE id = NEW.rent_ledger_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rent_payments_update
  AFTER INSERT ON c1_rent_payments
  FOR EACH ROW EXECUTE FUNCTION trg_rent_payment_update_ledger();
```

### Modified: `record_rent_payment` (replaces `mark_rent_paid`)

```sql
CREATE OR REPLACE FUNCTION record_rent_payment(
  p_rent_ledger_id uuid,
  p_pm_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_notes text DEFAULT NULL
) RETURNS uuid  -- returns payment ID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tenant_id uuid;
  v_payment_id uuid;
BEGIN
  -- Ownership check
  SELECT tenant_id INTO v_tenant_id
  FROM c1_rent_ledger
  WHERE id = p_rent_ledger_id AND property_manager_id = p_pm_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or access denied'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;

  -- Insert payment (trigger handles ledger update + status)
  INSERT INTO c1_rent_payments (rent_ledger_id, tenant_id, property_manager_id, amount, payment_method, notes)
  VALUES (p_rent_ledger_id, v_tenant_id, p_pm_id, p_amount, p_payment_method, p_notes)
  RETURNING id INTO v_payment_id;

  -- Auto-close rent arrears ticket if ALL arrears for this tenant are now cleared
  IF NOT EXISTS (
    SELECT 1 FROM c1_rent_ledger
    WHERE tenant_id = v_tenant_id
      AND status IN ('overdue', 'partial')
  ) THEN
    UPDATE c1_tickets
    SET status = 'closed', resolved_at = now()
    WHERE tenant_id = v_tenant_id
      AND category = 'rent_arrears'
      AND status = 'open';
  END IF;

  RETURN v_payment_id;
END;
$$;
```

**Why this is better than `mark_rent_paid`:**
- Audit trail: every payment is a row with timestamp, amount, method
- Accumulation: tenant pays £200 then £300 → ledger shows £500 total
- Atomic: trigger computes totals, no application-level math
- Queryable: "show me all payments from Tenant X in March"
- Auto-close: only when ALL arrears for the tenant are cleared

### New function: `create_rent_arrears_ticket`

`c1_create_manual_ticket` requires contractors and creates `c1_messages` for dispatch. Rent arrears have neither. New dedicated function:

```sql
CREATE OR REPLACE FUNCTION create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Dedup: only one open rent_arrears ticket per tenant
  SELECT id INTO v_ticket_id
  FROM c1_tickets
  WHERE tenant_id = p_tenant_id
    AND category = 'rent_arrears'
    AND status = 'open';

  IF FOUND THEN
    -- Ticket already exists — update description with latest arrears info
    UPDATE c1_tickets
    SET issue_description = p_issue_description,
        updated_at = now()
    WHERE id = v_ticket_id;
    RETURN v_ticket_id;
  END IF;

  -- Create new ticket (no c1_messages, no dispatch — PM-only action)
  INSERT INTO c1_tickets (
    status, date_logged, tenant_id, property_id, property_manager_id,
    issue_title, issue_description, category, priority,
    job_stage, verified_by, is_manual, handoff
  ) VALUES (
    'open', now(), p_tenant_id, p_property_id, p_property_manager_id,
    p_issue_title, p_issue_description, 'rent_arrears', 'high',
    'created', 'system', true, false
  ) RETURNING id INTO v_ticket_id;

  -- Trigger fires c1_compute_next_action → routes to rent sub-routine
  -- No c1_messages row needed — no contractor dispatch
  RETURN v_ticket_id;
END;
$$;
```

**Key behaviors:**
- **Dedup built-in**: if tenant already has an open arrears ticket, updates description instead of creating duplicate
- **No `c1_messages`**: no contractor dispatch, no `c1_message_next_action` call
- **Trigger-driven state**: `c1_trigger_recompute_next_action` fires on INSERT, routes to `compute_rent_arrears_next_action`
- **Sets pattern** for future non-contractor ticket types (inspections, tenant notices)

### New RPC: `rent_escalation_check()`

Returns tenants with overdue rent ready for ticket escalation:

```sql
-- Groups by tenant, not by ledger entry
SELECT
  rl.tenant_id,
  rl.property_manager_id,
  r.property_id,
  t.full_name AS tenant_name,
  p.address AS property_address,
  COUNT(*) AS months_overdue,
  SUM(rl.amount_due - COALESCE(rl.amount_paid, 0)) AS total_arrears,
  MIN(rl.due_date) AS earliest_overdue
FROM c1_rent_ledger rl
JOIN c1_rooms r ON r.id = rl.room_id
JOIN c1_properties p ON p.id = r.property_id
LEFT JOIN c1_tenants t ON t.id = rl.tenant_id
WHERE rl.status = 'overdue'
  AND rl.reminder_3_sent_at IS NOT NULL
  AND rl.reminder_3_sent_at < NOW() - INTERVAL '7 days'
GROUP BY rl.tenant_id, rl.property_manager_id, r.property_id, t.full_name, p.address
-- Exclude tenants who already have an open rent_arrears ticket
HAVING NOT EXISTS (
  SELECT 1 FROM c1_tickets tk
  WHERE tk.tenant_id = rl.tenant_id
    AND tk.category = 'rent_arrears'
    AND tk.status = 'open'
);
```

### Edge function: extend `yarro-rent-reminder`

After processing reminders, add escalation pass:
1. Call `rent_escalation_check()`
2. For each tenant → `create_rent_arrears_ticket()` with consolidated arrears info
3. Notify PM via `sendAndLog()`
4. Log via `c1_log_system_event()`

If tenant already has a ticket (dedup in the function), description gets updated with latest arrears totals.

### Dashboard dedup

`c1_get_dashboard_todo_extras` already returns overdue rent as non-ticket items. Once arrears become tickets, exclude:

```sql
-- In rent CTE of c1_get_dashboard_todo_extras:
AND NOT EXISTS (
  SELECT 1 FROM c1_tickets t
  WHERE t.tenant_id = rl.tenant_id
    AND t.category = 'rent_arrears'
    AND t.status = 'open'
)
```

---

## Testing Strategy

### Test format

Pure SQL `DO $$` blocks — runnable in Supabase SQL editor (local or production). No new dependencies.

**Security note:** Sub-routines are not `SECURITY DEFINER`. When tested in isolation (Phase B), run with `SET ROLE postgres` or service_role to ensure table access. In production they're called from the `SECURITY DEFINER` parent so permissions are inherited.

### Phase A: Regression suite (BEFORE any modification)

**File:** `supabase/tests/test_compute_next_action.sql`

18 tests covering every existing branch:

```
TEST 1:  Fresh open ticket                          → 'new' / 'new'
TEST 2:  archived = true                            → 'archived' / 'archived'
TEST 3:  archived + handoff                         → 'dismissed' / 'dismissed'
TEST 4:  status = 'closed'                          → 'completed' / 'completed'
TEST 5:  on_hold = true                             → 'on_hold' / 'on_hold'
TEST 6:  landlord_allocated, no outcome              → 'in_progress' / 'allocated_to_landlord'
TEST 7:  landlord_allocated, need_help               → 'needs_attention' / 'landlord_needs_help'
TEST 8:  landlord_allocated, resolved                → 'needs_attention' / 'landlord_resolved'
TEST 9:  landlord_allocated, in_progress             → 'in_progress' / 'landlord_in_progress'
TEST 10: pending_review = true                       → 'needs_attention' / 'pending_review'
TEST 11: ooh_dispatched, no outcome                  → 'needs_attention' / 'ooh_dispatched'
TEST 12: ooh_dispatched, resolved                    → 'needs_attention' / 'ooh_resolved'
TEST 13: handoff = true                              → 'needs_attention' / 'handoff_review'
TEST 14: job_not_completed (c1_job_completions)      → 'follow_up' / 'job_not_completed'
TEST 15: job_stage = 'booked'                        → 'in_progress' / 'scheduled'
TEST 16: c1_messages.stage = 'awaiting_manager'      → 'needs_attention' / 'manager_approval'
TEST 17: c1_messages.stage = 'no_contractors_left'   → 'assign_contractor' / 'no_contractors'
TEST 18: c1_messages.stage = 'waiting_contractor'    → 'in_progress' / 'awaiting_contractor'
```

### Phase B: Sub-routine + rent infrastructure tests

Build `compute_landlord_next_action` first — validate row-type parameter.

**Sub-routine tests (23 tests):**
```
-- Landlord (BUILD FIRST — validates row-type param)
TEST 19-22: 4 landlord outcome states

-- OOH
TEST 23-26: 4 OOH outcome states

-- Compliance
TEST 27-32: cert_renewed, job_not_completed, awaiting_manager,
            waiting_contractor, scheduled, compliance_pending

-- Maintenance (direct extraction — same as current)
TEST 33-38: job_not_completed, scheduled, awaiting_manager,
            no_contractors, waiting_contractor, default

-- Rent arrears (queries c1_rent_ledger aggregation)
TEST 39: tenant has overdue entries       → 'needs_attention' / 'rent_overdue'
TEST 40: tenant has partial entries       → 'needs_attention' / 'rent_partial_payment'
TEST 41: tenant has no overdue entries    → 'completed' / 'rent_cleared'
```

**Rent infrastructure tests (6 tests):**
```
TEST 42: record_rent_payment → inserts into c1_rent_payments
TEST 43: trigger updates c1_rent_ledger.amount_paid + status
TEST 44: two partial payments accumulate correctly (£200 + £300 = £500)
TEST 45: payment completing full amount → status = 'paid'
TEST 46: create_rent_arrears_ticket → creates ticket with correct fields
TEST 47: create_rent_arrears_ticket called twice for same tenant → dedup (returns existing)
```

### Phase C: Integration tests (after modifying router)

```
-- Regression: re-run tests 1-18 — must produce identical results

-- Dispatch routing
TEST 48: category='compliance_renewal' + fresh       → compliance_pending
TEST 49: category='rent_arrears' + overdue tenant    → rent_overdue
TEST 50: category='Plumbing' + awaiting_manager      → manager_approval
TEST 51: category='Plumbing' + landlord_allocated    → landlord handler

-- Category vs lifecycle flag precedence
TEST 52: compliance_renewal + landlord_allocated     → compliance handler (NOT landlord)

-- Universal state precedence
TEST 53: rent_arrears + on_hold                      → on_hold
TEST 54: rent_arrears + archived                     → archived
TEST 55: compliance_renewal + closed                 → completed
TEST 56: landlord_allocated + on_hold                → on_hold
TEST 57: ooh_dispatched + archived                   → archived

-- Status guard
TEST 58: landlord_allocated + status='weird'         → falls through to maintenance
```

### Phase D: End-to-end (rent escalation)

```
TEST 59: Create overdue ledger entry (reminder_3 sent 10 days ago)
         → invoke rent-reminder → ticket created with category='rent_arrears'
         → next_action = 'needs_attention' / 'rent_overdue'
TEST 60: Second overdue month for same tenant
         → invoke rent-reminder → existing ticket updated (dedup)
TEST 61: record_rent_payment for all overdue entries
         → ticket auto-closed
TEST 62: Re-run edge function → no new ticket (tenant clear)
TEST 63: Verify dashboard_todo_extras excludes tenant with open ticket
```

### Phase E: Production smoke

```
1. Query c1_tickets — no unexpected next_action changes on existing tickets
   EXCEPT: compliance tickets may change from 'new' to 'compliance_pending' (expected)
2. Spot-check 5 open maintenance tickets
3. Spot-check compliance tickets — verify compliance_pending is correct
4. Monitor Telegram alerts 24h
```

**Total: 63 tests across 5 phases.**

---

## Rollback Strategy

**File:** `supabase/rollbacks/rollback_phase_c.sql` — contains the current monolithic `c1_compute_next_action` function. One-file emergency revert.

If Phase C (router migration) breaks production:
1. Deploy `rollback_phase_c.sql` — restores original monolithic function
2. Sub-routines from Phase B become unused functions (no harm)
3. Rent infrastructure (payments table, new functions) remains but isn't triggered (no harm)
4. Only visible change: compliance tickets revert from `compliance_pending` to `new`
5. Total rollback time: one migration deploy (~2 minutes)

Create this file in Phase A alongside the regression tests — copy the current function before any modifications.

---

## Hardening (built into the plan, not deferred)

### CHECK constraint on `next_action_reason` — Phase C

Add alongside the router migration. Turns typos from silent dashboard bugs into loud deploy-time errors.

```sql
ALTER TABLE c1_tickets ADD CONSTRAINT chk_next_action_reason
CHECK (next_action_reason IN (
  -- Universal
  'new', 'archived', 'dismissed', 'completed', 'on_hold',
  -- Maintenance
  'pending_review', 'handoff_review', 'job_not_completed', 'landlord_no_response',
  'scheduled', 'awaiting_booking', 'manager_approval', 'no_contractors',
  'landlord_declined', 'awaiting_landlord', 'awaiting_contractor',
  -- Landlord
  'allocated_to_landlord', 'landlord_needs_help', 'landlord_resolved', 'landlord_in_progress',
  -- OOH
  'ooh_dispatched', 'ooh_resolved', 'ooh_unresolved', 'ooh_in_progress',
  -- Compliance
  'cert_renewed', 'compliance_pending',
  -- Rent
  'rent_overdue', 'rent_partial_payment', 'rent_cleared'
));
```

Future new values: one-line `ALTER TABLE DROP CONSTRAINT` + `ADD CONSTRAINT` in a migration.

### Protect sub-routines — end of Phase C

Once integration tests pass (before production traffic), add all 5 sub-routines + `create_rent_arrears_ticket` + `record_rent_payment` to the protected RPC list. They handle live data from that point — treat them as a single atomic unit with the router.

## Post-ship backlog

1. **Clean up timeout exception** — replace `AND t.compliance_certificate_id IS NULL` in `c1_contractor_timeout_check` with category-based check
2. **Frontend update** — dashboard stat counts + CTA labels for new `next_action_reason` values

---

## Files to Create/Modify

| # | File | What | Protected? |
|---|---|---|---|
| 1 | `supabase/tests/test_compute_next_action.sql` | **New** — regression + integration test suite (63 tests) | N/A |
| 2 | `supabase/rollbacks/rollback_phase_c.sql` | **New** — copy of current monolithic function (emergency revert) | N/A |
| 3 | `supabase/migrations/YYYYMMDD_rent_payments_table.sql` | **New** — `c1_rent_payments` table, trigger, `record_rent_payment` RPC | No |
| 4 | `supabase/migrations/YYYYMMDD_polymorphic_subroutines.sql` | **New** — 5 sub-routines (all SECURITY DEFINER) + `rent_escalation_check` + `create_rent_arrears_ticket` | No |
| 5 | `supabase/migrations/YYYYMMDD_compute_next_action_router.sql` | **New** — `c1_compute_next_action` refactored to router + CHECK constraint on `next_action_reason` | **Yes — protected** |
| 6 | `supabase/migrations/YYYYMMDD_dashboard_extras_dedup.sql` | **New** — exclude rent entries with open tickets from `c1_get_dashboard_todo_extras` | No |
| 7 | `supabase/functions/yarro-rent-reminder/index.ts` | Extend — add escalation pass after reminders | No |
| 8 | `supabase/core-rpcs/ticket-lifecycle.md` | Update — new migration location + add sub-routines to protected list | Docs |
| 9 | `src/components/property-rent-section.tsx` | Update — call `record_rent_payment` instead of `mark_rent_paid` | No |
| 10 | `src/components/rent-payment-dialog.tsx` | Update — call `record_rent_payment` instead of `mark_rent_paid` | No |

**Protected RPC changes: 1** — `c1_compute_next_action` (refactor to router). `c1_create_manual_ticket` NOT modified — rent uses its own `create_rent_arrears_ticket` instead.

---

## Execution Order

```
Phase A — Safety net (no production changes)
  1. Write regression test suite (18 tests)
  2. Copy current c1_compute_next_action → supabase/rollbacks/rollback_phase_c.sql
  3. Run regression tests against local Supabase — green baseline

Phase B — New infrastructure (zero risk to existing system)
  4. Deploy rent_payments table + trigger + record_rent_payment
  5. Test payment accumulation (tests 42-45)
  6. Build compute_landlord_next_action FIRST (SECURITY DEFINER) — validate row-type param
  7. Build remaining 4 sub-routines (all SECURITY DEFINER) + create_rent_arrears_ticket + rent_escalation_check
  8. Run sub-routine tests (tests 19-41) using SET ROLE postgres pattern
  9. Run ticket creation tests (46-47)
  10. Fix anything before proceeding

Phase C — Protected RPC change (the refactor)
  11. Deploy c1_compute_next_action router + CHECK constraint (PROTECTED — Safe Modification Protocol)
  12. Re-run ALL regression tests (1-18) — identical results required
  13. Run integration tests (48-58) — routing, precedence, status guard
  14. Fix anything before proceeding
  15. Add all sub-routines + create_rent_arrears_ticket + record_rent_payment to protected RPC list

Phase D — Rent escalation live
  16. Deploy dashboard_extras_dedup migration
  17. Deploy yarro-rent-reminder escalation extension
  18. Update frontend to call record_rent_payment instead of mark_rent_paid
  19. Run end-to-end tests (59-63)

Phase E — Production verification
  20. Query existing tickets — check for unexpected state changes
      (compliance tickets changing to compliance_pending is EXPECTED)
  21. Dashboard spot-checks
  22. 24h Telegram monitoring
  23. If anything breaks: deploy rollback_phase_c.sql (2-minute revert)

Phase F — Frontend follow-up (separate task)
  24. Dashboard stat counts for new next_action_reason values
  25. CTA labels for rent arrears tickets
```
