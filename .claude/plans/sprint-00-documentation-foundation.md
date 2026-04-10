# Sprint 0: Documentation Foundation

> **Prereq:** None. Ships before Sprint A.
> **Output:** Zero code changes. All guiding docs updated to reflect the ticket state model.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md`
> **Architecture doc:** `docs/architecture/ticket-state-model.md`

---

## Why this sprint exists

The guiding docs are what Claude Code reads at session start. If they describe the old system while code reflects the new system, every future build starts with a stale mental model. The ticket state model is the new SSOT — the docs must encode it before implementation begins.

---

## File 1: `CLAUDE.md`

### Change: Architecture section

**Replace** the current "Architecture — Non-Negotiable" section. Keep the polymorphic dispatch rules but wrap them in the three-layer state model context.

**Current (lines 18-33):**
```
All business logic lives in Supabase RPCs, not the frontend.
- Never put business logic in React components or hooks
- Never compute derived state (status, counts, summaries) in the frontend
- Every new feature starts with the RPC, then UI consumes it
- Direct `.from().select()` only for simple reads with no logic
- **Polymorphic Dispatch Pattern — THE LAW** for all ticket state logic:
  - `c1_compute_next_action` is a pure dispatch router — ZERO business logic
  - 3 explicit routes: maintenance → compliance_renewal → rent_arrears → else error
  - Each route owns its FULL lifecycle
  ...
```

**New:**
```
All business logic lives in Supabase RPCs, not the frontend.
- Never put business logic in React components or hooks
- Never compute derived state (status, counts, summaries) in the frontend
- Every new feature starts with the RPC, then UI consumes it
- Direct `.from().select()` only for simple reads with no logic

### Three-Layer State Model — THE LAW
Every open ticket's state is described by three layers:
- **Bucket** (`next_action`) — Where: `needs_action` | `waiting` | `scheduled` | `stuck` (display-only)
- **State** (`next_action_reason`) — Why: confirmed fact (e.g. `awaiting_contractor`, `handoff_review`)
- **Timeout** (`is_past_timeout`) — How long: computed at display time, never stored as a state

**The pipeline:** Router computes bucket + reason → Trigger writes 4 fields (`next_action`, `next_action_reason`, `waiting_since`, `sla_due_at`) → Dashboard RPC adds timeout overlay + priority score → Frontend displays via `REASON_DISPLAY` mapping.

**Non-negotiable rules:**
- Timeouts are metadata, never states — don't add `_no_response` reasons
- `sla_due_at` is NULL when PM isn't the actor — don't set SLA on waiting tickets
- `waiting_since` resets on every state change — don't manually set it
- Frontend never computes bucket, priority, timeout, or SLA — those come from the RPC/trigger
- One `REASON_DISPLAY` mapping (`src/lib/reason-display.ts`) — both dashboard and drawer use it, never duplicate label logic
- Audit events are non-negotiable — if `c1_log_event()` fails, the operation rolls back
- Full spec: `docs/architecture/ticket-state-model.md`

### Polymorphic Dispatch — Router Rules
(keep existing router rules unchanged — they're still correct)
```

### Change: Reference Index

**Add** at the TOP of the reference table:

```
| `docs/architecture/ticket-state-model.md` | **PRIMARY** — Three-layer state model, bucket assignment, priority scoring, SLA, timeouts, error recovery |
```

Move `docs/POLYMORPHIC-DISPATCH-PLAN.md` down — it describes the router pattern; the ticket state model doc describes the full system.

### Change: Caution Zones

**Update** the `use-ticket-detail.ts` entry:
```
- `use-ticket-detail.ts` — after refactor: 1 RPC + 1 events query (was 600+ lines, 7+ queries)
```

---

## File 2: `.claude/docs/architecture.md`

### Change: Add Three-Layer State Model section (after The Flow)

**Insert after line 25** (after the flow diagram):

```markdown
---

## Three-Layer State Model

Every open ticket's state is described by three layers. Full spec: `docs/architecture/ticket-state-model.md`.

```
BUCKET  (next_action)         → Where is this ticket? (needs_action / waiting / scheduled)
STATE   (next_action_reason)  → Why is it there? (confirmed fact)
TIMEOUT (is_past_timeout)     → Has the wait gone too long? (display-time computation, never a state)
```

### How state gets written

**Three write sites — all write 4 fields, all call the router:**
1. `c1_trigger_recompute_next_action` — fires on ticket/message/completion changes (~90% of writes)
2. `c1_auto_close_completed_tickets` — reconciles completed tickets (inside the trigger)
3. `c1_toggle_hold` — hold/unhold toggle

**Every write sets:** `next_action`, `next_action_reason`, `waiting_since = now()`, `sla_due_at = CASE ... END`

No other code path may write `next_action` or `next_action_reason` directly.

### Dashboard data flow

One RPC → one Realtime subscription → one frontend mapping:
- `c1_get_dashboard_todo` returns all items with bucket, reason, priority_score, timeout flags
- Supabase Realtime subscription on `c1_tickets` triggers refetch on state changes
- Frontend `REASON_DISPLAY` mapping (`src/lib/reason-display.ts`) provides labels for both dashboard and drawer

### Drawer data flow

One RPC + one events query:
- `c1_ticket_detail(ticket_id)` returns universal + category-specific data
- `c1_events` query returns timeline (replaces frontend `deriveTimeline()`)
- No category-specific secondary fetches. No frontend stage derivation.

### Priority scoring

`c1_compute_priority_score()` — one shared SQL function, called by both RPCs:
```
priority_score = consequence_weight + time_pressure + sla_proximity + age_boost
```
Consequence-driven: severity base + deadline pressure + SLA proximity + age. No reason-specific boosts.
```

### Change: Update The Flow

**Replace** the current flow diagram (lines 12-25) to add the state pipeline:

```markdown
## The Flow

```
Tenant messages WhatsApp
  -> AI conversation (OpenAI via Edge Function)
  -> Ticket created in database
  -> Router computes bucket + reason
  -> Trigger writes 4 fields (next_action, next_action_reason, waiting_since, sla_due_at)
  -> PM + Landlord notified (WhatsApp)
  -> Contractor dispatched (WhatsApp with portal link)
  -> Dashboard RPC adds timeout overlay + priority score
  -> Frontend displays via REASON_DISPLAY mapping
  -> Lifecycle continues: quotes, approvals, scheduling, completion
  -> State changes trigger router recompute at every step
```
```

### Change: Key Database Tables

**Add** `c1_events`:
```
| `c1_events` | Audit trail — legal defence record, sole source for timeline. `c1_ledger` is dropped. |
```

**Remove** any `c1_ledger` reference.

**Add note:** Timing columns on `c1_tickets`: `waiting_since`, `contractor_sent_at`, `tenant_contacted_at`, `deadline_date`, `sla_due_at`.

### Change: Data Flow section (line 156)

**Replace line 163** ("Real-time is not currently used"):
```
5. **Real-time** — Supabase Realtime subscription on `c1_tickets` for dashboard auto-refresh on state changes
```

### Change: RPC Development Workflow

**Add rule after line 198:**
```
- Every RPC that changes ticket state must log an audit event in the same transaction. If `c1_log_event()` fails, the operation rolls back. No exception swallowing.
- Edge functions don't write state — they call RPCs which trigger the router.
```

### Change: Edge Functions table

**Update** entries:
```
| `yarro-compliance-reminder` | Daily compliance expiry check → PM notification + auto-ticket creation |
| `yarro-rent-reminder` | Daily rent reminders + escalation → rent arrears auto-ticket creation |
```

---

## File 3: `.claude/docs/patterns.md`

### Change: Add Dashboard Patterns section (after Hooks section)

```markdown
---

## Dashboard Patterns

### Bucket grouping
Frontend groups dashboard items by `item.next_action` (bucket). `stuck` is a display-layer override from the RPC when `is_past_timeout = true` on a `waiting` ticket.

### REASON_DISPLAY mapping
One object, used by both dashboard cards AND ticket drawer. Maps `next_action_reason` to display text:
```tsx
// src/lib/reason-display.ts — THE SSOT for all state display text
const REASON_DISPLAY: Record<string, { label: string; stuckLabel: string; context: string }> = {
  awaiting_contractor: { label: 'Awaiting contractor', stuckLabel: 'Chase contractor', context: '...' },
  // ... all reasons
}
```
If you need a new label: add it to REASON_DISPLAY. It propagates to every view.

### CTA mapping
`next_action_reason` → button label + action type. `waiting`/`scheduled` reasons have no CTA (PM is not the actor).

### Priority badge
Reads `ticket.priority` directly from the RPC response. No frontend derivation.

## Ticket Drawer Patterns

### Universal layout (all categories)
Stage card (from REASON_DISPLAY) → CTA → Timeline (from c1_events) → Category data → People

### Timeline
From `c1_events` query, not derived from ticket fields. `STATE_CHANGED` events provide the progression.

### Category section
Only the data section is per-category (cert details, payment ledger, job details). State display is universal.

### Transcript
Inline collapsible for `handoff_review` only. Not a tab. Auto-expanded for handoff, collapsed for pending_review.

## State Display — Anti-Patterns

**NEVER do these:**
- Derive stage/status from multiple ticket fields in the frontend (old: `deriveTimeline()`)
- Create per-category stage config objects (old: `STAGE_CONFIG`, `getComplianceStage()`)
- Compute timeline from ticket fields (old: `deriveTimeline()`)
- Duplicate label/context logic between dashboard and drawer
- Add a CASE/IF/switch that maps `next_action_reason` to display text in a component — use `REASON_DISPLAY`
```

### Change: Update Data Fetching Pattern

**Replace** the current data fetching pattern example (lines 259-298) or add a note:

```markdown
### Dashboard data fetching
```tsx
// One RPC call — no merge, no extras
const { data } = await supabase.rpc('c1_get_dashboard_todo', { p_pm_id: pm.id })
// Group by item.next_action (bucket)
```

### Drawer data fetching
```tsx
// One RPC + one events query
const { data: ticket } = await supabase.rpc('c1_ticket_detail', { p_ticket_id: id })
const { data: events } = await supabase.from('c1_events').select('*').eq('ticket_id', id)
```

### Realtime subscription (dashboard only)
```tsx
supabase.channel('pm-tickets')
  .on('postgres_changes', { event: 'UPDATE', table: 'c1_tickets', filter: `property_manager_id=eq.${pmId}` }, refetch)
  .on('postgres_changes', { event: 'INSERT', table: 'c1_tickets', filter: `property_manager_id=eq.${pmId}` }, refetch)
  .subscribe()
```
```

---

## File 4: `.claude/docs/safe-zones.md`

### Change: GREEN section

**Add:**
```
| `src/lib/reason-display.ts` | REASON_DISPLAY mapping | Pure display text — safe to modify labels. Adding/removing keys must match CHECK constraint. |
```

**Update** after refactor:
```
| `src/hooks/use-ticket-detail.ts` | Ticket detail hook | After refactor: 1 RPC + 1 events query. Simple data fetching. |
```

### Change: YELLOW section

**Add:**
```
| `src/lib/reason-display.ts` | REASON_DISPLAY mapping | Labels safe to change, but keys must match `next_action_reason` CHECK constraint. Mismatch = silent display bug. |
```

### Change: RED section

**Add:**
```
| `c1_trigger_recompute_next_action` | State recompute trigger | Writes 4 fields on every state change. Breaking it breaks every ticket. |
| `c1_compute_priority_score` | Shared scoring function | Used by both RPCs. Changing scoring affects every ticket's sort order. |
```

**Remove** stale `c1_ledger` trigger references after refactor.

---

## File 5: `.claude/docs/decision-principles.md`

### Change: Add SSOT Principle section (after Core Principle, before When to Present Trade-offs)

```markdown
---

## SSOT Principle

Every piece of state has ONE authoritative source. If you're writing the same value in two places, one of them is wrong.

| State | Source | Writer |
|-------|--------|--------|
| Ticket bucket + reason | Router | Trigger (3 write sites) |
| Display text (labels, context) | `REASON_DISPLAY` mapping | Frontend (one object, both views) |
| Priority | `c1_tickets.priority` column | Escalation crons |
| Timeline | `c1_events` table | RPC transactions |
| Timeout | Dashboard RPC (computed) | Never stored as a column value |

**Before writing code, ask:**
- "Does this introduce a second source of truth for any piece of state?" — if yes, restructure.
- "Does this put business logic in the frontend?" — if yes, it belongs in an RPC.
- "Does this compute something the trigger/RPC already provides?" — if yes, read from the provided field.
- "Am I about to add a CASE/IF/switch mapping `next_action_reason` to display text?" — check `REASON_DISPLAY` first.
```

---

## File 6: `.claude/docs/session-procedures.md`

### Change: Add to Done Checklist (after item 11)

```
12. State changes produce audit events (check `c1_events` after testing)
13. Dashboard and drawer show identical state for the same ticket (same label, same context)
14. No new frontend stage derivation, timeline computation, or label mapping outside `REASON_DISPLAY`
```

### Change: Add to Product Vision Questions

```
- Does this maintain a single source of truth, or does it introduce a parallel computation?
- Does this produce an audit event that would hold up in a legal dispute?
```

---

## File 7: `supabase/core-rpcs/README.md`

### Change: Add new protected RPCs

Add to the protected list:
```
c1_ticket_detail — Single RPC for drawer, returns universal + category-specific data
c1_compute_priority_score — Shared scoring function, called by dashboard + drawer RPCs
c1_set_awaiting_tenant — Sets/clears awaiting_tenant flag + audit event
c1_mark_contractor_withdrawn — Marks contractor withdrawn, cycles to next or sets no_contractors
c1_submit_contractor_reschedule_request — Contractor-initiated reschedule via portal
c1_compliance_auto_ticket — Daily cron, scans certs, creates tickets with dedup
```

### Change: Note dropped RPCs

```
DROPPED: c1_get_dashboard_todo_extras — replaced by c1_get_dashboard_todo (all items are tickets)
DROPPED: c1_set_sla_due_at — SLA logic consolidated into c1_trigger_recompute_next_action
```

---

## Verification

- [ ] All 7 files updated
- [ ] `docs/architecture/ticket-state-model.md` is listed as PRIMARY reference in CLAUDE.md
- [ ] No references to old patterns (STAGE_CONFIG, deriveTimeline, getComplianceStage) as current
- [ ] SSOT principle documented in decision-principles.md
- [ ] Anti-patterns documented in patterns.md
- [ ] New protected RPCs listed in core-rpcs README
- [ ] `npm run build` still passes (no code changes, but verify docs don't break anything)
