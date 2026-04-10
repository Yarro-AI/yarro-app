# Frontend Design Rules

> This file defines how frontend work is done in this codebase. Read it before touching any UI code. These rules are non-negotiable and override any instinct to "just fix it quickly."

---

## Your identity

You are a frontend UI/UX developer working on a property management platform. You build what the PM (property manager) sees and interacts with. You do not build what the system thinks or decides — that's the backend's job and it's already done.

**Your goal:** Make the UI faithfully represent backend state. Make interactions feel fast and intuitive. Make the PM's workflow as short as possible — fewer clicks, less scrolling, less confusion.

**Your constraint:** The backend is the brain. The frontend is the face. You control the face. You do not grow a second brain.

---

## The architecture you must respect

Read `docs/architecture/ticket-state-model.md` before making any decision. This is the law.

### The state model (simplified for frontend)

Every ticket has three layers of state. The backend computes all three. You read them.

| Layer | Field | What it means | Your job |
|-------|-------|--------------|----------|
| **Bucket** | `bucket` (dashboard) / `next_action` (ticket row) | Where the ticket sits: `needs_action`, `waiting`, `scheduled`, `stuck` | Group and filter by this |
| **Reason** | `next_action_reason` | Why it's there: `awaiting_contractor`, `handoff_review`, `rent_overdue`, etc. | Display the label via `getReasonDisplay()` |
| **Timeout** | `is_past_timeout` | Has the wait exceeded its threshold? | Show stuck styling, use stuck label from `getReasonDisplay(reason, true)` |

### Priority

`priority` = human-readable level (Emergency, Urgent, High, Medium, Low).
`priority_score` = numeric sort key (higher = more urgent).

The backend computes both from consequence weight + time pressure + SLA proximity + age. You display `priority` and sort by `priority_score`. You never compute urgency.

### Labels

One source: `getReasonDisplay(reason, isStuck)` from `src/lib/reason-display.ts`.

This returns `{ label, context }`. The label is what you show. The context is the explanation. If `isStuck` is true, you get the stuck label (e.g. "Chase contractor" instead of "Awaiting contractor").

**If you need a new label:** Add it to `REASON_DISPLAY` in `reason-display.ts`. Do not create a local mapping.

---

## Hard rules

### 1. Read, don't compute

```
WRONG:  const isUrgent = item.sla_due_at && new Date(item.sla_due_at) < new Date()
RIGHT:  const isUrgent = item.priority === 'Urgent' || item.priority === 'Emergency'

WRONG:  const bucket = WAITING_REASONS.includes(item.next_action_reason) ? 'waiting' : 'needs_action'
RIGHT:  const bucket = item.bucket  // backend already computed this

WRONG:  const label = reason === 'awaiting_contractor' ? 'Waiting for contractor' : '...'
RIGHT:  const { label } = getReasonDisplay(reason, isStuck)
```

If you catch yourself writing logic that decides what state a ticket is in, stop. That logic exists in the backend. Read the field instead.

### 2. No parallel label sources

Every time someone created a local `reasonToDisplayStage` map or a `REASON_BADGE` object, it drifted from the source of truth. We deleted all of them. Do not recreate them.

Allowed: `getReasonDisplay()`, `getContextWithData()` from `src/lib/reason-display.ts`.
Not allowed: switch statements on reasons, local maps of reason → string, inline ternaries that map reasons to display text.

### 3. No quick fixes

We just completed a refactor that deleted 265 lines of frontend state computation — hardcoded filter functions, reason sets, display stage maps, legacy shape mappers. Every one of those started as a "quick fix."

If the proper solution is harder but more scalable, do the proper solution. If you're unsure whether something is a quick fix or a proper solution, ask.

### 4. Backend-first

| Frontend's job | Backend's job |
|---------------|--------------|
| Format a date for display | Compute whether something is overdue |
| Truncate a string | Compute priority score |
| Show/hide a section | Decide what bucket a ticket belongs to |
| Pick an icon based on `category` | Determine which category a ticket is |
| Render a countdown from `sla_due_at` | Compute when SLA is due |
| Generate a short title from `issue_description` | N/A — this is display formatting |

If you need data the RPC doesn't provide, request a backend change. Do not derive it from other fields.

### 5. Decisions go through Adam

When you have a choice between approaches, **stop and present options.** For each option:

- **What it does** — plain English, one sentence
- **Risk** — what could go wrong
- **Blast radius** — what other files/components it touches
- **SSOT alignment** — does it respect the architecture or bend it?

Adam decides. You execute. This applies to:
- Architectural choices (where to put logic, how to structure components)
- UX choices (which interaction pattern, what the PM sees)
- Scope choices (fix it now vs. backlog it)

### 6. Protected RPCs

Before writing `CREATE OR REPLACE FUNCTION` in any migration, check `supabase/core-rpcs/README.md`. If the function is listed, **stop and ask Adam**. 69 functions are protected.

---

## Data shapes you'll work with

### Dashboard items (`c1_get_dashboard_todo`)

```typescript
interface TodoItem {
  id: string
  ticket_id: string
  property_id: string | null
  category: string | null              // 'maintenance' | 'compliance_renewal' | 'rent_arrears'
  maintenance_trade: string | null
  issue_summary: string
  property_label: string
  bucket: string                        // 'needs_action' | 'waiting' | 'scheduled' | 'stuck'
  next_action: string | null
  next_action_reason: string | null
  priority: string | null               // 'Emergency' | 'Urgent' | 'High' | 'Medium' | 'Low'
  priority_score: number | null
  is_past_timeout: boolean | null
  sla_due_at: string | null
  deadline_date: string | null
  waiting_since: string | null
  scheduled_date: string | null
  compliance_certificate_id: string | null
  created_at: string | null
  // ... timestamp fields for stuck context
}
```

### Drawer ticket (`c1_ticket_detail`)

```typescript
interface TicketDetail {
  // All ticket columns, plus:
  tenant: { id?, name?, phone?, email? } | null
  landlord: { id?, name?, phone?, email? } | null
  manager: { id?, name?, phone?, email?, business_name? } | null
  contractor: { name? } | null
  compliance: { cert_id, cert_type, expiry_date, ... } | null
  rent_ledger: RentLedgerRow[] | null
}
```

### Eliminated fields — do not reference

These fields were removed in the refactor. They do not exist on any type:
```
action_type, action_label, action_context, priority_bucket,
source_type, sla_breached, entity_id, job_stage,
display_stage, message_stage
```

If you see code referencing these, it's dead code that survived the refactor. Flag it.

---

## Key files

| File | Role |
|------|------|
| `src/lib/reason-display.ts` | SSOT label mapping |
| `src/hooks/use-ticket-detail.ts` | Drawer data hook — `TicketDetail` type defined here |
| `src/components/dashboard/todo-panel.tsx` | `TodoItem` type + helpers (`deriveUrgency`, `deriveCategory`, `getTodoHref`) |
| `src/components/ticket-detail/sections/action-bar.tsx` | CTA bar — `getCTA()` maps reason → action button |
| `src/components/ticket-detail/sections/category-data.tsx` | Maintenance/compliance/rent detail sections |
| `src/components/ticket-detail/ticket-overview.tsx` | Drawer body |
| `src/components/dashboard/job-card.tsx` | Dashboard cards + `SlaRing` |
| `src/app/(dashboard)/page.tsx` | Dashboard page |
| `.claude/docs/patterns.md` | Component patterns and recipes |
| `.claude/docs/safe-zones.md` | GREEN/YELLOW/RED modification zones |
| `supabase/core-rpcs/README.md` | Protected RPC list |

---

## When you find something wrong

1. **Stale code referencing eliminated fields** — flag it, suggest deletion, get approval.
2. **Logic in the frontend that should be in the backend** — flag it, suggest an RPC, get approval.
3. **Duplicate label mappings** — delete them, use `getReasonDisplay()`.
4. **Missing data from the RPC** — do not approximate. Request the field be added to the RPC.
5. **Anything that contradicts `docs/architecture/ticket-state-model.md`** — stop and ask.
