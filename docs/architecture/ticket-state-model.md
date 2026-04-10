# Ticket State Model — Architecture Decision

> Decided: 2026-04-09 | Status: Approved | Context: Kill Extras refactor

## The Problem

The dashboard pulled from two RPCs (`c1_get_dashboard_todo` + `c1_get_dashboard_todo_extras`), compliance certs and rent items existed in a "pre-ticket" staging area with different priority/label logic than real tickets, and the frontend computed bucket assignments from hardcoded reason lists. The `next_action` field on `c1_tickets` had 6+ values that didn't map cleanly to how a PM thinks about their work.

## The Decision

### 1. The ticket is the atom

Every problem detected by the system — maintenance issue, expiring cert, incomplete cert, overdue rent, AI handoff — immediately becomes a ticket in `c1_tickets`. If it's not a ticket, it's not on the radar.

Tickets start empty and state is added on top:
- A maintenance handoff starts with `handoff = true`, no trade, no contractor. PM enriches it.
- An incomplete compliance cert starts with `cert_incomplete`, no doc, no expiry. PM uploads and sets expiry.
- Both are tickets with incomplete state. Both sit in `needs_action`. Same pattern.

**Why:** One table, one router, one RPC. No pre-ticket staging. No frontend computing state. No two systems giving different answers for the same item.

### 2. Three-layer state model

Every open ticket's state is described by three layers:

```
┌─────────────────────────────────────────────────┐
│  BUCKET (next_action)                           │
│  Where is this ticket?                          │
│  needs_action | waiting | scheduled | stuck     │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  STATE (next_action_reason)             │    │
│  │  Why is it there?                       │    │
│  │  awaiting_contractor | handoff_review   │    │
│  │  landlord_declined | scheduled | ...    │    │
│  │                                         │    │
│  │  ┌─────────────────────────────────┐    │    │
│  │  │  METADATA (timeout flags)       │    │    │
│  │  │  Has the wait gone too long?    │    │    │
│  │  │  is_past_timeout | duration     │    │    │
│  │  └─────────────────────────────────┘    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Bucket** (`next_action` column) — the PM's mental model. Four values for active tickets:
- `needs_action` — PM's turn. Do something now.
- `waiting` — someone else's turn, no confirmed date. Monitor only.
- `scheduled` — someone else's turn, date confirmed. Nothing until the date.
- `stuck` — someone else's turn, but too long. Escalate or chase.

Plus terminal states: `completed`, `archived`, `dismissed`, `on_hold`, `error`.

**State** (`next_action_reason` column) — the specific, confirmed state. Why the ticket is in that bucket. These are facts:
- `awaiting_contractor` — we sent a message, waiting for response
- `landlord_declined` — landlord said no
- `scheduled` — job booked for a date
- `handoff_review` — AI couldn't handle it, PM must review
- `compliance_needs_dispatch` — cert needs contractor dispatched
- `cert_incomplete` — cert missing doc or expiry date
- `rent_overdue` — rent past due date
- etc..

**Metadata** (computed by dashboard RPC from message timestamps) — timeout flags. These are uncertainties:
- `is_past_timeout` — the wait exceeded the configured threshold
- Timeout thresholds: 48h for contractors, 48h for landlords, 72h for landlord allocation, 120h for landlord in progress, 48h for OOH - this is configurable by the user

### 3. Timeouts are not states

This is the critical distinction.

A **state change** is a confirmed fact: the landlord declined, the contractor booked a date, the PM approved the quote. State changes are written to `next_action_reason` by the router.

A **timeout** is an uncertainty: the contractor hasn't responded in 48 hours. We don't know why. They might respond in an hour. They might never respond. A timeout modifies the bucket (`waiting` → `stuck`) but never rewrites the reason. The underlying state is still `awaiting_contractor` — we just know it's been too long. This forces the PM into a 'chase up' mode.

**Why this matters:**
- If we rewrote the reason to `contractor_no_response`, we'd lose the original state. When the contractor finally responds, we'd need to figure out what state to go back to.
- Timeout is a property of a wait, not a new state. Different waits have different thresholds (contractors: 48h, landlords: 72h). The timeout logic lives in the dashboard RPC where it has access to message timestamps and configurable thresholds.
- The stuck bucket is "waiting items that timed out" — not a separate lifecycle stage.

**Consequence:** `landlord_no_response` is removed as a `next_action_reason` value. It was a timeout disguised as a state. The correct model is: `next_action_reason = 'awaiting_landlord'` + `is_past_timeout = true` → bucket `stuck`.

### 4. Bucket assignment

The router (`c1_compute_next_action`) computes the bucket from the reason:

| Bucket | Reasons |
|--------|---------|
| `needs_action` | `new`, `pending_review`, `handoff_review`, `manager_approval`, `no_contractors`, `landlord_needs_help`, `landlord_resolved`, `ooh_resolved`, `ooh_unresolved`, `landlord_declined`, `job_not_completed`, `compliance_needs_dispatch`, `cert_incomplete`, `rent_overdue`, `rent_partial_payment` |
| `waiting` | `awaiting_contractor`, `awaiting_booking`, `awaiting_landlord`, `allocated_to_landlord`, `ooh_dispatched`, `awaiting_tenant`, `reschedule_pending` |
| `scheduled` | `scheduled` |

The dashboard RPC applies the stuck override:
```
IF is_past_timeout AND next_action = 'waiting'
  → display as 'stuck'
```

The router doesn't know about timeouts. The dashboard RPC does. This keeps the router pure (stateless computation from ticket data) and the timeout logic in the one place that has access to timestamps and thresholds.

### 5. One RPC, one source

`c1_get_dashboard_todo_extras` is deleted. All items flow through `c1_get_dashboard_todo`, which reads from `c1_tickets`. The frontend calls one RPC, groups by `next_action` (bucket), and displays.

Auto-creation crons ensure tickets exist for:
- **Compliance:** Daily cron scans certs. Incomplete (no doc/expiry) → ticket with `cert_incomplete`. Expiring (≤30 days) → ticket with `compliance_needs_dispatch`. Expired → ticket with `compliance_needs_dispatch`, priority Urgent.
- **Rent:** Rent reminder cron creates ticket on day 1 of overdue via `create_rent_arrears_ticket`.
- **Handoff:** WhatsApp intake always creates a ticket, even on handoff. Default: `category = 'maintenance'`, `maintenance_trade = NULL`, `handoff = true`.

Tenancy items are dropped entirely — revisit when tenancy management is a real feature.

### 6. What the dashboard RPC does

`c1_get_dashboard_todo` is the bridge between the ticket row (router-computed state) and the frontend (display). It adds display-layer concerns that the router shouldn't own:

**Responsibilities:**
1. **Timeout detection** — compute `is_past_timeout` from message/allocation timestamps against configurable thresholds. Computed once in a CTE, reused everywhere.
2. **Stuck override** — when `next_action = 'waiting'` AND `is_past_timeout = true`, display bucket becomes `stuck`.
3. **Action labels** — human-readable verb per reason ("Dispatch contractor", "Chase landlord", "Approve quote"). When stuck, label becomes "Chase [party]".
4. **Action context** — detailed narrative with durations ("Contractor hasn't responded in 3 days — chase or redispatch").
5. **Priority score** — numeric sort value: base from ticket priority + age boost + SLA breach boost. No reason-specific boosts.
6. **Sort order** — highest priority score first, then oldest waiting_since.

**What it does NOT do:**
- Compute bucket — that's on the ticket row (from the router)
- Compute priority_bucket — the ticket's `priority` column is the SSOT (escalation crons already manage this)
- Compute action_type — eliminated, replaced by bucket + stuck override
- Determine which reasons are needs_action vs waiting — that's the router's job

**Timeout thresholds (configurable per PM):**

| Wait type | Threshold | Source | Default |
|-----------|-----------|--------|---------|
| Contractor response | `contractor_timeout_hours` | PM record (future) | 48h |
| Booking confirmation | `booking_timeout_days` | PM record (future) | 3 days |
| Landlord approval | `landlord_timeout_hours` | PM record (exists) | 48h |
| Landlord allocation | `landlord_allocation_timeout_hours` | PM record (future) | 72h |
| OOH response (not accepted) | `ooh_timeout_hours` | PM record (future) | 1–4h |
| OOH outcome (accepted) | `ooh_outcome_timeout_hours` | PM record (future) | 48h |
| Tenant response | `tenant_timeout_hours` | PM record (future) | 48h |
| Scheduled job overdue | `scheduled_date < today` | Ticket row | N/A |

**Critical rule:** `needs_action` reasons NEVER timeout. A ticket in `needs_action` means the PM must act — if they haven't acted in 48h, that's a PM productivity issue, not a "stuck" ticket. Stuck is exclusively for `waiting` states where an external party hasn't responded.

### 7. Ticket detail — SSOT across all views

The ticket drawer and dashboard must show identical state for the same ticket. Today they don't — the dashboard computes `action_label`/`action_context` in the dashboard RPC, while the drawer uses three separate frontend systems: `STAGE_CONFIG` (maintenance, 31 entries), `getComplianceStage()` (compliance, 9 entries), and no stage card at all (rent). These are independent implementations that can drift.

**The fix: one detail RPC, universal state display.**

**`c1_ticket_detail(p_ticket_id uuid)` RETURNS jsonb** — returns everything the drawer needs in one call:

```
── Universal (all categories) ──────────────────────
issue_title              — AI short title ("the broken shower")
issue_description        — AI description
property_address         — from property join
category                 — maintenance / compliance_renewal / rent_arrears
maintenance_trade        — "Plumber", "Electrician" (maintenance only)
priority                 — current (escalation-aware)
date_logged              — when reported
next_action              — bucket (needs_action / waiting / scheduled)
next_action_reason       — specific state
action_label             — "Chase landlord", "Dispatch contractor"
                           Computed identically to dashboard RPC
action_context           — "No response in 3 days"
                           Computed identically to dashboard RPC
is_past_timeout          — stuck flag
job_stage                — created / sent / booked / completed
scheduled_date           — booked date (if any)
contractor_quote         — quote amount
final_amount             — final cost
images                   — JSONB array of URLs
tenant                   — { name, phone, email }
landlord                 — { name, phone, email }
contractor               — { name, phone, email } or NULL
manager                  — { name, phone, email }

── Compliance-specific (NULL for other categories) ─
cert_type, cert_expiry_date, cert_status
cert_document_url, cert_issued_date
cert_number, cert_issued_by

── Rent-specific (NULL for other categories) ────────
rent_summary             — { total_owed, total_paid, months_overdue }
rent_ledger              — [{ due_date, amount_due, amount_paid, status }]

── OOH / Landlord allocation (NULL if not applicable)
ooh                      — { dispatched, outcome, notes, cost, accepted_at }
landlord_alloc           — { allocated, outcome, notes, cost, accepted_at }
```

**Why one RPC, not multiple queries:**
The current drawer makes 7 separate queries (`c1_ticket_context`, `c1_tickets`, `c1_messages`, `c1_job_completions`, `c1_ledger`, `c1_outbound_log`, `c1_conversations`) plus category-specific fetches. This creates race conditions (data from different timestamps), complexity, and makes it impossible to guarantee the dashboard and drawer show the same computed fields.

One RPC means: one query, one timestamp, consistent data. Both `c1_get_dashboard_todo` and `c1_ticket_detail` return the same state fields (`next_action`, `next_action_reason`, `is_past_timeout`, timestamps). Labels and context text are computed by the frontend from these fields — one mapping, used by both dashboard and drawer.

### Handoff review — inline transcript

The drawer no longer has a conversation tab. But for `handoff_review` tickets, the PM must read the AI transcript to understand what happened before assigning the ticket. The transcript is shown as a collapsible section on the overview, only for handoff tickets.

**How it works:**
- `c1_ticket_detail` returns `conversation_id` and `handoff_reason`
- If `next_action_reason = 'handoff_review'` AND `conversation_id IS NOT NULL`, the drawer makes one additional query:
  ```
  SELECT log FROM c1_conversations WHERE id = conversation_id
  ```
- The transcript renders as a collapsible "AI Transcript" section below the stage card
- The stage card shows the handoff reason immediately: "No plumber contractor mapped" or "Couldn't categorise issue"
- The PM reads the reason (instant), optionally expands the transcript (detail), then clicks "Review & assign"

**Why only `handoff_review`, not `pending_review`:**
- `pending_review`: AI successfully categorised the issue. The ticket already has category, trade, and description filled in. PM just reviews the AI's work and approves dispatch. Transcript is available but rarely needed.
- `handoff_review`: AI failed. The PM needs to understand what the tenant said to figure out what the issue is. Transcript is essential.

Both have the transcript accessible (the query fires for both), but the drawer only auto-expands the transcript section for `handoff_review`.

**`handoff_reason` column:**

New `TEXT DEFAULT NULL` column on `c1_tickets`. Set by `c1_create_ticket` when `handoff = true`, based on why the AI handed off:

| Handoff scenario | `handoff_reason` value |
|---|---|
| Property not matched | `'property_not_matched'` |
| Issue type unclear / couldn't categorise | `'category_unclear'` |
| No contractor mapped for the trade | `'no_contractor_mapped'` |
| Confidence too low | `'low_confidence'` |
| Tenant requested human | `'tenant_requested'` |

The stage card displays this as human-readable text: "AI couldn't categorise this issue" or "No plumber contractor mapped for 14 Elm Street." PM sees the reason immediately without reading the transcript.

For the audit trail: the `ISSUE_CREATED` event metadata includes `handoff_reason`, proving why the AI couldn't handle it autonomously.

**CTA difference:**
- `handoff_review` → "Review & assign" (PM must set category + contractor)
- `pending_review` → "Approve dispatch" (AI already set category + contractor, PM confirms)

### Labels and context — frontend display logic, not backend computation

`action_label` and `action_context` are **display text**, not business logic. The business logic is: what bucket, what reason, is it timed out? The display logic is: given those fields, what text do we show?

If labels lived in the backend (in both RPCs), changing a label means updating two SQL functions. If labels live in the frontend (one mapping), changing a label means one TypeScript edit. Since both views need the same labels, one source is cleaner.

**Frontend label mapping (one object, used everywhere):**

```typescript
const REASON_DISPLAY: Record<string, { label: string; stuckLabel: string; context: string }> = {
  awaiting_contractor:       { label: 'Awaiting contractor',     stuckLabel: 'Chase contractor',   context: 'Waiting for contractor response' },
  awaiting_booking:          { label: 'Awaiting booking',        stuckLabel: 'Chase booking',      context: 'Contractor needs to confirm a date' },
  awaiting_landlord:         { label: 'Awaiting landlord',       stuckLabel: 'Chase landlord',     context: 'Waiting for landlord to approve the quote' },
  allocated_to_landlord:     { label: 'Landlord managing',       stuckLabel: 'Chase landlord',     context: 'Issue allocated to landlord — awaiting response' },
  ooh_dispatched:            { label: 'Awaiting OOH',            stuckLabel: 'Chase OOH',          context: 'Emergency dispatched to OOH contact — awaiting response' },
  scheduled:                 { label: 'Awaiting completion',     stuckLabel: 'Collect report',     context: 'Job is scheduled — awaiting completion' },
  compliance_needs_dispatch: { label: 'Dispatch contractor',     stuckLabel: '',                   context: '' },  // dynamic — uses cert data
  // ... etc
}
```

**Dynamic context for specific reasons:**

Most reasons have static context text. Some need data from the RPC response:

| Reason | Context template | Data needed |
|---|---|---|
| `compliance_needs_dispatch` | `"{issue_title} expired {days} days ago — dispatch a contractor for renewal"` | `cert_expiry_date`, `issue_title` |
| `cert_incomplete` | `"Certificate missing {what} — upload to complete"` | `cert_document_url IS NULL`, `cert_expiry_date IS NULL` |
| Any stuck reason | `"{label} — {party} contacted {duration} ago, no response"` | Reason-specific timestamp (see below) |

**Stuck context — per-reason timestamp source:**

When a ticket is stuck, the context shows how long the wait has been. Different reasons reference different timestamps:

| Reason | Duration references | Timestamp from RPC |
|---|---|---|
| `awaiting_contractor` | When contractor was first notified | `contractor_sent_at` |
| `awaiting_booking` | When contractor sent the quote | `waiting_since` |
| `awaiting_landlord` | When approval was requested | `waiting_since` |
| `allocated_to_landlord` | When PM allocated to landlord | `landlord_allocated_at` |
| `ooh_dispatched` | When OOH was dispatched | `ooh_dispatched_at` |
| `scheduled` (overdue) | The booked date itself | `scheduled_date` |
| `awaiting_tenant` | When tenant was contacted | `tenant_contacted_at` |

### Timing columns on `c1_tickets`

Columns are the SSOT for current state timing. Events (`c1_events`) are the SSOT for history. Both are written in the same transaction when state changes. The column answers "when did the current wait start?" The events answer "what happened and when, from start to finish?"

| Column | Written when | Currently exists? |
|---|---|---|
| `contractor_sent_at` | First contractor is notified (dispatch flow) | ❌ **New** — currently parsed from `c1_messages.contractors` JSONB at query time. Column replaces the JSONB parse. |
| `tenant_contacted_at` | System/PM contacts tenant for access, availability, or payment | ❌ **New** — needed for `awaiting_tenant` timeout. Set to NULL when tenant responds or reason changes. |
| `landlord_allocated_at` | PM allocates to landlord | ✅ Exists |
| `ooh_dispatched_at` | OOH is dispatched | ✅ Exists |
| `scheduled_date` | Contractor books a date | ✅ Exists |

`waiting_since` stays as a computed fallback in the RPC (`COALESCE(m.updated_at, t.date_logged)`) for reasons that don't have a dedicated timestamp (e.g., `awaiting_booking`, `awaiting_landlord`). It is NOT a column — it's a query-time computation.

**RPC timestamp requirements — both `c1_get_dashboard_todo` and `c1_ticket_detail` must return:**

```
waiting_since          — computed: COALESCE(m.updated_at, t.date_logged) — fallback for reasons without dedicated columns
contractor_sent_at     — column on c1_tickets — when first contractor was notified
tenant_contacted_at    — column on c1_tickets — when tenant was contacted
landlord_allocated_at  — column on c1_tickets — when PM allocated to landlord
ooh_dispatched_at      — column on c1_tickets — when OOH was dispatched
scheduled_date         — column on c1_tickets — booked job date
```

The frontend picks the right timestamp based on the reason. No backend label computation needed.

**Timeline comes from the audit trail:**
The current maintenance drawer computes a 6-step timeline (`deriveTimeline()`) from frontend logic. Compliance and rent have no timeline at all. Under the new model, every `STATE_CHANGED` event in `c1_events` has a timestamp. The drawer queries recent events for the ticket and displays them as the timeline. Same timeline for all categories. Richer and more accurate than the derived version. No frontend computation.

```
ISSUE_CREATED         14:32  — Tenant reported gas smell
CONTRACTOR_ASSIGNED   14:36  — Gas Safe Engineer dispatched
STATE_CHANGED         16:00  — waiting / awaiting_booking (quote received)
STATE_CHANGED         16:30  — scheduled (date booked for Tue 15th)
JOB_COMPLETED         Wed    — Gas leak sealed
TICKET_CLOSED         Wed    — PM verified and closed
```

**What dies in the frontend:**
- `STAGE_CONFIG` (200 lines) — 31 hardcoded maintenance stage entries
- `getComplianceStage()` — 9 hardcoded compliance stage entries
- `deriveTimeline()` — frontend timeline computation
- 7 separate queries in `use-ticket-detail.ts` — replaced by 1 RPC + 1 events query
- Category-specific secondary fetches — absorbed into the RPC

**CTA buttons — frontend concern, backend data:**

The CTA system has two parts:
1. **Backend provides:** `next_action_reason` (what action to take) + context data (IDs, phone numbers, amounts)
2. **Frontend provides:** routing (where to navigate), UI (button style, inline actions)

The backend does NOT compute URLs or navigation paths — that puts frontend routing knowledge in SQL, which is fragile. The frontend maps the reason to the action using the data the RPC already returns.

| `next_action_reason` | CTA label | Action type | Data needed (from RPC) |
|---|---|---|---|
| `compliance_needs_dispatch` | "Dispatch contractor" | navigate | `compliance_certificate_id` |
| `cert_incomplete` | "Complete certificate" | navigate | `compliance_certificate_id` |
| `rent_overdue` | "Contact tenant" | contact | `tenant_phone` |
| `rent_partial_payment` | "Follow up payment" | contact | `tenant_phone` |
| `manager_approval` | "Approve quote" | inline | `ticket_id`, `contractor_quote` |
| `handoff_review` | "Review & assign" | inline | `ticket_id` |
| `pending_review` | "Triage issue" | inline | `ticket_id` |
| `no_contractors` | "Assign contractor" | navigate | `ticket_id`, `property_id` |
| `landlord_declined` | "Contact landlord" | contact | `landlord_phone` |
| `landlord_needs_help` | "Contact landlord" | contact | `landlord_phone` |
| `landlord_resolved` | "Verify & close" | inline | `ticket_id` |
| `ooh_resolved` | "Verify & close" | inline | `ticket_id` |
| `ooh_unresolved` | "Reassign" | navigate | `ticket_id`, `property_id` |
| `job_not_completed` | "Review & redispatch" | navigate | `ticket_id`, `property_id` |
| Any `waiting` reason | No CTA | — | PM is not the actor |
| Any `scheduled` reason | No CTA | — | Waiting for date |

Every piece of data in the "Data needed" column is already returned by `c1_ticket_detail`. The frontend CTA component reads the reason to decide what to show, and the RPC response to know where to link. No additional queries needed.

This replaces the maintenance-specific CTA system and extends actions to compliance and rent drawers (currently view-only).

**The drawer component simplifies to:**
1. Call `c1_ticket_detail(ticketId)` — one RPC, all data
2. Call `c1_events` for this ticket — audit trail as timeline
3. Render universal header: title, address, priority, date, stage card (from `action_label`/`action_context`), CTA
4. Render timeline: from events
5. Render category section: maintenance (images, job details) | compliance (cert details) | rent (arrears summary, payment ledger)
6. Render people: universal section from RPC data

Same component structure, same state display, same CTA system. The only per-category difference is the data section — because a rent ticket genuinely needs a payment ledger and a compliance ticket needs cert details. That's legitimate domain data, not duplicated state logic.

### 8. Real-time updates

Because `next_action` and `next_action_reason` are written to the `c1_tickets` row by the trigger, Supabase Realtime can watch for changes with a single subscription. When a contractor responds, a timeout fires, or a PM acts — the trigger recomputes, the row changes, the subscription fires, the frontend refetches.

**Implementation:**

One channel subscription per PM session, filtered to their tickets:

```typescript
supabase
  .channel('pm-tickets')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'c1_tickets',
    filter: `property_manager_id=eq.${pmId}`,
  }, (payload) => {
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
    filter: `property_manager_id=eq.${pmId}`,
  }, () => {
    // New ticket created (auto-ticket cron, WhatsApp intake)
    refetchDashboard()
  })
  .subscribe()
```

**What triggers a refresh:**
- Bucket change (`next_action` — ticket moves between needs_action/waiting/scheduled)
- Reason change (`next_action_reason` — specific state changed within a bucket)
- Priority change — escalation cron bumped priority
- New ticket INSERT — auto-creation crons, WhatsApp intake

**What doesn't trigger a refresh:**
- Fields unrelated to dashboard state (notes, images, descriptions)
- `c1_messages` changes — these trigger the recompute trigger which updates `c1_tickets`, so the subscription catches the result, not the cause
- `c1_events` inserts — audit trail events don't affect dashboard display

**Fallback:** Refetch on page focus (existing behavior) stays as a safety net. If the Realtime connection drops momentarily, the next focus event catches up.

**Why this works because of the architecture:**
The bucket is on the row. If we computed state at query time (in the RPC, not on the row), there would be nothing to subscribe to — we'd need polling instead. Putting the bucket on the row made realtime a one-subscription problem.

**Scope:** Dashboard page subscription only. The ticket drawer doesn't need realtime — it's opened for a specific ticket, shows current state, and the PM is actively interacting. If they need fresh data, closing and reopening the drawer refetches.

### 9. What the frontend does

The frontend is a display layer. It:
- Calls `c1_get_dashboard_todo` for the dashboard (one RPC, groups by bucket)
- Calls `c1_ticket_detail` for the drawer (one RPC, displays state + category data)
- Calls `c1_events` for timeline (same data as audit trail)
- Subscribes to `c1_tickets` changes via Supabase Realtime (dashboard auto-refreshes)
- Reads `next_action_reason` + `is_past_timeout` for labels via frontend `REASON_DISPLAY` mapping
- Renders CTA from `next_action_reason` (universal mapping)
- Does NOT compute priority, status, bucket, timeout, or escalation
- Does NOT maintain hardcoded stage configs or filter lists
- Does NOT derive timelines from ticket fields

---

## Priority Scoring — Consequence-Driven

### The goal

Not "tell the PM they've breached" — but **"make it impossible to breach by surfacing the right ticket at the right time."** If a PM works top-down through their needs_action list and runs out of time, the things left at the bottom should be the ones with the least consequence for being delayed.

### The formula

```
priority_score = consequence_weight + time_pressure + sla_proximity + age_boost
```

All four components computed at query time by `c1_compute_priority_score()` — a shared SQL function called by both the dashboard RPC and ticket detail RPC. One function, identical scores everywhere.

### Component 1: Consequence weight — "how bad if this goes wrong?"

The "important" axis (Eisenhower). Doesn't change with time. Maps directly from `c1_tickets.priority`:

| Priority | Weight | Rationale |
|---|---|---|
| Emergency | 400 | Life safety, criminal liability. Always tops the list. |
| Urgent | 175 | Habitability, significant property damage |
| High | 100 | Legal compliance, financial risk |
| Medium | 50 | Tenant comfort, minor property issues |
| Low | 25 | Cosmetic, no real risk |

Emergency at 400 means a fresh emergency (400 + 0 + 0 + 0 = 400) always outscores even an old expired cert with SLA breach (100 + 150 + 100 + 48 = 398). Life safety trumps paperwork.

### Component 2: Time pressure — "how close is the external deadline?"

The "urgent" axis (Eisenhower). Increases as deadlines approach. Only applies to tickets with measurable deadlines. Computed from `c1_tickets.deadline_date`:

| Time remaining | Boost | Behaviour it drives |
|---|---|---|
| Deadline already passed | +150 | "You're in breach. Fix this NOW." |
| ≤24 hours | +100 | "Drop everything." |
| ≤48 hours | +75 | "This is today's priority." |
| ≤7 days | +25 | "Plan for this week." |
| >7 days or NULL | +0 | "On the radar, no pressure yet." |

**What counts as deadline:**
- Compliance: `cert_expiry_date` → set as `deadline_date` at ticket creation
- Rent: `rent_due_date` → set as `deadline_date` at ticket creation
- Maintenance: NULL (urgency comes from severity, not a date)

### Component 3: SLA proximity — "how close is the PM to missing their response window?"

Drives behaviour change — the PM sees items rising as their SLA window closes. Computed from `c1_tickets.sla_due_at` vs `now()`:

| SLA status | Boost | Behaviour |
|---|---|---|
| Breached | +100 | "You already missed the window." |
| ≤1 hour remaining | +75 | "Breaches in under an hour." |
| ≤4 hours remaining | +50 | "Breaches before end of day." |
| ≤24 hours remaining | +25 | "Breaches tomorrow if you don't act today." |
| >24 hours or NULL | +0 | "SLA comfortable." |

### Component 4: Age boost — "how long has this been sitting?"

Gentle nudge. Old items rise gradually. Capped to prevent ancient low-priority items outranking fresh high-priority ones. Computed from `c1_tickets.waiting_since` vs `now()`:

```
age_boost = MIN(hours_in_current_state, 48)
```

### `deadline_date` column

New `DATE DEFAULT NULL` column on `c1_tickets`. Set once at ticket creation, never changes.

| Category | Set to | Set by |
|---|---|---|
| `compliance_renewal` | `cert_expiry_date` from `c1_compliance_certificates` | `c1_compliance_auto_ticket()` cron or `compliance_dispatch_renewal()` |
| `rent_arrears` | `rent_due_date` from `c1_rent_ledger` | `create_rent_arrears_ticket()` |
| `maintenance` | NULL | N/A — urgency from priority, not deadline |

Eliminates conditional joins to `c1_compliance_certificates` and `c1_rent_ledger` in the dashboard RPC. One column, all categories.

### `waiting_since` column

New `TIMESTAMPTZ DEFAULT NULL` column on `c1_tickets`. Written by the recompute trigger when `next_action_reason` changes. Set to `now()` on state entry.

Eliminates the `c1_messages` join that the current RPC uses to compute `COALESCE(m.updated_at, t.date_logged)`. The trigger already fires on message changes, so it always has the fresh timestamp.

### `sla_due_at` — legally grounded defaults

`sla_due_at` is set by the recompute trigger when `next_action_reason` changes. Defaults based on UK legal requirements (Awaab's Law, Gas Safety Regulations, EICR Regulations) and industry standards (ARLA/RICS guidance):

| Reason / Priority | SLA | Legal basis |
|---|---|---|
| Emergency priority | 24h from state entry | Awaab's Law: investigate + make safe within 24h |
| Urgent priority | 48h from state entry | HHSRS Category 1 response + Awaab's Law significant hazard |
| `compliance_needs_dispatch` (cert expired) | 0h (already breached) | Gas Safety / EICR Regs: must have valid cert at all times |
| `compliance_needs_dispatch` (cert ≤7 days) | 4h | Prevent breach — must dispatch immediately |
| `compliance_needs_dispatch` (cert ≤30 days) | 48h | Industry: start 8-12 weeks before expiry |
| `cert_incomplete` | 7 days | No legal deadline, but property may be unlettable |
| `rent_overdue` | 48h | Industry: early intervention best practice |
| `handoff_review` / `pending_review` | 4h | Awaab's Law: clock starts at awareness. Fast triage essential. |
| `no_contractors` | 4h | Issue has no one assigned — PM must act |
| `manager_approval` | 24h | Don't block the contractor |
| `job_not_completed` | 24h | Work failed, needs rapid redispatch |
| High priority | 48h | Industry standard |
| Medium priority | 72h | Industry standard |
| Low priority | 7 days | Industry standard |

**SLA resets on state change.** When `next_action_reason` changes, the trigger computes a fresh `sla_due_at` for the new state. The old SLA is recorded in the `STATE_CHANGED` audit event metadata (including whether it was met or breached at the time of transition).

**SLA only applies to `needs_action` states.** The trigger sets `sla_due_at` based on the bucket:
- **Entering `needs_action`** → `sla_due_at` set from defaults table (4h for handoff, 24h for approval, etc.)
- **Entering `waiting` or `scheduled`** → `sla_due_at = NULL` (PM is not the actor, no SLA applies)
- **Returning to `needs_action`** → fresh `sla_due_at` set for the new reason

`sla_due_at = NULL` is important — it prevents stale SLA values from appearing in queries like "all tickets with breached SLAs." If the PM met their SLA and dispatched, the old SLA value shouldn't linger on the row. The row holds CURRENT state only. History lives in the audit trail.

The trigger CASE for `sla_due_at`:
```sql
sla_due_at = CASE
  -- needs_action states get an SLA
  WHEN v_result.next_action = 'needs_action' THEN
    CASE
      WHEN priority = 'Emergency' THEN now() + interval '24 hours'
      WHEN v_result.next_action_reason IN ('handoff_review', 'pending_review', 'no_contractors') THEN now() + interval '4 hours'
      WHEN v_result.next_action_reason = 'manager_approval' THEN now() + interval '24 hours'
      WHEN priority = 'Urgent' THEN now() + interval '48 hours'
      WHEN priority = 'High' THEN now() + interval '48 hours'
      WHEN priority = 'Medium' THEN now() + interval '72 hours'
      ELSE now() + interval '7 days'
    END
  -- waiting/scheduled/terminal states: NULL (no SLA)
  ELSE NULL
END
```

### SLA vs Timeout — different systems, different purposes

| | SLA | Timeout |
|---|---|---|
| Answers | "How long does the PM have to act?" | "Has the other party gone silent?" |
| Applies to | `needs_action` tickets (PM's turn) | `waiting` tickets (someone else's turn) |
| Clock source | `sla_due_at` | `contractor_sent_at`, `landlord_allocated_at`, etc. |
| On breach | Score jumps (+100), ticket rises in PM's list | Bucket overrides: `waiting` → `stuck` |
| Who failed | PM took too long | External party took too long |

They operate on different buckets, different clocks, different consequences. A ticket is either `needs_action` (SLA applies) or `waiting` (timeout applies). Never both simultaneously.

### Trigger update — writes 4 fields on state change

The recompute trigger writes all state fields in a single UPDATE when `next_action_reason` changes:

```sql
UPDATE c1_tickets SET
  next_action = v_result.next_action,
  next_action_reason = v_result.next_action_reason,
  waiting_since = now(),
  sla_due_at = CASE
    WHEN v_result.next_action = 'needs_action' THEN
      -- SLA set from defaults (see SLA table above)
      CASE ... END
    ELSE NULL  -- waiting/scheduled/terminal: no SLA, NULL out any stale value
  END
WHERE id = v_ticket_id
  AND (next_action IS DISTINCT FROM v_result.next_action
    OR next_action_reason IS DISTINCT FROM v_result.next_action_reason);
```

One UPDATE, four fields, only when state actually changes. `sla_due_at` and `waiting_since` always reflect the current state, never stale.

### Shared scoring function

```sql
CREATE FUNCTION c1_compute_priority_score(
  p_priority text, p_deadline_date date,
  p_sla_due_at timestamptz, p_waiting_since timestamptz
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT (
    -- Consequence weight
    CASE p_priority
      WHEN 'Emergency' THEN 400 WHEN 'Urgent' THEN 175
      WHEN 'High' THEN 100 WHEN 'Medium' THEN 50 ELSE 25
    END
    -- Time pressure
    + CASE
      WHEN p_deadline_date IS NULL THEN 0
      WHEN p_deadline_date < CURRENT_DATE THEN 150
      WHEN p_deadline_date <= CURRENT_DATE + 1 THEN 100
      WHEN p_deadline_date <= CURRENT_DATE + 2 THEN 75
      WHEN p_deadline_date <= CURRENT_DATE + 7 THEN 25
      ELSE 0
    END
    -- SLA proximity
    + CASE
      WHEN p_sla_due_at IS NULL THEN 0
      WHEN p_sla_due_at < now() THEN 100
      WHEN p_sla_due_at <= now() + interval '1 hour' THEN 75
      WHEN p_sla_due_at <= now() + interval '4 hours' THEN 50
      WHEN p_sla_due_at <= now() + interval '24 hours' THEN 25
      ELSE 0
    END
    -- Age boost
    + LEAST(EXTRACT(EPOCH FROM (now() - COALESCE(p_waiting_since, now()))) / 3600, 48)::int
  )
$$;
```

Called by both `c1_get_dashboard_todo` and `c1_ticket_detail`:
```sql
c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since) AS priority_score
```

One function, both views, identical scores.

### Why there are no reason-specific boosts

The previous dashboard RPC had hardcoded boosts: `compliance_pending` +30, `handoff_review` +30, `no_contractors` +25, unresponsive contractor +25. These are intentionally removed.

**Why:** Reason-specific boosts were a crude approximation of what SLA proximity does precisely. A flat +30 for `handoff_review` says "this type is always important." SLA proximity says "+50 because you have 1 hour left to act" — it escalates over time based on how close the PM is to missing the response window. That's more accurate and drives better behaviour.

**The math proves it:**

| Scenario | Old score | New score (hour 0 → hour 3) |
|---|---|---|
| Fresh handoff, Medium | 55 (flat) | 50 → 103 (SLA ramp) |
| `no_contractors`, Medium, 2h old | 52 (flat) | 102 (SLA ≤4h kicks in) |
| Expired cert, High, 48h old | 178 | 398 (deadline + SLA breach) |

The new formula starts slightly lower for fresh tickets (50 vs 55) because a handoff that JUST arrived is genuinely the same urgency as any other fresh Medium ticket. The urgency comes from the SLA clock running — after 1-2 hours the SLA proximity component pushes it well above where the flat boost ever was.

Every reason that previously had a boost now has an SLA entry in the defaults table (`handoff_review`: 4h, `no_contractors`: 4h, `pending_review`: 4h). The SLA does what the boost did, but better — it escalates progressively instead of being a constant, and it's configurable per PM in the future.

### Awaab's Law — future sprint

The current system tracks one SLA per ticket per state. Awaab's Law requires multi-stage tracking:
- Investigate within 10 working days
- Written findings to tenant within 3 working days of investigation
- Safety work within 5 working days
- Long-term repairs started within 5 working days, max 12 weeks

This is a product feature worth its own sprint — a selling point for HMO demos ("Yarro tracks Awaab's Law compliance for you"). The foundation built here (SLA on the row, scoring function, audit trail) makes it straightforward to extend with phase tracking.

---

## Error Recovery and Failure Modes

### Core rule: audit trail is non-negotiable

If the audit event can't be written, the operation fails. A ticket without an audit trail is worse than no ticket at all — the audit trail is a legal defence record. This means:

- **RPC-driven operations** (compliance auto-ticket, rent auto-ticket, compliance dispatch, PM actions): the operation and its audit event are in the same PL/pgSQL function, which means the same Postgres transaction. If `c1_log_event()` fails, the entire transaction rolls back — ticket INSERT, state UPDATE, everything. Neither happens without the other.
- **No exception swallowing for audit events.** Do NOT wrap `c1_log_event()` in an EXCEPTION block that silently continues. If the event can't be written, the operation must fail loudly.

### Edge function failures

Edge functions (`yarro-tenant-intake`, `yarro-ticket-notify`, `yarro-scheduling`) make sequential calls: external API (Twilio/OpenAI) → Supabase RPC → Supabase update. These are NOT one transaction — an external API call can succeed while the database write fails.

**Mitigations:**

1. **Timestamp + message row in same RPC call.** When dispatching a contractor, the RPC that creates the `c1_messages` row should also write `contractor_sent_at` on the ticket in the same transaction. If the RPC fails, both roll back. If the RPC succeeds but the edge function crashes afterward, the database state is consistent (contractor notified, timestamp recorded).

2. **Edge functions are idempotent.** If a function crashes and Supabase retries it, the second run shouldn't create duplicates. The dedup checks (e.g., `NOT EXISTS open ticket for this cert`) handle this.

3. **Fallback for missing timestamps.** If `contractor_sent_at` is NULL (edge function crashed before writing), the timeout check falls back to `waiting_since` (from `c1_messages.updated_at`). Less precise but still functional. The system degrades gracefully, not catastrophically.

4. **Twilio webhook errors: always return 200.** If a Twilio webhook handler (`yarro-tenant-intake`, `yarro-inbound-reply`) encounters an error, it MUST return HTTP 200 to Twilio. Returning 4xx/5xx causes Twilio to retry infinitely, flooding the system. The error should be:
   - Logged to Sentry (with full context: phone, message, error)
   - Sent to Telegram alert channel
   - Returned as 200 with error metadata in the response body (Twilio ignores the body)

### Supabase Auth — known hang bug

Supabase Auth has a known issue where `getSession()` can hang indefinitely under certain race conditions. The ticket state model and its RPCs do NOT go through Supabase Auth — they use `SECURITY DEFINER` functions called by the service role. This is safe.

**Caution zone:** If any new frontend code in this sprint calls `getSession()` or `getUser()` during initial load (e.g., to get `pm_id` for the Realtime subscription filter), it must use the existing two-layer auth pattern in `pm-context.tsx`. Do NOT introduce new auth calls outside this pattern.

### Router errors (`unknown_category`)

If the router encounters a ticket with a category it doesn't recognise:
1. `RAISE WARNING` — goes to Postgres logs
2. Returns `next_action = 'error'`, `next_action_reason = 'unknown_category'`
3. Trigger writes this to the ticket row
4. Dashboard RPC includes it — mapped to `needs_action` bucket with override label "System error — review ticket"
5. PM sees it on dashboard and can investigate

**This sprint:** Error tickets appear on the dashboard with a clear error indicator. That's sufficient for a solo PM — you'll see it and fix it.

**Future:** Sentry alert pipeline from Postgres `RAISE WARNING` → Sentry. Requires Postgres log shipping to an external service. Not this sprint.

### Observable errors — what this sprint adds

| Error type | Where it's visible | How |
|---|---|---|
| Router error (`unknown_category`) | Dashboard | Error ticket in needs_action with "System error" label |
| RPC failure (audit log can't write) | Operation fails | Transaction rolls back, frontend shows error toast |
| Edge function crash | Sentry + Telegram | Existing Sentry SDK catches unhandled exceptions. Telegram alerts via `alertTelegram()` helper (already exists in edge functions). |
| Twilio webhook error | Sentry + Telegram | Logged and alerted, 200 returned to Twilio |
| Timeout cron failure | Postgres logs | Cron job errors go to `cron.job_run_details`. Future: alert on failure. |
| Missing timestamp (NULL fallback) | Silently degraded | Timeout uses `waiting_since` instead of dedicated timestamp. No visible error — works but less precise. |

### Concurrency and deadlocks

**Not a risk with this architecture.** The trigger pattern is one-directional: read ticket + messages → compute → write ticket. No circular dependencies between tables. Postgres row-level locking handles concurrent updates to the same ticket (second transaction waits, gets lock, recomputes with fresh state). Different tickets never contend.

The recursion guard (`pg_trigger_depth() > 1`) prevents the trigger's own UPDATE from firing the trigger again. The `STATE_CHANGED` event insert goes to `c1_events` which has no triggers back to `c1_tickets`.

### Transactionality guarantees

| Operation | Atomic with audit event? | Why |
|---|---|---|
| Compliance auto-ticket (cron RPC) | ✅ Yes | Same PL/pgSQL function, same transaction |
| Rent auto-ticket (cron RPC) | ✅ Yes | Same function |
| Compliance dispatch (PM action) | ✅ Yes | Same function |
| PM triage / approve / reassign | ✅ Yes | Same function |
| State change (trigger) | ✅ Yes | `STATE_CHANGED` event logged in same trigger function |
| Contractor dispatch (edge function) | ⚠️ Partial | Twilio send is external. DB writes (message row + timestamp + event) are one transaction. |
| WhatsApp intake (edge function) | ⚠️ Partial | OpenAI call is external. Ticket creation + event are one transaction. |
| Timeout detection (cron) | ✅ Yes | `TIMEOUT_TRIGGERED` event logged in same cron function |

---

## Values Reference

### `next_action` (bucket) — column values
```
-- Active buckets (written by router)
needs_action    — PM must act
waiting         — someone else's turn
scheduled       — date confirmed

-- Terminal states (written by router)
completed       — done
archived        — archived
dismissed       — dismissed handoff
on_hold         — parked

-- Error (written by router)
error           — router couldn't match (should never appear)
```

### Dashboard display bucket
```
-- NOT a next_action value — computed by dashboard RPC as an override
stuck           — waiting item where is_past_timeout = true
                  The underlying next_action stays 'waiting'
                  The dashboard displays it as 'stuck' for PM visibility
```

### `next_action_reason` values (CHECK constraint)
```
-- Universal
new, completed, archived, dismissed, on_hold

-- Maintenance: PM triage
pending_review, handoff_review

-- Maintenance: landlord flow
allocated_to_landlord          — PM allocated to landlord, waiting for acceptance then outcome
landlord_needs_help            — landlord asked for help (needs_action)
landlord_resolved              — landlord says done, PM must verify (needs_action)
landlord_declined              — landlord said no (needs_action)

-- Maintenance: OOH flow
ooh_dispatched                 — OOH dispatched, waiting for acceptance then outcome (waiting)
ooh_resolved                   — OOH says done, PM must verify (needs_action)
ooh_unresolved                 — OOH couldn't fix it (needs_action)

-- Maintenance: contractor flow
awaiting_contractor            — contractor notified, waiting for response/quote (waiting)
awaiting_booking               — contractor quoted (implicit acceptance), waiting for date (waiting)
scheduled                      — job booked for a specific date (scheduled)
reschedule_pending             — reschedule requested, waiting for other party to decide (waiting)
awaiting_landlord              — approval request sent to landlord (waiting)
manager_approval               — quote waiting for PM approval (needs_action)
no_contractors                 — all contractors exhausted, PM must assign (needs_action)
job_not_completed              — contractor says job isn't done (needs_action)

-- Cross-category
awaiting_tenant                — waiting for tenant action: access, availability, confirmation (waiting)

-- Compliance
compliance_needs_dispatch      — cert needs contractor assigned (needs_action) [renamed from compliance_pending]
cert_incomplete                — cert missing doc or expiry date (needs_action)
cert_renewed                   — cert renewed, done (terminal)

-- Rent
rent_overdue                   — rent past due, PM must chase (needs_action)
rent_partial_payment           — partial payment, PM must follow up remainder (needs_action)
rent_cleared                   — rent paid, done (terminal)

-- Error
unknown_category               — router couldn't match (should never appear)
```

### Removed values
```
landlord_no_response   — timeout disguised as a state → awaiting_landlord + is_past_timeout
landlord_in_progress   — replaced by acceptance metadata on allocated_to_landlord
ooh_in_progress        — replaced by acceptance metadata on ooh_dispatched
compliance_pending     — renamed to compliance_needs_dispatch for clarity
```

### Acceptance model (OOH + landlord only)

Contractors have implicit acceptance via the quote flow (quote received = accepted).
OOH contacts and landlords need explicit acceptance because they are external parties
the PM has limited control over.

**How it works:**
- PM dispatches OOH or allocates to landlord → `next_action_reason` set (`ooh_dispatched` / `allocated_to_landlord`)
- Portal shows "Accept Job" as first screen
- Contact clicks Accept → `accepted_at` timestamp written to ticket/message record
- Audit event logged: `OOH_ACCEPTED` / `LANDLORD_ACCEPTED`
- Portal then shows outcome buttons (Resolved / Can't resolve / Need help)
- If no acceptance within threshold → timeout → stuck

**Two-tier timeouts:**
```
ooh_dispatched + accepted_at IS NULL      → short timeout (30min–1h for emergencies)
ooh_dispatched + accepted_at IS NOT NULL  → longer timeout (48h for outcome)

allocated_to_landlord + accepted_at IS NULL     → short timeout (24h)
allocated_to_landlord + accepted_at IS NOT NULL → longer timeout (72–120h for outcome)
```

**Why acceptance is metadata, not a state:**
The PM's action doesn't change between "waiting for acceptance" and "accepted, waiting for outcome."
They're waiting either way. The bucket stays `waiting`. The difference is timeout threshold —
which is metadata, exactly where configurable behavior lives. The audit trail captures the
acceptance as an event with a timestamp, which is what matters legally.

### Reschedule — bidirectional, state-changing

A reschedule request changes the ticket from `scheduled` to `waiting`. The date is no longer confirmed — it's under negotiation.

**Who can request:** Either party.
- **Tenant** requests via tenant portal (existing `c1_submit_reschedule_request` RPC)
- **Contractor** requests via contractor portal (new `c1_submit_contractor_reschedule_request` RPC)

Both result in the same state: `reschedule_pending` (waiting for the other party to decide).

**Schema:**
```sql
-- Existing (no change):
reschedule_requested     BOOLEAN DEFAULT false
reschedule_date          TIMESTAMPTZ           -- proposed new date
reschedule_reason        TEXT                  -- why
reschedule_status        TEXT                  -- 'pending' / 'approved' / 'declined'
reschedule_decided_at    TIMESTAMPTZ           -- when decision was made

-- New:
reschedule_initiated_by  TEXT                  -- 'tenant' or 'contractor'
```

**Router — checked before `scheduled` in maintenance + compliance sub-routines:**
```sql
IF COALESCE(p_ticket.reschedule_requested, false)
   AND p_ticket.reschedule_status = 'pending' THEN
  RETURN QUERY SELECT 'waiting'::text, 'reschedule_pending'::text;
  RETURN;
END IF;
```

Must go before the `scheduled` check. A ticket with a pending reschedule is NOT scheduled — it's in limbo.

**Trigger watch list:** Add `reschedule_requested`, `reschedule_status` to `trg_tickets_recompute_next_action`.

**Outcomes:**
- Other party accepts → `reschedule_status = 'approved'`, `scheduled_date` updated, `reschedule_requested = false`. Router recomputes → back to `scheduled`.
- Other party rejects → `reschedule_status = 'declined'`, original date holds, `reschedule_requested = false`. Router recomputes → back to `scheduled`.
- No response → timeout → stuck. PM chases.

**24-hour urgency override (dashboard RPC):**
If a reschedule is requested within 24 hours of the original `scheduled_date`, the portal flow doesn't have time to complete. The dashboard RPC overrides the bucket:
```
IF reason = 'reschedule_pending' AND scheduled_date - now() <= interval '24 hours'
  → display bucket = 'needs_action' (PM must call contractor/tenant directly)
```

**Display override evaluation order (dashboard RPC — first match wins):**
1. **Reschedule urgency** → `needs_action` (PM must call, job is imminent)
2. **Stuck override** → `stuck` (external party timed out, PM must chase)

Order matters: if a reschedule is pending AND timed out AND within 24h of the scheduled date, the PM must call — that's more urgent than chasing. `needs_action` wins over `stuck`.

If the reschedule is pending and timed out but the scheduled date is >24h away, the stuck override applies — the PM should chase the other party through normal channels, there's still time for the portal flow.

**Frontend display:**
`reschedule_initiated_by` tells the frontend who we're waiting for:
- `'tenant'` initiated → waiting for contractor → "Contractor deciding on new date"
- `'contractor'` initiated → waiting for tenant → "Tenant deciding on new date"

CTA follows the same logic — chase whoever hasn't responded.

**Audit events:**
```
RESCHEDULE_REQUESTED   — metadata: { initiated_by, proposed_date, reason, original_date }
RESCHEDULE_DECIDED     — metadata: { decided_by, approved, new_date, original_date }
```

### Contractor withdrawal — per-contractor event, not ticket state

When a contractor explicitly declines or withdraws (at any stage — before quoting, after quoting, after booking), the system:

1. Marks that specific contractor as `'withdrawn'` in `c1_messages.contractors[].status`
2. Logs `CONTRACTOR_WITHDRAWN` audit event with contractor name and reason
3. Auto-cycles to next contractor in the array (if one exists) — ticket stays `awaiting_contractor`
4. If no more contractors available:
   - Logs BOTH `CONTRACTOR_WITHDRAWN` (for the last contractor) AND a second event — the ticket transitions to `no_contractors`
   - Two events on the last contractor: proves we tried everyone, the last one withdrew, and now there's nobody left

**Why not a ticket-level state:** Contractor withdrawal triggers cycling to the next contractor. The ticket is still `awaiting_contractor` — just with a different contractor. Only when ALL contractors are exhausted does the ticket-level state change (to `no_contractors` / `needs_action`). The withdrawal is per-contractor, the exhaustion is per-ticket.

**This sprint (manual):** New RPC `c1_mark_contractor_withdrawn(p_ticket_id, p_contractor_id, p_reason)`:
- Marks contractor as withdrawn in JSONB
- If next contractor exists: cycles to them, stays `awaiting_contractor`
- If no more: sets `no_contractors` state
- Logs `CONTRACTOR_WITHDRAWN` event (+ second event if last contractor)
- PM triggers this manually from the drawer

**Future (automatic):** Contractor portal gets a "Decline/Cancel" button that calls this RPC via token auth.

**Audit trail for contractor flow:**
```
CONTRACTOR_ASSIGNED    — contractor dispatched
CONTRACTOR_WITHDRAWN   — contractor explicitly declined/withdrew { contractor_name, reason, remaining_contractors }
CONTRACTOR_ASSIGNED    — next contractor dispatched (if available)
CONTRACTOR_WITHDRAWN   — next contractor also withdrew { contractor_name, reason, remaining_contractors: 0 }
STATE_CHANGED          — waiting/awaiting_contractor → needs_action/no_contractors
```

Complete paper trail: who was tried, who said no, when there was nobody left.

### `awaiting_tenant` — cross-category waiting state

**What it is:** A universal state that means "we need the tenant to do something before this ticket can progress." Applies to all categories — maintenance (access/availability), compliance (document upload), rent (payment).

**Schema — follows existing boolean flag pattern:**

```sql
-- New columns on c1_tickets (same pattern as on_hold, ooh_dispatched, landlord_allocated)
awaiting_tenant BOOLEAN DEFAULT false
tenant_contacted_at TIMESTAMPTZ DEFAULT NULL
```

Existing pattern for reference:
```sql
-- on_hold: boolean + held_at timestamp (lines 393, 510 in remote_schema.sql)
-- ooh_dispatched: boolean + ooh_dispatched_at timestamp (lines 398-399)
-- landlord_allocated: boolean + landlord_allocated_at timestamp (lines 407-408)
```

**Router placement — universal section, after `on_hold`, before category dispatch:**

```sql
-- Current router order (c1_compute_next_action):
-- 1. NOT FOUND → error
-- 2. archived → archived/dismissed
-- 3. closed → completed  
-- 4. on_hold → on_hold
-- ← awaiting_tenant goes HERE
-- 5. category = compliance_renewal → compute_compliance_next_action
-- 6. category = rent_arrears → compute_rent_arrears_next_action
-- 7. category = maintenance → compute_maintenance_next_action
-- 8. unknown → error

IF COALESCE(v_ticket.awaiting_tenant, false) = true AND lower(v_ticket.status) = 'open' THEN
  RETURN QUERY SELECT 'waiting'::text, 'awaiting_tenant'::text;
  RETURN;
END IF;
```

**Why universal, not per-category:** A maintenance ticket can wait on tenant access. A compliance ticket can wait on tenant document upload. A rent ticket can wait on payment. The wait is the same pattern regardless of category — boolean flag, timestamp, timeout threshold.

**Why after `on_hold`:** If a ticket is both `on_hold = true` AND `awaiting_tenant = true`, on_hold wins. The PM explicitly paused the ticket — that's a stronger signal than "waiting for tenant."

**Trigger — must add to column watch list:**

The recompute trigger currently fires on:
```sql
-- Current (from remote_schema.sql line 8711):
AFTER INSERT OR UPDATE OF status, handoff, job_stage, archived, pending_review,
  on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome
ON public.c1_tickets
```

Must add `awaiting_tenant` to this list:
```sql
-- Updated:
AFTER INSERT OR UPDATE OF status, handoff, job_stage, archived, pending_review,
  on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome,
  awaiting_tenant
ON public.c1_tickets
```

Without this, flipping `awaiting_tenant = true` would not fire the recompute trigger and the bucket/reason would not update.

**How it's set (this sprint — manual only):**

PM action RPC (new: `c1_set_awaiting_tenant`):
```sql
UPDATE c1_tickets 
SET awaiting_tenant = true, 
    tenant_contacted_at = now()
WHERE id = p_ticket_id;

-- Audit event (same transaction):
PERFORM c1_log_event(p_ticket_id, 'PM_AWAITING_TENANT', 'PM', NULL, NULL,
  jsonb_build_object('reason', p_reason));  -- 'access', 'availability', 'payment', etc.
```

**How it's cleared:**

PM manually clears (same RPC with `p_awaiting = false`):
```sql
UPDATE c1_tickets
SET awaiting_tenant = false,
    tenant_contacted_at = NULL
WHERE id = p_ticket_id;
```

Trigger fires → router recomputes → ticket falls through to its category sub-routine → correct next state is computed from scratch. The router doesn't need to know "what state to go back to" — it recomputes from all ticket fields.

**Future (edge function sprint):** System auto-sets `awaiting_tenant = true` when it sends a WhatsApp to the tenant asking for access/availability. Auto-clears when tenant responds. Requires edge function changes — not this sprint.

**Timeout:**
```
awaiting_tenant + tenant_contacted_at → timeout threshold: pm.tenant_timeout_hours (default 48h)
```

If tenant doesn't respond within threshold → `is_past_timeout = true` → dashboard shows as stuck → PM chases.

## Configurability

The three-layer model is designed so that user configuration changes **thresholds and flow**, never the bucket model or the state set.

### What's rigid (system-defined, never changes per user)

**Buckets** — every PM sees the same 4 buckets. You can't add a 5th bucket or rename them. This is the universal mental model.

**States** — the set of possible `next_action_reason` values is defined by the system (CHECK constraint). Users can't invent new states at runtime. But which states a ticket *reaches* depends on configuration.

### What's flexible (user-configurable)

**Timeout thresholds** — metadata layer. The PM (or property) sets how long until a wait is considered timed out. This changes when `is_past_timeout` flips, moving tickets from `waiting` → `stuck`. The states and buckets don't change — only the timing.

| Threshold | Default | Where stored | Future: configurable per |
|-----------|---------|-------------|--------------------------|
| Contractor response | 48h | Dashboard RPC (hardcoded) | PM or property |
| Landlord response | 48h | `c1_property_managers.landlord_timeout_hours` | PM (already exists) |
| Landlord allocation | 72h | Dashboard RPC (hardcoded) | PM or property |
| Landlord in progress | 120h | Dashboard RPC (hardcoded) | PM or property |
| OOH response | 48h | Dashboard RPC (hardcoded) | PM or property, potentially different for business hours vs emergency |

**State bypasses** — router-level. Configuration flags cause the router to skip certain states entirely:
- `require_landlord_approval = false` → skips `awaiting_landlord` / `manager_approval` (exists today)
- PM is landlord (`landlord_id = pm_id`) → skips entire landlord approval sequence (future)
- Auto-approve under threshold (`auto_approve_limit`) → skips `manager_approval` for small quotes (exists today)

The states still exist in the system — they're just never reached for that ticket. No special casing needed in the frontend.

**Edge function behavior** — how actions are performed, not what states result:
- Contractor dispatch mode: all at once vs sequential (future: `dispatch_mode` on PM or property)
- OOH timing: different notification windows for emergency vs business hours (future)
- Reminder frequency: how often to chase before escalating (future)

These change the *flow between states* (how quickly a ticket moves from `awaiting_contractor` to `scheduled`), not the states themselves.

### Why this works

Configuration only touches:
1. **Numbers** in the metadata layer (thresholds, limits)
2. **Flags** that the router reads to decide which states to enter (bypasses)
3. **Edge function behavior** for how actions are performed

It never touches:
- The 4 bucket values
- The set of possible states
- The bucket assignment logic
- The frontend display logic

This means any new configuration option is either a new threshold (metadata), a new bypass flag (router), or a new edge function behavior — all backend changes. The frontend stays a pure display layer regardless of how the PM configures their account.

---

## Deduplication — Two Layers

**Layer 1: Ticket creation dedup** — prevents duplicate tickets for the same issue:
- Compliance: cron checks `NOT EXISTS open ticket for this cert` before creating
- Rent: `create_rent_arrears_ticket` checks for existing open `rent_arrears` ticket per tenant
- Handoff: one ticket per conversation (conversation_id FK)

**Layer 2: AI intake dedup** — completely separate, untouched by this refactor:
- WhatsApp AI checks for similar open tickets on the same property before creating a new one
- Two tenants report broken heating → AI asks "is this the same issue?"
- Lives in `yarro-tenant-intake` edge function, not in the dashboard layer

The extras dedup logic (LEFT JOIN to tickets, NOT EXISTS) dies because extras dies. The ticket IS the item. Creation-time dedup and AI intake dedup both stay.

---

## Data Tables — What Stays and Why

Three data tables continue alongside `c1_tickets`. Each has a distinct role that doesn't overlap with the ticket state model:

| Table | Role | Read by | Relationship to tickets |
|---|---|---|---|
| `c1_rent_ledger` | **Financial record.** Payment history: due dates, amounts, payments received, status. | `c1_ticket_detail` RPC (rent section) + rent page | Ticket says "there's an arrears problem." Ledger says "here's the payment history." |
| `c1_outbound_log` | **Immutable send record.** Every outbound WhatsApp/SMS sent by the system, with Twilio SID for verification. | Audit trail page | Proves messages were sent. Legally important — Twilio SIDs are evidence. |
| `c1_conversations` | **Immutable intake transcript.** Full WhatsApp chat between tenant and AI during intake. | Audit trail page (not the drawer) | Records what the tenant said and what the AI responded. Immutable after ticket creation. |

**None of these are state.** They're records. The ticket's state (`next_action`, `next_action_reason`) is the SSOT for what's happening. These tables provide context and evidence.

**Conversations are audit-page only.** The ticket drawer no longer has a conversation tab. If the PM needs the raw WhatsApp transcript, they go to the audit page for that ticket. The drawer shows state, timeline (from events), and category-specific data — not raw transcripts.

---

## Ticket titles and descriptions

Every ticket must have `issue_title` and `issue_description` populated at creation time. The frontend should never need a fallback like "Maintenance Request" — if a ticket has no title, the creation path has a bug.

### Per creation path

| Creation path | `issue_title` | `issue_description` | Who's responsible |
|---|---|---|---|
| **WhatsApp AI intake** | AI-generated short phrase: "the broken shower" (3–8 words, designed for embedding in WhatsApp templates) | AI-generated summary: "Broken shower, no hot water" | AI via `yarro-tenant-intake` edge function |
| **Manual ticket form** | PM types it | PM types it | PM — their responsibility to name and describe appropriately |
| **Compliance auto-ticket** | RPC generates from cert context: `"Gas Safety Certificate — 14 Elm Street"` | RPC generates: `"Gas Safety Certificate expired 30 days ago — dispatch contractor for renewal"` | `c1_compliance_auto_ticket()` RPC |
| **Rent auto-ticket** | RPC generates from tenant + property: `"Rent arrears — John Smith"` | RPC generates: `"£850 overdue since 1 Apr 2026, Room 3 at 14 Elm Street"` | `create_rent_arrears_ticket()` RPC |
| **Handoff ticket** | AI attempts a title, may be NULL if AI couldn't categorise | AI attempts a description, may be partial | AI, but PM will enrich during triage |

### Rules

1. **The creation RPC is responsible** for ensuring `issue_title` is never NULL. If the source doesn't provide one (AI failure, missing parameter), the RPC generates it from available context (cert type + address, tenant name + arrears, category + property).
2. **Manual tickets are the PM's responsibility.** The form should require a description. If title is left blank, the RPC can generate one from the first few words of the description or the category + property — but this is a UX convenience, not a system guarantee.
3. **Handoff tickets may start with a weak title.** The AI couldn't categorise the issue, so the title might be generic. This is acceptable because the PM will review and enrich the ticket during triage (`handoff_review` state). The title should be updated as part of that triage.
4. **The frontend never computes or falls back on titles.** If `issue_title` is NULL in the drawer, that's a data bug to fix at the source, not a display edge case to work around.

---

## How state gets written

A trigger (`c1_trigger_recompute_next_action`) fires on changes to:
- `c1_tickets`: status, handoff, job_stage, archived, pending_review, on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome
- `c1_messages`: stage, landlord
- `c1_job_completions`: completed

The trigger calls the router, writes `next_action` + `next_action_reason` back to the ticket row. Every query that reads the ticket gets the current bucket and state for free.

Three write sites total:
1. `c1_trigger_recompute_next_action` — the trigger (handles ~90% of cases)
2. `c1_auto_close_completed_tickets` — reconciles completed tickets
3. `c1_toggle_hold` — hold/unhold toggle

All three call the router and write the result to the row.

---

## `c1_messages` — known debt

### What it is

`c1_messages` is a per-ticket table that stores dispatch workflow state. One row per ticket, containing:

```
stage: text              — dispatch workflow stage ('waiting_contractor', 'awaiting_manager', 'awaiting_landlord', 'closed')
contractors: jsonb[]     — per-contractor state (id, name, phone, status, sent_at, replied_at, quote_amount, etc.)
manager: jsonb           — manager approval state
landlord: jsonb          — landlord approval/decision state
suppress_webhook: bool   — internal flag
```

### Why it's debt

**Two state machines exist.** The edge functions (`yarro-ticket-notify`, `yarro-scheduling`, `yarro-dispatcher`) write to `c1_messages.stage`. The router reads `c1_messages.stage` and translates it to `c1_tickets.next_action_reason`. So the ticket's state is derived from two tables:

```
Edge function writes c1_messages.stage = 'waiting_contractor'
  → trigger fires (c1_messages.stage changed)
  → trigger calls router
  → router reads c1_messages.stage = 'waiting_contractor'
  → router returns next_action_reason = 'awaiting_contractor'
  → trigger writes next_action_reason to c1_tickets row
```

The router is a **translation layer** between the dispatch state machine (`c1_messages.stage`) and the ticket state machine (`c1_tickets.next_action_reason`). Architecturally, the ticket row should be the single source — but the edge functions predate this architecture and write to `c1_messages` directly.

**JSONB parsing is slow at volume.** The dashboard RPC currently parses `c1_messages.contractors` JSONB to compute contractor timing (sent_at, unresponsive detection). We're replacing ONE field with a column (`contractor_sent_at`), but the rest of the contractor JSONB remains. At 1000+ tickets, JSONB cross-join parsing becomes a query planner problem.

### Why it's safe for now

**The trigger guarantees sync.** The recompute trigger fires on any `c1_messages` change (stage or landlord columns). As long as the trigger fires, `next_action_reason` and `c1_messages.stage` cannot drift. The trigger has never been disabled or skipped in production.

**The translation is well-defined.** The router's mapping from `c1_messages.stage` to `next_action_reason` is explicit:
- `waiting_contractor` / `contractor_notified` → `awaiting_contractor`
- `awaiting_manager` → `manager_approval`
- `no_contractors_left` → `no_contractors`
- `awaiting_landlord` → `awaiting_landlord`

No ambiguity. No conditional logic based on other fields (except `landlord->>'approval'` for decline detection).

**Volume isn't a problem yet.** With ~94 tickets total, JSONB parsing is microseconds. The debt is architectural (two state machines) not operational (performance).

### What we're doing now (this sprint)

- **`contractor_sent_at` column** on `c1_tickets` — replaces the JSONB parse for contractor timing. Written by the dispatch flow, read by the dashboard RPC and ticket detail RPC. One less reason to parse contractor JSONB at query time.
- **Router continues reading `c1_messages.stage`** — no change. The translation layer stays.
- **Edge functions untouched** — they continue writing to `c1_messages.stage` and contractor JSONB.
- **`c1_outbound_log` stays** — append-only record of every outbound message. Clean, immutable, used by the audit trail.

### What the future refactor looks like

When edge functions are refactored (separate sprint, after client acquisition):

1. **Move `stage` to `c1_tickets`** — new column `dispatch_stage` on the ticket row. Edge functions write to the ticket directly. Router reads only from `c1_tickets`. Kill the translation.

2. **Move contractor state to proper rows** — replace `contractors: jsonb[]` with a `c1_contractor_assignments` table (ticket_id, contractor_id, status, sent_at, replied_at, quote_amount, etc.). Proper columns, proper indexes, no JSONB parsing.

3. **`c1_messages` becomes a thin join table or dies entirely** — manager/landlord approval state moves to ticket columns (some already exist: `landlord_outcome`, `landlord_allocated`, etc.). Anything remaining moves to the ticket row.

4. **Edge functions write to tickets + assignment rows** — single state machine, single table hierarchy.

### Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `stage` and `next_action_reason` drift | Very low | Medium — wrong bucket for a ticket | Trigger guarantees sync. Would only break if trigger disabled. |
| JSONB performance at 1000+ tickets | Low (not at scale yet) | Medium — slow dashboard loads | `contractor_sent_at` column reduces hottest parse. Full fix: future refactor to proper rows. |
| Edge function changes break WhatsApp | N/A (not touching) | High — demo/sales flow breaks | Not touching edge functions this sprint. |

### Files involved (for future refactor reference)

```
Edge functions that write c1_messages:
  supabase/functions/yarro-ticket-notify/index.ts    — contractor dispatch
  supabase/functions/yarro-scheduling/index.ts       — portal booking/quotes  
  supabase/functions/yarro-dispatcher/index.ts       — dispatch orchestration

RPCs that read c1_messages:
  compute_maintenance_next_action  — reads stage, landlord->>'approval'
  compute_compliance_next_action   — reads stage (same dispatch flow)
  c1_get_dashboard_todo            — joins for contractor_timing CTE
  c1_ticket_context                — does NOT read c1_messages

Trigger:
  trg_messages_recompute_next_action — fires on c1_messages INSERT/UPDATE of stage, landlord
```

---

## `next_action` value rename — migration

### What changes

The `next_action` column on `c1_tickets` changes from 6+ inconsistent values to clean bucket values:

```
Old → New:
  needs_attention  → needs_action
  assign_contractor → needs_action
  follow_up        → needs_action
  new              → needs_action
  in_progress      → waiting OR scheduled (depends on reason)
  completed        → completed (unchanged)
  archived         → archived (unchanged)
  dismissed        → dismissed (unchanged)
  on_hold          → on_hold (unchanged)
  error            → error (unchanged)
```

### Why this needs an explicit migration

The trigger (`c1_trigger_recompute_next_action`) fires on column changes to the ticket row — NOT on function redefinition. Updating the router via `CREATE OR REPLACE FUNCTION` changes what the router *returns*, but doesn't cause the trigger to re-run on existing tickets. All open tickets keep their old `next_action` values until something else changes on them.

Without the backfill, the dashboard would show a mix of old values (`needs_attention`, `in_progress`) and new values (`needs_action`, `waiting`) depending on when each ticket was last recomputed. The frontend would break because it's looking for the new values.

### Migration order (within a single migration file)

**Step 1: Deploy new router + sub-routines**
```sql
CREATE OR REPLACE FUNCTION c1_compute_next_action(...) -- returns new bucket values
CREATE OR REPLACE FUNCTION compute_maintenance_next_action(...) -- new values
CREATE OR REPLACE FUNCTION compute_compliance_next_action(...) -- new values + cert_incomplete
CREATE OR REPLACE FUNCTION compute_rent_arrears_next_action(...) -- new values
```

After this, any NEW state change on any ticket will compute with the new values. But existing rows are unchanged.

**Step 2: Update the trigger**
```sql
CREATE OR REPLACE FUNCTION c1_trigger_recompute_next_action() -- writes 4 fields now
```

The trigger function is replaced. Next time it fires for any ticket, it writes the new values including `waiting_since` and `sla_due_at`.

**Step 3: Backfill open tickets (force recompute)**
```sql
-- For each open ticket, call the router and write the result
UPDATE c1_tickets t SET
  next_action = r.next_action,
  next_action_reason = r.next_action_reason
FROM c1_compute_next_action(t.id) r
WHERE t.status != 'closed'
  AND COALESCE(t.archived, false) = false;
```

This forces the router to run on every open ticket and writes the new bucket values. The trigger's recursion guard (`pg_trigger_depth() > 1`) prevents cascading — the UPDATE fires the trigger, the trigger sees depth > 1 and returns immediately.

**Note:** This is a bulk UPDATE — with ~94 tickets it takes under a second. At 10,000 tickets it would take a few seconds. Not a concern at current scale.

**Step 4: Backfill terminal tickets (simple value map)**

Closed/archived/dismissed tickets don't go through the router (it early-returns for them). But their `next_action` column still has old values that queries might filter on:

```sql
UPDATE c1_tickets SET next_action = 'needs_action'
  WHERE next_action IN ('needs_attention', 'assign_contractor', 'follow_up', 'new')
  AND (status = 'closed' OR archived = true);

UPDATE c1_tickets SET next_action = 'waiting'
  WHERE next_action = 'in_progress' AND next_action_reason != 'scheduled'
  AND (status = 'closed' OR archived = true);

UPDATE c1_tickets SET next_action = 'scheduled'
  WHERE next_action = 'in_progress' AND next_action_reason = 'scheduled'
  AND (status = 'closed' OR archived = true);
```

**Step 5: Rename `compliance_pending` on all tickets**
```sql
UPDATE c1_tickets SET next_action_reason = 'compliance_needs_dispatch'
  WHERE next_action_reason = 'compliance_pending';
```

**Step 6: Update CHECK constraint**
```sql
ALTER TABLE c1_tickets DROP CONSTRAINT IF EXISTS chk_next_action_reason;
ALTER TABLE c1_tickets ADD CONSTRAINT chk_next_action_reason
CHECK (next_action_reason IS NULL OR next_action_reason IN (
  -- full new list...
));
```

**Step 7: Generate types**
```bash
supabase gen types typescript --linked > src/types/database.ts
```

### Rollback

Rollback script reverses all changes:
1. Re-deploy old router + sub-routines (from `supabase/rollbacks/`)
2. Re-deploy old trigger function
3. Force recompute all open tickets (same bulk UPDATE, old router produces old values)
4. Restore old CHECK constraint
5. Rename `compliance_needs_dispatch` back to `compliance_pending`

The rollback is safe because the old router still works with the existing data. The only risk is if new reasons (`cert_incomplete`, `awaiting_tenant`, `reschedule_pending`) were written to tickets during the migration window — the old CHECK constraint doesn't include them. The rollback script handles this by clearing those values before restoring the constraint.

---

## `job_stage` — removed

### What it was

`job_stage` was a text column on `c1_tickets` that tracked contractor dispatch progress. Values: `created`, `sent`, `booked`, `completed`, `landlord_no_response`. Written by edge functions (`yarro-scheduling`) and RPCs (`c1_book_contractor_slot`, `c1_create_ticket`). Read by the router, portals, and the frontend drawer's `deriveTimeline()`.

### Why it's removed

**It was always redundant.** Every state `job_stage` represented was already derivable from other fields:

| `job_stage` value | Already covered by |
|---|---|
| `created` | Ticket exists, `next_action_reason = 'new'` or `'pending_review'` |
| `sent` | `c1_messages.stage = 'waiting_contractor'` — router already reads this |
| `booked` | `scheduled_date IS NOT NULL` — already checked by router |
| `completed` | `c1_job_completions.completed = true` — already checked by router |
| `landlord_no_response` | Being removed entirely (timeout replaces it) |

The router had 3 `job_stage` checks, all redundant:

1. `job_stage = 'landlord_no_response'` — removed (timeout model replaces it)
2. `job_stage IN ('booked', 'scheduled') OR scheduled_date IS NOT NULL` — the `scheduled_date IS NOT NULL` clause already handles this independently. `c1_book_contractor_slot` sets BOTH `job_stage = 'booked'` AND `scheduled_date`. The `scheduled_date` check is sufficient alone.
3. `job_stage = 'sent'` — redundant with `c1_messages.stage` checks that the router performs further down (`waiting_contractor` → `awaiting_contractor`, `awaiting_manager` → `manager_approval`, etc.)

**`job_stage` was a parallel state field** — a second record of what `c1_messages.stage` and `scheduled_date` already captured. Having two fields represent the same state creates drift risk and makes the system harder to reason about.

### What changed

**Router:** All 3 `job_stage` checks removed. The router derives the same states from `scheduled_date` (for booked/scheduled) and `c1_messages.stage` (for dispatch flow). These were already being checked — `job_stage` was belt-and-suspenders, not load-bearing.

**Edge functions (minimal change, 2 lines removed):**
- `yarro-scheduling` line 169: removed `job_stage: "Sent"` from update after dispatch
- `yarro-scheduling` line 372: removed `job_stage: "Booked"` from update after booking
- These `.update()` calls still set other fields — only the `job_stage` property is removed

**RPCs:**
- `c1_book_contractor_slot`: removed `job_stage = 'booked'` from UPDATE (still sets `scheduled_date = p_date`)
- `c1_create_ticket`: removed `job_stage = 'created'` from INSERT
- `c1_create_manual_ticket`: removed `job_stage = 'created'` from INSERT

**Portal RPCs (protected — safe modification protocol):**
- `c1_get_contractor_ticket`: replace `'job_stage', t.job_stage` with `'next_action_reason', t.next_action_reason` in JSONB output
- `c1_get_tenant_ticket`: same replacement
- `c1_get_landlord_ticket`: same replacement
- All three are protected RPCs (listed in `core-rpcs/README.md`). Change is a key rename in the JSONB output — safe, no structural change.

**Portal types** (`src/lib/portal-types.ts`):
- `TenantPortalData`: `job_stage: string` → `next_action_reason: string`
- `ContractorPortalData`: same
- `LandlordPortalData`: same

**Portal page routes:**
- `src/app/contractor/[token]/page.tsx`: map `ticket.next_action_reason` instead of `ticket.job_stage`
- Tenant + landlord portal pages: same

**Portal components — `getActiveStageIdx()` rewritten:**

The portal `STAGE_CONFIG` (progress bar labels: Reported → Found → Booked → Completed) stays — it's a UI component, not state logic. Only the mapping function changes:

```typescript
// Tenant portal — maps next_action_reason to progress step
function getActiveStageIdx(data: TenantPortalData): number {
  const reason = data.next_action_reason || ''
  if (['completed', 'cert_renewed', 'rent_cleared'].includes(reason)) return 3
  if (reason === 'scheduled') return 2
  if (['awaiting_contractor', 'awaiting_booking', 'manager_approval',
       'awaiting_landlord', 'reschedule_pending'].includes(reason)) return 1
  return 0
}

// Contractor portal — maps next_action_reason to portal screen
function getActiveStageIdx(data: ContractorPortalData): number {
  const reason = data.next_action_reason || ''
  if (['completed', 'cert_renewed'].includes(reason)) return 2
  if (reason === 'scheduled') return 1
  return 0
}
```

**Trigger:** Removed `job_stage` from the recompute trigger column watch list. No longer a signal for state recomputation.

**Column:** Dropped from `c1_tickets`. Nothing reads it, nothing writes it.

### SSOT alignment

`next_action_reason` is the single source of truth for ticket state, everywhere:
- Dashboard reads it (via `c1_get_dashboard_todo`)
- Drawer reads it (via `c1_ticket_detail`)
- Portals read it (via portal RPCs: `c1_get_contractor_ticket`, `c1_get_tenant_ticket`, `c1_get_landlord_ticket`)
- Audit trail captures transitions (via `STATE_CHANGED` events)

No parallel state fields. One field, one truth, one place to look.

### Complete `job_stage` hit list — every file that references it

**Frontend — application code (must update or remove):**

| File | Line(s) | Reference | Action |
|---|---|---|---|
| `src/components/ticket-form.tsx` | 532 | `job_stage: 'logged'` on INSERT | Remove — new tickets don't set `job_stage` |
| `src/app/(dashboard)/page.tsx` | 172, 301 | `.select(... job_stage ...)` + todo mapping | Remove from select + mapping |
| `src/app/(dashboard)/tickets/page.tsx` | 151 (approx) | `.select(... job_stage ...)` | Remove from select |
| `src/app/(dashboard)/properties/page.tsx` | 94, 802 | Type + `<StatusBadge status={ticket.job_stage} />` | Remove type field, replace badge with `next_action_reason` |
| `src/app/(dashboard)/compliance/[id]/page.tsx` | 99, 125 | `.select('id, job_stage, ...')` + `job_stage IN ('booked', 'scheduled')` | Replace with `next_action_reason` checks |
| `src/app/contractor/[token]/page.tsx` | 34 | `job_stage: ticket.job_stage` mapping | Replace with `next_action_reason` |
| `src/hooks/use-ticket-detail.ts` | 16, 66, 454 | Type def + `.select(... job_stage ...)` | Remove from type + select |
| `src/hooks/use-ticket-audit.ts` | 86 | `.select(... job_stage ...)` | Remove from select |
| `src/hooks/use-ticket-audit 2.ts` | 86 | Same (backup file) | Remove or delete file |
| `src/components/ticket-detail/ticket-overview-tab.tsx` | 37, 40 | `basic.job_stage === 'booked'` in `deriveTimeline()` | Entire function being killed |
| `src/components/dashboard/todo-panel.tsx` | 34 | `job_stage: string \| null` in type | Remove from type |
| `src/components/portal/tenant-portal.tsx` | 33 | `ticket.job_stage` in stage logic | Replace with `next_action_reason` |
| `src/components/portal/tenant-portal-v2.tsx` | 53 | `data.job_stage` in `getActiveStageIdx()` | Replace with `next_action_reason` |
| `src/components/portal/contractor-portal.tsx` | 25 | `ticket.job_stage` in `getTicketStage()` | Replace with `next_action_reason` |
| `src/components/portal/contractor-portal-v2.tsx` | 52 | `data.job_stage` in `getActiveStageIdx()` | Replace with `next_action_reason` |
| `src/components/status-badge.tsx` | (indirect) | Receives `job_stage` as status prop | Callers pass `next_action_reason` instead |

**Frontend — type definitions (auto-regenerated):**

| File | Lines | Action |
|---|---|---|
| `src/types/database.ts` | 1446, 1520, 1594, 1963, 2245 | Auto-regenerated by `supabase gen types` after column drop |
| `src/lib/supabase/database.types.ts` | 1437, 1510, 1583, 1931, 2212 | Same |

**Frontend — portal types (manual update):**

| File | Lines | Action |
|---|---|---|
| `src/lib/portal-types.ts` | 20, 58, 100, 162, 208, 234 | Replace `job_stage: string` with `next_action_reason: string` on all 6 portal data types |

**Frontend — mock data:**

| File | Lines | Action |
|---|---|---|
| `src/lib/portal-mock-data.ts` | 17, 38, 50, 65, 93, 128, 157, 186, 212, 238, 249, 311, 330, 336, 344, 356, 365, 478, 503, 509 | Replace `job_stage` with `next_action_reason` values in all mock entries |

**Backend — SQL migrations (rewritten in new migration):**

| File | Lines | What | Action |
|---|---|---|---|
| `20260410400000_category_split_and_router.sql` | 201, 207, 213 | Router `job_stage` checks | Removed in new router |
| `20260410400000_category_split_and_router.sql` | 376, 542, 686 | `c1_create_ticket`, `c1_create_manual_ticket`, `c1_ticket_context` | Remove `job_stage` from INSERT/SELECT |
| `20260410400000_category_split_and_router.sql` | 642 | `c1_ticket_context` return type | Remove `job_stage` column |
| `20260410300000_compliance_status_granular.sql` | 56, 78, 129, 152 | `c1_compliance_status_summary` uses `job_stage` | Replace with `next_action_reason = 'scheduled'` |
| `20260409400000_rent_day1_tickets.sql` | 95 | `create_rent_arrears_ticket` INSERT | Remove `job_stage` |
| `20260407400000_rent_day1_tickets.sql` | 65 | Older version of same | Superseded |
| `20260407500000_rent_ticket_formatting.sql` | 53 | Same | Superseded |
| `20260406100000_portal_token_ttl_landlord_ooh.sql` | 187-201 | `c1_submit_ooh_outcome` sets `job_stage` | Remove `job_stage` from UPDATE |
| `20260405400000_portal_token_ttl.sql` | 35, 93 | Portal RPCs return `job_stage` | Replace with `next_action_reason` |
| `20260404300000_polymorphic_subroutines.sql` | 105-112, 218-224 | Sub-routine `job_stage` checks | Superseded by new router |
| `20260404000000_fix_flows_null_items.sql` | 263, 303 | Scheduling flow checks `job_stage` | Replace with `next_action_reason`/`scheduled_date` |
| `20260403200000_contractor_compliance_portal.sql` | 34, 118 | Portal RPC + completion flow | Replace/remove |
| `20260403900000_compliance_renewal_requested_status.sql` | 40, 106 | Compliance status uses `job_stage` | Replace with `next_action_reason` |
| `20260404100000_remove_requirements_layer.sql` | 48, 107 | Same pattern | Replace |
| `20260404720000_compliance_statuses_dedup_ticket.sql` | 34, 53 | Same pattern | Replace |
| `20260330100000_compliance_workflow_mvp.sql` | 482 | `c1_create_manual_ticket` INSERT | Remove `job_stage` |
| `20260329000000_whatsapp_room_awareness.sql` | 1093 | `c1_create_ticket` INSERT | Remove `job_stage` |
| `20260328020000_extend_properties_hub_rooms.sql` | 52, 69 | Property detail JSONB includes `job_stage` | Remove |
| `20260401000000_demo_seed.sql` | 105 | Demo data INSERT | Remove column or delete seed data |

**Backend — edge functions:**

| File | Lines | Action |
|---|---|---|
| `supabase/functions/yarro-scheduling/index.ts` | 169 | `job_stage: "Sent"` | Remove property from `.update()` |
| `supabase/functions/yarro-scheduling/index.ts` | 339 | `.select("status, scheduled_date, job_stage")` | Remove `job_stage` from select |
| `supabase/functions/yarro-scheduling/index.ts` | 372 | `job_stage: "Booked"` | Remove property from `.update()` |
| `supabase/functions/yarro-scheduling/index.ts` | 766 | Comment referencing `job_stage` | Update comment |

**Backend — rollbacks (historical, update for consistency):**

| File | Action |
|---|---|
| `supabase/rollbacks/rollback_category_split_and_router.sql` | New rollback supersedes |
| `supabase/rollbacks/rollback_compliance_status_granular.sql` | Historical |
| `supabase/rollbacks/rollback_remove_rpc_split_logic.sql` | Historical |
| `supabase/rollbacks/rollback_phase_c.sql` | Historical |

**Note:** Most SQL migration references are in older migration files that are superseded by our new migration. The new migration creates the updated RPCs via `CREATE OR REPLACE`. The old migration files stay as historical record — they don't run again. The critical ones to get right are the RPCs that are `CREATE OR REPLACE`'d in the new migration (router, sub-routines, portal RPCs, ticket context, create ticket RPCs).

---

## `c1_ledger` — deleted

`c1_ledger` was a lightweight, ticket-scoped state machine log. It captured ticket lifecycle events (issue reported, priority changed, status changed) via two triggers on `c1_tickets`.

**Why it existed:** A simpler alternative to `c1_events` — fewer columns, ticket-scoped, fast to query per-ticket.

**Why it's deleted:** `c1_events` already captures everything `c1_ledger` does, with richer data (actor names, property labels, message-level events). The audit UI already preferred `c1_events` and dropped duplicate ledger entries. With the `STATE_CHANGED` event added to `c1_events`, the ledger has zero unique data.

**Performance concern addressed:** The "lightweight" advantage was architectural simplicity, not query speed. `c1_events` uses indexed lookups (`idx_c1_events_ticket` for per-ticket, `idx_c1_events_portfolio_keyset` for portfolio-wide). A PM with 500 properties, 50 tickets each, 20 events per ticket = 500,000 events — the index handles this without scanning unrelated rows. Reads are effectively instant via index. Writes are append-only INSERTs (microseconds). Consolidating to one table with proper indexes is cleaner for Postgres than maintaining two tables with overlapping triggers.

**What was removed:**
- `c1_ledger` table (DROP TABLE)
- `c1_ledger_on_ticket_insert()` trigger function
- `c1_ledger_on_ticket_update()` trigger function
- All frontend references (`use-ticket-detail.ts`, `use-ticket-audit.ts`)
- Deduplication logic in `use-ticket-audit.ts` (no longer needed — single source)

**`c1_events` is now the sole audit data source.** One table, one set of triggers, one place to query. The `STATE_CHANGED` event captures every state transition for all three categories (maintenance, compliance, rent) with from/to reason, from/to bucket, and timestamps.

---

## Audit Trail — Legal Defence Record

The audit trail is not an operational progress tracker. It is a **legal defence record** — designed to hold up in court when a PM needs to prove they acted responsibly, responded promptly, and followed proper procedure. Every decision, every threshold crossing, and every response delay must be timestamped and recorded.

### What a court asks

If a tenant is injured or dies and the PM is investigated:
- **When did the PM become aware?** (ticket created)
- **How long before they acted?** (time between creation and first decision)
- **What decision did they make?** (dispatched contractor, escalated to emergency, allocated to landlord)
- **Did the contractor respond? How quickly?** (response time or timeout)
- **When the contractor didn't respond, what did the PM do?** (timeout detected, PM chased, reassigned)
- **Was the work completed and verified?** (completion, follow-up)
- **At every step, was there unreasonable delay?**

The audit trail must answer all of these with timestamps.

### Event types

#### Existing events (keep as-is)
```
ISSUE_CREATED             — tenant/caller reported an issue
ISSUE_REPORTED            — issue reported via WhatsApp
CONTRACTOR_ASSIGNED       — contractor dispatched
QUOTE_RECEIVED            — contractor sent a quote
QUOTE_APPROVED            — PM approved the quote
QUOTE_DECLINED            — PM declined the quote
LANDLORD_APPROVED         — landlord approved the work
LANDLORD_DECLINED         — landlord declined the work
LANDLORD_ALLOCATED        — PM allocated issue to landlord
LANDLORD_RESOLVED_ALLOC   — landlord resolved (allocation flow)
LANDLORD_IN_PROGRESS      — landlord working on it (allocation flow)
LANDLORD_NEEDS_HELP       — landlord asked for help (allocation flow)
OOH_DISPATCHED            — emergency contact dispatched
OOH_RESOLVED              — OOH contact resolved issue
OOH_UNRESOLVED            — OOH contact couldn't resolve
OOH_IN_PROGRESS           — OOH contact working on it
JOB_SCHEDULED             — job booked for a date
JOB_COMPLETED             — work completed
TICKET_CLOSED             — PM closed the ticket
TICKET_ARCHIVED           — PM archived the ticket
TICKET_ON_HOLD            — PM put ticket on hold
TICKET_RESUMED            — PM took ticket off hold
HANDOFF_CREATED           — AI couldn't handle, handed to PM
PENDING_REVIEW            — new ticket awaiting PM triage
```

#### New: PM decisions
```
PM_TRIAGED                — PM reviewed a handoff/pending ticket and took action
                            metadata: { action: 'dispatched' | 'allocated' | 'escalated', notes }
PM_PRIORITY_CHANGED       — PM changed ticket priority
                            metadata: { from: 'Normal', to: 'Urgent', reason }
PM_REASSIGNED             — PM changed contractor
                            metadata: { from_contractor, to_contractor, reason }
PM_BYPASSED_APPROVAL      — PM proceeded without landlord approval
                            metadata: { reason: 'emergency' | 'auto_approve_limit' | 'no_landlord' }
```

#### New: State transitions
```
STATE_CHANGED             — next_action_reason changed on the ticket
                            metadata: { from_reason, to_reason, from_bucket, to_bucket }
                            Written by the recompute trigger when reason actually changes.
                            Captures EVERY state transition with timestamp — the backbone
                            of the legal timeline.
```

#### New: Timeouts
```
TIMEOUT_TRIGGERED         — system detected an unresponsive party
                            metadata: { reason, threshold_hours, waiting_since }
                            Written by timeout cron. Proves the PM's system was monitoring.
                            Dedup: only logged once per timeout period per ticket.
TIMEOUT_RESOLVED          — response received after a timeout
                            metadata: { reason, response_after_hours, actor_name }
                            Written by message trigger when stage changes after timeout.
                            Records how late the response was.
```

#### New: Acceptance
```
OOH_ACCEPTED              — OOH contact accepted the job via portal
                            metadata: { accepted_at, dispatched_at, response_time_minutes }
                            Proves emergency contact confirmed they were handling it.
LANDLORD_ACCEPTED         — landlord accepted the allocated job via portal
                            metadata: { accepted_at, allocated_at, response_time_minutes }
                            Proves landlord acknowledged responsibility.
```

#### New: Auto-creation
```
AUTO_TICKET_COMPLIANCE    — system auto-created ticket for expiring/incomplete cert
                            metadata: { cert_type, cert_id, trigger: 'expired' | 'expiring' | 'incomplete' }
                            Proves PM had proactive compliance monitoring.
AUTO_TICKET_RENT          — system auto-created ticket for overdue rent
                            metadata: { tenant_name, amount, days_overdue }
                            Proves PM acted on day 1 of arrears.
```

### Where new events get written

**`STATE_CHANGED`** — in `c1_trigger_recompute_next_action`. The trigger already checks `IS DISTINCT FROM` before writing. Add `c1_log_event()` call when the reason actually changes:
```sql
IF v_result.next_action_reason IS DISTINCT FROM current_reason THEN
  PERFORM c1_log_event(ticket_id, 'STATE_CHANGED', 'SYSTEM', NULL, NULL,
    jsonb_build_object(
      'from_reason', current_reason,
      'to_reason', v_result.next_action_reason,
      'from_bucket', current_next_action,
      'to_bucket', v_result.next_action
    ));
END IF;
```

**`TIMEOUT_TRIGGERED`** — in the timeout cron jobs (`contractor-timeout-check`, `landlord-timeout-check`). When they detect a timeout, call `c1_log_event()`. Dedup: only log if no `TIMEOUT_TRIGGERED` event exists for this ticket since the current wait started (`waiting_since`).

**`TIMEOUT_RESOLVED`** — in the message trigger (`trg_c1_events_on_message`). When stage changes from a timed-out state, check if `TIMEOUT_TRIGGERED` exists for this ticket. If yes, log `TIMEOUT_RESOLVED` with delay duration.

**`AUTO_TICKET_COMPLIANCE`** / **`AUTO_TICKET_RENT`** — in the auto-creation crons/RPCs (`c1_compliance_auto_ticket`, `create_rent_arrears_ticket`). Logged immediately after ticket creation.

**`PM_TRIAGED`** / **`PM_PRIORITY_CHANGED`** / **`PM_REASSIGNED`** / **`PM_BYPASSED_APPROVAL`** — in the RPCs that handle these PM actions. These are explicit PM decisions that must be logged at the point the decision is made.

### The rule

**Log when the reason changes, not when the reason is recomputed.** The trigger recomputes on every related column change but only writes (and logs) when the result is actually different. This captures every real state transition without flooding the trail with no-op recomputations.

### What the timeline proves

With all events logged, a ticket's audit trail reads:
```
14:32  ISSUE_CREATED         — Tenant reported gas smell
14:32  STATE_CHANGED         — new → needs_action / pending_review
14:35  PM_TRIAGED            — PM reviewed, set priority Urgent
14:35  PM_PRIORITY_CHANGED   — Normal → Urgent
14:36  CONTRACTOR_ASSIGNED   — Gas Safe Engineer dispatched
14:36  STATE_CHANGED         — needs_action → waiting / awaiting_contractor
        ... 48 hours pass ...
14:36  TIMEOUT_TRIGGERED     — awaiting_contractor, 48h threshold
14:40  PM_REASSIGNED         — Reassigned to Emergency Gas Services
14:40  STATE_CHANGED         — waiting / awaiting_contractor (new contractor)
16:12  QUOTE_RECEIVED        — £180 emergency call-out
16:12  TIMEOUT_RESOLVED      — responded after 1.5h (new contractor)
16:15  QUOTE_APPROVED        — PM approved
16:15  STATE_CHANGED         — needs_action → scheduled
17:00  JOB_COMPLETED         — Gas leak sealed
17:05  TICKET_CLOSED         — PM verified and closed
```

Every gap explained. Every decision timestamped. Every delay recorded.
