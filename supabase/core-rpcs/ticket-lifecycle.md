# Ticket Lifecycle RPCs

Core state machine, contractor dispatch, PM decisions, and submission handlers.
These power the entire ticket journey from WhatsApp intake to job completion.

---

## State Machine (WhatsApp + Tickets)

### c1_context_logic
- **Purpose:** Core WhatsApp intake state machine (2,393 lines). Receives inbound message, returns conversation context, property match, tenant match, AI instruction.
- **Signature:** `(_phone text, _message jsonb) RETURNS jsonb`
- **Live in:** `20260329000000_whatsapp_room_awareness.sql` lines 10-971 (NOT in main migration)
- **Called by:** `yarro-tenant-intake` edge function
- **Breaks:** All WhatsApp conversations stop working

### c1_create_ticket
- **Purpose:** Creates ticket from WhatsApp conversation. Returns ticket UUID, triggers notification chain.
- **Signature:** `(_conversation_id uuid, _issue jsonb) RETURNS jsonb`
- **Live in:** `20260329000000_whatsapp_room_awareness.sql` lines 977-end (NOT in main migration)
- **Called by:** `yarro-tenant-intake` edge function
- **Breaks:** No tickets created from WhatsApp intake

### c1_create_manual_ticket
- **Purpose:** Creates tickets from PM dashboard or compliance automation.
- **Signature:** `(p_property_manager_id uuid, p_property_id uuid, p_contractor_ids uuid[], p_issue_title text, p_issue_description text) RETURNS uuid`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** Tickets page, `yarro-compliance-reminder` edge function
- **Breaks:** Manual ticket creation, automated compliance renewal tickets

### c1_convo_finalize
- **Purpose:** Finalizes WhatsApp conversation after issue captured.
- **Signature:** `(_conversation_id uuid, ...) RETURNS jsonb`
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-tenant-intake` edge function (final branch)
- **Breaks:** Conversations never close, tickets not created from finalized convos

### c1_convo_finalize_quick
- **Purpose:** Quick finalization for duplicate/nomatch branches.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-tenant-intake` edge function (nomatch/duplicate branches)

### c1_convo_append_outbound
- **Purpose:** Appends AI response to conversation log.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-tenant-intake` edge function (normal branch)
- **Breaks:** Conversation history gaps

### c1_message_next_action
- **Purpose:** Advances ticket state machine after events. **9+ callers.**
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `c1_inbound_reply`, `c1_convo_finalize`, `c1_convo_finalize_quick`, `c1_contractor_timeout_check`, `c1_landlord_timeout_check`, `c1_manager_decision_from_app`, `c1_create_manual_ticket`, multiple submission handlers
- **Breaks:** Tickets stuck — no state transitions after any event

### c1_compute_next_action
- **Purpose:** Router — dispatches to domain-specific sub-routines for ticket state computation.
- **Live in:** `20260404400000_compute_next_action_router.sql` (was monolithic in `20260327041845_remote_schema.sql`)
- **Called by:** `c1_trigger_recompute_next_action` (trigger), `c1_message_next_action`
- **Dispatches to:** `compute_compliance_next_action`, `compute_rent_arrears_next_action`, `compute_landlord_next_action`, `compute_ooh_next_action`, `compute_maintenance_next_action`
- **Rollback:** `supabase/rollbacks/rollback_phase_c.sql` (original monolithic version)
- **Breaks:** next_action field never set — UI can't show what to do next

---

## Polymorphic Sub-routines (State Machine)

All 5 are SECURITY DEFINER and protected. Called only by `c1_compute_next_action` (router).

### compute_compliance_next_action
- **Purpose:** Compliance renewal lifecycle — cert verification, contractor dispatch, renewal detection.
- **Signature:** `(p_ticket_id uuid, p_ticket c1_tickets) RETURNS TABLE(next_action text, next_action_reason text)`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Reads:** `c1_compliance_certificates`, `c1_job_completions`, `c1_messages`
- **Breaks:** Compliance tickets stuck — no state progression

### compute_rent_arrears_next_action
- **Purpose:** Rent arrears tracking — aggregates overdue entries per tenant, detects partial payments.
- **Signature:** `(p_ticket_id uuid, p_ticket c1_tickets) RETURNS TABLE(next_action text, next_action_reason text)`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Reads:** `c1_rent_ledger` (aggregation by tenant_id)
- **Breaks:** Rent arrears tickets never update state, never auto-close

### compute_landlord_next_action
- **Purpose:** Landlord-managed ticket outcomes (need_help, resolved, in_progress).
- **Signature:** `(p_ticket_id uuid, p_ticket c1_tickets) RETURNS TABLE(next_action text, next_action_reason text)`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Reads:** `c1_tickets` (p_ticket passed in — no extra query)
- **Breaks:** Landlord-allocated tickets stuck at initial state

### compute_ooh_next_action
- **Purpose:** Out-of-hours emergency outcomes (resolved, unresolved, in_progress).
- **Signature:** `(p_ticket_id uuid, p_ticket c1_tickets) RETURNS TABLE(next_action text, next_action_reason text)`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Reads:** `c1_tickets` (p_ticket passed in — no extra query)
- **Breaks:** OOH tickets stuck — emergency handling never progresses

### compute_maintenance_next_action
- **Purpose:** Standard contractor dispatch lifecycle (extracted from original branches 9-11). Zero logic change from monolithic version.
- **Signature:** `(p_ticket_id uuid, p_ticket c1_tickets) RETURNS TABLE(next_action text, next_action_reason text)`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Reads:** `c1_job_completions`, `c1_messages`
- **Breaks:** All standard maintenance tickets stuck — no state progression

---

## Rent Arrears Functions

### create_rent_arrears_ticket
- **Purpose:** Creates consolidated rent arrears ticket per tenant. Dedup built-in — returns existing ticket if open.
- **Signature:** `(p_property_manager_id uuid, p_property_id uuid, p_tenant_id uuid, p_issue_title text, p_issue_description text) RETURNS uuid`
- **Live in:** `20260404300000_polymorphic_subroutines.sql`
- **Called by:** `yarro-rent-reminder` edge function (escalation pass)
- **Breaks:** Rent escalation creates no tickets — overdue tenants invisible on dashboard

### record_rent_payment
- **Purpose:** Records payment with audit trail. Trigger recomputes ledger. Auto-closes ticket if all arrears cleared.
- **Signature:** `(p_rent_ledger_id uuid, p_pm_id uuid, p_amount numeric, p_payment_method text, p_notes text) RETURNS uuid`
- **Live in:** `20260404200000_rent_payments_table.sql`
- **Called by:** Rent tracking UI (`property-rent-section.tsx`, `rent-payment-dialog.tsx`)
- **Breaks:** Payments not recorded, ledger not updated, tickets never auto-close

---

### c1_inbound_reply
- **Purpose:** Processes inbound WhatsApp replies to outbound messages.
- **Live in:** `20260404000000_fix_flows_null_items.sql` (was `20260327041845_remote_schema.sql`)
- **Called by:** `yarro-outbound-monitor` edge function (Twilio webhook)
- **Breaks:** Contractor/tenant/landlord replies not processed
- **Last modified:** 2026-04-04 — Fixed Flows parsing crash when page items are JSON null (PM skips markup step)

### c1_ticket_context
- **Purpose:** Fetches complete ticket data (tenant, property, contractor, dates).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `use-ticket-detail.ts` hook, `yarro-ticket-notify` edge function
- **Breaks:** Ticket detail panel empty, notifications missing context

---

## Contractor Dispatch Chain

### c1_contractor_context
- **Purpose:** Gets contractor dispatch context for ticket.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-ticket-notify` edge function
- **Breaks:** Contractors never assigned to tickets

### c1_contractor_mark_sent
- **Purpose:** Records SMS dispatch to contractor (Twilio SID, body, direction).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-dispatcher` edge function
- **Breaks:** SMS logging fails — no audit trail for contractor messages

### c1_msg_merge_contractor
- **Purpose:** Merges data into contractor JSONB entry (portal_token, quote, etc.). **11 callers.**
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `c1_inbound_reply`, `c1_contractor_timeout_check` (multiple), `yarro-dispatcher`, `yarro-scheduling`
- **Breaks:** Contractor portal tokens not stored, quotes not recorded

### c1_submit_contractor_schedule
- **Purpose:** Processes contractor schedule submission via portal token.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Contractors can't book appointments

### c1_submit_contractor_completion
- **Purpose:** Marks job as completed by contractor (with photos/notes).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Job completion not recorded

### c1_submit_contractor_not_completed
- **Purpose:** Records contractor reporting job not completed.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Failed job attempts not tracked, no reschedule workflow

---

## PM Decision Flow

### c1_manager_decision_from_app
- **Purpose:** Records PM approval/denial of contractor quote (with optional markup).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ticket-dispatch-tab.tsx`
- **Breaks:** PM can't approve/reject quotes — tickets stuck at review stage

### c1_allocate_to_landlord
- **Purpose:** Escalates unresolved ticket to landlord. Generates landlord_token.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ticket-form.tsx`, `ticket-dispatch-tab.tsx`
- **Breaks:** Escalation pathway broken

### c1_redispatch_contractor
- **Purpose:** PM reassigns ticket to different contractor.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ticket-dispatch-tab.tsx`
- **Breaks:** Can't change contractor after initial dispatch

### c1_dispatch_from_review
- **Purpose:** Dispatches ticket after PM reviews/updates issue description.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `review-dispatch-modal.tsx`
- **Breaks:** Stalled tickets can't be reactivated

---

## Submission Handlers

### c1_submit_landlord_outcome
- **Purpose:** Records landlord's outcome decision (approved/denied/escalated).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `landlord/[token]/page.tsx`
- **Breaks:** Landlord escalation resolution broken

### c1_submit_ooh_outcome
- **Purpose:** Records OOH contact's handling (fixed/dispatched/escalated).
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `ooh/[token]/page.tsx`
- **Breaks:** Emergency handling resolution broken

### c1_submit_tenant_confirmation
- **Purpose:** Records tenant's job completion confirmation.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Tenant can't confirm job is done

### c1_submit_reschedule_request
- **Purpose:** Contractor requests to reschedule job.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Reschedule flow broken

### c1_submit_reschedule_decision
- **Purpose:** PM approves or rejects contractor reschedule request.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `yarro-scheduling` edge function
- **Breaks:** Reschedule decisions can't be recorded

### c1_complete_handoff_ticket
- **Purpose:** Completes handoff-originated ticket.
- **Live in:** `20260327041845_remote_schema.sql`
- **Called by:** `tickets/page.tsx`
- **Breaks:** Handoff tickets can't be closed
