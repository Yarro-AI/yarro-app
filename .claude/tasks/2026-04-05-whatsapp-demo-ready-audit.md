## PRD: WhatsApp Demo-Ready Audit
**Date:** 2026-04-05
**Branch:** fix/whatsapp-demo-audit
**Status:** In Progress
**Scope:** Fire every WhatsApp/email message scenario, verify templates & logic, fix what's broken — zero new features.

### Goal
First live clients are about to use the platform. Every WhatsApp and email message must fire at the right time, with correct copy, correct variables, and correct channel routing (WhatsApp vs email based on recipient preferences). This is a test-and-fix pass across all 35 templates in 11 edge functions, with a focus on the new rent and compliance flows.

### User Story
As a PM going live with real clients, I want every automated message to be correct and professional so that tenants, contractors, and landlords receive the right information at the right time on their preferred channel.

### Technical Plan
**Approach:** Segment by flow. For each flow, build a curl test command, fire it, verify the message, fix any issues found. Work through flows in priority order (new/changed first).

**Priority order:**
1. **Rent reminders** (NEW — never tested live)
2. **Compliance reminders** (NEW — never tested live)
3. **Onboarding welcome messages** (NEW)
4. **Tenant intake** (known looping bug)
5. **Ticket notifications** (morning dispatch, handoff, review)
6. **Contractor dispatch** (quote request + tenant portal link)
7. **Quote review** (PM quote, landlord quote)
8. **Scheduling** (approval, declined, auto-approve, job booked)
9. **Job reminders** (day-of)
10. **Completion** (completed, not completed, tenant feedback)
11. **Followups** (5 timeout escalation scenarios)

**Known issues to fix:**
- `yarro-rent-reminder` uses raw `sendWhatsApp()` instead of `sendAndLog()` — no audit trail, no email fallback, no contact_method preference check
- `yarro-onboarding-send` uses raw `sendWhatsApp()` — same problem
- `TEMPLATES.md` says `rent_reminder_due` SID is "Awaiting Twilio creation" but `templates.ts` has `HX8c7233c5378f6a55d1c9440fbbd722a1` — need to verify this SID exists in Twilio
- Intake looping bug (from SESSION_LOG.md)

**Channel routing check:**
- `sendAndLog()` auto-detects channel for contractors and landlords via `contact_method` column
- Only checks `contractor` and `landlord` roles — tenants always get WhatsApp (correct, tenants don't have email preference)
- Functions using raw `sendWhatsApp()` bypass this entirely

### Acceptance Criteria
- [ ] All 35 templates fire successfully with correct variables
- [ ] Rent reminders (3 levels) send on correct channel based on tenant phone availability
- [ ] Compliance reminders send to PM with correct cert type, expiry, urgency prefix
- [ ] Onboarding messages send for all 3 entity types
- [ ] Contact method preference respected: contractors/landlords with `contact_method=email` get email, not WhatsApp
- [ ] `yarro-rent-reminder` migrated to `sendAndLog()` for audit trail + channel routing
- [ ] `yarro-onboarding-send` migrated to `sendAndLog()` for audit trail + channel routing
- [ ] Intake looping bug diagnosed and fixed
- [ ] Template copy reviewed for professionalism and accuracy
- [ ] `TEMPLATES.md` updated to match actual Twilio state

### Test Plan

#### Segment 1 — Rent Reminders (yarro-rent-reminder)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 1.1 | Reminder level 1 (3 days before) | curl with test ledger entry at reminder_level=1 | Tenant gets `rent_reminder_before` with name, £amount, due date | |
| 1.2 | Reminder level 2 (due today) | curl with test ledger entry at reminder_level=2 | Tenant gets `rent_reminder_due` with name, £amount | |
| 1.3 | Reminder level 3 (3 days overdue) | curl with test ledger entry at reminder_level=3 | Tenant gets `rent_reminder_overdue` with name, £amount, due date. Ledger status → overdue | |
| 1.4 | Tenant with no phone | Ledger entry with null phone | Skipped, system event logged | |
| 1.5 | Escalation (arrears ticket) | Tenant past all 3 reminders | `rent_escalation_check` → `create_rent_arrears_ticket` fires | |

#### Segment 2 — Compliance Reminders (yarro-compliance-reminder)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 2.1 | Cert expiring, contractor assigned | cert within reminder_days_before, has contractor_id | Ticket created, contractor dispatched, PM notified via sendAndLog | |
| 2.2 | Cert expiring, no contractor | cert within window, contractor_id=null | Email to PM (Path B), no ticket, system event logged | |
| 2.3 | Expired cert (2nd reminder) | cert expired, reminder_count=1 | "EXPIRED —" prefix in message | |
| 2.4 | Critical (3rd+ reminder) | cert expired, reminder_count≥3 | "CRITICAL —" prefix | |

#### Segment 3 — Onboarding (yarro-onboarding-send)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 3.1 | Tenant onboarding | POST with entity_type=tenant | `onboarding_tenant` template sent | |
| 3.2 | Contractor onboarding | POST with entity_type=contractor | `onboarding_contractor` template sent | |
| 3.3 | Landlord onboarding | POST with entity_type=landlord | `onboarding_landlord` template sent | |

#### Segment 4 — Tenant Intake (yarro-tenant-intake)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 4.1 | New tenant message | Inbound WhatsApp to intake number | AI responds, enters verify stage | |
| 4.2 | Full flow (verify → issue → photos → access → availability → summary) | Sequential messages | Ticket created, no looping | |
| 4.3 | Emergency detection | "flooding" / "gas leak" message | Immediate escalation to OOH contact | |
| 4.4 | Duplicate check | Same tenant, same issue within 24h | Duplicate detected, not re-created | |

#### Segment 5 — Ticket Notifications (yarro-ticket-notify)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 5.1 | Morning dispatch — PM | source=morning-dispatch | PM gets `pm_ticket` per new ticket | |
| 5.2 | Morning dispatch — LL | source=morning-dispatch | Landlord gets `ll_ticket` | |
| 5.3 | Handoff | AI can't resolve | PM gets `handoff` template | |
| 5.4 | Manual review | Urgent ticket | PM gets `ticket_review` | |
| 5.5 | OOH emergency | Emergency ticket after hours | OOH contact gets `ooh_emergency_dispatch` | |

#### Segment 6 — Dispatcher (yarro-dispatcher)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 6.1 | Contractor quote request | contractor-sms instruction | Contractor gets `contractor_quote` (Flows) | |
| 6.2 | Tenant portal link | Sent alongside 6.1 | Tenant gets `tenant_portal_link` (CTA button) | |
| 6.3 | Landlord allocation | landlord-allocate instruction | Landlord gets `allocate_landlord` (CTA) | |
| 6.4 | No contractors available | pm-nomorecontractors-sms | PM gets `no_more_contractors` | |
| 6.5 | Email channel — contractor prefers email | contractor.contact_method=email | Email sent instead of WhatsApp | |

#### Segment 7 — Quote Review (yarro-dispatcher)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 7.1 | PM receives quote | pm-sms instruction | PM gets `pm_quote` (Flows button) | |
| 7.2 | Landlord receives quote | landlord-sms instruction | Landlord gets `landlord_quote` (Flows button) | |
| 7.3 | Landlord email preference | landlord.contact_method=email | Email sent, not WhatsApp | |

#### Segment 8 — Scheduling (yarro-scheduling)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 8.1 | Landlord approved | finalize-job, approved=true | PM gets `pm_landlord_approved`, contractor gets `contractor_job_schedule` | |
| 8.2 | Auto-approved (no landlord) | finalize-job, no landlord on property | PM gets `pm_auto_approved`, contractor gets `contractor_job_schedule` | |
| 8.3 | Landlord declined | finalize-job, approved=false | PM gets `landlord_declined` | |
| 8.4 | Job booked | Fillout form / portal schedule | PM gets `pm_job_booked`, LL gets `ll_job_booked`, tenant gets `tenant_job_booked` | |

#### Segment 9 — Job Reminders (yarro-job-reminder)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 9.1 | Contractor day-of reminder | Cron or direct trigger | Contractor gets `contractor_job_reminder` with portal CTA | |
| 9.2 | Tenant day-of reminder | Same trigger | Tenant gets `tenant_job_reminder` with contractor details | |

#### Segment 10 — Completion (yarro-completion)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 10.1 | Job completed | Fillout/portal completion | PM gets `pm_job_completed`, LL gets `ll_job_completed`, tenant gets `tenant_job_completed` | |
| 10.2 | Job not completed | Portal "not completed" form | PM gets `pm_job_not_completed` with reason | |

#### Segment 11 — Followups (yarro-followups)
| # | Scenario | How to trigger | Expected | Pass? |
|---|----------|----------------|----------|-------|
| 11.1 | Contractor quote timeout | contractor-reminder-sms | Contractor gets `contractor_reminder` | |
| 11.2 | Landlord approval timeout | landlord-followup-sms | Landlord gets `pm_contractor_timeout` | |
| 11.3 | PM landlord timeout | pm-landlord-timeout-sms | PM gets `landlord_reminder` | |
| 11.4 | Completion reminder | contractor-completion-reminder-sms | Contractor gets `completion_followup` | |
| 11.5 | Completion overdue | pm-completion-overdue-sms | PM gets `pm_completion_overdue` | |

#### Build checks
| # | Step | Expected | Pass? |
|---|------|----------|-------|
| B.1 | npm test | Zero failures | |
| B.2 | npm run build | Zero errors | |

### Out of Scope
- New message templates or new scenarios
- n8n cron workflow configuration changes
- Tenant intake AI prompt rewrite (fix looping bug only, don't rewrite the 900-line prompt)
- New features (reschedule flow, etc.)
- Twilio account/number configuration
- Changes to email template styling

### Constraints
- `prompts.ts` is a caution zone (1,550 lines, backend parses exact emoji + phrases) — minimal changes only
- `c1_get_contractor_ticket` is protected — read-only
- All template SID changes must update both `templates.ts` AND `TEMPLATES.md`
- Edge function deploys required after any change: `supabase functions deploy <function-name>`

### Done When
- [ ] All acceptance criteria pass
- [ ] Test plan passes (all segments)
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Edge functions deployed for any changed functions
- [ ] Committed, merged to main, pushed
- [ ] SESSION_LOG.md updated
