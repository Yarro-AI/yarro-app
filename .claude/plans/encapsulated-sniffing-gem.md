# Demo-Readiness Sprint — 8 Urgent Blockers

## Context
Adam is switching from build mode to sales mode. These 8 issues (YAR-221–228) are the last UX blockers before demos. Goal: knock them out fast, then shift to 1 feature/day + sales.

Key architectural decision: **rent overdue items become real tickets from day 1**, not pseudo-items. The entire pipeline already exists (`create_rent_arrears_ticket`, `compute_rent_arrears_next_action`, polymorphic dispatch router). We're just triggering it earlier. This eliminates special-casing for rent routing, drawers, and priority — everything flows through the ticket system.

---

## Build Order

### Session 1: Priority System + Rent-as-Tickets Foundation (~2.5h)
Branch: `fix/yar-226-priority-rent-tickets`

**1. YAR-226 — Priority tiers + SLA on dashboard** | Size: M

**Protected RPC changes (need Adam's approval):**

a) **`c1_get_dashboard_todo`** (protected) — add `sla_due_at` to JSON output:
   - File: current version at `supabase/migrations/20260405600000_dashboard_todo_perf.sql`
   - Line 173: after `'sla_breached', COALESCE(s.sla_due_at < now(), false),`
   - Add: `'sla_due_at', s.sla_due_at,`
   - Also add: `'scheduled_date', s.scheduled_date,` (needed for YAR-221 later)
   - Follow Safe Modification Protocol: new migration, backup current def

b) **`create_rent_arrears_ticket`** (protected) — set initial priority based on confirmed tiers:
   - Currently hardcodes `priority = 'high'` (line 311)
   - Change to accept `p_priority text DEFAULT 'Medium'` parameter
   - Caller passes priority based on days overdue

c) **`compute_rent_arrears_next_action`** (protected) — add priority escalation:
   - Currently only returns next_action + reason
   - Add: UPDATE ticket priority based on days since `date_logged`:
     - 1+ day overdue → Medium
     - 7+ days → High  
     - 14+ days → Urgent
   - This runs every time the router evaluates the ticket, so priority auto-escalates

**Non-protected changes:**

d) **`c1_get_dashboard_todo_extras`** (NOT protected) — update rent priority tiers:
   - Line 248: `'priority', NULL` → set to 'Normal' for partial (not overdue), 'Medium' for 1+ day overdue
   - Lines 253-257: Update `priority_bucket`:
     - Partial, not overdue → NORMAL
     - 1+ day overdue → NORMAL (Medium priority)
     - 7+ days overdue → HIGH
     - 14+ days overdue → URGENT
   - Lines 249-252: Align `priority_score` with the confirmed tiers:
     - Partial not overdue: 40
     - 1 day overdue: 60
     - 7+ days overdue: 90  
     - 14+ days overdue: 130

e) **Frontend — TodoItem type + SlaBadge on rows:**
   - `src/components/dashboard/todo-panel.tsx`: add `sla_due_at?: string | null` and `scheduled_date?: string | null` to `TodoItem`
   - `src/components/dashboard/todo-row.tsx`: import `SlaBadge` from `@/components/sla-badge`, render next to the wait-time text when `item.sla_due_at` exists

---

### Session 2: Rent-as-Tickets + Fix Dashboard Routing (~2h)
Branch: `fix/yar-222-223-rent-tickets-routing`

**2. YAR-222+223 — Rent items become tickets + fix all dashboard routing**

The core insight: rent overdue items should create real tickets on day 1, not wait for 3 reminders + 7 days. Once they're tickets, they open in the existing ticket drawer — no new components needed.

**a) Trigger rent ticket creation earlier:**
   - Modify `yarro-rent-reminder/index.ts`: after processing reminders, also call `create_rent_arrears_ticket` for any entry where `status === 'overdue'` AND no open `rent_arrears` ticket exists
   - Currently: ticket created only after `reminder_3_sent_at + 7 days` (via `rent_escalation_check`)
   - New: ticket created on first overdue detection (day 1). The escalation check stays as a safety net
   - The `create_rent_arrears_ticket` RPC already deduplicates (one per tenant)

**b) Remove rent pseudo-items from extras (once tickets exist):**
   - `c1_get_dashboard_todo_extras`: remove the rent UNION ALL section (lines ~225-262)
   - Rent items now come through `c1_get_dashboard_todo` as real tickets with `category = 'rent_arrears'`
   - Keep tenancy items in extras (tenancy_ending/expired are not tickets)

**c) Fix `getTodoHref()` — stop navigating away from dashboard:**
   - `src/components/dashboard/todo-panel.tsx` line 160-174
   - Remove: `if (src === 'rent' || src === 'tenancy') return '/properties/${item.property_id}'`
   - Change: `if (src === 'tenancy') return '/properties/${item.property_id}'` (tenancy stays as-is)
   - Rent items now have real ticket_ids → fall through to `onTicketClick` → opens ticket drawer
   - Remove: handoff_review and pending_review hrefs (lines 171-172). These should also open the ticket drawer, not navigate to /tickets page
   - All three flows now use the `<button onClick>` path → ticket drawer

**d) Result:**
   - Rent overdue → ticket created day 1 → appears in dashboard todo → click opens ticket drawer
   - Handoff review → click opens ticket drawer (not /tickets page)
   - Pending review → click opens ticket drawer (not /tickets page)
   - No new components. No RentDrawer. No CreateDrawerProvider. Same ticket system for everything.

---

### Session 3: Dashboard Layout + Priority Filter (~1.5h)
Branch: `feat/yar-221-225-dashboard-layout`

**3. YAR-221 — In Progress + Scheduled sections** | Size: M
- File: `src/app/(dashboard)/page.tsx`
- Split `inProgressItems` into two sub-lists:
  - `scheduledItems` = items where `next_action_reason === 'scheduled'`
  - `awaitingItems` = everything else in `IN_PROGRESS_REASONS`
- Right column: two sections with sub-headers ("In Progress" / "Scheduled")
- Show `scheduled_date` on scheduled items (now available from RPC via Session 1 change)

**4. YAR-225 — Priority filter on dashboard** | Size: S
- Add pill filter bar to Needs Action panel header
- Filter options: All | Urgent | High | Normal — matching `priority_bucket`
- Use same pill-button pattern as rent page status filters (lines 155-162 of rent/page.tsx)
- Filter the `actionable` list before passing to `JobsList`
- Show counts in each pill

---

### Session 4: Table Scroll Debug (~1h)
Branch: `fix/yar-227-table-scroll`

**5. YAR-227 — Debug investigation first, then fix** | Size: S-M

All three target pages (properties, tenants, contractors) already have:
- `<div className="flex-1 min-h-0 overflow-hidden">` wrapper
- `fillHeight` on DataTable
- Correct flex chain: `h-screen` → `flex-1 overflow-hidden` (layout.tsx:90) → `flex-1 overflow-hidden` (main:106) → PageShell → wrapper → DataTable

**Debug steps (before writing any code):**
1. Run `npm run dev`, open each page
2. Resize viewport to small height — identify what actually overflows
3. Check DevTools: is `<main>` getting the right computed height? Is PageShell's `pb-8` (line 90) pushing content?
4. Check if `DashboardHeader` (fixed at top) is accounted for in the flex layout
5. Test with the `topBar` slot populated vs empty — does that change scroll behavior?

**Likely suspects:**
- `pb-8` on PageShell content area adding padding that pushes DataTable below fold
- `topBar` or `headerExtra` content not being `flex-shrink-0`
- `DashboardHeader` height not properly constrained

Fix whatever the actual root cause is. Don't rewrite working flex chains.

---

### Session 5: Minimal Audit + Ticket Drawer Polish (~2.5h)
Branch: `fix/yar-224-228-polish`

**6. YAR-224 — Audit page: minimal demo-ready version** | Size: M
- File: `src/app/(dashboard)/audit-trail/page.tsx` (230 lines)
- Add event type filter pills (top bar, using known event types from `CAUSAL_ORDER`)
- Make `ticket_id` clickable → `useOpenTicket()` to open ticket drawer
- Keep existing search + causal ordering
- Skip: pagination, date range filter, actor filter, grouping (backlog these)

**7. YAR-228 — Ticket drawer: minimal demo-ready version** | Size: M
- File: `src/components/ticket-detail/ticket-detail-modal.tsx`
- Add `SlaBadge` in drawer header next to status badges (data available from `useTicketDetail`)
- Make Next Action block more prominent — full-width colored card at top of overview tab
- Skip: status timeline, 2-column grid, mobile full-width, sticky footer (backlog these)

---

## Protected RPC Summary

| RPC | Change | Protocol |
|-----|--------|----------|
| `c1_get_dashboard_todo` | Add `sla_due_at` + `scheduled_date` to JSON output | New migration, backup current |
| `create_rent_arrears_ticket` | Accept `p_priority` param, default 'Medium' | New migration, backup current |
| `compute_rent_arrears_next_action` | Add priority escalation logic (1d/7d/14d) | New migration, backup current |

`c1_get_dashboard_todo_extras` is NOT protected — can modify freely.

## Key Files

| File | Touched By |
|------|-----------|
| `supabase/migrations/20260405600000_dashboard_todo_perf.sql` | Session 1 (backup, new migration) |
| `supabase/migrations/20260404300000_polymorphic_subroutines.sql` | Session 1 (backup, new migration) |
| `supabase/migrations/20260330120000_dashboard_todo_extras.sql` | Session 1+2 (update rent tiers, then remove rent section) |
| `supabase/functions/yarro-rent-reminder/index.ts` | Session 2 (earlier ticket creation) |
| `src/components/dashboard/todo-panel.tsx` | Session 1 (types), Session 2 (routing), Session 3 (filter) |
| `src/components/dashboard/todo-row.tsx` | Session 1 (SlaBadge) |
| `src/app/(dashboard)/page.tsx` | Session 3 (scheduled split + priority filter) |
| `src/app/(dashboard)/audit-trail/page.tsx` | Session 5 (filter pills + clickable tickets) |
| `src/components/ticket-detail/ticket-detail-modal.tsx` | Session 5 (SlaBadge + next action) |
| `src/components/sla-badge.tsx` | Referenced in Sessions 1 + 5 (no changes, just imported) |

## Verification
After each session:
1. `npm run build` — must pass
2. `npm run dev` — visually verify in browser
3. Test: dashboard todo items open correct drawers (not navigate away)
4. Test: rent overdue items appear as tickets with correct priority
5. Test: SlaBadge visible on dashboard rows with countdown
6. Commit + merge to main

## Estimated Total: ~9.5 hours across 5 sessions
