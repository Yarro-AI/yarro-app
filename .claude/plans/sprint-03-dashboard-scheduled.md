# Sprint Plan 03: Dashboard — In Progress + Scheduled Section

## Context
The dashboard right column shows all in-progress items mixed together. Scheduled jobs (contractor booked for a specific date) should be visually separated from items waiting on responses. PMs need to see "what's scheduled when" at a glance.

**Branch:** `feat/yar-221-dashboard-scheduled`
**Issues:** YAR-221
**Depends on:** Sprint 01 (scheduled_date now in TodoItem)

---

## Steps

### 1. Split inProgressItems into two sub-lists

File: `src/app/(dashboard)/page.tsx`

After `filterInProgress(allItems)`, split:
```typescript
const scheduledItems = inProgressItems.filter(
  i => i.next_action_reason === 'scheduled'
)
const awaitingItems = inProgressItems.filter(
  i => i.next_action_reason !== 'scheduled'
)
```

### 2. Render two sections in the right column

Replace the single `inProgressItems.map(...)` with two sections:

```tsx
{/* In Progress section */}
{awaitingItems.length > 0 && (
  <>
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 px-4 pt-3 pb-1">
      In Progress ({awaitingItems.length})
    </h3>
    {awaitingItems.map(item => (
      <TodoRow key={item.id} item={item} onHandoffClick={() => {}} onTicketClick={(i) => openTicket(i.ticket_id)} />
    ))}
  </>
)}

{/* Scheduled section */}
{scheduledItems.length > 0 && (
  <>
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 px-4 pt-3 pb-1">
      Scheduled ({scheduledItems.length})
    </h3>
    {scheduledItems.map(item => (
      <TodoRow key={item.id} item={item} onHandoffClick={() => {}} onTicketClick={(i) => openTicket(i.ticket_id)} />
    ))}
  </>
)}
```

### 3. Show scheduled date on scheduled items

File: `src/components/dashboard/todo-row.tsx`

If `item.scheduled_date` exists, show it alongside the wait-time:
```tsx
{item.scheduled_date && (
  <span className="text-xs text-muted-foreground/80">
    {format(new Date(item.scheduled_date), 'd MMM')}
  </span>
)}
```

---

## Files Modified
- `src/app/(dashboard)/page.tsx` — split in-progress, render two sections
- `src/components/dashboard/todo-row.tsx` — show scheduled date

## Verification
1. `npm run build` passes
2. In Progress column shows two sections: "In Progress" and "Scheduled"
3. Scheduled items show the scheduled date
4. Empty sections don't render (no empty headers)
