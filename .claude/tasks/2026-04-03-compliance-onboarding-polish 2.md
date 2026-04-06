## PRD: Compliance Onboarding Polish
**Date:** 2026-04-03
**Branch:** feat/compliance-onboarding-polish
**Status:** In Progress
**Journey:** Compliance Lifecycle — Slice 2 of 3
**Scope:** Add contractor + reminder config to compliance onboarding wizard. Nothing else.

### Goal
When a PM onboards their compliance certs, they should be able to assign a contractor and set a reminder window per cert — so auto-dispatch and reminders work from day one. Currently these are hardcoded (null contractor, 60-day reminder). Two dropdowns, pass the values to the existing RPC. Keep it simple.

### User Story
As a PM, I want to assign a contractor and set reminder days when I first upload a certificate so that renewals are automated from the start.

### Technical Plan
1. In `CertFormCard` (inside `compliance-onboarding.tsx`), add:
   - Contractor dropdown — query `c1_contractors` for this PM, show name list, allow "None"
   - Reminder days dropdown — 30 / 60 / 90 options, default 60
2. Pass `contractor_id` and `reminder_days_before` to the `compliance_upsert_certificate` RPC call (line ~127-138)
3. That's it. No new RPCs, no new migrations, no other files.

### Acceptance Criteria
- [ ] Onboarding wizard cert upload step shows contractor dropdown with PM's contractors
- [ ] Onboarding wizard cert upload step shows reminder days dropdown (30/60/90)
- [ ] Contractor dropdown defaults to "None", reminder defaults to 60 days
- [ ] Saving a cert with contractor + reminder persists both values to the DB
- [ ] Skipping a cert doesn't create a record (existing behavior preserved)
- [ ] Wizard still works with zero contractors (dropdown shows "None" only)

### Test Plan
| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1 | Open /compliance with no certs → wizard launches | Wizard shows intro | |
| 2 | Select cert types → advance to upload step | Upload form appears with contractor + reminder dropdowns | |
| 3 | Set contractor + 90 days + expiry + upload doc → Save & Next | Toast "saved", advances to next cert | |
| 4 | Check DB: `c1_compliance_certificates` for saved cert | `contractor_id` and `reminder_days_before = 90` set | |
| 5 | Skip a cert → check DB | No cert record created for skipped type | |
| 6 | Complete wizard with no contractors available | Dropdown shows "None", saves with null contractor_id | |
| 7 | npm test | Zero failures | |
| 8 | npm run build | Zero errors | |

### Out of Scope
- Contractor portal for cert uploads (Slice 3)
- Dashboard getting-started card changes (already wired to /compliance)
- Compliance page UI changes
- Certificate form dialog changes (separate from onboarding wizard)
- New RPCs or migrations

### Constraints
- Only file to edit: `src/components/onboarding/compliance-onboarding.tsx`
- No protected RPCs touched
- Follow existing onboarding wizard patterns (ToggleOptionButton, OnboardingOptionButton)

### Done When
- [ ] All acceptance criteria pass
- [ ] Test plan passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed
- [ ] SESSION_LOG.md updated
