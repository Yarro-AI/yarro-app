# E2E Test Session Summary — 2026-04-11

## Tests Completed

| Test | Name | Result | Notes |
|------|------|--------|-------|
| 17 | Entity CRUD | **PASS** | Property, room, tenant, contractor, landlord all create fine. BUG-2 (rent_due_day not saved). |
| 1 | Maintenance Lifecycle | **PARTIAL** | Create → dispatch → quote → approve works. Scheduling broken (BUG-11). Auto-approve doesn't update dashboard (BUG-10). |
| 2 | Dispatch Chain | **PARTIAL** | WhatsApp landlord flow works. Email completely broken (BUG-14). Landlord decline doesn't update bucket (BUG-16). |
| 5 | Rent Lifecycle | **PARTIAL** | Partial + full payment works. Cron doesn't create tickets (BUG-4). |
| 9 | Priority Scoring | **PASS** | Emergency > Compliance > Low — correct order. |
| 11 | Data Integrity | **PASS** | All 5 queries return 0. Clean data. |
| 16 | Surface Checks | **PASS** | All pages load, navigation works, search works. |

## Tests Skipped / Blocked

| Test | Name | Blocked By |
|------|------|------------|
| 14 | WhatsApp Intake | Not tested (needs real WhatsApp conversation) |
| 4 | Compliance Lifecycle | BUG-6 (RPC ambiguity) |
| 3/3b/3c | Contractor Timeout | Not reached |
| 7 | Emergency + OOH | Not reached |
| 8 | Email vs WhatsApp Routing | BUG-14 (email broken) |
| 10 | Onboarding | Not reached |
| 12 | Tenant Journey | BUG-11 (scheduling broken) |
| 13 | Landlord Journey | BUG-11 (scheduling broken) |
| 15 | Cron Schedules | Not reached |

## Bug Tally

- **Total:** 16 logged (2 invalid)
- **Blockers:** 7
- **High:** 7
- **Medium:** 2

## UX/UI Backlog

14 items logged in `e2e-ux-backlog.md`

## Blocker Root Causes + Fix Approach

### BUG-2: rent_due_day not saved
- **Root cause:** Room creation form/API not persisting rent_due_day
- **Fix:** Check room creation RPC or API route — field likely missing from the insert
- **Effort:** Small (30 min)

### BUG-4: Rent cron doesn't create tickets or flip status
- **Root cause:** `yarro-rent-reminder` edge function sends WhatsApp but doesn't call status flip or ticket creation
- **Fix:** Add status flip logic (pending → overdue when past due) + ticket creation at 5+ days
- **Effort:** Medium (2-3 hours)

### BUG-6: Compliance ticket creation — RPC ambiguity
- **Root cause:** Two overloads of `c1_create_manual_ticket` — Postgres can't resolve which to call
- **Fix:** Drop the old overload or add explicit type casts in the edge function call
- **Effort:** Small (30 min)

### BUG-10: Dashboard stuck on "Awaiting landlord" after auto-approve
- **Root cause:** Auto-approve fires in edge function but doesn't re-trigger `c1_compute_next_action`
- **Fix:** After auto-approve, update ticket fields so the trigger re-computes bucket/reason
- **Effort:** Medium (1-2 hours)

### BUG-11: Contractor scheduling — "job_stage" column missing
- **Root cause:** Edge function `yarro-scheduling` references `job_stage` column that doesn't exist
- **Fix:** Remove the reference or add the column via migration
- **Effort:** Small (30 min)

### BUG-12: WhatsApp decline overrides approved quote
- **Root cause:** Edge function processes WhatsApp flow response without checking current ticket state
- **Fix:** Add state guard — reject flow response if quote already actioned
- **Effort:** Small (1 hour)

### BUG-14: Email notifications fail — no sending domain
- **Root cause:** `notifications@yarro.ai` doesn't exist — no email sending infrastructure
- **Fix:** Set up Resend or SendGrid with yarro.ai domain verification
- **Effort:** Medium (2-3 hours including DNS + verification)
