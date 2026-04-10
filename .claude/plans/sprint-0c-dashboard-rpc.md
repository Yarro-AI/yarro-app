# Sprint C: Dashboard RPC Rewrite

> **Prereq:** Sprint A (backend) + Sprint B (auto-creation + edge functions) complete.
> **Output:** Single RPC returns all dashboard items, stuck override works, priority scoring works, labels move to frontend.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Step 5

---

## Dashboard RPC Rewrite: `c1_get_dashboard_todo`

**Migration file:** `supabase/migrations/YYYYMMDD_05_dashboard_rpc_rewrite.sql`

### Current problems being fixed

1. Timeout logic duplicated 5x (action_type, action_label, action_context, priority_bucket, is_past_timeout)
2. `action_type` is redundant with bucket + stuck override
3. `priority_bucket` re-derives urgency that escalation crons already handle
4. References removed reasons (`landlord_in_progress`, `ooh_in_progress`, `compliance_pending`)
5. `compliance_pending` flagged as timed out — wrong (needs_action states don't timeout)
6. Hardcoded thresholds should be configurable

### New CTE structure

```sql
CREATE OR REPLACE FUNCTION c1_get_dashboard_todo(p_pm_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH
  -- CTE 1: Filter to open, non-archived, non-held tickets for this PM
  pm_tickets AS (
    SELECT t.*
    FROM c1_tickets t
    WHERE t.property_manager_id = p_pm_id
      AND lower(t.status) = 'open'
      AND t.archived = false
      AND COALESCE(t.on_hold, false) = false
  ),

  -- CTE 2: Contractor timing (reads column, no JSONB parse)
  contractor_timing AS (
    SELECT t.id AS ticket_id,
           t.contractor_sent_at
    FROM pm_tickets t
  ),

  -- CTE 3: Timeout check — compute is_past_timeout ONCE per ticket
  timeout_check AS (
    SELECT t.id AS ticket_id,
      CASE
        -- IMPORTANT: needs_action reasons NEVER timeout
        WHEN t.next_action != 'waiting' THEN false
        -- Per-reason timeout thresholds
        WHEN t.next_action_reason = 'awaiting_contractor'
          AND ct.contractor_sent_at IS NOT NULL
          AND now() - ct.contractor_sent_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_booking'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '3 days'
          THEN true
        WHEN t.next_action_reason = 'awaiting_landlord'
          AND now() - COALESCE(t.waiting_since, t.date_logged) >
            make_interval(hours => COALESCE(
              (SELECT landlord_timeout_hours FROM c1_property_managers WHERE id = p_pm_id),
              48))
          THEN true
        WHEN t.next_action_reason = 'allocated_to_landlord'
          AND t.landlord_allocated_at IS NOT NULL
          AND now() - t.landlord_allocated_at > interval '72 hours'
          THEN true
        WHEN t.next_action_reason = 'ooh_dispatched'
          AND t.ooh_dispatched_at IS NOT NULL
          AND now() - t.ooh_dispatched_at > interval '48 hours'
          THEN true
        WHEN t.next_action_reason = 'awaiting_tenant'
          AND t.tenant_contacted_at IS NOT NULL
          AND now() - t.tenant_contacted_at > interval '48 hours'
          THEN true
        -- Scheduled + past date = overdue
        WHEN t.next_action_reason = 'scheduled'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date < CURRENT_DATE
          THEN true
        -- Reschedule pending timeout
        WHEN t.next_action_reason = 'reschedule_pending'
          AND now() - COALESCE(t.waiting_since, t.date_logged) > interval '48 hours'
          THEN true
        ELSE false
      END AS is_past_timeout
    FROM pm_tickets t
    LEFT JOIN contractor_timing ct ON ct.ticket_id = t.id
  ),

  -- CTE 4: Scored + display bucket
  scored AS (
    SELECT
      t.id,
      t.id AS ticket_id,
      t.property_id,
      t.category,
      t.maintenance_trade,
      t.issue_title AS issue_summary,
      -- Display bucket with overrides (order matters — first match wins)
      CASE
        -- 1. Reschedule urgency: PM must call, job is imminent
        WHEN t.next_action_reason = 'reschedule_pending'
          AND t.scheduled_date IS NOT NULL
          AND t.scheduled_date - now() <= interval '24 hours'
          THEN 'needs_action'
        -- 2. Stuck override: waiting + timed out
        WHEN tc.is_past_timeout AND t.next_action = 'waiting'
          THEN 'stuck'
        -- 3. Normal bucket from ticket row
        ELSE t.next_action
      END AS bucket,
      t.next_action,
      t.next_action_reason,
      t.priority,
      c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since) AS priority_score,
      tc.is_past_timeout,
      t.sla_due_at,
      t.deadline_date,
      -- Timing fields for frontend REASON_DISPLAY
      t.waiting_since,
      t.contractor_sent_at,
      t.scheduled_date,
      t.landlord_allocated_at,
      t.ooh_dispatched_at,
      t.tenant_contacted_at,
      -- Compliance-specific
      t.compliance_certificate_id,
      -- Property info
      p.address AS property_label,
      t.date_logged AS created_at,
      -- Reschedule info
      t.reschedule_initiated_by
    FROM pm_tickets t
    LEFT JOIN timeout_check tc ON tc.ticket_id = t.id
    LEFT JOIN c1_properties p ON p.id = t.property_id
  )

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'ticket_id', s.ticket_id,
      'property_id', s.property_id,
      'category', s.category,
      'maintenance_trade', s.maintenance_trade,
      'issue_summary', s.issue_summary,
      'bucket', s.bucket,
      'next_action', s.next_action,
      'next_action_reason', s.next_action_reason,
      'priority', s.priority,
      'priority_score', s.priority_score,
      'is_past_timeout', s.is_past_timeout,
      'sla_due_at', s.sla_due_at,
      'deadline_date', s.deadline_date,
      'waiting_since', s.waiting_since,
      'contractor_sent_at', s.contractor_sent_at,
      'scheduled_date', s.scheduled_date,
      'landlord_allocated_at', s.landlord_allocated_at,
      'ooh_dispatched_at', s.ooh_dispatched_at,
      'tenant_contacted_at', s.tenant_contacted_at,
      'compliance_certificate_id', s.compliance_certificate_id,
      'property_label', s.property_label,
      'created_at', s.created_at,
      'reschedule_initiated_by', s.reschedule_initiated_by
    )
    ORDER BY s.priority_score DESC, s.waiting_since ASC
  ) INTO v_result
  FROM scored s;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
```

### What's eliminated from output

| Old field | Replacement |
|-----------|-------------|
| `action_type` | `bucket` + `is_past_timeout` |
| `action_label` | Frontend `REASON_DISPLAY` mapping |
| `action_context` | Frontend `REASON_DISPLAY` mapping |
| `priority_bucket` | `priority` (read directly) |
| `source_type` | All items are tickets; `category` tells you the type |
| `sla_breached` | `sla_due_at < now()` (frontend can compute, or part of priority_score) |

### What's new in output

| New field | Purpose |
|-----------|---------|
| `bucket` | Display bucket with stuck/reschedule overrides applied |
| `contractor_sent_at` | For stuck context: "Contractor notified X days ago" |
| `tenant_contacted_at` | For stuck context: "Tenant contacted X days ago" |
| `deadline_date` | For compliance/rent time pressure display |
| `sla_due_at` | For SLA proximity display |
| `reschedule_initiated_by` | For reschedule context: who we're waiting for |

### Hardcoded thresholds (with comments for future extraction)

```sql
-- TODO: extract to c1_property_managers columns
-- contractor_timeout_hours DEFAULT 48
-- booking_timeout_days DEFAULT 3
-- landlord_allocation_timeout_hours DEFAULT 72
-- ooh_timeout_hours DEFAULT 48
-- tenant_timeout_hours DEFAULT 48
```

Currently only `landlord_timeout_hours` exists on `c1_property_managers` — used in the `awaiting_landlord` check. Rest are hardcoded with clear DEFAULT comments.

---

## Verification

- [ ] `supabase db push` succeeds
- [ ] `supabase gen types` regenerated
- [ ] RPC returns all open tickets for PM
- [ ] `bucket` field: `needs_action`, `waiting`, `scheduled`, or `stuck`
- [ ] `stuck` only appears for `waiting` tickets with `is_past_timeout = true`
- [ ] `needs_action` override works for imminent reschedules (scheduled_date ≤ 24h)
- [ ] `priority_score` returns sensible values (Emergency > Urgent > High > etc.)
- [ ] `ooh_dispatched` appears with `bucket = 'waiting'` (not needs_action)
- [ ] No `action_type`, `action_label`, `action_context`, `priority_bucket` in output
- [ ] All timing fields present for frontend REASON_DISPLAY
- [ ] Sort order: highest priority_score first, then oldest waiting_since
- [ ] Empty portfolio returns `[]` (not NULL)
