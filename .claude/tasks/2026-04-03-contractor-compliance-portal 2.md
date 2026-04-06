## PRD: Contractor Compliance Portal
**Date:** 2026-04-03
**Branch:** feat/contractor-compliance-portal
**Status:** In Progress
**Journey:** Compliance Lifecycle — Slice 3 of 3
**Scope:** Contractor uploads renewed cert via existing dispatch pipeline. Cert form replaces maintenance completion photo.

### Goal
Close the compliance renewal loop. When a cert is expiring and has a contractor assigned, the cron creates a ticket, the contractor gets dispatched (existing pipeline), and at the completion step they upload the new cert instead of a maintenance photo. The cert auto-updates as valid, PM gets notified. No manual PM intervention needed.

### User Story
As a contractor, I want to upload the renewed certificate through the portal so that the property stays compliant without the PM having to chase me.

### Technical Plan

**1. Fix cron — link tickets to certs**
- File: `supabase/functions/yarro-compliance-reminder/index.ts`
- Add `p_compliance_certificate_id: cert.cert_id` to the `c1_create_manual_ticket` RPC call (line ~97-108)
- This links the ticket to the cert so status shows "renewal_scheduled" and the portal can detect it

**2. Extend `c1_get_contractor_ticket` (PROTECTED — approved)**
- New migration: add `'compliance_certificate_id', t.compliance_certificate_id` to the jsonb_build_object return
- Also add cert type + property info for the compliance form: join to `c1_compliance_certificates` when `compliance_certificate_id IS NOT NULL`, return `compliance_cert_type` and `compliance_expiry_date`
- Follow safe modification protocol: backup current definition, new migration file

**3. New RPC: `compliance_submit_contractor_renewal`**
- New migration file
- Params: `p_token text, p_expiry_date date, p_issued_by text, p_certificate_number text, p_notes text`
- Logic:
  - Validate token → get ticket + compliance_certificate_id
  - Upload is done client-side (Supabase Storage), document_url passed as param too
  - Update `c1_compliance_certificates`: new `document_url`, `expiry_date`, `issued_by`, `certificate_number`, reset `reminder_count = 0`, `last_reminder_at = NULL`, `reminder_sent_at = NULL`
  - Update `c1_tickets`: set `job_stage = 'completed'`, `resolved_at = now()`
  - Append to `tenant_updates` jsonb: `{ type: 'compliance_renewal_completed', ... }`
  - Return `{ success: true, ticket_id, cert_id }`

**4. Portal UI — compliance completion form**
- File: `src/components/portal/contractor-portal.tsx` (or new compliance section)
- In `ContractorTicketView`: when `ticket.compliance_certificate_id` is not null AND `stage === 'complete'`:
  - Show cert renewal form instead of maintenance completion form
  - Fields: New expiry date*, Issued by, Certificate number, Document upload (reuse existing photo upload pattern but for PDF/images)
  - Uses `PortalShell`, `PortalCard`, existing portal patterns
- File: `src/app/contractor/[token]/page.tsx`
  - Pass `compliance_certificate_id` from ticket data to presenter
  - New handler: `handleComplianceCompletion` — uploads doc to `compliance-documents` storage, calls `yarro-scheduling` edge function with `source: 'portal-compliance-completion'`

**5. Edge function handler — compliance completion**
- File: `supabase/functions/yarro-scheduling/index.ts`
- New handler for `source: 'portal-compliance-completion'`
- Calls `compliance_submit_contractor_renewal` RPC
- Sends PM notification (WhatsApp/email) — reuse `sendAndLog` pattern
- Template: reuse `pm_job_completed` or create compliance-specific message

**6. Update portal types**
- File: `src/lib/portal-types.ts`
- Add `compliance_certificate_id` to `ContractorTicket` interface

### Acceptance Criteria
- [ ] Compliance cron creates tickets WITH `compliance_certificate_id` linked
- [ ] Compliance status shows "renewal_scheduled" when active ticket exists
- [ ] `c1_get_contractor_ticket` returns `compliance_certificate_id` + cert type
- [ ] Contractor portal detects compliance ticket at completion step
- [ ] Contractor sees cert renewal form (expiry, issued by, cert number, doc upload) — not maintenance photo form
- [ ] Contractor submits → cert record updated (new doc, expiry, reminders reset)
- [ ] Contractor submits → ticket closed (job_stage = completed)
- [ ] PM receives notification that cert was renewed
- [ ] Existing maintenance portal flow unchanged (no regression)

### Test Plan
| # | Step | Expected Result | Pass? |
|---|------|-----------------|-------|
| 1 | Trigger compliance cron with cert that has contractor_id set | Ticket created with `compliance_certificate_id` linked | |
| 2 | Check compliance page for that cert | Shows "renewal_scheduled" status | |
| 3 | Open contractor portal link for the compliance ticket | Portal loads, shows scheduling step (same as maintenance) | |
| 4 | Schedule the job | Date saved, portal advances | |
| 5 | At completion step | Cert renewal form shown (not maintenance photo form) | |
| 6 | Fill in new expiry + issued by + upload doc → submit | Success message shown | |
| 7 | Check DB: `c1_compliance_certificates` | New expiry, document_url, issued_by, reminder_count = 0 | |
| 8 | Check DB: `c1_tickets` | job_stage = completed, resolved_at set | |
| 9 | Check compliance page | Cert shows "valid" (not renewal_scheduled) | |
| 10 | Open a maintenance ticket contractor portal | Normal maintenance completion form (no regression) | |
| 11 | npm test | Zero failures | |
| 12 | npm run build | Zero errors | |

### Out of Scope
- New WhatsApp template for compliance renewal (reuse existing pm_job_completed)
- Contractor timeout cron scheduling (exists but not scheduled — separate task)
- PM-side UI for viewing renewal progress on a ticket
- Contractor uploading cert outside of a ticket (manual upload stays on PM)

### Constraints
- `c1_get_contractor_ticket` is PROTECTED — Adam approved modification (add compliance_certificate_id + cert type to return)
- `c1_create_manual_ticket` is PROTECTED — NOT modified, just passing an existing parameter
- Follow existing portal patterns: `PortalShell`, `PortalCard`, `PortalBanner`, `InfoRows`
- Document upload to `compliance-documents` Supabase Storage bucket (same as cert detail page)
- Edge function completion handler follows `yarro-scheduling` source routing pattern

### Done When
- [ ] All acceptance criteria pass
- [ ] Test plan passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Committed, merged to main, pushed
- [ ] SESSION_LOG.md updated
