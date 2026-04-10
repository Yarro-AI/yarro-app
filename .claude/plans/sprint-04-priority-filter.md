# Sprint Plan 04: Dashboard Priority Filter

## Context
Dashboard todo items are sorted by priority_score but PMs can't filter by priority level. During busy periods, PMs need to focus on urgent items only.

**Branch:** `feat/yar-225-priority-filter`
**Issues:** YAR-225

---

## Steps

### 1. Add priority filter state

File: `src/app/(dashboard)/page.tsx`

```typescript
const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'NORMAL'>('ALL')
```

### 2. Filter actionable items

After computing `actionable` list:
```typescript
const filteredActionable = priorityFilter === 'ALL' 
  ? actionable 
  : actionable.filter(i => i.priority_bucket === priorityFilter)
```

Pass `filteredActionable` to `JobsList` instead of `actionable`.

### 3. Add filter pills UI

Render above `JobsList`, inside the Needs Action panel header area. Use same pill pattern as rent page:

```tsx
const PRIORITY_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'URGENT', label: 'Urgent' },
  { key: 'HIGH', label: 'High' },
  { key: 'NORMAL', label: 'Normal' },
] as const

// Counts
const priorityCounts = {
  ALL: actionable.length,
  URGENT: actionable.filter(i => i.priority_bucket === 'URGENT').length,
  HIGH: actionable.filter(i => i.priority_bucket === 'HIGH').length,
  NORMAL: actionable.filter(i => i.priority_bucket === 'NORMAL' || i.priority_bucket === 'LOW').length,
}

// Render
<div className="flex gap-2 px-4 pb-2">
  {PRIORITY_FILTERS.map(f => (
    <button
      key={f.key}
      onClick={() => setPriorityFilter(f.key)}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors',
        priorityFilter === f.key
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {f.label} ({priorityCounts[f.key]})
    </button>
  ))}
</div>
```

Note: LOW items grouped into NORMAL count for simplicity — most items are Normal or above.

---

## Files Modified
- `src/app/(dashboard)/page.tsx` — filter state, pills UI, filtered list

## Verification
1. `npm run build` passes
2. Filter pills appear above todo list with counts
3. Clicking a pill filters items correctly
4. "All" shows everything, counts are accurate
5. Filter persists while interacting with drawers
