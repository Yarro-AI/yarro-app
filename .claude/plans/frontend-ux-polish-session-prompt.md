# Frontend UI/UX Polish Session — Post-SSOT Refactor

## Background

We've just completed a full **Single Source of Truth (SSOT) refactor** across both backend and frontend. The goal: every piece of state in the system is computed once, in the backend, and the frontend only reads and displays it. No frontend state computation. No hardcoded reason lists. No duplicate label logic.

### What happened in the backend refactor (Sprints 0-F)

- **Three-layer state model** established: Bucket (`next_action`) → State (`next_action_reason`) → Timeout metadata (`is_past_timeout`)
- **Polymorphic dispatch router** (`c1_compute_next_action`) — pure function that computes bucket + reason from ticket data. Three routes: maintenance → compliance → rent.
- **Priority scoring** (`c1_compute_priority_score`) — consequence weight + time pressure + SLA proximity + age boost. Computed at query time, never stored.
- **Dashboard RPC** (`c1_get_dashboard_todo`) — returns items with `bucket`, `priority`, `priority_score`, `is_past_timeout`, `category`, `next_action_reason`. One RPC, sorted by priority score.
- **Ticket detail RPC** (`c1_ticket_detail`) — returns flat JSONB with nested `tenant`, `landlord`, `manager`, `contractor`, `compliance`, `rent_ledger` objects. One RPC for the drawer.
- **`job_stage` column dropped** — all state flows through `next_action` + `next_action_reason` now.
- **`REASON_DISPLAY`** (`src/lib/reason-display.ts`) — the single mapping from reason → human label. Both dashboard and drawer use it.
- **Audit trail** — `c1_events` table, fired by triggers on state changes. Non-negotiable: if `c1_log_event()` fails, the operation rolls back.

### What happened in the frontend refactor (Sprints G-I)

- **Dashboard** — groups by `bucket` field from RPC. No `filterActionable`/`filterInProgress`/`filterStuck`. Labels from `getReasonDisplay()`. Urgency from `priority` field. Categories from `category` field. Stuck detection from `is_past_timeout` + `next_action_reason`.
- **Tickets page** — filters by `next_action` column (bucket). Labels from `getReasonDisplay()`. Deleted all hardcoded reason arrays.
- **Compliance page** — status from `next_action` (bucket). Removed `job_stage` and invalid reasons.
- **Drawer** — `TicketDetail` type matches RPC output directly. Deleted 4 legacy shape mappers (`rpcToContext`, `rpcToBasic`, `rpcToComplianceCert`, `rpcToRentLedger`). Components read `ticket.*` with nested person objects.
- **Net result**: -265 lines of frontend state computation deleted.

### Post-refactor fixes applied

- Compliance RPCs fixed (removed `job_stage` reference)
- Events trigger fixed (was silently failing since Sprint B — audit trail restored)
- Edge functions fixed (`yarro-scheduling` + `yarro-tenant-intake`)
- Stale tickets recomputed
- Manual ticket creation ambiguity resolved

---

## What you need to read first

1. **Architecture spec** — `docs/architecture/ticket-state-model.md` — the north star. Read the whole thing. Every decision you make must align with this.
2. **Reason display SSOT** — `src/lib/reason-display.ts` — the single mapping. Don't duplicate label logic.
3. **Refactor notes** — `.claude/docs/refactor-notes.md` — bugs found, decisions made, risks identified.
4. **Patterns** — `.claude/docs/patterns.md` — existing component patterns and recipes.
5. **Safe zones** — `.claude/docs/safe-zones.md` — what you can and can't touch.
6. **Protected RPCs** — `supabase/core-rpcs/README.md` — check before modifying ANY SQL function.

---

## Your role

You are a **frontend UI/UX developer** doing the final polish step of the SSOT refactor. You make the UI match the architecture. You don't create new architecture.

### Hard rules

1. **No frontend state computation.** If the backend returns it, read it. If it's not in the RPC response, it doesn't exist in the frontend. If you need data the RPC doesn't return, request a backend change — don't compute it client-side.
2. **One label source.** `getReasonDisplay()` from `src/lib/reason-display.ts`. Never duplicate label logic. If you need a new label, add it to `REASON_DISPLAY`.
3. **No quick fixes or patches.** Every change must be the strongest, most scalable version of itself. If a quick fix would work but a proper solution exists, do the proper solution.
4. **No independent decisions.** When you face a choice between approaches, present the options to Adam in plain English with: what each option does, the risks, the blast radius, and how it aligns with the SSOT architecture. Adam decides.
5. **Reference the architecture before deciding.** `docs/architecture/ticket-state-model.md` is the law. If your change contradicts it, stop and ask.
6. **Backend-first.** All business logic lives in Supabase RPCs. If you need new logic, request an RPC. Don't build it in React.

---

## Work items (priority order)

### High priority — from testing

1. **SLA timer ring** — starts nearly empty on fresh tickets. Currently maps against fixed 24h window. Each SLA duration should start full and count down proportionally to its own total. Drawer should also show the timer with a live countdown and explanation.

2. **Inline actions in sticky bar** — assign contractor, approve quote, allocate landlord currently render at the bottom of scrollable content. Should expand within/above the sticky action bar so PM doesn't scroll to find them.

3. **Compliance drawer dispatch** — wire `compliance_needs_dispatch` CTA to `inline_dispatch` (dispatch from drawer, no page hop). Add "View certificate" link in cert details section for full cert page access.

4. **Rent arrears label** — says "1 month(s) overdue" when only 2 days overdue. Counts ledger rows instead of actual duration. Show days overdue from `due_date`.

5. **Ticket drawer title fallback** — falls back to "Maintenance Request" when `issue_title` is null. Generate short title from `issue_description` if null.

### Medium priority — from testing

6. **Manual ticket form** — no title field, every manual ticket gets generic title. Needs title input or auto-generation from description.

7. **Assign contractor CTA intermittent** — `StageDispatchAction` sometimes doesn't respond. Investigate.

8. **Properties page compliance certs** — list items not clickable. Should link to compliance profile page.

### Reference — key files

| File | What it does |
|------|-------------|
| `src/lib/reason-display.ts` | SSOT for all display labels |
| `src/hooks/use-ticket-detail.ts` | Drawer hook — 1 RPC + 3 queries, returns `TicketDetail` |
| `src/components/dashboard/todo-panel.tsx` | `TodoItem` type + derivation helpers |
| `src/components/ticket-detail/ticket-detail-modal.tsx` | Drawer entry point |
| `src/components/ticket-detail/ticket-overview.tsx` | Drawer overview — reads `ticket.*` |
| `src/components/ticket-detail/sections/action-bar.tsx` | CTA bar — `getCTA()` maps reason → action |
| `src/components/ticket-detail/sections/category-data.tsx` | Category-specific sections (maintenance/compliance/rent) |
| `src/components/dashboard/job-card.tsx` | Dashboard needs-action cards + `SlaRing` |
| `src/app/(dashboard)/page.tsx` | Dashboard page — bucket grouping |

### Key RPC responses to understand

**`c1_get_dashboard_todo`** returns per item:
```
id, ticket_id, property_id, category, maintenance_trade, issue_summary,
bucket, next_action, next_action_reason,
priority, priority_score, is_past_timeout, sla_due_at, deadline_date,
waiting_since, contractor_sent_at, scheduled_date,
landlord_allocated_at, ooh_dispatched_at, tenant_contacted_at,
compliance_certificate_id, property_label, created_at, reschedule_initiated_by
```

**`c1_ticket_detail`** returns:
```
All ticket fields + nested objects:
  tenant: { id, name, phone, email }
  landlord: { id, name, phone, email }
  manager: { id, name, phone, email, business_name }
  contractor: { name }
  compliance: { cert_id, cert_type, expiry_date, ... }
  rent_ledger: [{ id, due_date, amount_due, amount_paid, status, ... }]
```

---

## How to work

- **One item at a time.** Complete it, verify it, get approval, then move to the next.
- **Read before changing.** Always read the file before editing it. Understand the existing code.
- **Commit after each item.** Each change is a safe rollback point.
- **Document gaps.** Log anything unexpected in `.claude/docs/refactor-notes.md`.
- **When in doubt, ask.** Present options, don't assume.
