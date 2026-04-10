# Sprint Plan 08: Rent Priority Auto-Escalation in Ticket System

## Context
Once rent overdue items become tickets (Sprint 02), their priority needs to auto-escalate over time. This sprint ensures the `compute_rent_arrears_next_action` sub-routine updates ticket priority based on Adam's confirmed tiers every time the polymorphic router evaluates the ticket.

**Branch:** `fix/yar-226-rent-escalation`
**Issues:** YAR-226 (completion)
**Depends on:** Sprint 01 + Sprint 02

**Note:** This may be merged into Sprint 02 during implementation if it's small enough. Separated here for clarity of the protected RPC change.

---

## Steps

### 1. Protected RPC: `compute_rent_arrears_next_action`

**Current version:** `supabase/migrations/20260404300000_polymorphic_subroutines.sql` line 148

The function currently checks overdue/partial state and returns next_action + reason. Add priority escalation at the top:

```sql
-- Auto-escalate priority based on ticket age
v_days_open := EXTRACT(DAY FROM now() - p_ticket.date_logged)::integer;
v_new_priority := CASE
  WHEN v_days_open >= 14 THEN 'Urgent'
  WHEN v_days_open >= 7 THEN 'High'
  ELSE 'Medium'
END;

IF p_ticket.priority IS DISTINCT FROM v_new_priority THEN
  UPDATE c1_tickets SET priority = v_new_priority WHERE id = p_ticket_id;
  -- Log the escalation
  PERFORM c1_log_event(
    p_ticket_id,
    'PRIORITY_CHANGED',
    'system',
    'System',
    jsonb_build_object(
      'old_priority', p_ticket.priority,
      'new_priority', v_new_priority,
      'reason', 'rent_age_escalation',
      'days_open', v_days_open
    )
  );
END IF;
```

Add `v_days_open integer; v_new_priority text;` to DECLARE block.

### 2. Verify escalation triggers

The router (`c1_compute_next_action`) is called:
- On ticket INSERT via trigger
- On ticket UPDATE via trigger
- On message insert via `c1_message_next_action`

For rent tickets without messages, the trigger fires on any ticket update. The `yarro-rent-reminder` edge function can also call the RPC periodically, or a simple cron can UPDATE all open rent_arrears tickets to trigger re-evaluation:

```sql
-- Optional: cron to trigger re-evaluation daily
UPDATE c1_tickets SET updated_at = now() 
WHERE category = 'rent_arrears' AND status = 'open';
```

This is lightweight — the trigger fires, router dispatches to rent sub-routine, priority escalates if needed.

---

## Files Modified
- New migration: `compute_rent_arrears_next_action` (protected — Safe Modification Protocol)
- Possibly: new cron migration for daily rent ticket re-evaluation

## Verification
1. `npm run build` passes (no frontend changes)
2. SQL test: Create a rent_arrears ticket with date_logged 8 days ago → verify priority updates to 'High'
3. SQL test: Create a rent_arrears ticket with date_logged 15 days ago → verify priority updates to 'Urgent'
4. Audit trail shows PRIORITY_CHANGED events with rent_age_escalation reason
