# Sprint E: Drawer + Frontend Rewrite

> **Prereq:** Sprint D (audit trail) complete.
> **Output:** Drawer uses 1 RPC, STAGE_CONFIG gone, REASON_DISPLAY is the SSOT, extras RPC dropped.
> **Master plan:** `.claude/plans/gentle-roaming-creek.md` — Steps 7, 8

---

## Part 1: Ticket Detail RPC

**Migration file:** `supabase/migrations/YYYYMMDD_07_ticket_detail_rpc.sql`

### New RPC: `c1_ticket_detail(p_ticket_id uuid) RETURNS jsonb`

**Why:** The drawer currently makes 7+ separate queries + category-specific fetches, and uses three independent frontend stage systems. The dashboard and drawer compute display text independently → they can show conflicting state.

```sql
CREATE OR REPLACE FUNCTION c1_ticket_detail(p_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_result jsonb;
  v_ticket c1_tickets%rowtype;
  v_timeout boolean;
BEGIN
  SELECT * INTO v_ticket FROM c1_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Compute timeout (same logic as dashboard RPC)
  v_timeout := CASE
    WHEN v_ticket.next_action != 'waiting' THEN false
    WHEN v_ticket.next_action_reason = 'awaiting_contractor'
      AND v_ticket.contractor_sent_at IS NOT NULL
      AND now() - v_ticket.contractor_sent_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'awaiting_landlord'
      AND now() - COALESCE(v_ticket.waiting_since, v_ticket.date_logged) > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'allocated_to_landlord'
      AND v_ticket.landlord_allocated_at IS NOT NULL
      AND now() - v_ticket.landlord_allocated_at > interval '72 hours' THEN true
    WHEN v_ticket.next_action_reason = 'ooh_dispatched'
      AND v_ticket.ooh_dispatched_at IS NOT NULL
      AND now() - v_ticket.ooh_dispatched_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'awaiting_tenant'
      AND v_ticket.tenant_contacted_at IS NOT NULL
      AND now() - v_ticket.tenant_contacted_at > interval '48 hours' THEN true
    WHEN v_ticket.next_action_reason = 'scheduled'
      AND v_ticket.scheduled_date IS NOT NULL
      AND v_ticket.scheduled_date < CURRENT_DATE THEN true
    ELSE false
  END;

  SELECT jsonb_build_object(
    -- Universal
    'id', t.id,
    'issue_title', t.issue_title,
    'issue_description', t.issue_description,
    'property_address', p.address,
    'property_id', t.property_id,
    'category', t.category,
    'maintenance_trade', t.maintenance_trade,
    'priority', t.priority,
    'date_logged', t.date_logged,
    'next_action', t.next_action,
    'next_action_reason', t.next_action_reason,
    'is_past_timeout', v_timeout,
    'priority_score', c1_compute_priority_score(t.priority, t.deadline_date, t.sla_due_at, t.waiting_since),
    'status', t.status,
    'handoff', t.handoff,
    'handoff_reason', t.handoff_reason,
    'conversation_id', t.conversation_id,

    -- Timing
    'deadline_date', t.deadline_date,
    'sla_due_at', t.sla_due_at,
    'waiting_since', t.waiting_since,
    'contractor_sent_at', t.contractor_sent_at,
    'landlord_allocated_at', t.landlord_allocated_at,
    'ooh_dispatched_at', t.ooh_dispatched_at,
    'tenant_contacted_at', t.tenant_contacted_at,
    'scheduled_date', t.scheduled_date,

    -- Financials
    'contractor_quote', t.contractor_quote,
    'final_amount', t.final_amount,
    'images', t.images,

    -- Reschedule
    'reschedule_requested', t.reschedule_requested,
    'reschedule_date', t.reschedule_date,
    'reschedule_reason', t.reschedule_reason,
    'reschedule_status', t.reschedule_status,
    'reschedule_initiated_by', t.reschedule_initiated_by,

    -- People
    'tenant', CASE WHEN ten.id IS NOT NULL THEN jsonb_build_object(
      'name', ten.name, 'phone', ten.phone, 'email', ten.email) ELSE NULL END,
    'landlord', CASE WHEN ll.id IS NOT NULL THEN jsonb_build_object(
      'name', ll.name, 'phone', ll.phone, 'email', ll.email) ELSE NULL END,
    'contractor', (
      SELECT jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email)
      FROM c1_messages m, jsonb_array_elements(m.contractors) elem
      JOIN c1_contractors c ON c.id = (elem->>'id')::uuid
      WHERE m.ticket_id = t.id
        AND elem->>'status' NOT IN ('withdrawn', 'declined')
      LIMIT 1
    ),
    'manager', jsonb_build_object(
      'name', pm.name, 'phone', pm.phone, 'email', pm.email),

    -- Compliance-specific (NULL for non-compliance)
    'cert_type', cc.cert_type,
    'cert_expiry_date', cc.expiry_date,
    'cert_status', cc.status,
    'cert_document_url', cc.document_url,
    'cert_issued_date', cc.issued_date,
    'cert_number', cc.cert_number,
    'cert_issued_by', cc.issued_by,

    -- Rent-specific (NULL for non-rent)
    'rent_summary', CASE WHEN t.category = 'rent_arrears' THEN (
      SELECT jsonb_build_object(
        'total_owed', COALESCE(SUM(amount_due), 0),
        'total_paid', COALESCE(SUM(COALESCE(amount_paid, 0)), 0),
        'months_overdue', COUNT(*)
      ) FROM c1_rent_ledger
      WHERE tenant_id = t.tenant_id AND status IN ('overdue', 'partial')
    ) ELSE NULL END,
    'rent_ledger', CASE WHEN t.category = 'rent_arrears' THEN (
      SELECT jsonb_agg(jsonb_build_object(
        'due_date', due_date, 'amount_due', amount_due,
        'amount_paid', amount_paid, 'status', status
      ) ORDER BY due_date DESC)
      FROM c1_rent_ledger WHERE tenant_id = t.tenant_id
    ) ELSE NULL END,

    -- OOH/Landlord allocation
    'ooh', CASE WHEN COALESCE(t.ooh_dispatched, false) THEN jsonb_build_object(
      'dispatched', true, 'outcome', t.ooh_outcome,
      'dispatched_at', t.ooh_dispatched_at) ELSE NULL END,
    'landlord_alloc', CASE WHEN COALESCE(t.landlord_allocated, false) THEN jsonb_build_object(
      'allocated', true, 'outcome', t.landlord_outcome,
      'allocated_at', t.landlord_allocated_at) ELSE NULL END
  )
  INTO v_result
  FROM c1_tickets t
  LEFT JOIN c1_properties p ON p.id = t.property_id
  LEFT JOIN c1_tenants ten ON ten.id = t.tenant_id
  LEFT JOIN c1_landlords ll ON ll.id = p.landlord_id
  LEFT JOIN c1_property_managers pm ON pm.id = t.property_manager_id
  LEFT JOIN c1_compliance_certificates cc ON cc.id = t.compliance_certificate_id
  WHERE t.id = p_ticket_id;

  RETURN v_result;
END;
$$;
```

**No `action_label` or `action_context`** — labels are frontend display logic via REASON_DISPLAY.
**No `job_stage`** — removed from the system.

---

## Part 2: Kill extras RPC

**Migration file:** `supabase/migrations/YYYYMMDD_08_drop_extras.sql`

```sql
DROP FUNCTION IF EXISTS c1_get_dashboard_todo_extras(uuid);
```

---

## Part 3: Frontend — REASON_DISPLAY mapping

### New file: `src/lib/reason-display.ts`

**THE SSOT for all state display text.** Both dashboard and drawer read from this one mapping.

```typescript
export type ReasonDisplay = {
  label: string
  stuckLabel: string
  context: string | ((data: any) => string)
}

export const REASON_DISPLAY: Record<string, ReasonDisplay> = {
  // Needs action
  new:                        { label: 'New issue',           stuckLabel: '',                context: 'New issue — triage and assign' },
  pending_review:             { label: 'Review AI triage',    stuckLabel: '',                context: 'AI categorised — confirm and dispatch' },
  handoff_review:             { label: 'Review handoff',      stuckLabel: '',                context: 'AI couldn\'t handle — review transcript and assign' },
  manager_approval:           { label: 'Approve quote',       stuckLabel: '',                context: 'Quote received — approve or decline' },
  no_contractors:             { label: 'Assign contractor',   stuckLabel: '',                context: 'No contractors available — assign manually' },
  landlord_declined:          { label: 'Landlord declined',   stuckLabel: '',                context: 'Landlord declined — reassign or escalate' },
  landlord_needs_help:        { label: 'Landlord needs help', stuckLabel: '',                context: 'Landlord asked for assistance' },
  landlord_resolved:          { label: 'Verify resolution',   stuckLabel: '',                context: 'Landlord says resolved — verify and close' },
  ooh_resolved:               { label: 'Verify resolution',   stuckLabel: '',                context: 'OOH says resolved — verify and close' },
  ooh_unresolved:             { label: 'Reassign',            stuckLabel: '',                context: 'OOH couldn\'t resolve — reassign contractor' },
  job_not_completed:          { label: 'Review & redispatch', stuckLabel: '',                context: 'Contractor reports job not completed' },
  compliance_needs_dispatch:  { label: 'Dispatch contractor', stuckLabel: '',                context: 'Certificate needs renewal — dispatch contractor' },
  cert_incomplete:            { label: 'Complete certificate', stuckLabel: '',                context: 'Certificate missing document or expiry date' },
  rent_overdue:               { label: 'Chase tenant',        stuckLabel: '',                context: 'Rent overdue — contact tenant' },
  rent_partial_payment:       { label: 'Follow up payment',   stuckLabel: '',                context: 'Partial payment — follow up remainder' },

  // Waiting
  awaiting_contractor:        { label: 'Awaiting contractor',     stuckLabel: 'Chase contractor',    context: 'Waiting for contractor response' },
  awaiting_booking:           { label: 'Awaiting booking',        stuckLabel: 'Chase booking',       context: 'Contractor needs to confirm a date' },
  awaiting_landlord:          { label: 'Awaiting landlord',       stuckLabel: 'Chase landlord',      context: 'Waiting for landlord to approve' },
  allocated_to_landlord:      { label: 'Landlord managing',       stuckLabel: 'Chase landlord',      context: 'Allocated to landlord — awaiting outcome' },
  ooh_dispatched:             { label: 'Awaiting OOH',            stuckLabel: 'Chase OOH',           context: 'Emergency dispatched — awaiting OOH response' },
  awaiting_tenant:            { label: 'Awaiting tenant',         stuckLabel: 'Chase tenant',        context: 'Waiting for tenant response' },
  reschedule_pending:         { label: 'Reschedule pending',      stuckLabel: 'Chase reschedule',    context: 'Reschedule requested — awaiting decision' },

  // Scheduled
  scheduled:                  { label: 'Job scheduled',       stuckLabel: 'Collect report',  context: 'Job booked — awaiting completion' },

  // Terminal (shown in drawer, not dashboard)
  completed:                  { label: 'Completed',           stuckLabel: '',                context: 'Issue resolved' },
  on_hold:                    { label: 'On hold',             stuckLabel: '',                context: 'Ticket paused' },
}

// Helper: get display for a reason + timeout state
export function getReasonDisplay(reason: string, isStuck: boolean): { label: string; context: string } {
  const entry = REASON_DISPLAY[reason]
  if (!entry) return { label: reason, context: '' }
  return {
    label: isStuck && entry.stuckLabel ? entry.stuckLabel : entry.label,
    context: typeof entry.context === 'function' ? '' : entry.context,
  }
}
```

---

## Part 4: Frontend — Dashboard rewrite

### `src/app/(dashboard)/page.tsx`

**Changes:**
1. Remove `c1_get_dashboard_todo_extras` call (line ~218)
2. Remove merge logic (lines ~320-327) — single RPC returns everything
3. Remove `source_type` mapping
4. Group items by `item.bucket` instead of filter functions
5. Import `getReasonDisplay` from `src/lib/reason-display.ts` for labels

### `src/components/dashboard/todo-panel.tsx`

**Changes:**
1. Remove `WAITING_REASONS`, `SCHEDULED_REASONS`, `STUCK_REASONS`, `STUCK_ACTION_TYPES` constants
2. Remove `filterActionable()`, `filterInProgress()`, `filterStuck()` functions
3. Remove `REASON_BADGE` mapping — replaced by `REASON_DISPLAY`
4. Update `TodoItem` type to match new RPC output (remove `action_type`, `action_label`, `action_context`, `priority_bucket`, `source_type`)
5. Add `bucket` field to type
6. Use `getReasonDisplay(item.next_action_reason, item.is_past_timeout)` for labels

### `src/app/(dashboard)/tickets/page.tsx`

**Changes:**
1. Remove `WAITING_REASONS`, `NEEDS_MGR_REASONS` constants
2. Remove `isWaitingReason()`, `isScheduledReason()`, `isNeedsMgrReason()` functions
3. Replace with: `item.next_action === 'waiting'`, `item.next_action === 'scheduled'`, `item.next_action === 'needs_action'`
4. Remove `landlord_no_response` from any filter lists
5. Remove `needs_attention` from any comparisons

### `src/app/(dashboard)/compliance/[id]/page.tsx`

**Line 121:** `compliance_pending` → `compliance_needs_dispatch`

### `src/components/dashboard/waiting-section.tsx`

Read `bucket` field from RPC instead of computing from reason.

### `src/components/status-badge.tsx`

1. Remove `landlord no response` badge (line 62) — no longer a state
2. Rename `compliance pending` → `compliance needs dispatch` (line 102)
3. Add badges: `cert_incomplete`, `awaiting_tenant`, `reschedule_pending`
4. Remove any tenancy/handoff_conversation badges

### `src/components/profile/ticket-card.tsx`

1. Remove `landlord_no_response` from `displayStageMap`
2. Update to use bucket values for status derivation

---

## Part 5: Frontend — Drawer rewrite

### `src/hooks/use-ticket-detail.ts` (⚠️ major rewrite)

**Current:** 678 lines, 7+ queries, category-specific secondary fetches.

**After:** ~100 lines. Three calls:

```typescript
export function useTicketDetail(ticketId: string | null) {
  // 1. Main RPC — all ticket data
  const { data: ticket } = useQuery(['ticket-detail', ticketId], () =>
    supabase.rpc('c1_ticket_detail', { p_ticket_id: ticketId })
  )

  // 2. Events — timeline
  const { data: events } = useQuery(['ticket-events', ticketId], () =>
    supabase.from('c1_events').select('*').eq('ticket_id', ticketId).order('occurred_at')
  )

  // 3. Transcript — only for handoff/pending_review tickets
  const { data: transcript } = useQuery(
    ['ticket-transcript', ticketId],
    () => supabase.from('c1_conversations').select('log').eq('id', ticket?.conversation_id).single(),
    { enabled: !!ticket?.conversation_id && ['handoff_review', 'pending_review'].includes(ticket?.next_action_reason) }
  )

  return { ticket, events, transcript, loading, error }
}
```

**Kill:** All 7+ queries, `LedgerEntry` type, category-specific secondary fetches, `displayStage` computation.

### `src/components/ticket-detail/ticket-detail-modal.tsx`

**Simplify template switching:**
- Remove tab bar for all categories
- Universal layout: Stage card → CTA → Timeline → Category data → People
- Category section is the only per-category difference:
  - Maintenance: images, job details
  - Compliance: cert details
  - Rent: payment ledger
- Conversation tab → removed. Transcript inline for handoff only.
- Activity tab → merged as events timeline in main view
- Completion tab → job completion details shown inline

### `src/components/ticket-detail/ticket-overview-tab.tsx`

**Kill:**
- `deriveTimeline()` (lines 34-54, 21 lines)
- `STAGE_CONFIG` (lines 113-311, 199 lines)

**Replace with:**
- Stage card from `getReasonDisplay(ticket.next_action_reason, ticket.is_past_timeout)`
- Timeline from `c1_events` (passed in from hook)
- CTA from `next_action_reason` mapping (see architecture doc § CTA buttons)

### `src/components/ticket-detail/compliance-overview-tab.tsx`

**Kill:** `getComplianceStage()` (lines 51-140, 90 lines)

**Replace with:** Same universal stage card from REASON_DISPLAY. Keep cert details section.

### `src/components/ticket-detail/rent-overview-tab.tsx`

**Add:** Stage card (currently has none). Use universal stage card from REASON_DISPLAY. Keep payment ledger section.

### Handoff review — inline transcript

For `handoff_review` tickets:
- Collapsible "AI Transcript" section below stage card
- Stage card shows `handoff_reason` immediately: "No plumber contractor mapped" / "Couldn't categorise issue"
- Auto-expanded for `handoff_review`, collapsed for `pending_review`
- CTA: `handoff_review` → "Review & assign" | `pending_review` → "Approve dispatch"

---

## Part 6: Frontend — Portals

### `src/components/portal/tenant-portal.tsx`

**Replace `getActiveStage()` (lines 32-38):**
```typescript
// Old: reads ticket.job_stage
// New: reads ticket.next_action_reason
function getActiveStage(ticket: any): string {
  const reason = ticket.next_action_reason
  if (reason === 'completed' || ticket.resolved_at) return 'completed'
  if (reason === 'scheduled') return 'booked'
  if (['awaiting_contractor', 'awaiting_booking', 'awaiting_landlord', 'manager_approval'].includes(reason)) return 'contractor_found'
  return 'reported'
}
```

### `src/components/portal/tenant-portal-v2.tsx`

Same changes as above.

### `src/components/portal/contractor-portal.tsx`

**Replace `getTicketStage()` (lines 24-28):**
```typescript
function getTicketStage(ticket: any): string {
  const reason = ticket.next_action_reason
  if (reason === 'completed' || ticket.resolved_at) return 'done'
  if (reason === 'scheduled' && ticket.scheduled_date) return 'complete'
  return 'schedule'
}
```

---

## Part 7: Audit `c1_ticket_context` callers

**Check:** Is `c1_ticket_context` used outside `use-ticket-detail.ts`?
- If only used by the drawer hook → drop it after refactor
- If used by audit page or other callers → leave it, document decision

---

## Verification

- [ ] `npm run build` passes
- [ ] Dashboard loads with single RPC (no extras call)
- [ ] 4 buckets render: needs_action, waiting, scheduled, stuck
- [ ] `ooh_dispatched` in waiting bucket (not needs_action)
- [ ] No tenancy items on dashboard
- [ ] Labels from REASON_DISPLAY match between dashboard card and drawer
- [ ] Drawer opens with 1 RPC call + 1 events query
- [ ] `STAGE_CONFIG` deleted from codebase
- [ ] `getComplianceStage()` deleted from codebase
- [ ] `deriveTimeline()` deleted from codebase
- [ ] `filterActionable`/`filterInProgress`/`filterStuck` deleted
- [ ] Maintenance drawer: stage card, timeline from events, CTA renders
- [ ] Compliance drawer: stage card, cert details, CTA "Dispatch contractor"
- [ ] Rent drawer: stage card, payment ledger, CTA "Contact tenant"
- [ ] Handoff drawer: transcript inline, handoff_reason shown, CTA "Review & assign"
- [ ] Portals: tenant/contractor portals show correct stage from `next_action_reason`
- [ ] No references to `landlord_no_response`, `compliance_pending`, `landlord_in_progress`, `ooh_in_progress` in frontend
- [ ] `c1_get_dashboard_todo_extras` function dropped
