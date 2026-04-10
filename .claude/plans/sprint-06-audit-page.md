# Sprint Plan 06: Audit Page — Minimal Demo-Ready

## Context
Audit trail page is functional but bare — just a search box over 500 events in a table. For demos, it needs to look like a real audit system with filters and clickable ticket references. Minimal version only.

**Branch:** `feat/yar-224-audit-minimal`
**Issues:** YAR-224

---

## Steps

### 1. Add event type filter pills

File: `src/app/(dashboard)/audit-trail/page.tsx`

Extract unique event types from the data. Add pill filter bar at top:

```typescript
const EVENT_GROUPS = {
  'All': null,
  'Issues': ['ISSUE_CREATED', 'ISSUE_REPORTED'],
  'Dispatch': ['CONTRACTOR_ASSIGNED', 'OOH_DISPATCHED', 'LANDLORD_ALLOCATED'],
  'Quotes': ['QUOTE_RECEIVED', 'QUOTE_APPROVED', 'QUOTE_DECLINED'],
  'Jobs': ['JOB_SCHEDULED', 'JOB_COMPLETED', 'JOB_NOT_COMPLETED'],
  'Status': ['TICKET_CLOSED', 'TICKET_ARCHIVED', 'PRIORITY_CHANGED'],
} as const
```

Use same pill-button pattern from other pages. Filter events before rendering.

### 2. Make ticket_id clickable

Import `useOpenTicket` from `@/hooks/use-open-ticket`.

In the Details column (or as a link icon), when `event.ticket_id` exists:
```tsx
<button 
  onClick={() => openTicket(event.ticket_id!)}
  className="text-primary hover:underline text-sm"
>
  View ticket
</button>
```

### 3. Keep existing features
- Search (CommandSearchInput) — unchanged
- Causal ordering — unchanged  
- 500 event limit — unchanged (pagination is backlog)

---

## Files Modified
- `src/app/(dashboard)/audit-trail/page.tsx` — filter pills + clickable tickets

## Verification
1. `npm run build` passes
2. Filter pills show grouped event types with counts
3. Clicking a pill filters the table
4. "View ticket" opens the ticket drawer
5. Search still works alongside filters
