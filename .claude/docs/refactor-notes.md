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

## Decision Log

_Record decisions made during the refactor that aren't in the architecture spec or plans._

(none yet)

---

## Gaps Found in Plans

### 1. Sprint A backfill referenced non-existent `updated_at` column
The plan's backfill SQL used `COALESCE(updated_at, date_logged)` for `waiting_since`, but `c1_tickets` has no `updated_at` column. Fixed to use `date_logged` directly. Migration had to be repaired and re-pushed.

---

## Risks Encountered

_Record any risks that materialised or new risks discovered._

(none yet)
