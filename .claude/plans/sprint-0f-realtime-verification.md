# Sprint F: Realtime + Verification

> **Prereq:** Sprint E (drawer + frontend) complete.
> **Output:** Dashboard auto-updates on ticket changes, full E2E verification passes.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Steps 9, 10

---

## Part 1: Realtime dashboard subscription

### `src/app/(dashboard)/page.tsx`

**Add Supabase Realtime subscription:**

```typescript
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'

// Inside the dashboard component, after data fetching setup:

useEffect(() => {
  if (!propertyManager?.id) return

  const supabase = createClient()

  const channel = supabase
    .channel('pm-tickets')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'c1_tickets',
      filter: `property_manager_id=eq.${propertyManager.id}`,
    }, (payload) => {
      // Only refetch when state actually changed
      if (payload.new.next_action !== payload.old.next_action ||
          payload.new.next_action_reason !== payload.old.next_action_reason ||
          payload.new.priority !== payload.old.priority) {
        refetchDashboard()
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'c1_tickets',
      filter: `property_manager_id=eq.${propertyManager.id}`,
    }, () => {
      // New ticket (auto-creation cron, WhatsApp intake)
      refetchDashboard()
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}, [propertyManager?.id])
```

**Key rules:**
- Dashboard page ONLY — ticket drawer doesn't need realtime
- Filter by `property_manager_id` — PM only sees their own tickets
- Only refetch on state/priority changes — not on unrelated field updates
- Keep existing focus-refetch as fallback (window `visibilitychange` listener)
- Clean up subscription on unmount
- **Auth pattern:** Use `propertyManager.id` from `pm-context.tsx` — do NOT introduce new `getSession()`/`getUser()` calls (Supabase Auth hang bug)

---

## Part 2: Full verification

### Build
- [ ] `npm run build` passes with zero errors
- [ ] `npm test` passes with zero failures
- [ ] No TypeScript `any` types in new code
- [ ] No `@ts-ignore` in new code

### State model
- [ ] All open tickets have `next_action` in: `needs_action`, `waiting`, `scheduled`
- [ ] No ticket has old values: `needs_attention`, `assign_contractor`, `follow_up`, `in_progress`, `new` (as next_action)
- [ ] No ticket has removed reasons: `landlord_no_response`, `landlord_in_progress`, `ooh_in_progress`, `compliance_pending`
- [ ] `compliance_pending` renamed to `compliance_needs_dispatch` on ALL tickets (open + closed)
- [ ] `job_stage` column does not exist on `c1_tickets`
- [ ] `c1_ledger` table does not exist
- [ ] `trg_c1_set_sla` trigger does not exist
- [ ] CHECK constraint rejects old values, accepts new values

### Dashboard
- [ ] Shows all items from single RPC (`c1_get_dashboard_todo`)
- [ ] No extras RPC call
- [ ] 4 buckets render: needs_action, waiting, scheduled, stuck
- [ ] `ooh_dispatched` appears in waiting bucket (not needs_action)
- [ ] No tenancy items
- [ ] Priority scoring: Emergency tickets always at top, compliance with expired certs high
- [ ] Labels from `REASON_DISPLAY` mapping (not from RPC output)

### Auto-creation
- [ ] Incomplete certs → `cert_incomplete` → needs_action bucket
- [ ] Expiring/expired certs → `compliance_needs_dispatch` → needs_action bucket
- [ ] Rent overdue → ticket on day 1 with `deadline_date` set
- [ ] Handoff → always creates ticket with `handoff_reason`

### Ticket drawer — SSOT verification
- [ ] Open same ticket on dashboard and in drawer → labels identical (same reason + timeout = same text)
- [ ] Maintenance drawer: stage card from REASON_DISPLAY, timeline from events, CTA renders
- [ ] Compliance drawer: same stage card system, cert details below, CTA "Dispatch contractor" works
- [ ] Rent drawer: same stage card system, payment ledger below, CTA "Contact tenant" works
- [ ] Handoff drawer: transcript inline, handoff_reason shown, CTA "Review & assign"
- [ ] `STAGE_CONFIG` / `getComplianceStage()` / `deriveTimeline()` are GONE from frontend
- [ ] `use-ticket-detail.ts` makes 1 RPC call + 1 events query (not 7+ queries)

### Compliance dispatch
- [ ] `compliance_dispatch_renewal` handles existing tickets (idempotent — no exception)

### Audit trail
- [ ] `STATE_CHANGED` events appear for every state transition
- [ ] `TIMEOUT_TRIGGERED` logged when contractor/landlord/OOH goes silent
- [ ] `TIMEOUT_RESOLVED` logged when late response arrives
- [ ] `AUTO_TICKET_*` events for cron-created tickets
- [ ] No frontend references to `c1_ledger` remain
- [ ] Audit timeline reads from `c1_events` only — no dedup logic

### Real-time
- [ ] Dashboard updates without page refresh when ticket state changes
- [ ] New auto-created tickets appear on dashboard without refresh
- [ ] Subscription cleans up on unmount (check dev tools → no lingering channels)
- [ ] Focus-refetch still works as fallback
- [ ] No `getSession()`/`getUser()` calls outside `pm-context.tsx`

### Portals
- [ ] Tenant portal shows correct stage from `next_action_reason` (not `job_stage`)
- [ ] Contractor portal shows correct stage from `next_action_reason`
- [ ] Portal outcome values (`resolved`, `in_progress`, `need_help`) untouched

### Removed code verification
- [ ] Grep codebase for `job_stage` — zero results
- [ ] Grep codebase for `landlord_no_response` — zero results (except docs/plans)
- [ ] Grep codebase for `compliance_pending` — zero results (except docs/plans)
- [ ] Grep codebase for `STAGE_CONFIG` — zero results
- [ ] Grep codebase for `getComplianceStage` — zero results
- [ ] Grep codebase for `deriveTimeline` — zero results
- [ ] Grep codebase for `filterActionable` — zero results
- [ ] Grep codebase for `c1_get_dashboard_todo_extras` — zero results
- [ ] Grep codebase for `c1_ledger` — zero results (except docs/plans)
- [ ] Grep codebase for `action_type` in todo/dashboard context — zero results

### Performance
- [ ] Dashboard loads in <2s (one RPC instead of two)
- [ ] Drawer opens in <1s (one RPC instead of 7+ queries)
- [ ] Realtime subscription connects within 5s of page load

---

## Post-completion

After Sprint F passes all verification:

1. **Update SESSION_LOG.md** with full summary of the refactor
2. **Run `/ship`** — test, build, commit, merge, push
3. **Deploy to production** following the deployment strategy in the master plan
4. **Monitor Sentry** for 24h after deploy — watch for unexpected errors
5. **Run compliance auto-ticket cron manually** — verify tickets created correctly
6. **Spot-check portals** — contractor, tenant, landlord portals all show correct data
