/**
 * Shared audit trail utilities.
 * Used by both the audit list page and per-ticket audit profile.
 */

export interface AuditEvent {
  id: string
  event_type: string
  actor_type: string
  actor_name: string | null
  property_label: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
  ticket_id: string | null
}

// Causal ordering for same-ticket events with near-identical timestamps.
// DB triggers fire at different microseconds within the same transaction,
// so CONTRACTOR_ASSIGNED can appear before ISSUE_CREATED without this.
export const CAUSAL_ORDER: Record<string, number> = {
  ISSUE_CREATED: 0,
  ISSUE_REPORTED: 0,
  AUTO_TICKET_COMPLIANCE: 0,
  AUTO_TICKET_RENT: 0,
  PRIORITY_CLASSIFIED: 1,
  PRIORITY_CHANGED: 1,
  PM_PRIORITY_CHANGED: 1,
  HANDOFF_CREATED: 2,
  HANDOFF_CHANGED: 2,
  STATE_CHANGED: 2,
  PM_TRIAGED: 2,
  PM_AWAITING_TENANT: 2,
  TENANT_RESPONDED: 2,
  CONTRACTOR_ASSIGNED: 3,
  CONTRACTOR_WITHDRAWN: 3,
  PM_REASSIGNED: 3,
  OOH_DISPATCHED: 3,
  OOH_ACCEPTED: 3,
  LANDLORD_ALLOCATED: 3,
  LANDLORD_ACCEPTED: 3,
  LANDLORD_APPROVED: 4,
  LANDLORD_DECLINED: 4,
  PM_BYPASSED_APPROVAL: 4,
  QUOTE_RECEIVED: 5,
  QUOTE_APPROVED: 5,
  QUOTE_DECLINED: 5,
  TIMEOUT_TRIGGERED: 5,
  TIMEOUT_RESOLVED: 5,
  JOB_SCHEDULED: 6,
  RESCHEDULE_REQUESTED: 6,
  RESCHEDULE_DECIDED: 6,
  JOB_COMPLETED: 7,
  TICKET_CLOSED: 8,
  TICKET_ARCHIVED: 9,
}

export function sortWithCausalOrder(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => {
    const timeDiff = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    if (Math.abs(timeDiff) < 2000 && a.ticket_id && a.ticket_id === b.ticket_id) {
      const orderA = CAUSAL_ORDER[a.event_type] ?? 5
      const orderB = CAUSAL_ORDER[b.event_type] ?? 5
      if (orderA !== orderB) return orderB - orderA
    }
    return timeDiff
  })
}

export function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function extractDetail(event: AuditEvent): string {
  if (!event.metadata) return '—'

  const meta = event.metadata
  if (meta.summary && typeof meta.summary === 'string') return meta.summary
  if (meta.from_reason && meta.to_reason) return `${meta.from_reason} → ${meta.to_reason}`
  if (meta.old_status && meta.new_status) return `${meta.old_status} → ${meta.new_status}`
  if (meta.message && typeof meta.message === 'string') {
    const msg = meta.message as string
    return msg.length > 80 ? msg.slice(0, 80) + '…' : msg
  }

  const firstVal = Object.values(meta).find((v) => typeof v === 'string')
  if (firstVal && typeof firstVal === 'string') {
    return firstVal.length > 80 ? firstVal.slice(0, 80) + '…' : firstVal
  }

  return '—'
}
