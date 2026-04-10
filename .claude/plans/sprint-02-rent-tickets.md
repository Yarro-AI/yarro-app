# Sprint Plan 02: Rent Overdue → Real Tickets from Day 1

## Context
Rent overdue items currently appear as pseudo-items from `c1_get_dashboard_todo_extras`. They have no ticket_id, can't open in the ticket drawer, and route to the wrong page. The entire rent-as-tickets pipeline already exists (`create_rent_arrears_ticket`, `compute_rent_arrears_next_action`, polymorphic dispatch) — it just triggers too late (after 3 reminders + 7 days). We're moving ticket creation to day 1 of overdue.

**Branch:** `fix/yar-222-223-rent-as-tickets`
**Issues:** YAR-222, YAR-223
**Depends on:** Sprint 01 (priority tiers)

---

## Steps

### 1. Protected RPC: Update `create_rent_arrears_ticket` to accept priority

**Current version:** `supabase/migrations/20260404300000_polymorphic_subroutines.sql` line 278

Backup current, new migration. Add `p_priority text DEFAULT 'Medium'` parameter:
```sql
CREATE OR REPLACE FUNCTION public.create_rent_arrears_ticket(
  p_property_manager_id uuid,
  p_property_id uuid,
  p_tenant_id uuid,
  p_issue_title text,
  p_issue_description text,
  p_priority text DEFAULT 'Medium'  -- NEW
)
```
Change line 311: `'rent_arrears', 'high',` → `'rent_arrears', p_priority,`

### 2. Protected RPC: Add priority escalation to `compute_rent_arrears_next_action`

**Current version:** `supabase/migrations/20260404300000_polymorphic_subroutines.sql` line 148

Add at the START of the function (before the overdue check), update ticket priority based on age:
```sql
-- Auto-escalate priority based on ticket age
DECLARE
  v_days_open integer;
  v_new_priority text;
BEGIN
  v_days_open := EXTRACT(DAY FROM now() - p_ticket.date_logged)::integer;
  v_new_priority := CASE
    WHEN v_days_open >= 14 THEN 'Urgent'
    WHEN v_days_open >= 7 THEN 'High'
    ELSE 'Medium'
  END;
  
  IF p_ticket.priority IS DISTINCT FROM v_new_priority THEN
    UPDATE c1_tickets SET priority = v_new_priority WHERE id = p_ticket_id;
  END IF;
  
  -- ... rest of existing logic
```

### 3. Trigger ticket creation on first overdue in edge function

File: `supabase/functions/yarro-rent-reminder/index.ts`

After the reminder processing loop (line ~247), before the existing escalation pass (line ~252), add a new pass:

```typescript
// ─── Early ticket creation: create tickets for day-1 overdue ───
const overdueEntries = (entries as RentReminder[]).filter(
  e => e.status === 'overdue' && e.reminder_level >= 2  // at least due-date reminder sent
);

for (const entry of overdueEntries) {
  const daysOverdue = Math.floor(
    (Date.now() - new Date(entry.due_date).getTime()) / 86400000
  );
  const priority = daysOverdue >= 14 ? 'Urgent' 
    : daysOverdue >= 7 ? 'High' : 'Medium';
  
  const title = `Rent overdue: ${entry.tenant_name || 'Tenant'} — Room ${entry.room_number}`;
  const desc = `£${Number(entry.amount_due).toFixed(2)} overdue since ${formatFriendlyDate(entry.due_date)}`;
  
  const { error } = await supabase.rpc("create_rent_arrears_ticket", {
    p_property_manager_id: entry.property_manager_id,
    p_property_id: entry.property_id,  // need to get this — see note below
    p_tenant_id: entry.tenant_id,
    p_issue_title: title,
    p_issue_description: desc,
    p_priority: priority,
  });
  // RPC already deduplicates — safe to call repeatedly
}
```

**Note:** `RentReminder` type doesn't include `property_id` — only `room_id`. May need to join through `c1_rooms` in `get_rent_reminders_due` or add `property_id` to its output. Check and add if missing.

### 4. Remove rent pseudo-items from `c1_get_dashboard_todo_extras`

New migration. Remove the rent UNION ALL section (lines ~225-262 of `20260330120000_dashboard_todo_extras.sql`). Rent items now come through `c1_get_dashboard_todo` as real tickets.

Keep: compliance, tenancy, and handoff sections.

### 5. Fix `getTodoHref()` — stop navigating away

File: `src/components/dashboard/todo-panel.tsx` lines 160-174

```typescript
export function getTodoHref(item: TodoItem): string | null {
  const src = item.source_type || 'ticket'
  const isTicket = item.id.startsWith('todo_')
  if (isTicket && src === 'compliance') return null
  if (src === 'compliance') {
    return item.next_action_reason === 'compliance_missing'
      ? `/properties/${item.property_id}`
      : `/compliance/${item.entity_id}`
  }
  if (src === 'tenancy') return `/properties/${item.property_id}`
  // Everything else (tickets, rent tickets, handoffs) → return null → opens drawer
  return null
}
```

Removed:
- `if (src === 'rent' || src === 'tenancy')` → rent removed (now tickets), tenancy kept
- `if (item.next_action_reason === 'handoff_review')` → removed, opens drawer
- `if (item.next_action_reason === 'pending_review')` → removed, opens drawer

---

## Files Modified
- New migration: `create_rent_arrears_ticket` (protected)
- New migration: `compute_rent_arrears_next_action` (protected)
- New migration: `c1_get_dashboard_todo_extras` (remove rent section)
- `supabase/functions/yarro-rent-reminder/index.ts` — early ticket creation
- `src/components/dashboard/todo-panel.tsx` — fix getTodoHref()
- Possibly: `get_rent_reminders_due` RPC if property_id not in output

## Verification
1. `npm run build` passes
2. Overdue rent creates a ticket visible in dashboard todo
3. Clicking rent todo opens ticket drawer (not navigates to /properties)
4. Clicking handoff/pending_review todos opens ticket drawer (not navigates to /tickets)
5. Rent ticket priority auto-escalates: Medium → High (7d) → Urgent (14d)
6. Paying rent clears the ticket (compute_rent_arrears_next_action returns 'rent_cleared')
