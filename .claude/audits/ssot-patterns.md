# SSOT Patterns — The Standard

These are examples of SSOT done RIGHT in Yarro. They were built during hardening sessions in April 2026. Use them as the standard to measure the rest of the codebase against — anything that DOESN'T follow these patterns is a finding.

---

### Pattern 1: Trigger-enforced room → tenant → ledger sync
**What:** `trg_room_tenant_assigned` on `c1_rooms AFTER UPDATE OF current_tenant_id` handles ALL downstream effects of tenant assignment/removal.
**Why:** There are 5 RPCs that can change `current_tenant_id` (assign, remove, end_tenancy, onboarding, bulk_import). Previously each had its own sync logic — some cancelled ledger entries, some didn't, some logged audit events, some didn't. We consolidated everything into one trigger.
**The rule:** RPCs ONLY update `c1_rooms.current_tenant_id`. The trigger handles: `c1_tenants.room_id`, `c1_tenants.property_id`, ledger creation, pending entry cancellation, audit logging.
**What to look for:** Any RPC or frontend code that directly updates `c1_tenants.room_id` or `c1_tenants.property_id` instead of going through the room trigger. Any code that creates/cancels ledger entries outside of triggers.

### Pattern 2: Shared SLA computation function
**What:** `compute_sla_due_at(next_action, next_action_reason, priority)` returns the SLA deadline.
**Why:** SLA durations were duplicated in two triggers. When someone changed durations in one, they'd forget the other. We extracted it into a shared function.
**The rule:** SLA duration logic lives in ONE function. Both triggers call it. Change durations once, they update everywhere.
**What to look for:** Any hardcoded SLA duration outside of `compute_sla_due_at()`. Any frontend code computing "time remaining" from its own logic instead of reading `sla_due_at` from the DB.

### Pattern 3: Escalation functions with audit trail
**What:** Three escalation functions (`escalate_maintenance_tickets`, `escalate_rent_ticket_priority`, `c1_compliance_escalate`) run on daily crons and bump ticket priority based on time thresholds.
**Why:** Previously rent and compliance escalated but maintenance didn't. Escalation happened silently — no audit trail. Now all three log `PRIORITY_ESCALATED` events with from/to priority and reason.
**The rule:** Every priority change logs an audit event. The PM can see WHY a ticket's priority changed.
**What to look for:** Any code path that changes `c1_tickets.priority` without logging an event.

### Pattern 4: Query RPCs as the single display source
**What:** `get_rent_ledger_for_month` and `get_rent_summary_for_property` are the ONLY source for rent display data. They compute `effective_status`, `is_former_tenant`, and exclude cancelled entries.
**Why:** Previously the frontend fetched raw ledger rows and computed status client-side. Different pages computed it differently.
**The rule:** Rent status, former tenant flag, and visibility filtering all happen in the RPC. Frontend never recomputes these.
**What to look for:** Any frontend code that checks `status === 'pending' && due_date < today` to override to "overdue". Any page querying `c1_rent_ledger` directly instead of through these RPCs.

### Pattern 5: Former tenant detection from rooms SSOT
**What:** `is_former_tenant` is computed as `r.current_tenant_id IS DISTINCT FROM rl.tenant_id` (rent) or `NOT EXISTS(SELECT 1 FROM c1_rooms WHERE property_id = p.id AND current_tenant_id = t.id)` (dashboard/property views).
**Why:** `c1_tenants.property_id` stays set after tenancy ends (historical link). You CAN'T determine active/former from `tenant.property_id` alone.
**The rule:** "Is this tenant active?" always goes through rooms, never through `tenant.room_id` or `tenant.property_id` alone.
**What to look for:** Any page that uses `tenant.property_id` or `tenant.room_id` to determine active status instead of checking rooms.

### Pattern 6: Record-level payment guards
**What:** `record_rent_payment` rejects payments on already-paid entries and caps at remaining balance. `trg_rent_payment_update_ledger` caps `amount_paid` at `amount_due` as a safety net.
**Why:** Previously you could pay an already-paid entry. Overpayment cascaded to close ALL tenant tickets.
**The rule:** Defence in depth — RPC validates, trigger caps.
**What to look for:** Any payment or amount-setting path that bypasses these guards.

### Pattern 7: REASON_DISPLAY as single label mapping
**What:** `src/lib/reason-display.ts` maps `next_action_reason` → display labels. Both dashboard and drawer use it.
**Why:** Previously dashboard cards had one set of labels and the drawer had another. Same ticket, different descriptions.
**The rule:** ONE mapping file, imported everywhere. Never hardcode a reason label in a component.
**What to look for:** Any component that maps `next_action_reason` to a label without importing from `reason-display.ts`.
