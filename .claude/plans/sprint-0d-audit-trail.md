# Sprint D: Audit Trail

> **Prereq:** Sprint C (dashboard RPC) complete.
> **Output:** STATE_CHANGED events fire on every transition, c1_ledger dropped, audit page reads c1_events only.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Step 6

---

## Part 1: Add STATE_CHANGED to recompute trigger

**Migration file:** `supabase/migrations/YYYYMMDD_06a_state_changed_events.sql`

Update `c1_trigger_recompute_next_action` to log a `STATE_CHANGED` event when `next_action_reason` changes:

```sql
-- Inside the trigger function, AFTER the UPDATE that writes 4 fields:
-- Add event logging when reason actually changed

-- Store old values before update
v_old_reason := (SELECT next_action_reason FROM c1_tickets WHERE id = v_ticket_id);
v_old_bucket := (SELECT next_action FROM c1_tickets WHERE id = v_ticket_id);

-- ... (existing UPDATE) ...

-- Log state change event (only when reason changed)
IF v_old_reason IS DISTINCT FROM v_result.next_action_reason THEN
  -- Resolve property_label for the event
  SELECT p.address INTO v_property_label
  FROM c1_tickets t JOIN c1_properties p ON t.property_id = p.id
  WHERE t.id = v_ticket_id;

  PERFORM c1_log_event(
    v_ticket_id,
    'STATE_CHANGED',
    'system',
    NULL,
    v_property_label,
    jsonb_build_object(
      'from_bucket', v_old_bucket,
      'to_bucket', v_result.next_action,
      'from_reason', v_old_reason,
      'to_reason', v_result.next_action_reason
    )
  );
END IF;
```

**Key:** The event is logged in the same trigger function as the UPDATE, so it's the same transaction. If `c1_log_event` fails, the state change rolls back.

---

## Part 2: Add events to auto-creation RPCs

**Migration file:** `supabase/migrations/YYYYMMDD_06b_auto_ticket_events.sql`

### `c1_compliance_auto_ticket()` — already has `AUTO_TICKET_COMPLIANCE` (added in Sprint B)

### `create_rent_arrears_ticket()` — already has `AUTO_TICKET_RENT` (added in Sprint B)

### PM action RPCs — add events

Add to relevant PM action RPCs (in same transaction):

| RPC | Event | Metadata |
|-----|-------|----------|
| Triage/approve action | `PM_TRIAGED` | `{ category, maintenance_trade, priority }` |
| Priority change action | `PM_PRIORITY_CHANGED` | `{ from_priority, to_priority, reason }` |
| Reassign action | `PM_REASSIGNED` | `{ from_contractor, to_contractor }` |
| Bypass approval | `PM_BYPASSED_APPROVAL` | `{ quote_amount, reason }` |

### Reschedule RPCs — add events

| RPC | Event | Metadata |
|-----|-------|----------|
| `c1_submit_reschedule_request` (tenant) | `RESCHEDULE_REQUESTED` | `{ initiated_by: 'tenant', proposed_date, reason, original_date }` |
| `c1_submit_contractor_reschedule_request` | `RESCHEDULE_REQUESTED` | `{ initiated_by: 'contractor', proposed_date, reason, original_date }` |
| Reschedule decision RPC | `RESCHEDULE_DECIDED` | `{ decided_by, approved, new_date, original_date }` |

### `c1_mark_contractor_withdrawn` — add event (already specified in Sprint A)

Logs `CONTRACTOR_WITHDRAWN` with `{ contractor_name, reason, remaining_contractors }`.
If last contractor: logs BOTH `CONTRACTOR_WITHDRAWN` AND `STATE_CHANGED` to `no_contractors`.

---

## Part 3: TIMEOUT events

**Migration file:** `supabase/migrations/YYYYMMDD_06c_timeout_events.sql`

### TIMEOUT_TRIGGERED

Add to timeout detection logic (either in dashboard RPC or a new dedicated cron). When `is_past_timeout` flips to true:

```sql
-- Dedup: only log once per timeout period per ticket
INSERT INTO c1_events (ticket_id, event_type, actor_type, property_label, metadata)
SELECT t.id, 'TIMEOUT_TRIGGERED', 'system', p.address,
  jsonb_build_object(
    'reason', t.next_action_reason,
    'threshold_hours', 48,  -- or the actual threshold used
    'waiting_since', t.waiting_since
  )
FROM c1_tickets t
JOIN c1_properties p ON t.property_id = p.id
WHERE t.id = v_ticket_id
  AND NOT EXISTS (
    SELECT 1 FROM c1_events e
    WHERE e.ticket_id = t.id
      AND e.event_type = 'TIMEOUT_TRIGGERED'
      AND e.metadata->>'reason' = t.next_action_reason
      AND e.occurred_at > t.waiting_since  -- only dedup within current wait period
  );
```

### TIMEOUT_RESOLVED

Add to message trigger (`trg_c1_events_on_message`): when stage changes and a timeout existed for the current reason:

```sql
-- Log when a response arrives after a timeout
PERFORM c1_log_event(
  v_ticket_id,
  'TIMEOUT_RESOLVED',
  COALESCE(v_actor_type, 'system'),
  v_actor_name,
  v_property_label,
  jsonb_build_object(
    'reason', v_old_reason,
    'response_after_hours', EXTRACT(EPOCH FROM (now() - v_waiting_since)) / 3600,
    'actor_name', v_actor_name
  )
);
```

---

## Part 4: Delete `c1_ledger`

**Migration file:** `supabase/migrations/YYYYMMDD_06d_drop_ledger.sql`

**Order matters — triggers first, then table:**

```sql
-- 1. Drop triggers that fire on c1_tickets and write TO c1_ledger
DROP TRIGGER IF EXISTS trg_c1_ledger_insert ON c1_tickets;
DROP TRIGGER IF EXISTS trg_c1_ledger_update ON c1_tickets;

-- 2. Drop the trigger functions
DROP FUNCTION IF EXISTS c1_ledger_on_ticket_insert();
DROP FUNCTION IF EXISTS c1_ledger_on_ticket_update();

-- 3. Drop the table
DROP TABLE IF EXISTS c1_ledger;
```

---

## Part 5: Frontend audit changes

### `src/lib/audit-utils.ts` — update CAUSAL_ORDER

**Current (lines 20-39):**
```typescript
ISSUE_CREATED: 0, ISSUE_REPORTED: 0,
PRIORITY_CLASSIFIED: 1, PRIORITY_CHANGED: 1,
HANDOFF_CREATED: 2, HANDOFF_CHANGED: 2,
CONTRACTOR_ASSIGNED: 3, OOH_DISPATCHED: 3, LANDLORD_ALLOCATED: 3,
LANDLORD_APPROVED: 4, LANDLORD_DECLINED: 4,
QUOTE_RECEIVED: 5, QUOTE_APPROVED: 5, QUOTE_DECLINED: 5,
JOB_SCHEDULED: 6,
JOB_COMPLETED: 7,
TICKET_CLOSED: 8,
TICKET_ARCHIVED: 9
```

**Add new event types:**
```typescript
// New events — insert at appropriate causal positions
STATE_CHANGED: 2,              // Generic state transition
PM_TRIAGED: 2,
PM_AWAITING_TENANT: 2,
TENANT_RESPONDED: 2,
PM_PRIORITY_CHANGED: 1,
PM_REASSIGNED: 3,
PM_BYPASSED_APPROVAL: 4,
AUTO_TICKET_COMPLIANCE: 0,
AUTO_TICKET_RENT: 0,
TIMEOUT_TRIGGERED: 5,
TIMEOUT_RESOLVED: 5,
RESCHEDULE_REQUESTED: 6,
RESCHEDULE_DECIDED: 6,
CONTRACTOR_WITHDRAWN: 3,
OOH_ACCEPTED: 3,
LANDLORD_ACCEPTED: 3,
```

### `src/hooks/use-ticket-audit.ts` — remove c1_ledger

**Current:** Fetches `c1_events` + `c1_ledger`, merges into `unifiedTimeline`, deduplicates.

**Changes:**
1. Remove `c1_ledger` fetch (lines ~107-111)
2. Remove `LedgerEntry` type references
3. Remove merge logic (lines ~205-273) — `c1_events` is now the sole source
4. Remove dedup logic — no longer needed without dual sources
5. Keep CAUSAL_ORDER sorting for event display order

**After:** Hook fetches `c1_events` only, sorts by `occurred_at` (with CAUSAL_ORDER for same-timestamp tiebreaking).

### `src/hooks/use-ticket-detail.ts` — remove c1_ledger

Remove the `c1_ledger` fetch (lines ~482-486) and `LedgerEntry` type.

### `src/components/audit-profile/audit-timeline.tsx` — update for new events

Add display rendering for new event types:
- `STATE_CHANGED` → "State changed: {from_reason} → {to_reason}"
- `TIMEOUT_TRIGGERED` → "Timeout: {reason} — no response for {threshold_hours}h"
- `TIMEOUT_RESOLVED` → "Response received after {response_after_hours}h"
- `AUTO_TICKET_COMPLIANCE` → "Auto-created: compliance ticket"
- `AUTO_TICKET_RENT` → "Auto-created: rent arrears ticket"
- `PM_TRIAGED` → "PM triaged ticket"
- `RESCHEDULE_REQUESTED` → "Reschedule requested by {initiated_by}"
- `CONTRACTOR_WITHDRAWN` → "Contractor {contractor_name} withdrawn — {reason}"

Remove any ledger source handling from the component.

---

## Verification

- [ ] `supabase db push` succeeds
- [ ] `supabase gen types` regenerated
- [ ] `c1_ledger` table does not exist
- [ ] No frontend references to `c1_ledger` remain
- [ ] `STATE_CHANGED` events appear in `c1_events` when ticket state changes
- [ ] `TIMEOUT_TRIGGERED` deduplicates (only one per timeout period per ticket)
- [ ] `TIMEOUT_RESOLVED` logged when response arrives after timeout
- [ ] `AUTO_TICKET_*` events logged for cron-created tickets
- [ ] Audit timeline page loads without errors
- [ ] Audit timeline shows events from `c1_events` only — no dedup logic
- [ ] New event types render with appropriate labels
- [ ] `npm run build` passes
