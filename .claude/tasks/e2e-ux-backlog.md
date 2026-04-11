# E2E UX/UI Backlog — 2026-04-11

Discovered during E2E testing session. Separate from bug fixes — these are design/UX improvements.

---

### UX-1: Room creation has too many fields
- **Found in:** Test 17b
- **Issue:** Room form asks for room number, name, AND floor. Only need one field (name or number).
- **Suggestion:** Single "Room name/number" field.

### UX-2: No UI for contractor compliance qualifications
- **Found in:** Onboarding — compliance cert assignment
- **Issue:** System checks contractor qualifications for cert types, but there's no UI to set qualifications on the contractor profile or during onboarding. Shows "no contractor with matching qualifications" with no way to fix it.
- **Suggestion:** Add qualification/trade mapping in contractor profile + onboarding cert step.

### UX-3: Email onboarding message not sent
- **Found in:** Test 17c (also BUG-1)
- **Issue:** WhatsApp onboarding sends fine, email channel does not send.
- **Suggestion:** Implement email onboarding path or flag as not-yet-supported.

### UX-5: No workflow for certs with missing documents
- **Found in:** Test 4c — compliance reminder
- **Issue:** `get_compliance_expiring()` requires `document_url IS NOT NULL`. Certs created without a document get no reminders and no tickets — they silently expire. Onboarding allows creating certs without uploading a document.
- **Suggestion:** Either (a) require document upload during onboarding, or (b) create a separate "cert_incomplete" ticket/reminder path for certs with no document.

### UX-14: Add people to properties from within property profile page
- **Found in:** Test 5 / general navigation
- **Issue:** Can't add tenants, contractors, or landlords from inside the property detail page. Have to go to separate entity pages and link back.
- **Suggestion:** Add "Add tenant", "Add contractor", "Link landlord" actions within the property profile page.

### UX-13: Unclear who gets notified on manual ticket creation
- **Found in:** Test 2a
- **Issue:** When a manual ticket is created, it's unclear who receives notifications (tenant? landlord? both?). An email was received but it's not clear if it went to tenant (email preference) or landlord (email preference). Need clear notification matrix.
- **Suggestion:** Document and display: on ticket creation → contractor gets dispatch, landlord gets FYI, tenant gets portal link + status update. Make this configurable per PM.

### UX-12: Rename "Tenant" label to "Reporter" in ticket creation
- **Found in:** Test 2a
- **Issue:** Ticket form uses "Tenant" but the reporter may not be a tenant — could be a landlord, agent, or other person. "Reporter" is more accurate.
- **Suggestion:** Change label to "Reporter" with a role field (tenant, landlord, other).

### UX-9: Contractor portal doesn't confirm scheduling clearly
- **Found in:** Test 1e
- **Issue:** After scheduling, the page doesn't clearly change to show "Job scheduled". No confirmation state. PM can't tell if it worked.
- **Suggestion:** Show a clear success state — "Job scheduled for [date]. You'll receive a reminder the day before." Disable the form after submission.

### UX-10: Contractor portal should show access details
- **Found in:** Test 1e
- **Issue:** Contractor portal doesn't display property access instructions. Contractor has to ask the tenant.
- **Suggestion:** Show access details on the portal when available from the property record.

### UX-11: Portal actions should be idempotent / prevent double submission
- **Found in:** Test 1e
- **Issue:** Contractor can submit multiple schedule requests. WhatsApp approve/decline buttons remain active after dashboard action taken. Need to prevent stale actions.
- **Suggestion:** (a) Portal: disable form after successful submission, show current state. (b) WhatsApp flow forms: validate current ticket state before processing, return "already actioned" if stale.

### UX-8: "Add markup for tenant" label should just say "Add markup"
- **Found in:** Test 1d — quote approval drawer
- **Issue:** CTA says "Add markup for tenant" — "for tenant" is unnecessary and confusing.
- **Suggestion:** Change label to "Add markup".

### UX-7: Contractor dispatch status not visible to PM/landlord/tenant
- **Found in:** Test 1b
- **Issue:** After dispatch, contractor shows "Not assigned" in People section with no detail about what's happening. There's no visibility into: contractor contacted → awaiting response → quoted → approved → assigned. Landlord/tenant portals also can't see this.
- **Suggestion:** Track dispatch status as a callable/queryable state in the RPC. Show "Contractor contacted" or "Awaiting quote from Test Plumber" in the drawer + portals instead of just "Not assigned".

### UX-6: Access details not auto-filled from property when creating manual ticket
- **Found in:** Test 1a
- **Issue:** Property has access instructions ("Key in lockbox, code 1234") but manual ticket form doesn't auto-populate them. Contractor WhatsApp shows "Must be arranged with tenant" instead.
- **Suggestion:** Auto-fill access field from property when property is selected in the form.

### UX-4: Dashboard empty after setup — no instant ticket creation
- **Found in:** Test 17 → dashboard check
- **Issue:** After completing onboarding with overdue rent and a cert missing docs, dashboard shows nothing. Tickets only get created when crons run (daily). PM sees empty dashboard on day 1.
- **Suggestion:** Either backfill tickets on onboarding completion, or trigger rent/compliance checks immediately when relevant data changes (tenant assigned to room, cert created without docs, ledger goes overdue).
