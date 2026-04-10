# Plan: Kill Extras — Everything Is a Ticket

> Architecture decision doc: `docs/architecture/ticket-state-model.md`

## Context

The category split refactor (73419af) established a clean 3-route router: `maintenance`, `compliance_renewal`, `rent_arrears`. But the dashboard still pulls from two RPCs (`c1_get_dashboard_todo` + `c1_get_dashboard_todo_extras`), the `next_action` field has 6+ values that don't map to how a PM thinks, and the frontend computes bucket assignments from hardcoded reason lists.

**Decisions made:**
1. Everything becomes a ticket — no pre-ticket staging area
2. `next_action` values are replaced with clean bucket values — no new column
3. Timeouts are metadata, not states — `landlord_no_response` is removed
4. `compliance_dispatch_renewal` becomes idempotent — handles existing tickets
5. Tenancy items dropped entirely

---

## Three-Layer State Model

```
BUCKET  (next_action)         → Where is this ticket?
STATE   (next_action_reason)  → Why is it there? (confirmed facts only)
TIMEOUT (is_past_timeout)     → Has the wait gone too long? (metadata, never a state)
```

### `next_action` — becomes the bucket

**Old values (replaced):**
```
needs_attention, assign_contractor, follow_up, new  →  needs_action
in_progress (non-scheduled)                         →  waiting
in_progress (scheduled)                             →  scheduled
```

**New values:**
```
needs_action  — PM's turn
waiting       — someone else's turn, no date
scheduled     — date confirmed
completed     — done (terminal)
archived      — archived (terminal)
dismissed     — dismissed (terminal)
on_hold       — parked (terminal)
error         — router failure (should never appear)
```

`stuck` is NOT a `next_action` value — it's a display-layer override in the dashboard RPC when `is_past_timeout = true` on a `waiting` ticket.

### `next_action_reason` — confirmed states only

Changes to this column's values:
- **Add:** `cert_incomplete` (compliance — cert missing doc or expiry)
- **Add:** `awaiting_tenant` (cross-category — waiting for tenant access/availability/confirmation)
- **Add:** `compliance_needs_dispatch` (replaces `compliance_pending` — clearer name)
- **Remove:** `compliance_pending` (renamed to `compliance_needs_dispatch`)
- **Remove:** `landlord_no_response` (timeout disguised as a state → `awaiting_landlord` + `is_past_timeout`)
- **Remove:** `landlord_in_progress` (replaced by acceptance metadata on `allocated_to_landlord`)
- **Remove:** `ooh_in_progress` (replaced by acceptance metadata on `ooh_dispatched`)
- **Bucket fix:** `ooh_dispatched` moves from `needs_action` → `waiting` (PM is waiting for OOH outcome)

**Acceptance model (OOH + landlord only):**
- Portal gets "Accept Job" as first screen before outcome buttons
- Acceptance writes `accepted_at` timestamp — metadata, not a state change
- Two-tier timeouts: short (no acceptance) vs long (accepted, waiting for outcome)
- Contractors keep existing quote flow (quote = implicit acceptance)

### Value removed: `landlord_no_response`

A timeout is an uncertainty — we don't know why the landlord hasn't responded. The ticket is still `awaiting_landlord`. The dashboard shows it as stuck because `is_past_timeout = true`, with context like "No response for 3 days."

If we rewrite the reason on timeout, we lose the original state. When the landlord finally responds, we'd need to figure out what to go back to. Keeping the reason stable and overlaying timeout as metadata is cleaner.

---

## Per-Category Changes

### Maintenance (no change)
Already works. WhatsApp intake → `c1_create_ticket`. Manual form → `c1_create_manual_ticket`. Router handles full lifecycle.

### Compliance — auto-create tickets + idempotent dispatch

**Auto-ticketing cron** scans `c1_compliance_certificates` daily:
1. **Incomplete cert** (no `document_url` OR no `expiry_date`) → ticket, `cert_incomplete`
2. **Expiring cert** (≤30 days, doc exists) → ticket, `compliance_needs_dispatch`
3. **Expired cert** (past expiry, doc exists) → ticket, `compliance_needs_dispatch`, priority Urgent

Pre-creation checks: no open ticket for cert AND cert not already renewed.

**`compliance_dispatch_renewal` becomes idempotent:**
- Current: raises exception if ticket exists
- New: if ticket exists, update it (assign contractor, set stage to dispatched). If no ticket, create + dispatch.
- PM always clicks "Dispatch", always picks contractor. Doesn't matter if ticket was auto-created or not.

**Router change** — `compute_compliance_next_action` gets `cert_incomplete` at top:
```
IF cert has no document_url OR no expiry_date → needs_action / cert_incomplete
... rest of existing lifecycle
```

**Escalation** (all on the ticket, no frontend):
- Day 30: created, Normal → Day 14: High → Day 0: Urgent, `sla_breached`
- Incomplete certs: Normal, no deadline to escalate against

### Rent — day-1 ticketing
- `yarro-rent-reminder` calls `create_rent_arrears_ticket` on first overdue (day 1)
- RPC already deduplicates (one per tenant)
- Escalation: Day 1 Medium → Day 7 High → Day 14 Urgent

### Handoff — always a ticket
- `yarro-tenant-intake` always calls `c1_create_ticket`, even on handoff
- Defaults: `category = 'maintenance'`, `maintenance_trade = NULL`, `handoff = true`
- Router returns `handoff_review` → `needs_action` bucket

---

## How State Gets Written

A trigger (`c1_trigger_recompute_next_action`) fires on ticket/message/job_completion changes, calls the router, writes 4 fields to the ticket row in a single UPDATE.

**Trigger writes (when `next_action_reason` changes):**
- `next_action` — bucket value
- `next_action_reason` — specific state
- `waiting_since` — reset to `now()`
- `sla_due_at` — set from defaults for `needs_action` states, NULL for `waiting`/`scheduled`/terminal

**Trigger column watch list (updated):**
- `c1_tickets`: status, handoff, archived, pending_review, on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome, awaiting_tenant, reschedule_requested, reschedule_status
- `c1_messages`: stage, landlord
- `c1_job_completions`: completed
- (`job_stage` removed from watch list — column dropped)

**Three write sites (all updated):**

1. **`c1_trigger_recompute_next_action`** — the trigger (~90% of writes)
2. **`c1_auto_close_completed_tickets`** — reconciles completed tickets
3. **`c1_toggle_hold`** — hold/unhold

All three call the router and write the 4 fields. All `c1_log_event()` calls include `v_property_label`.

---

## Deduplication — Two Layers (Unchanged)

**Layer 1: Ticket creation dedup**
- Compliance: cron checks `NOT EXISTS open ticket for cert`
- Rent: `create_rent_arrears_ticket` checks existing open ticket per tenant
- Handoff: one ticket per conversation (conversation_id FK)

**Layer 2: AI intake dedup (separate, untouched)**
- WhatsApp AI checks for similar open tickets on same property
- Two tenants report same issue → AI asks "is this the same issue?"

---

## Sprint 0: Documentation Foundation (before any code)

The guiding docs (`CLAUDE.md`, `architecture.md`, `patterns.md`, `safe-zones.md`, `decision-principles.md`, `session-procedures.md`) are what Claude Code reads at the start of every session. If these still describe the OLD system while the code reflects the NEW system, every future build starts with a stale mental model. The ticket state model is the new SSOT — the docs must encode it BEFORE implementation begins.

**Sprint 0 produces zero code changes. It ships before Sprint A begins.**

### `CLAUDE.md` — Root guidance file
- **Architecture section:** Replace the polymorphic dispatch bullet list with the three-layer state model as the primary architecture. Router is still THE LAW, but context is now: router writes bucket + reason → trigger writes 4 fields → dashboard computes timeout → frontend displays via REASON_DISPLAY.
- **Add "State Model — Non-Negotiable" rules:**
  - Timeouts are metadata, never states — don't add `_no_response` reasons
  - `sla_due_at` is NULL when PM isn't the actor — don't set SLA on waiting tickets
  - `waiting_since` resets on every state change — don't manually set it
  - Frontend never computes bucket, priority, timeout, or SLA
  - One `REASON_DISPLAY` mapping — both dashboard and drawer use it
  - Audit events are non-negotiable — if `c1_log_event()` fails, the operation rolls back
- **Reference Index:** Add `docs/architecture/ticket-state-model.md` as PRIMARY architecture reference (above `docs/POLYMORPHIC-DISPATCH-PLAN.md`)
- **Caution Zones:** Update `use-ticket-detail.ts` — after refactor it moves from YELLOW to GREEN (1 RPC + 1 query, no longer 600+ lines)

### `.claude/docs/architecture.md` — System architecture
- **Three-Layer State Model section** (new, after The Flow): Bucket / State / Timeout. What writes each layer, rule that timeout is display-time only.
- **Update The Flow:** Ticket created → Router computes bucket + reason → Trigger writes 4 fields → Dashboard RPC adds timeout + priority score → Frontend displays via REASON_DISPLAY.
- **State write sites:** 3 sites (trigger, auto-close, toggle-hold), ALL write 4 fields. No other code path may write next_action directly.
- **Dashboard data flow:** One RPC, one Realtime subscription, one frontend mapping. Remove "Real-time is not currently used."
- **Drawer data flow:** One RPC + one events query. No category-specific secondary fetches. No frontend stage derivation.
- **Key Database Tables:** Add `c1_events`. Remove `c1_ledger`. Note timing columns (waiting_since, contractor_sent_at, tenant_contacted_at, deadline_date, sla_due_at).
- **Priority Scoring:** Document `c1_compute_priority_score()` — one shared SQL function, consequence-driven.
- **RPC Development Workflow — add rule:** "Every RPC that changes ticket state must log an audit event in the same transaction."

### `.claude/docs/patterns.md` — Component patterns
- **Add "Dashboard Patterns":** Bucket grouping, `REASON_DISPLAY` mapping (one object, `src/lib/reason-display.ts`), CTA mapping, priority badge reads `ticket.priority` directly.
- **Add "Ticket Drawer Patterns":** Universal header + stage card + CTA for all categories. Timeline from `c1_events`. Category section is the only per-category difference.
- **Update Data Fetching Pattern:** Dashboard = one RPC. Drawer = one RPC + one events query. Add Realtime subscription pattern.
- **Add "State Display — Anti-Patterns":** NEVER derive stage from ticket fields in frontend. NEVER create per-category stage configs. NEVER duplicate label logic between dashboard and drawer.

### `.claude/docs/safe-zones.md` — Modification zones
- **Move to GREEN after refactor:** `use-ticket-detail.ts` (simple 1-RPC hook), `src/lib/reason-display.ts` (pure display text)
- **Add to RED:** `c1_trigger_recompute_next_action` (writes 4 fields on every state change), `c1_compute_priority_score` (shared scoring function)
- **Remove stale entries:** `c1_ledger` trigger references

### `.claude/docs/decision-principles.md` — Decision framework
- **Add "SSOT Principle":** Every piece of state has ONE authoritative source. Ticket state = router. Display text = REASON_DISPLAY. Priority = `c1_tickets.priority` column. Timeline = `c1_events` table.
- **Add to Decision Test:** "Does this introduce a second source of truth?" and "Does this put business logic in the frontend?"

### `.claude/docs/session-procedures.md` — Session workflow
- **Add to Done Checklist:** "State changes produce audit events", "Dashboard and drawer show identical state for same ticket", "No new frontend stage derivation outside REASON_DISPLAY"

### `supabase/core-rpcs/README.md` — Protected RPC list
- Add new RPCs: `c1_ticket_detail`, `c1_compute_priority_score`, `c1_set_awaiting_tenant`, `c1_mark_contractor_withdrawn`, `c1_submit_contractor_reschedule_request`, `c1_compliance_auto_ticket`
- Note dropped: `c1_get_dashboard_todo_extras`, `c1_set_sla_due_at`

---

## Deployment Strategy

App goes offline during deployment. No zero-downtime requirement.

**⚠️ CRITICAL: Edge functions must deploy BEFORE the migration that drops `job_stage`.** If SQL drops the column first, edge functions still writing `job_stage: "Sent"` / `job_stage: "Booked"` will error.

**Order:**
1. Take app offline
2. Deploy edge function changes FIRST (`supabase functions deploy`) — removes `job_stage` writes
3. Push all backend migrations (`supabase db push`) — now safe to drop `job_stage` column
4. Run `supabase gen types` → regenerate TypeScript types
5. `npm run build` → verify frontend compiles with new types
6. Deploy frontend
7. Verify: dashboard loads, buckets render, drawer opens, audit events fire
8. App back online

If anything breaks: rollback script restores previous state before bringing app back up. See architecture doc § "Rollback". Since all data is seed data, rollback can be a clean slate if needed.

---

## Migration Steps

### Prerequisites
- **Sprint 0 complete:** All guiding docs updated to reflect the new state model BEFORE any code changes.
- **Edge function changes:** Steps 3 and 4 modify `yarro-rent-reminder`, `yarro-tenant-intake`, and `yarro-scheduling`. Adam approves scoped changes before building.
- **Protected RPCs:** All follow safe modification protocol (new migration, backup current def). **Portal RPCs (`c1_get_contractor_ticket`, `c1_get_tenant_ticket`, `c1_get_landlord_ticket`) are protected — require explicit approval per `supabase/core-rpcs/README.md`.**
- **`c1_messages` — known debt, not this sprint.** Router continues reading `c1_messages.stage`. Edge functions continue writing to it. The trigger guarantees sync. `contractor_sent_at` column replaces the JSONB parse for timing. Full refactor (move dispatch state to ticket row, kill JSONB) is a future sprint after client acquisition. See architecture doc § `c1_messages — known debt` for full analysis.
- **Verification after router changes:** After Step 1, run the router against all existing open tickets and compare old vs new bucket assignments. Log any tickets that changed unexpectedly. This confirms `c1_messages.stage` behavior is preserved through the refactor.
- **Error handling rules (apply to ALL steps):**
  - Audit events are non-negotiable: if `c1_log_event()` fails, the operation rolls back. No exception swallowing.
  - RPC operations + their audit events = same transaction (PL/pgSQL guarantees this).
  - Edge function webhook handlers always return 200 to Twilio. Errors go to Sentry + Telegram, not HTTP error codes.
  - Router `error`/`unknown_category` → visible on dashboard as needs_action with "System error" label.
  - Do NOT introduce new `getSession()`/`getUser()` calls outside `pm-context.tsx` (Supabase Auth hang bug).
  - See architecture doc § "Error Recovery and Failure Modes" for full analysis.

### Recommended sprint boundaries

This plan can be split into independently deployable sprints. Each sprint boundary is a safe rollback point:

| Sprint | Steps | Verifiable outcome |
|--------|-------|--------------------|
| **A — Backend foundation** | 1a–1h | All tickets have correct bucket values, router returns new values, trigger writes 4 fields |
| **B — Auto-creation + edge functions** | 2, 3, 4 | Crons create tickets, edge functions don't write job_stage |
| **C — Dashboard RPC** | 5 | Single RPC returns all items, stuck override works, priority scoring works |
| **D — Audit trail** | 6 | STATE_CHANGED events fire, c1_ledger gone, audit page works |
| **E — Drawer + frontend** | 7, 8 | Drawer uses 1 RPC, STAGE_CONFIG gone, REASON_DISPLAY works |
| **F — Realtime + verification** | 9, 10 | Dashboard auto-updates, full E2E verification |

### Step 1: Router bucket values + schema + compliance sub-routine
**⚠️ This step is large. Recommend splitting into sub-migrations (1a–1h) for safer incremental deployment. Each sub-migration can be tested independently. See sprint boundaries above.**

**Sub-step 1a — New columns (pure additive, zero risk):**
- **New columns on `c1_tickets`:**
  - `contractor_sent_at TIMESTAMPTZ DEFAULT NULL` — when first contractor was notified. Replaces JSONB parse.
  - `tenant_contacted_at TIMESTAMPTZ DEFAULT NULL` — when tenant was contacted. Written when `awaiting_tenant` is set.
  - `awaiting_tenant BOOLEAN DEFAULT false` — cross-category flag.
  - `deadline_date DATE DEFAULT NULL` — external deadline for scoring. Set at creation: cert expiry (compliance), rent due date (rent), NULL (maintenance).
  - `waiting_since TIMESTAMPTZ DEFAULT NULL` — when current state was entered. Written by trigger on state change. Eliminates `c1_messages` join for timing.
  - `reschedule_initiated_by TEXT DEFAULT NULL` — 'tenant' or 'contractor'.
  - `handoff_reason TEXT DEFAULT NULL` — why AI handed off ('property_not_matched', 'category_unclear', 'no_contractor_mapped', 'low_confidence', 'tenant_requested'). Set by `c1_create_ticket` when `handoff = true`.
**Sub-step 1b — New scoring function + SLA trigger consolidation:**
- **New SQL function: `c1_compute_priority_score(p_priority, p_deadline_date, p_sla_due_at, p_waiting_since)`** — shared scoring function. Called by dashboard RPC and ticket detail RPC. One function, identical scores everywhere. See architecture doc § "Priority Scoring".
- **⚠️ Drop existing SLA trigger:** `DROP TRIGGER trg_c1_set_sla ON c1_tickets` + `DROP FUNCTION c1_set_sla_due_at()`. The existing trigger writes `sla_due_at` independently — it will conflict with the recompute trigger which now owns this field. SLA logic is consolidated into the recompute trigger.

**Sub-step 1c — Trigger update:**
- **Trigger update:** recompute trigger now writes 4 fields in single UPDATE: `next_action`, `next_action_reason`, `waiting_since = now()`, `sla_due_at = CASE ... END`. `sla_due_at` set from legally grounded defaults for `needs_action` states, **NULL for `waiting`/`scheduled`/terminal** (no SLA when PM isn't the actor — prevents stale values in breach queries). Only fires when reason actually changes.
- **All `c1_log_event()` calls must pass `v_property_label`** — resolve from ticket's property join, same pattern as existing event triggers. Enables audit queries filtered by property.
- **Update recompute trigger column watch list:** add `awaiting_tenant`, `reschedule_requested`, `reschedule_status`, **`priority`**; remove `job_stage`. (Full list: status, handoff, archived, pending_review, on_hold, ooh_dispatched, ooh_outcome, landlord_allocated, landlord_outcome, awaiting_tenant, reschedule_requested, reschedule_status, priority). **Why `priority`:** escalation crons bump priority directly. Without `priority` in the watch list, the trigger doesn't fire on priority changes → SLA doesn't recompute → stale `sla_due_at` until the next unrelated state change.
- **Router universal section:** add `awaiting_tenant` check after `on_hold`, before category dispatch. Returns `waiting` / `awaiting_tenant`.
- **New RPC: `c1_set_awaiting_tenant(p_ticket_id, p_awaiting, p_reason)`** — sets/clears the boolean + timestamp, logs PM_AWAITING_TENANT audit event in same transaction.
- **New column: `reschedule_initiated_by TEXT`** — `'tenant'` or `'contractor'`. Written by reschedule request RPCs.
- **New RPC: `c1_submit_contractor_reschedule_request(p_token, p_proposed_date, p_reason)`** — contractor-initiated reschedule (mirrors existing tenant version).
- **New RPC: `c1_mark_contractor_withdrawn(p_ticket_id, p_contractor_id, p_reason)`** — marks contractor as withdrawn in JSONB, cycles to next or sets `no_contractors`. Logs `CONTRACTOR_WITHDRAWN` event. If last contractor, logs BOTH `CONTRACTOR_WITHDRAWN` AND `STATE_CHANGED` to `no_contractors`.
- **Router: maintenance + compliance sub-routines** — add `reschedule_pending` check BEFORE `scheduled` check: `IF reschedule_requested AND reschedule_status = 'pending' → waiting / reschedule_pending`
- Replace `next_action` values in router: `needs_attention`/`assign_contractor`/`follow_up`/`new` → `needs_action`, `in_progress` → `waiting` or `scheduled`
- Each sub-routine returns `(next_action, next_action_reason)` with new bucket values
- Update `compute_compliance_next_action`: add `cert_incomplete` check at top
- Update CHECK constraint: add `cert_incomplete`, `awaiting_tenant`, `compliance_needs_dispatch`, `reschedule_pending`; remove `landlord_no_response`, `landlord_in_progress`, `ooh_in_progress`, `compliance_pending`
- **Update creation RPCs to write new columns:**
  - `c1_create_ticket`: add `handoff_reason` (from `_issue` JSONB when `handoff = true`), `waiting_since = now()`. Trigger handles `sla_due_at` on INSERT.
  - `c1_create_manual_ticket`: add `waiting_since = now()`, `deadline_date` (from cert expiry for compliance, rent due date for rent, NULL for maintenance).
  - Both: remove `job_stage = 'created'` from INSERT.
- **Remove `job_stage` entirely (sub-step 1f — AFTER edge function changes in Step 4):**
  - ⚠️ Edge functions must be deployed first (removing `job_stage: "Sent"` and `job_stage: "Booked"` writes). Then the column can be safely dropped.
  - Router: remove all 3 `job_stage` checks. `scheduled_date IS NOT NULL` handles booked. `c1_messages.stage` handles dispatch flow. `landlord_no_response` check removed (timeout replaces it).
  - RPCs: remove `job_stage` from INSERT in `c1_create_ticket`, `c1_create_manual_ticket`. (`c1_book_contractor_slot` does not exist — scheduling goes through `yarro-scheduling` edge function which updates `c1_tickets` directly.)
  - Portal RPCs: `c1_get_contractor_ticket`, `c1_get_tenant_ticket`, `c1_get_landlord_ticket` — replace `'job_stage', t.job_stage` with `'next_action_reason', t.next_action_reason` in JSONB output. **All three are protected — require Adam's approval per `supabase/core-rpcs/README.md`.**
  - Trigger watch list: remove `job_stage` from `trg_tickets_recompute_next_action`.
  - Column: `ALTER TABLE c1_tickets DROP COLUMN job_stage`.
  - See architecture doc § "`job_stage` — removed" for full reasoning.
- Update `c1_trigger_recompute_next_action`: no structural change (same 2-col write), new values flow through
- Update `c1_auto_close_completed_tickets`: handles new return values
- Update `c1_toggle_hold`: same pattern
- **Data backfill (sub-step 1g — order matters):**
  1. Deploy router + sub-routines first (CREATE OR REPLACE)
  2. Backfill open tickets: `UPDATE c1_tickets SET (next_action, next_action_reason) = (SELECT next_action, next_action_reason FROM c1_compute_next_action(id))` for all WHERE status != 'closed' AND archived = false
  3. Backfill terminal tickets (simple value map): `SET next_action = 'needs_action' WHERE next_action IN ('needs_attention', 'assign_contractor', 'follow_up', 'new')`, `SET next_action = 'waiting' WHERE next_action = 'in_progress' AND next_action_reason != 'scheduled'`, `SET next_action = 'scheduled' WHERE next_action = 'in_progress' AND next_action_reason = 'scheduled'`
  4. Rename `compliance_pending` on ALL tickets (open and closed): `UPDATE c1_tickets SET next_action_reason = 'compliance_needs_dispatch' WHERE next_action_reason = 'compliance_pending'`
  5. **Backfill `waiting_since`:** `UPDATE c1_tickets SET waiting_since = COALESCE(updated_at, date_logged) WHERE status != 'closed' AND waiting_since IS NULL` — existing open tickets need this for age_boost in priority scoring
  6. **Backfill `deadline_date` (compliance):** `UPDATE c1_tickets t SET deadline_date = cc.expiry_date FROM c1_compliance_certificates cc WHERE t.compliance_certificate_id = cc.id AND t.category = 'compliance_renewal'` — existing compliance tickets need this for time_pressure in priority scoring
  7. **Backfill `deadline_date` (rent):** Set from linked `c1_rent_ledger.due_date` for existing rent tickets
  8. **Recompute `sla_due_at`:** For existing `needs_action` tickets, trigger a recompute so SLA is set from the new defaults table. For `waiting`/`scheduled` tickets, ensure `sla_due_at = NULL`.
  9. **Verify:** Run router against all open tickets, compare old vs new bucket assignments. Log any unexpected changes to confirm `c1_messages.stage` behavior is preserved.
- `supabase gen types` after push
- **Rollback:** `supabase/rollbacks/` contains rollback script. Reverses: column additions (DROP), router to old values, CHECK constraint to old values, backfill old `next_action` values. Test rollback on local before pushing to remote.

### Step 2: Compliance auto-ticketing cron
- New RPC: `c1_compliance_auto_ticket()` — scans certs, creates tickets with dedup
- **Title generation:** RPC generates `issue_title` from cert context (e.g., "Gas Safety Certificate — 14 Elm Street") and `issue_description` from cert status (e.g., "Gas Safety Certificate expired 30 days ago"). See architecture doc § "Ticket titles".
- New cron: `compliance-auto-ticket-daily`, runs daily after `c1_compliance_escalate`
- Modify `compliance_dispatch_renewal`: idempotent — update existing ticket if one exists instead of raising exception
- **First run is a backfill** — run manually, review created tickets before enabling cron

### Step 3: Rent day-1 ticketing — verify + augment (⚠️ edge function)
- **`yarro-rent-reminder` already calls `create_rent_arrears_ticket()`** (line 298) with priority escalation and dedup. No new RPC call needed.
- **Verify existing RPC sets new columns:** `deadline_date` (from rent due date), `waiting_since` (now()), `issue_title`/`issue_description` (generated from tenant + property context). Update RPC if any are missing.
- **Add `AUTO_TICKET_RENT` audit event** to `create_rent_arrears_ticket()` if not already logging
- **Title generation:** RPC generates `issue_title` (e.g., "Rent arrears — John Smith") and `issue_description` (e.g., "£850 overdue since 1 Apr 2026, Room 3"). See architecture doc § "Ticket titles".
- **Scoped change:** RPC updates only, edge function likely unchanged

### Step 4: Handoff always creates ticket + remove `job_stage` writes (⚠️ edge functions)
- Audit `yarro-tenant-intake/index.ts`: ensure `c1_create_ticket` always called on handoff
- **`yarro-scheduling/index.ts`:** remove `job_stage: "Sent"` (line 169) and `job_stage: "Booked"` (line 372) from `.update()` calls. 2 lines removed, no other changes.
- **Scoped changes:** guard handoff path + remove 2 `job_stage` properties from update objects

### Step 5: Dashboard RPC rewrite — `c1_get_dashboard_todo`

**Current problems (see full analysis in conversation):**
1. Timeout logic duplicated 5x (action_type, action_label, action_context, priority_bucket, is_past_timeout)
2. `action_type` is redundant with bucket + stuck override
3. `priority_bucket` re-derives urgency that escalation crons already handle
4. References removed reasons (`landlord_in_progress`, `ooh_in_progress`, `compliance_pending`)
5. `compliance_pending` flagged as timed out — wrong (needs_action states don't timeout)
6. Hardcoded thresholds (48, 72, 120) should come from PM/property config

**New structure — compute once, reference everywhere:**

```
CTE 1: pm_tickets (existing — filter open, non-archived, non-held)
CTE 2: contractor_timing (simplified — reads t.contractor_sent_at column instead of JSONB parse)
CTE 3: timeout_check (NEW — compute is_past_timeout ONCE per ticket)
         For each waiting reason, check against configurable threshold:
         - awaiting_contractor: now() - t.contractor_sent_at > threshold (column read, no JSONB)
         - awaiting_booking: > pm.booking_timeout_days (default 3)
         - awaiting_landlord: > pm.landlord_timeout_hours (exists, default 48)
         - allocated_to_landlord: > pm.landlord_allocation_timeout_hours (default 72)
         - ooh_dispatched: > pm.ooh_timeout_hours (default 48)
           Split by accepted_at: NULL = short timeout, NOT NULL = longer timeout
         - awaiting_tenant: now() - t.tenant_contacted_at > pm.tenant_timeout_hours (default 48)
         - scheduled + past date: SCHEDULED_OVERDUE
         IMPORTANT: needs_action reasons NEVER timeout (PM hasn't acted ≠ stuck)
CTE 4: scored (simplified — reads bucket from t.next_action, uses timeout_check)
```

**Display overrides (dashboard RPC applies on top of router bucket, evaluated in order — first match wins):**
1. Reschedule urgency: `IF reason = 'reschedule_pending' AND scheduled_date - now() <= 24h → display as 'needs_action'` (PM must call — no time for portal flow)
2. Stuck override: `IF is_past_timeout AND next_action = 'waiting' → display as 'stuck'`

**Order matters:** If a reschedule is pending AND timed out AND within 24h, the PM must call (needs_action). That's more urgent than chasing (stuck). Reschedule urgency is checked first.

**What dies:**
- `action_type` column — eliminated entirely. Bucket + is_past_timeout replaces it.
- `priority_bucket` column — eliminated. Ticket `priority` column is the SSOT (escalation crons already bump it). Frontend reads `t.priority` directly.
- Duplicated timeout CASE blocks — computed once in timeout_check CTE.
- `compliance_pending` timeout — needs_action states don't timeout.
- References to `landlord_in_progress`, `ooh_in_progress`.

**What stays (updated):**
- `priority_score` — computed via `c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since)`. Consequence-driven: base severity + deadline pressure + SLA proximity + age boost. See architecture doc § "Priority Scoring".
- `is_past_timeout` — read from timeout_check CTE (computed once).

**New output fields:**
- `bucket` — reads `t.next_action` (already the bucket value after Step 1). Dashboard RPC overrides to `'stuck'` when `is_past_timeout = true AND t.next_action = 'waiting'`.
- `contractor_sent_at` — column on `c1_tickets`. When first contractor was notified. Read directly, no JSONB parse.

**Removed output fields:**
- `action_type` — dead (replaced by bucket + is_past_timeout)
- `action_label` — dead (moved to frontend mapping, one object used by dashboard + drawer)
- `action_context` — dead (moved to frontend mapping, composed from reason + timestamps)
- `priority_bucket` — dead (frontend reads `priority` directly)
- `source_type` — dead (all items are tickets; `category` tells you the type)

**Labels and context move to frontend (SSOT):**
Both the dashboard and drawer need the same labels/context. If computed in backend, it's duplicated across two RPCs. Instead:
- Backend returns: `next_action_reason`, `is_past_timeout`, `waiting_since`, `contractor_sent_at`, `scheduled_date`, `landlord_allocated_at`, `ooh_dispatched_at`, `cert_expiry_date`, `issue_title`
- Frontend has one `REASON_DISPLAY` mapping: `reason → { label, stuckLabel, context }`
- Stuck context uses per-reason timestamps for duration text (e.g., `awaiting_contractor` → `contractor_sent_at`, `allocated_to_landlord` → `landlord_allocated_at`)
- Dynamic context for compliance: composed from `cert_expiry_date` + `issue_title`
- See architecture doc § "Labels and context" for full mapping

**Hardcoded thresholds → configurable:**
- Read from `c1_property_managers` columns. Currently only `landlord_timeout_hours` exists.
- Add columns (future migration, can be defaults for now): `contractor_timeout_hours`, `ooh_timeout_hours`, `booking_timeout_days`, `tenant_timeout_hours`
- For this step: use existing `landlord_timeout_hours`, hardcode rest with clear DEFAULT comments. Extraction to PM columns is a follow-up.

**`supabase gen types` after push.**

### Step 6: Audit trail — legal defence events
- Add `STATE_CHANGED` event to `c1_trigger_recompute_next_action`: log when `next_action_reason` actually changes (metadata: from_reason, to_reason, from_bucket, to_bucket)
- Add `TIMEOUT_TRIGGERED` event to timeout cron jobs: log when `is_past_timeout` fires (metadata: reason, threshold_hours, waiting_since). Dedup: only once per timeout period per ticket.
- Add `TIMEOUT_RESOLVED` event to message trigger: log when stage changes after a timeout existed (metadata: reason, response_after_hours, actor_name)
- Add `AUTO_TICKET_COMPLIANCE` event to compliance auto-ticket cron
- Add `AUTO_TICKET_RENT` event to rent auto-ticket RPC
- Add `PM_TRIAGED`, `PM_PRIORITY_CHANGED`, `PM_REASSIGNED`, `PM_BYPASSED_APPROVAL` events to relevant PM action RPCs
- Add `RESCHEDULE_REQUESTED` event to both reschedule request RPCs (metadata: initiated_by, proposed_date, reason, original_date)
- Add `RESCHEDULE_DECIDED` event to reschedule decision RPC (metadata: decided_by, approved, new_date, original_date)
- Add `CONTRACTOR_WITHDRAWN` event to `c1_mark_contractor_withdrawn` RPC (metadata: contractor_name, reason, remaining_contractors). If last contractor: log BOTH `CONTRACTOR_WITHDRAWN` AND the `STATE_CHANGED` to `no_contractors`.
- Update `CAUSAL_ORDER` in `src/lib/audit-utils.ts` with new event types
- Update audit timeline component for new event display
- **Delete `c1_ledger` (⚠️ order matters):** The triggers `trg_c1_ledger_insert` and `trg_c1_ledger_update` fire on `c1_tickets` (not on `c1_ledger`), so `DROP TABLE c1_ledger CASCADE` will NOT remove them. They must be dropped explicitly BEFORE the table:
  ```
  DROP TRIGGER trg_c1_ledger_insert ON c1_tickets;
  DROP TRIGGER trg_c1_ledger_update ON c1_tickets;
  DROP FUNCTION c1_ledger_on_ticket_insert();
  DROP FUNCTION c1_ledger_on_ticket_update();
  DROP TABLE c1_ledger;
  ```
  All test data — no migration needed to preserve.
- Remove `c1_ledger` from `use-ticket-detail.ts` (ledger fetch + LedgerEntry type)
- Remove `c1_ledger` from `use-ticket-audit.ts` (ledger fetch + merge + dedup logic)
- `c1_events` is now the sole audit data source. No dedup needed.
- See `docs/architecture/ticket-state-model.md` § Audit Trail for full spec

### Step 7: Ticket detail RPC — SSOT for the drawer
**New RPC: `c1_ticket_detail(p_ticket_id uuid)` RETURNS jsonb**

**Why:** The drawer currently makes 7 separate queries + category-specific fetches, and uses three independent frontend stage systems (`STAGE_CONFIG` for maintenance, `getComplianceStage()` for compliance, nothing for rent). The dashboard and drawer compute display text independently → they can show conflicting state for the same ticket.

**What it returns:**
- Universal: issue_title, issue_description, property_address, category, maintenance_trade, priority, date_logged, next_action (bucket), next_action_reason (state), is_past_timeout, scheduled_date, contractor_quote, final_amount, images, people (tenant/landlord/contractor/manager as JSONB objects)
- Scoring: `priority_score` via `c1_compute_priority_score()` — same function as dashboard RPC, identical score
- Timing: deadline_date, sla_due_at, waiting_since, contractor_sent_at, landlord_allocated_at, ooh_dispatched_at, tenant_contacted_at
- Reschedule: reschedule_requested, reschedule_date, reschedule_reason, reschedule_status, reschedule_initiated_by
- Compliance (NULL for others): cert_type, cert_expiry_date, cert_status, cert_document_url, cert_issued_date, cert_number, cert_issued_by
- Rent (NULL for others): rent_summary (total_owed, total_paid, months_overdue), rent_ledger array
- OOH/landlord allocation (NULL if not applicable): dispatched, outcome, notes, cost, accepted_at

**No `action_label` or `action_context`.** Labels and context are frontend display logic — one `REASON_DISPLAY` mapping used by both dashboard and drawer.
**No `job_stage`.** Removed from the system. `next_action_reason` is the SSOT for state.

**Timeline:** The drawer queries `c1_events` for this ticket's recent events. `STATE_CHANGED` events provide the timeline. Same data as the audit trail, displayed as a progression. Replaces `deriveTimeline()`.

**CTA buttons:** Rendered from `next_action_reason` — universal mapping, all categories:
- `compliance_needs_dispatch` → "Dispatch contractor"
- `cert_incomplete` → "Complete certificate"
- `rent_overdue` → "Contact tenant"
- `manager_approval` → "Approve quote"
- `handoff_review` → "Review & assign"
- `no_contractors` → "Assign contractor"
- Any `waiting`/`scheduled` reason → no CTA (PM is not the actor)

**`c1_ticket_context` RPC:** Currently the first query in `use-ticket-detail.ts`. Replaced by `c1_ticket_detail`. Audit all callers — if only used by the drawer hook, drop it. If used by audit page or other callers, leave it for now and document.

**What dies in frontend:**
- `STAGE_CONFIG` (200 lines, maintenance-only)
- `getComplianceStage()` (compliance-only)
- `deriveTimeline()` (frontend timeline computation)
- Conversation tab in drawer (full tab removed — transcript inline for handoff only)
- Activity tab merges into the main view as the events timeline
- Completion tab data absorbed into the universal drawer (job completion details shown inline)
- The tab bar itself is simplified: maintenance tickets may keep Overview + Completion as sections, not tabs. All categories use the same scrollable layout: stage card → CTA → timeline → category data → people.
- 7 separate queries in `use-ticket-detail.ts`
- Category-specific secondary fetches (absorbed into RPC)
- `use-ticket-detail.ts` hook rewritten to call 1 RPC + 1 events query + conditional transcript query

**Handoff review — inline transcript:**
- For `handoff_review` tickets: drawer makes one extra query (`c1_conversations.log` by `conversation_id`)
- Collapsible "AI Transcript" section on overview, below stage card. Auto-expanded for handoff.
- Stage card shows `handoff_reason` immediately: "No plumber contractor mapped" / "Couldn't categorise issue"
- `pending_review` tickets: transcript available (collapsible) but not auto-expanded — AI already filled in category/trade, PM just approves
- CTA: `handoff_review` → "Review & assign" | `pending_review` → "Approve dispatch"
- See architecture doc § "Handoff review — inline transcript"

### Step 8: Kill extras
- Drop `c1_get_dashboard_todo_extras` RPC
- Remove frontend: extras RPC call, merge logic, `filterActionable`/`filterInProgress`/`filterStuck`
- Remove tenancy items entirely
- Frontend groups by `item.next_action` (bucket) — reads `stuck` from dashboard RPC override
- Update `status-badge.tsx`: remove tenancy/handoff_conversation badges, add `cert_incomplete`

### Step 9: Real-time dashboard (final polish)
- Add Supabase Realtime subscription on `c1_tickets` in the dashboard page
- Filter: `property_manager_id = pm.id`
- Watch: UPDATE (bucket/reason/priority changes) + INSERT (new tickets from crons/intake)
- On change: refetch `c1_get_dashboard_todo` — dashboard updates without page refresh
- Keep focus-refetch as fallback (existing behavior)
- Scope: dashboard page only. Ticket drawer doesn't need realtime.
- Clean up subscription on unmount

### Step 10: Verify

**Build:**
- `npm run build` passes

**State model:**
- All open tickets have new `next_action` bucket values (backfill complete)
- `landlord_no_response`, `landlord_in_progress`, `ooh_in_progress` no longer exist on any ticket
- `compliance_pending` renamed to `compliance_needs_dispatch` on all tickets
- `job_stage` column dropped from `c1_tickets` — no references anywhere
- Portals read `next_action_reason` not `job_stage`

**Dashboard:**
- Shows all items from single RPC (`c1_get_dashboard_todo`)
- 4 buckets render: needs_action, waiting, scheduled, stuck
- `ooh_dispatched` appears in waiting bucket (not needs_action)
- No tenancy items, no extras RPC

**Auto-creation:**
- Incomplete certs → `cert_incomplete` → needs_action bucket
- Expiring/expired certs → `compliance_needs_dispatch` → needs_action bucket
- Rent overdue → ticket on day 1
- Handoff → always creates ticket

**Ticket drawer — SSOT verification:**
- Open same ticket on dashboard and in drawer → labels from `REASON_DISPLAY` mapping are identical (same reason + timeout = same text)
- Maintenance drawer: stage card from frontend `REASON_DISPLAY`, timeline from events, CTA renders
- Compliance drawer: same stage card system, cert details below, CTA "Dispatch contractor" works
- Rent drawer: same stage card system, payment ledger below, CTA "Contact tenant" works
- `STAGE_CONFIG` / `getComplianceStage()` / `deriveTimeline()` are gone from frontend
- `use-ticket-detail.ts` makes 1 RPC call + 1 events query (not 7+ queries)

**Compliance dispatch:**
- `compliance_dispatch_renewal` handles existing tickets (idempotent)

**Audit trail:**
- `STATE_CHANGED` events appear for every state transition
- `TIMEOUT_TRIGGERED` logged when contractor/landlord/OOH goes silent
- `TIMEOUT_RESOLVED` logged when late response arrives
- `OOH_ACCEPTED` / `LANDLORD_ACCEPTED` logged on portal acceptance
- `AUTO_TICKET_*` events for cron-created tickets
- `c1_ledger` table does not exist (dropped)
- No frontend references to `c1_ledger` remain
- Audit timeline reads from `c1_events` only — no dedup logic

**Real-time:**
- Dashboard updates without page refresh when ticket state changes
- New auto-created tickets appear on dashboard without refresh
- Subscription cleans up on unmount
- Focus-refetch still works as fallback

---

## Protected RPC Summary

| RPC | Change |
|-----|--------|
| `c1_compute_next_action` | Return new bucket values instead of old `next_action` values |
| `compute_maintenance_next_action` | Return new bucket values, remove `landlord_no_response`/`landlord_in_progress`/`ooh_in_progress`, fix `ooh_dispatched` → waiting |
| `compute_compliance_next_action` | Add `cert_incomplete` check, rename `compliance_pending` → `compliance_needs_dispatch`, return new bucket values |
| `compute_rent_arrears_next_action` | Return new bucket values |
| `c1_trigger_recompute_next_action` | No structural change (same 2-col write), new values flow through |
| `c1_auto_close_completed_tickets` | Handle new router return values |
| `c1_toggle_hold` | Handle new router return values |
| `c1_get_dashboard_todo` | Rewrite: eliminate action_type/priority_bucket, add stuck override, compute timeout once in CTE |
| `compliance_dispatch_renewal` | Idempotent — update existing ticket if exists |
| `c1_ticket_detail` | **NEW** — single RPC for drawer, returns universal + category-specific data |
| `c1_trigger_recompute_next_action` | Add `STATE_CHANGED` event logging |
| `c1_get_contractor_ticket` | Replace `job_stage` → `next_action_reason` in JSONB output |
| `c1_get_tenant_ticket` | Replace `job_stage` → `next_action_reason` in JSONB output |
| `c1_get_landlord_ticket` | Replace `job_stage` → `next_action_reason` in JSONB output |
| `trg_c1_events_on_message` | Add `TIMEOUT_RESOLVED` event logging |

## Edge Function Summary

| Function | Change | Scope |
|----------|--------|-------|
| `yarro-rent-reminder` | Already calls `create_rent_arrears_ticket`. Verify RPC sets new columns (`deadline_date`, `waiting_since`, audit event). | RPC updates only, edge function likely unchanged |
| `yarro-tenant-intake` | Ensure `c1_create_ticket` always called on handoff + passes `handoff_reason` | Guard existing code path + add parameter |
| `yarro-scheduling` | Remove `job_stage` writes (lines 169, 372) — **MUST deploy before SQL drops `job_stage` column** | 2 lines removed from `.update()` objects |

## Files Affected

### Backend (SQL migrations)
- Migration 1: router + sub-routines bucket values + CHECK constraint + cert_incomplete + write site updates + data backfill
- Migration 2: compliance auto-ticket cron + `compliance_dispatch_renewal` idempotent
- Migration 3: dashboard RPC rewrite — eliminate action_type/priority_bucket, add stuck override, timeout CTE
- Migration 4: `c1_ticket_detail` — new RPC for drawer, returns universal + category-specific data
- Migration 5: audit trail events + ledger deletion — `STATE_CHANGED` in recompute trigger, `TIMEOUT_TRIGGERED`/`TIMEOUT_RESOLVED` in timeout crons + message trigger, `AUTO_TICKET_*` in creation RPCs, `PM_*` in PM action RPCs. DROP TABLE c1_ledger + both triggers.
- Migration 6: drop `c1_get_dashboard_todo_extras`

### Edge Functions (⚠️ requires approval)
- `supabase/functions/yarro-rent-reminder/index.ts`
- `supabase/functions/yarro-tenant-intake/index.ts`
- `supabase/functions/yarro-scheduling/index.ts`

### Frontend — Dashboard
- `src/app/(dashboard)/page.tsx` — remove extras call, group by bucket, remove `landlord_no_response` filter
- `src/app/(dashboard)/tickets/page.tsx` — replace `isWaitingReason`/`isScheduledReason`/`isNeedsMgrReason` filters with `next_action === 'waiting'` etc., remove `landlord_no_response` from `NEEDS_MGR_REASONS`
- `src/app/(dashboard)/compliance/[id]/page.tsx` — line 121: `compliance_pending` → `compliance_needs_dispatch` (cert page status derivation)
- `src/components/dashboard/todo-panel.tsx` — remove filter functions, remove extras reason refs, remove `landlord_no_response` badge
- `src/components/dashboard/waiting-section.tsx` — read bucket field
- `src/components/status-badge.tsx` — update badges, add `cert_incomplete`, `compliance_needs_dispatch`, `awaiting_tenant`

### Frontend — Ticket Drawer (major rewrite)
- `src/hooks/use-ticket-detail.ts` — ⚠️ RED zone: rewrite from 7 queries to 1 RPC (`c1_ticket_detail`) + 1 events query. Kill category-specific secondary fetches.
- `src/components/ticket-detail/ticket-detail-modal.tsx` — simplify template switching. Universal header + stage card + CTA for all categories. Category section renders maintenance/compliance/rent-specific data.
- `src/components/ticket-detail/ticket-overview-tab.tsx` — kill `STAGE_CONFIG` (200 lines), kill `deriveTimeline()`. Replace with `action_label`/`action_context` from RPC + events timeline.
- `src/components/ticket-detail/compliance-overview-tab.tsx` — kill `getComplianceStage()`. Use universal stage card from RPC. Keep cert details section.
- `src/components/ticket-detail/rent-overview-tab.tsx` — add stage card (currently has none). Use universal stage card from RPC. Keep payment ledger section.
- `src/components/profile/ticket-card.tsx` — remove `landlord_no_response` label, update to use bucket values

### Audit only (read, don't modify unless needed)
- `supabase/functions/yarro-tenant-intake/prompts.ts` — ⚠️ RED zone: check if `landlord_no_response` appears in AI prompt mapping table. If yes, remove entry. If no, no action.

### Frontend — Portals (migrate from `job_stage` to `next_action_reason`)
- `src/components/portal/tenant-portal.tsx` — `getActiveStageIdx()`: replace `job_stage` checks with `next_action_reason` mapping
- `src/components/portal/tenant-portal-v2.tsx` — same as above
- `src/components/portal/contractor-portal.tsx` — `getTicketStage()`: replace `job_stage` checks with `next_action_reason` mapping

### Not affected (do not modify)
- Portal outcome values (`resolved`, `in_progress`, `need_help` on landlord/OOH portals) — these are landlord/OOH *outcome* values, NOT `next_action` values. Do not touch.

### Audit trail
- `src/lib/audit-utils.ts` — add new event types to `CAUSAL_ORDER`
- `src/components/audit-profile/audit-timeline.tsx` — add display for new event types, remove ledger source handling
- `src/hooks/use-ticket-audit.ts` — remove c1_ledger fetch, remove merge/dedup logic, read c1_events only
- `src/hooks/use-ticket-detail.ts` — remove c1_ledger fetch

### Type Generation
- `supabase gen types` after migrations 1, 3, 4, 5 (ledger drop changes types too)
- **Expect 30+ type errors** after first gen — all `next_action` string comparisons will fail. This is expected; fix in the frontend steps.

---

---

## Risks

### RISK 1: Router + trigger ordering within migration
The new trigger writes 4 fields using values from the router. The migration must `CREATE OR REPLACE FUNCTION` the router and all sub-routines BEFORE updating the trigger function. SQL migrations execute sequentially — ordering within the file matters.

### RISK 2: Edge function deployment timing
Edge functions deploy independently from SQL migrations. If the SQL migration drops `job_stage` before edge functions are updated, writes to `job_stage` will error. **Deployment strategy addresses this: edge functions deploy FIRST.**

### RISK 3: `c1_messages.stage` dependency
The router still reads `c1_messages.stage` for dispatch flow. If router changes break assumptions about stage values, dispatch flow produces wrong bucket assignments. **Mitigated by post-backfill verification step (1g.9).**

### RISK 4: TypeScript type blast radius
When `next_action` values change from `needs_attention`/`assign_contractor`/`follow_up`/`new`/`in_progress` to `needs_action`/`waiting`/`scheduled`, generated types change. Every frontend file with string comparisons against these values will get type errors. Expect 30+ errors after `supabase gen types`. This is normal — caught by `npm run build`.

### RISK 5: `prompts.ts` — verify no `landlord_no_response` reference
Investigation confirms `landlord_no_response` does NOT appear in `prompts.ts`. Safe. But if future sessions add AI prompt changes that reference removed reason values, they'll silently fail to match. The audit step (Step 10) should verify no references to removed values remain anywhere.

---

## Key Principle

**The ticket is the atom.** Three layers describe its state: bucket (where), reason (why), timeout (how long). The router writes the first two. The dashboard computes the third. The frontend displays all three. Nothing else computes state.

**SSOT everywhere.** Every piece of state has one authoritative source. Ticket state = router. Display text = REASON_DISPLAY. Priority = `c1_tickets.priority`. Timeline = `c1_events`. If you're writing the same value in two places, one of them is wrong.
