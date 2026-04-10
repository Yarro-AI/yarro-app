# Plan: Dashboard Priority Filter (YAR-225)

## Context
Dashboard todo items are sorted by `priority_score` but PMs can't filter by priority level. During busy periods, PMs need to focus on urgent items only. The sprint plan (`sprint-04-priority-filter.md`) specifies adding filter pills above the jobs list, but the current dashboard uses a **category card accordion** layout (Maintenance / Compliance / Finance), not a flat `JobsList`. The filter needs to work with `TodoCategoryCard` components, filtering items *within* each category.

## Approach

Single file change: `src/app/(dashboard)/page.tsx`

### 1. Add priority filter state

After existing state declarations (~line 246):
```typescript
const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'NORMAL'>('ALL')
```

### 2. Apply filter to category sub-lists

Modify the existing `maintenanceTodos`, `complianceTodos`, `financeTodos` memos (lines 380-385) to chain a priority filter. Add a shared filter helper + `filteredActionable`:

```typescript
const applyPriorityFilter = (items: TodoItem[]) =>
  priorityFilter === 'ALL'
    ? items
    : items.filter(i =>
        priorityFilter === 'NORMAL'
          ? i.priority_bucket === 'NORMAL' || i.priority_bucket === 'LOW'
          : i.priority_bucket === priorityFilter
      )

const filteredActionable = useMemo(() => applyPriorityFilter(actionable), [actionable, priorityFilter])
```

Then update the three category memos to filter from `filteredActionable` instead of `actionable`.

### 3. Compute priority counts from unfiltered `actionable`

```typescript
const priorityCounts = useMemo(() => ({
  ALL: actionable.length,
  URGENT: actionable.filter(i => i.priority_bucket === 'URGENT').length,
  HIGH: actionable.filter(i => i.priority_bucket === 'HIGH').length,
  NORMAL: actionable.filter(i => i.priority_bucket === 'NORMAL' || i.priority_bucket === 'LOW').length,
}), [actionable])
```

### 4. Render filter pills in the "Needs action" header area

Insert between the header div (line 520) and the category cards div (line 528). Use the existing pill pattern from compliance page (`rounded-full`, `bg-primary text-primary-foreground` when active):

```tsx
<div className="flex gap-2 px-5 pb-3 flex-shrink-0">
  {PRIORITY_FILTERS.map(f => (
    <button
      key={f.key}
      onClick={() => setPriorityFilter(f.key)}
      className={cn(
        'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
        priorityFilter === f.key
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-transparent border-border text-muted-foreground hover:bg-muted/50'
      )}
    >
      {f.label} <span className={cn('ml-1', priorityFilter === f.key ? 'opacity-70' : '')}>{priorityCounts[f.key]}</span>
    </button>
  ))}
</div>
```

Constants (top of file or above render):
```typescript
const PRIORITY_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'URGENT', label: 'Urgent' },
  { key: 'HIGH', label: 'High' },
  { key: 'NORMAL', label: 'Normal' },
] as const
```

### 5. Update totalTasks badge

The `totalTasks` count in the header badge (line 522-526) should reflect the filtered count so it stays consistent with what's shown:
```typescript
const totalTasks = filteredActionable.length  // instead of actionable.length
```

---

## Key Decisions
- **LOW grouped into NORMAL** — per sprint plan, most items are Normal or above
- **Filter applied to category sub-lists** — not the flat list, since dashboard uses accordion categories
- **Counts from unfiltered list** — so users always see how many items exist per priority level
- **Pill style matches compliance page** — `rounded-full` pills with semantic color tokens

## Files Modified
- `src/app/(dashboard)/page.tsx` — filter state, priority counts, pills UI, filtered category lists

## Verification
1. `npm run build` passes
2. Filter pills appear below "Needs action" header with correct counts
3. Clicking "Urgent" shows only urgent items across all categories
4. "All" shows everything, empty categories auto-hide (existing `items.length === 0` guard in `TodoCategoryCard`)
5. Filter persists while expanding/collapsing categories and opening drawers
6. `totalTasks` badge updates to match filtered count
