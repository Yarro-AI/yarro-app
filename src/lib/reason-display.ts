/**
 * REASON_DISPLAY — Single Source of Truth for all state display text.
 * Both dashboard and drawer read from this mapping. Never duplicate label logic.
 *
 * Keys are next_action_reason values from the CHECK constraint.
 * Labels change when is_past_timeout = true (stuck override).
 */

export type ReasonDisplay = {
  label: string
  stuckLabel: string
  context: string
}

export const REASON_DISPLAY: Record<string, ReasonDisplay> = {
  // ── Needs action ──
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

  // ── Waiting ──
  awaiting_contractor:        { label: 'Awaiting contractor',     stuckLabel: 'Chase contractor',    context: 'Waiting for contractor response' },
  awaiting_booking:           { label: 'Awaiting booking',        stuckLabel: 'Chase booking',       context: 'Contractor needs to confirm a date' },
  awaiting_landlord:          { label: 'Awaiting landlord',       stuckLabel: 'Chase landlord',      context: 'Waiting for landlord to approve' },
  allocated_to_landlord:      { label: 'Landlord managing',       stuckLabel: 'Chase landlord',      context: 'Allocated to landlord — awaiting outcome' },
  ooh_dispatched:             { label: 'Awaiting OOH',            stuckLabel: 'Chase OOH',           context: 'Emergency dispatched — awaiting OOH response' },
  awaiting_tenant:            { label: 'Awaiting tenant',         stuckLabel: 'Chase tenant',        context: 'Waiting for tenant response' },
  reschedule_pending:         { label: 'Reschedule pending',      stuckLabel: 'Chase reschedule',    context: 'Reschedule requested — awaiting decision' },

  // ── Scheduled ──
  scheduled:                  { label: 'Job scheduled',       stuckLabel: 'Collect report',  context: 'Job booked — awaiting completion' },

  // ── Terminal (shown in drawer, not dashboard) ──
  completed:                  { label: 'Completed',           stuckLabel: '',                context: 'Issue resolved' },
  archived:                   { label: 'Archived',            stuckLabel: '',                context: 'Ticket archived' },
  dismissed:                  { label: 'Dismissed',           stuckLabel: '',                context: 'Ticket dismissed' },
  on_hold:                    { label: 'On hold',             stuckLabel: '',                context: 'Ticket paused' },
  cert_renewed:               { label: 'Certificate renewed', stuckLabel: '',                context: 'Certificate renewed successfully' },
  rent_cleared:               { label: 'Rent cleared',        stuckLabel: '',                context: 'Rent balance cleared' },
}

/** Get display text for a reason + timeout state */
export function getReasonDisplay(reason: string | null, isStuck: boolean): { label: string; context: string } {
  if (!reason) return { label: 'Unknown', context: '' }
  const entry = REASON_DISPLAY[reason]
  if (!entry) return { label: reason.replace(/_/g, ' '), context: '' }
  return {
    label: isStuck && entry.stuckLabel ? entry.stuckLabel : entry.label,
    context: entry.context,
  }
}
