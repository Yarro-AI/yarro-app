# Sprint Plan 01: SLA + Priority on Dashboard

## Context
Dashboard todo rows show priority badges but no SLA countdown. PMs can't see how urgent things are at a glance. The `SlaBadge` component exists but isn't wired into the dashboard — only visible inside the ticket drawer.

**Branch:** `fix/yar-226-sla-priority`
**Issues:** YAR-226

---

## Steps

### 1. Protected RPC: Add `sla_due_at` + `scheduled_date` to `c1_get_dashboard_todo` output

**Current version:** `supabase/migrations/20260405600000_dashboard_todo_perf.sql`

Backup current definition, then create new migration:

```sql
-- In JSON output (line ~173), add after sla_breached:
'sla_due_at', s.sla_due_at,
'scheduled_date', s.scheduled_date,
```

Verify `scheduled_date` is in the SELECT (it's in `c1_tickets` column). If not, add `t.scheduled_date` to the scored CTE.

### 2. Update `TodoItem` type

File: `src/components/dashboard/todo-panel.tsx`

Add to `TodoItem` interface (after `sla_breached: boolean`):
```typescript
sla_due_at?: string | null
scheduled_date?: string | null
```

### 3. Add SlaBadge to TodoRow

File: `src/components/dashboard/todo-row.tsx`

- Import `SlaBadge` from `@/components/sla-badge`
- Render after the wait-time `<span>` in the metadata row:
```tsx
{item.sla_due_at && (
  <SlaBadge slaDueAt={item.sla_due_at} priority={item.priority} />
)}
```

### 4. Update rent priority tiers in `c1_get_dashboard_todo_extras`

File: NOT protected — modify directly.
Current version: `supabase/migrations/20260330120000_dashboard_todo_extras.sql`

Create new migration. Update rent section (lines ~247-259):

```sql
'priority', CASE
  WHEN ri.days_overdue >= 14 THEN 'Urgent'
  WHEN ri.days_overdue >= 7 THEN 'High'
  WHEN ri.days_overdue >= 1 THEN 'Medium'
  ELSE 'Normal'
END,
'priority_score', CASE
  WHEN ri.days_overdue >= 14 THEN 130
  WHEN ri.days_overdue >= 7 THEN 90
  WHEN ri.days_overdue >= 1 THEN 60
  ELSE 40
END,
'priority_bucket', CASE
  WHEN ri.days_overdue >= 14 THEN 'URGENT'
  WHEN ri.days_overdue >= 7 THEN 'HIGH'
  ELSE 'NORMAL'
END,
'sla_breached', ri.days_overdue >= 14,
```

---

## Files Modified
- New migration: `c1_get_dashboard_todo` (protected — Safe Modification Protocol)
- New migration: `c1_get_dashboard_todo_extras` rent priority tiers
- `src/components/dashboard/todo-panel.tsx` — TodoItem type
- `src/components/dashboard/todo-row.tsx` — SlaBadge render

## Verification
1. `npm run build` passes
2. Dashboard shows SLA countdown badges on ticket todo rows
3. Rent overdue items show correct priority: Normal (partial, not overdue), Medium (1d), High (7d), Urgent (14d)
4. Items sorted correctly by priority_score
