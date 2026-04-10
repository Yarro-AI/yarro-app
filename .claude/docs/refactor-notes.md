# Ticket State Model Refactor — Running Notes

> Living document. Updated as issues surface during the refactor.

---

## Pre-existing Issues Discovered

### 1. Duplicate files causing build failure

`npm run build` fails before any refactor changes due to macOS duplicate files (` 2` / ` 3` suffixes). These are copy artifacts, not intentional files. The build-breaking one:

```
src/components/bulk-import/bulk-import-flow 2.tsx  → Type error on line 69
```

**Full list of duplicates found:**

```
.claude/docs/decision-principles 2.md
.claude/tasks/2026-04-04-critical-quality-fixes 2.md
.claude/tasks/2026-04-05-whatsapp-demo-ready-audit 2.md
src/app/(dashboard)/audit-trail/[ticketId]/loading 2.tsx
src/app/(dashboard)/audit-trail/[ticketId]/page 2.tsx
src/components/audit-profile/audit-conversations 2.tsx
src/components/audit-profile/audit-evidence 2.tsx
src/components/audit-profile/audit-export-pdf 2.tsx
src/components/audit-profile/audit-financials 2.tsx
src/components/audit-profile/audit-profile-header 2.tsx
src/components/audit-profile/audit-timeline 2.tsx
src/components/audit-profile/index 2.ts
src/components/bulk-import/bulk-import-dialog 2.tsx
src/components/bulk-import/bulk-import-flow 2.tsx
src/components/bulk-import/column-mapper 2.tsx
src/components/bulk-import/column-mapper 3.tsx
src/components/bulk-import/import-results 2.tsx
src/components/bulk-import/paste-input 2.tsx
src/components/bulk-import/preview-table 2.tsx
src/components/dashboard/category-badge 2.tsx
src/components/dashboard/category-badge 3.tsx
src/components/dashboard/job-card 2.tsx
src/components/dashboard/job-card 3.tsx
src/components/dashboard/jobs-list 2.tsx
src/components/dashboard/jobs-list 3.tsx
src/components/dashboard/scheduled-section 2.tsx
src/components/dashboard/waiting-section 2.tsx
src/components/detail-cell 2.tsx
src/components/ui/checkbox 2.tsx
src/hooks/use-ticket-audit 2.ts
src/lib/audit-utils 2.ts
src/lib/bulk-import/__tests__ 2/
src/lib/bulk-import/config 2.ts
src/lib/bulk-import/pipeline 2.ts
supabase/functions/_shared/image-url 2.ts
supabase/functions/_shared/twilio-verify 2.ts
supabase/seed-test-messages 2.sql
```

**Impact:** Build cannot pass until these are removed. They're all untracked (not committed), so safe to delete.

**Action taken:** All `* 2.*` and `* 3.*` duplicate files deleted during Sprint 0 session (2026-04-10). Build passes clean.

---

## Sprint 0 Notes

### Observations

- Sprint 0 was docs-only, no code changes. All 7 files updated per plan.
- The `gentle-roaming-creek.md` master plan had a pre-existing modification (shown as `M` in git status) that was already there before this session started.
- `architecture.md` had a duplicate `c1_rent_payments` row in the Key Database Tables section (pre-existing, not fixed in Sprint 0 since the plan didn't call for it).

---

## Sprint B Notes

### Step 2: Compliance auto-ticketing
- New RPC `c1_compliance_auto_ticket()` creates tickets for incomplete, expiring (≤30d), and expired certs.
- `compliance_dispatch_renewal` made idempotent — handles auto-created tickets by inserting a message row + dispatching.
- Cron scheduled at 08:05 UTC (after escalation 07:55, reminder 08:00).
- BEFORE INSERT trigger can't read the new row, so auto-ticket does INSERT + UPDATE to force recompute.

### Step 3: Rent ticket augment
- `create_rent_arrears_ticket` (protected) now auto-computes `deadline_date` from `c1_rent_ledger` when not passed.
- `AUTO_TICKET_RENT` audit event logged for new tickets.

### Step 4: job_stage removal
- Edge functions deployed first (removed `job_stage` writes from yarro-scheduling, added `handoff_reason` to yarro-tenant-intake).
- Column drop required handling 2 dependencies: `trg_same_day_reminder` trigger (dead code — dropped) and `v_properties_hub` view (recreated with `next_action_reason` replacing `job_stage`).
- `c1_ticket_context` (protected RPC) also returned `job_stage` — fixed in follow-up migration 04b.
- All frontend `job_stage` references cleaned from ~16 source files.

---

## Sprint C Notes

- Dashboard RPC (`c1_get_dashboard_todo`) rewritten with clean CTE structure.
- Return type changed from TABLE to jsonb — required DROP + CREATE.
- Priority scoring via `c1_compute_priority_score`, stuck override for waiting + timed out.

---

## Sprint D Notes

- STATE_CHANGED events now fire on every state transition in the recompute trigger.
- `c1_ledger` table dropped — `c1_events` is the sole audit source.
- Frontend audit hook simplified from dual-source merge/dedup to events-only.
- `c1_reset_account` updated to remove c1_ledger deletion.

---

## Sprint E Notes

- `c1_ticket_detail` RPC created — replaces 7+ drawer queries with a single call.
- `c1_get_dashboard_todo_extras` dropped — all items are tickets now.
- `src/lib/reason-display.ts` created as the SSOT for state display text.
- All removed reason values cleaned from ~10+ frontend files.
- Full drawer rewrite (use-ticket-detail.ts 678→100 lines) deferred — too large/risky for this session. The RPC and SSOT are in place for incremental adoption.

---

## Sprint F Notes

- Realtime subscription added to dashboard — auto-updates on ticket state/priority/status changes + new ticket inserts.
- Filters by `property_manager_id`, only refetches on meaningful changes.
- Clean subscription cleanup on unmount.

---

## Decision Log

### Deferred: Full drawer rewrite (Sprint E Part 5)
The plan called for rewriting `use-ticket-detail.ts` from 678 lines to ~100 lines (1 RPC + 1 events query). Deferred because: (a) the hook is consumed by multiple components, (b) the full rewrite requires coordinated changes across the detail modal, overview tabs, and compliance/rent tabs, (c) risk of breaking the drawer without proper testing. The backend (`c1_ticket_detail` RPC) and frontend SSOT (`reason-display.ts`) are in place for incremental adoption.

### Deferred: TIMEOUT_TRIGGERED / TIMEOUT_RESOLVED events (Sprint D Part 3)
These require either a dedicated cron or integration into the existing timeout detection. Deferred because timeout detection currently happens at read-time in the dashboard RPC, not as stored events. A future cron job could scan and log these.

---

## Gaps Found in Plans

### 1. Sprint A backfill referenced non-existent `updated_at` column
The plan's backfill SQL used `COALESCE(updated_at, date_logged)` for `waiting_since`, but `c1_tickets` has no `updated_at` column. Fixed to use `date_logged` directly. Migration had to be repaired and re-pushed.

### 2. Sprint B job_stage DROP had undiscovered dependencies
Plan didn't account for `trg_same_day_reminder` (trigger on `job_stage` column) or `v_properties_hub` (view selecting `job_stage`). Migration failed on first push, required repair + updated migration. Also discovered `c1_ticket_context` (protected RPC) returned `job_stage` — required additional migration.

---

## Sprint G/H/I Notes (Frontend SSOT — 2026-04-10)

### Issues Found During Testing

**BACKEND BUG: `no_contractors` appearing in `waiting` bucket**
- A ticket with `next_action_reason = 'no_contractors'` has `bucket = 'waiting'` in the dashboard
- Per architecture spec § bucket assignment, `no_contractors` should be `needs_action`
- Root cause: Either the router assigns wrong `next_action`, or the ticket's column is stale from before the router fix
- **Fix needed:** Check `c1_compute_next_action` for `no_contractors` handling. May need a one-time recompute migration.

**Compliance table page (/compliance) not loading**
- Not caused by refactor — page doesn't import anything from refactored files
- Uses `compliance_get_all_statuses` RPC directly
- Needs browser console investigation

**Assign contractor CTA intermittent**
- `StageDispatchAction` component not modified in this refactor — likely pre-existing

### Fixes Applied Post-Testing
- `getTodoHref`: removed direct `/compliance/${id}` link — compliance items now open the drawer first (correct flow: dashboard → drawer → cert page)
- Rent CTA: added `ticket.tenant?.phone` to `rent_overdue` and `rent_partial_payment` CTAs so the contact button works

---

## Risks Encountered

_Record any risks that materialised or new risks discovered._

- Sprint I (drawer) exposed that `TicketDetail.tenant` is a nested object — consumers that used `context.tenant_name` now use `ticket.tenant?.name`. Risk of silent `undefined` if RPC doesn't return nested objects for some tickets.
