## Task: Compliance Type Cleanup + Property List Indicators
**Date:** 2026-03-27
**Branch:** feat/compliance-types-and-indicators
**Status:** In Progress

### Goal
Replace local compliance interfaces with generated database types and add compliance status indicators to the properties list page — so PMs can see at a glance which properties have compliance issues.

### Context
- **Local interfaces to remove:** `ComplianceCertificate` in `property-compliance-section.tsx` (line 15-23), `CertificateRowProps.certificate` in `certificate-row.tsx` (line 12-17)
- **Database types available:** `Database["public"]["Tables"]["c1_compliance_certificates"]["Row"]` in `types/database.ts`
- **Properties list page:** `src/app/(dashboard)/properties/page.tsx` — uses `v_properties_hub` view and `DataTable` component
- **Existing patterns:** `StatusBadge` component already supports `valid`, `expiring`, `expired`, `missing` statuses
- **Utility:** `computeCertificateStatus()` in `src/lib/constants.ts` already computes status from expiry date

### Behaviour
- The compliance components use database-generated types instead of hand-written interfaces
- The properties list page shows a small compliance indicator per property (e.g. red dot or badge if any cert is expired/expiring)
- Properties with no certificates show a neutral/muted indicator
- Properties with all certs valid show green or no indicator (clean = quiet)

### Technical Plan

**Part 1 — Type cleanup (3 files)**
1. Create a derived type alias in `constants.ts` or a new `types/compliance.ts`:
   `type ComplianceCertificate = Database["public"]["Tables"]["c1_compliance_certificates"]["Row"]`
2. Update `property-compliance-section.tsx`: remove local `ComplianceCertificate` interface, import the DB type
3. Update `certificate-row.tsx`: remove local interface, use `Pick<ComplianceCertificate, 'id' | 'certificate_type' | 'expiry_date' | 'issued_by'>` for props
4. Update `certificate-form-dialog.tsx`: `CertificateFormData` stays as-is (it's a form DTO, not a DB row)
5. Remove the `as ComplianceCertificate[]` cast in `property-compliance-section.tsx` (line 48) — types should flow naturally

**Part 2 — Properties list compliance indicators**
1. On the properties list page, fetch compliance certificates alongside properties (either join via the view or a second query)
2. Compute worst compliance status per property using `computeCertificateStatus()`
3. Add a compliance status column or indicator to the DataTable — small `StatusBadge` or dot showing worst status
4. Keep it subtle — compliance is important but shouldn't dominate the row

### Constraints
- Do NOT modify `types/database.ts` (auto-generated)
- Do NOT change `CertificateFormData` (it's a form shape, not a DB row)
- Follow existing `DataTable` column patterns from the properties page
- Use semantic color tokens only (`bg-card`, `text-muted-foreground`, etc.)

### Done When
- [ ] `npm run build` passes with zero errors
- [ ] No local `ComplianceCertificate` interfaces remain in compliance components
- [ ] Properties list shows compliance indicator per property
- [ ] Feature works visually in browser
- [ ] Dark mode looks correct
- [ ] Responsive at 375px and 1440px
- [ ] No `any` types or `@ts-ignore`
- [ ] Committed and pushed to task branch

### Notes
Anything that comes up during the session goes to BACKLOG.md
