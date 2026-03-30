## Task: Migrate Compliance Logic to Supabase RPCs
**Date:** 2026-03-27
**Branch:** refactor/compliance-rpcs
**Status:** In Progress

### Goal
Move all compliance business logic (CRUD, status computation, dashboard aggregation) from the frontend into Supabase RPCs, enforcing the backend-first architecture rule before Phase 1 sign-off.

### Context
- **Frontend files with business logic to migrate:**
  - `src/components/property-compliance-section.tsx` — direct insert/delete on `c1_compliance_certificates`, upsert (delete-then-insert) logic
  - `src/components/certificate-form-dialog.tsx` — duplicate type prevention check
  - `src/lib/constants.ts` — `computeCertificateStatus()` function (lines 92-103)
  - `src/app/(dashboard)/page.tsx` — dashboard summary query + client-side aggregation (lines 476-492)
  - `src/components/certificate-row.tsx` — uses `computeCertificateStatus` for badge display
- **Database table:** `c1_compliance_certificates`
- **Patterns:** Follow RPC pattern from CLAUDE.md (migration file → test in SQL editor → deploy → regen types → build UI)

### Behaviour
- **No user-visible changes.** Everything works exactly as before.
- The user can still add/edit/delete certificates on the property detail page.
- The dashboard still shows expired/expiring/valid counts.
- Status badges still show correct colors (green/amber/red).
- All logic now runs server-side via RPCs.

### Technical Plan

**Step 1 — Write migration with 4 RPCs:**

1. `compliance_upsert_certificate(...)` — accepts all cert fields, handles:
   - Delete existing cert of same type for same property (upsert behavior)
   - Insert new cert
   - Returns the new certificate row
   - Ownership check: validates `property_manager_id` matches caller

2. `compliance_delete_certificate(cert_id uuid, pm_id uuid)` — handles:
   - Ownership check before delete
   - Returns success/failure

3. `compliance_get_certificates(p_property_id uuid, pm_id uuid)` — handles:
   - Fetch all certs for a property
   - Compute status in SQL: `CASE WHEN expiry_date IS NULL THEN 'missing' WHEN expiry_date < now() THEN 'expired' WHEN expiry_date < now() + interval '30 days' THEN 'expiring' ELSE 'valid' END`
   - Returns rows with computed `status` field
   - Ordered by `expiry_date`

4. `compliance_get_summary(pm_id uuid)` — handles:
   - Count certificates by computed status across all properties
   - Returns `{ expired: int, expiring: int, valid: int, total: int }`

**Step 2 — Deploy and regenerate types:**
```bash
supabase db push
supabase gen types typescript --project-id qedsceehrrvohsjmbodc > src/types/database.ts
```

**Step 3 — Update frontend to call RPCs:**
- `property-compliance-section.tsx` → call `compliance_upsert_certificate` and `compliance_delete_certificate` instead of direct table operations; call `compliance_get_certificates` instead of `.from().select()`
- `page.tsx` → call `compliance_get_summary` instead of fetching + looping
- `certificate-row.tsx` → status now comes from RPC response, remove `computeCertificateStatus` call
- `constants.ts` → keep `computeCertificateStatus` for now (other code may use it), but compliance section no longer calls it

**Step 4 — Build and verify:**
- `npm run build` passes
- Test in browser: add/delete certs, check dashboard counts
- Verify no direct `.from('c1_compliance_certificates')` writes remain

### Constraints
- No user-visible changes — pure refactor
- Do not touch caution zone files (intake, middleware, pm-context)
- Keep `computeCertificateStatus` in constants.ts (don't delete, just stop using it in migrated code)
- Follow existing RPC naming convention (`c1_` prefix pattern or new `compliance_` prefix — check existing RPCs)
- Status thresholds must match exactly: 30 days = expiring

### Done When
- [ ] 4 RPCs created and deployed
- [ ] Frontend calls RPCs instead of direct table access for compliance
- [ ] No `.from('c1_compliance_certificates').insert/delete` in frontend code
- [ ] Dashboard summary uses `compliance_get_summary` RPC
- [ ] `npm run build` passes
- [ ] Tested locally — same behavior as before
- [ ] Committed and pushed to `refactor/compliance-rpcs`

### Notes
- After this, Phase 1 sign-off can proceed
- Future: consider adding `updated_at` trigger on cert table
