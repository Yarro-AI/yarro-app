# Sprint Plan 07: Ticket Drawer — Minimal Demo Polish

## Context
The ticket drawer works but needs two specific improvements to look polished in demos: SLA countdown in the header, and a more prominent next-action block. Minimal version — no structural rewrite.

**Branch:** `feat/yar-228-ticket-drawer-polish`
**Issues:** YAR-228

---

## Steps

### 1. Add SlaBadge to drawer header

File: `src/components/ticket-detail/ticket-detail-modal.tsx`

In the header section (after the status badges), add:
```tsx
<SlaBadge
  slaDueAt={basic?.sla_due_at || null}
  resolvedAt={basic?.resolved_at || null}
  priority={basic?.priority}
  dateLogged={basic?.date_logged}
  archived={basic?.archived}
  ticketStatus={basic?.status}
/>
```

Import `SlaBadge` from `@/components/sla-badge`. The `useTicketDetail` hook already returns all these fields via `basic`.

### 2. Make Next Action block more prominent

File: `src/components/ticket-detail/ticket-overview-tab.tsx`

The `NEXT_ACTION_MAP` already defines messages + CTAs per state. Currently renders as inline text. Wrap in a prominent card:

```tsx
{nextAction && (
  <div className={cn(
    'rounded-lg border p-4 mb-4',
    isUrgent ? 'bg-red-500/5 border-red-500/20' : 'bg-primary/5 border-primary/20'
  )}>
    <p className="text-sm font-medium mb-2">{nextAction.message}</p>
    {nextAction.button && (
      <Button size="sm" variant={isUrgent ? 'destructive' : 'default'}>
        {nextAction.button.label}
      </Button>
    )}
  </div>
)}
```

Where `isUrgent = basic?.priority === 'Emergency' || basic?.priority === 'Urgent' || (basic?.sla_due_at && new Date(basic.sla_due_at) < new Date())`

---

## Files Modified
- `src/components/ticket-detail/ticket-detail-modal.tsx` — SlaBadge in header
- `src/components/ticket-detail/ticket-overview-tab.tsx` — prominent next action card

## Verification
1. `npm run build` passes
2. Ticket drawer shows SLA countdown badge in header (green/amber/red/breached)
3. Next action block is visually prominent with colored background
4. Urgent/breached tickets show red-tinted action block
5. No regression on other drawer tabs
