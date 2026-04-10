# Frontend UI/UX Polish Session

## How this system works

The backend is the single source of truth (SSOT) for all state. The frontend is a display layer — it reads from RPCs and renders. It does not compute state, derive status, filter by hardcoded lists, or duplicate label logic.

**Three-layer state model** — every ticket has:
- **Bucket** (`next_action`): `needs_action` | `waiting` | `scheduled` | `stuck` — where the ticket sits
- **Reason** (`next_action_reason`): why it's there (e.g. `awaiting_contractor`, `handoff_review`, `rent_overdue`)
- **Timeout** (`is_past_timeout`): computed at query time, never stored — has the wait gone too long?

**Priority scoring** — `priority_score` is computed by the backend from consequence weight + time pressure + SLA proximity + age. The frontend reads `priority` and `priority_score`. It never computes urgency.

**Labels** — one mapping: `getReasonDisplay(reason, isStuck)` from `src/lib/reason-display.ts`. Every label in the UI comes from here. If you need a new label, add it to `REASON_DISPLAY`. Never create a parallel mapping.

---

## Read before you start

| Doc | Why |
|-----|-----|
| `docs/architecture/ticket-state-model.md` | **The law.** Every decision must align with this. Read the whole thing. |
| `src/lib/reason-display.ts` | The SSOT label mapping. Understand the shape before touching any display logic. |
| `.claude/docs/patterns.md` | Existing component patterns — check before creating anything new. |
| `.claude/docs/safe-zones.md` | GREEN/YELLOW/RED zones — know what you can touch freely vs. what needs approval. |
| `supabase/core-rpcs/README.md` | **Check before modifying ANY SQL function.** 69 protected functions listed. |

---

## Rules — non-negotiable

### 1. The frontend does not think
If the backend returns it, read it. If it's not in the RPC response, it doesn't exist in the frontend. Need data the RPC doesn't provide? **Stop and request a backend change.** Do not compute it client-side. Do not derive it from other fields. Do not approximate it.

### 2. One label source
`getReasonDisplay()` from `src/lib/reason-display.ts`. This is the only place display text is defined. Do not create local label maps, switch statements on reasons, or inline ternaries that map reasons to strings. If you see existing code doing this, flag it — don't copy the pattern.

### 3. No quick fixes
Every change must be the strongest, most scalable version of itself. If a quick fix exists but a proper solution is better, do the proper solution. Patches that "work for now" become permanent debt. We just spent a full refactor deleting exactly this kind of code.

### 4. No independent decisions
When you face a choice between approaches — **stop and present options to Adam**. For each option explain:
- What it does (plain English, no jargon)
- The risks
- The blast radius (what else it touches)
- How it aligns with the SSOT architecture

Adam decides. You execute. Do not guess, assume, or pick the "obvious" one. What seems obvious often has context you don't have.

### 5. Backend-first
All business logic lives in Supabase RPCs. Formatting a date for display? Frontend. Computing whether a ticket is overdue? Backend. Counting days since a due date? Backend. If you're writing an `if` statement that checks ticket state to decide what to show — you're probably in the wrong layer. Ask.

### 6. Architecture is the law
`docs/architecture/ticket-state-model.md` is the single source of truth for how state flows. If your change contradicts it, stop and ask. If the architecture doesn't cover your case, stop and ask. Do not extend the architecture yourself.

---

## What the RPCs return

You need to know the exact shape so you read the right fields.

**Dashboard — `c1_get_dashboard_todo`** per item:
```
id, ticket_id, property_id, category, maintenance_trade, issue_summary,
bucket,                    ← grouping (needs_action/waiting/scheduled/stuck)
next_action, next_action_reason,
priority,                  ← urgency display (Emergency/Urgent/High/Medium/Low)
priority_score,            ← sort order (higher = more urgent)
is_past_timeout,           ← stuck flag
sla_due_at, deadline_date,
waiting_since, contractor_sent_at, scheduled_date,
landlord_allocated_at, ooh_dispatched_at, tenant_contacted_at,
compliance_certificate_id, property_label, created_at, reschedule_initiated_by
```

**Drawer — `c1_ticket_detail`**:
```
All ticket columns + nested objects:
  tenant: { id, name, phone, email }
  landlord: { id, name, phone, email }
  manager: { id, name, phone, email, business_name }
  contractor: { name }
  compliance: { cert_id, cert_type, expiry_date, issued_date, certificate_number, issued_by, document_url, status }
  rent_ledger: [{ id, due_date, amount_due, amount_paid, status, room_id, paid_at, payment_method, notes }]
```

Fields that **do not exist** (eliminated in refactor):
```
action_type, action_label, action_context, priority_bucket, source_type, sla_breached, entity_id, job_stage, display_stage, message_stage
```

---

## Key files

| File | What it does |
|------|-------------|
| `src/lib/reason-display.ts` | SSOT label mapping — `getReasonDisplay(reason, isStuck)` |
| `src/hooks/use-ticket-detail.ts` | Drawer hook — returns `TicketDetail` (RPC response shape) |
| `src/components/dashboard/todo-panel.tsx` | `TodoItem` type, `deriveUrgency()`, `deriveCategory()`, `getTodoHref()` |
| `src/components/ticket-detail/ticket-detail-modal.tsx` | Drawer entry point — destructures `useTicketDetail()` |
| `src/components/ticket-detail/ticket-overview.tsx` | Drawer body — header, stage card, category data, people |
| `src/components/ticket-detail/sections/action-bar.tsx` | Sticky CTA bar — `getCTA(reason, isStuck, ticket)` maps reason → action |
| `src/components/ticket-detail/sections/category-data.tsx` | Maintenance/compliance/rent sections in drawer |
| `src/components/dashboard/job-card.tsx` | Dashboard needs-action cards + `SlaRing` component |
| `src/app/(dashboard)/page.tsx` | Dashboard — bucket grouping, column layout |

---

## Work items (priority order)

### High

1. **SLA timer ring** — currently maps remaining time against a fixed 24h window, so a 4h SLA starts nearly empty. Fix: each SLA should start full and count down proportionally to its own total duration. Drawer should also show the timer with a live countdown and what it means.
   - File: `src/components/dashboard/job-card.tsx` (`SlaRing` component)
   - Data available: `sla_due_at` from RPC. You may need `sla_started_at` or `sla_duration` from the backend — if so, request it.

2. **Inline actions in sticky bar** — assign contractor, approve quote, allocate landlord render at the bottom of scrollable content, below the overview. They should expand within or above the sticky action bar so the PM doesn't scroll.
   - Files: `action-bar.tsx`, `ticket-detail-modal.tsx`

3. **Compliance drawer dispatch** — the `compliance_needs_dispatch` CTA currently navigates to the cert page. Wire it to `inline_dispatch` so the PM can dispatch from the drawer. Add a "View certificate" link in the cert details section for when they need the full page.
   - Files: `action-bar.tsx`, `category-data.tsx`

4. **Rent arrears duration** — shows "1 month(s) overdue" when only 2 days overdue (counts ledger rows, not actual duration). Show days overdue from `due_date`. The data is in `rent_ledger[].due_date` — compute the display string from that.
   - File: `category-data.tsx` (`RentSection`)

5. **Ticket drawer title** — falls back to "Maintenance Request" when `issue_title` is null. Generate a short title from `issue_description` (first ~6 words or a sensible truncation). This is display logic — frontend is the right layer.
   - File: `ticket-overview.tsx`

### Medium

6. **Manual ticket form** — no title field. Every manual ticket gets a generic title. Add a title input, or auto-generate from description.
   - Investigate: where does `issue_title` get set? Trace the creation path.

7. **Assign contractor CTA intermittent** — `StageDispatchAction` sometimes doesn't respond. Investigate root cause.

8. **Properties page compliance certs** — list items not clickable. Should link to `/compliance/{cert_id}`.

---

## How to work

- **One item at a time.** Read the relevant files. Understand what's there. Plan the change. Present to Adam if there's a decision. Execute. Verify with `npm run build`. Commit.
- **Commit after each item.** Each commit is a safe rollback point.
- **Log gaps.** If you find something broken or unexpected, log it in `.claude/docs/refactor-notes.md`.
- **When in doubt, ask.** Asking is always faster than undoing.
