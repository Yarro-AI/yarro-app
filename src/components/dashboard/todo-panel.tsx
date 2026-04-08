
// ─────────────────────────────────────────────────────────
// Types (shared — exported for use in page.tsx)
// ─────────────────────────────────────────────────────────

export type TodoSourceType = 'ticket' | 'compliance' | 'rent' | 'tenancy' | 'handoff'

export interface TodoItem {
  id: string
  ticket_id: string
  source_type?: TodoSourceType
  entity_id?: string
  property_id?: string
  issue_summary: string
  property_label: string
  action_type: string
  action_label: string
  action_context: string | null
  next_action_reason: string | null
  waiting_since: string
  priority_bucket: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
  priority: string | null
  priority_score?: number
  sla_breached: boolean
  sla_due_at?: string | null
  scheduled_date?: string | null
  is_past_timeout?: boolean
}

export interface TicketSummary {
  id: string
  issue_description: string | null
  status: string
  job_stage: string | null
  display_stage: string | null
  message_stage?: string | null
  category: string | null
  priority: string | null
  date_logged: string
  scheduled_date?: string | null
  final_amount?: number | null
  address?: string
  handoff?: boolean
  landlord_declined?: boolean
  next_action?: string | null
  next_action_reason?: string | null
  on_hold?: boolean | null
}

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

// CTA button text per action_label
const ACTION_CTA: Record<string, string> = {
  // Ticket CTAs
  'Review issue': 'Triage',
  'Needs attention': 'Review',
  'Landlord declined': 'Review',
  'Job not completed': 'Review',
  'Assign contractor': 'Assign',
  'Review quote': 'Approve',
  'Awaiting landlord': 'Follow up',
  'Contractor unresponsive': 'Redispatch',
  'OOH dispatched': 'Review',
  'OOH resolved': 'Close',
  'OOH unresolved': 'Review',
  'OOH in progress': 'View',
  // Rent CTAs
  'Rent overdue': 'Chase',
  'Partial payment': 'Follow up',
  // Tenancy CTAs
  'Tenancy ending': 'Review',
  'Tenancy expired': 'Update',
  // Handoff CTAs
  'Handoff conversation': 'Create ticket',
}

// CTA fallback for compliance items (action_label is dynamic, e.g. "Gas Safety (CP12) expired")
export function getCtaText(item: TodoItem): string {
  const fromMap = ACTION_CTA[item.action_label]
  if (fromMap) return fromMap
  // Compliance items have dynamic labels — match by reason key
  if (item.next_action_reason === 'compliance_expired') return 'Renew'
  if (item.next_action_reason === 'compliance_expiring') return 'Schedule'
  if (item.next_action_reason === 'compliance_missing') return 'Add'
  return 'View'
}

// Dot + text badges per next_action_reason
export const REASON_BADGE: Record<string, { label: string; dot: string; text: string }> = {
  on_hold:              { label: 'On Hold',              dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  pending_review:       { label: 'Needs review',         dot: 'bg-primary',          text: 'text-primary' },
  handoff_review:       { label: 'Handoff',              dot: 'bg-danger',           text: 'text-danger' },
  ooh_dispatched:       { label: 'OOH Dispatched',       dot: 'bg-primary',          text: 'text-primary' },
  ooh_resolved:         { label: 'OOH Resolved',         dot: 'bg-success',          text: 'text-success' },
  ooh_unresolved:       { label: 'OOH Unresolved',       dot: 'bg-danger',           text: 'text-danger' },
  ooh_in_progress:      { label: 'OOH In Progress',      dot: 'bg-warning',          text: 'text-warning' },
  no_contractors:       { label: 'No contractors',       dot: 'bg-warning',          text: 'text-warning' },
  job_not_completed:    { label: 'Not completed',        dot: 'bg-primary',          text: 'text-primary' },
  landlord_declined:    { label: 'Landlord declined',    dot: 'bg-danger',           text: 'text-danger' },
  landlord_no_response: { label: 'Landlord silent',      dot: 'bg-warning',          text: 'text-warning' },
  manager_approval:     { label: 'Needs approval',       dot: 'bg-primary',          text: 'text-primary' },
  allocated_to_landlord:{ label: 'Landlord Managing',    dot: 'bg-primary',          text: 'text-primary' },
  landlord_in_progress: { label: 'Landlord In Progress', dot: 'bg-warning',          text: 'text-warning' },
  landlord_resolved:    { label: 'Landlord Resolved',    dot: 'bg-success',          text: 'text-success' },
  landlord_needs_help:  { label: 'Landlord Needs Help',  dot: 'bg-danger',           text: 'text-danger' },
  awaiting_contractor:  { label: 'Awaiting reply',       dot: 'bg-warning',          text: 'text-warning' },
  awaiting_booking:     { label: 'Awaiting booking',     dot: 'bg-warning',          text: 'text-warning' },
  scheduled:            { label: 'Scheduled',             dot: 'bg-success',          text: 'text-success' },
  awaiting_landlord:    { label: 'Awaiting landlord',    dot: 'bg-warning',          text: 'text-warning' },
  // Compliance
  compliance_expired:   { label: 'Expired',              dot: 'bg-danger',           text: 'text-danger' },
  compliance_expiring:  { label: 'Expiring',             dot: 'bg-warning',          text: 'text-warning' },
  compliance_missing:   { label: 'Missing',              dot: 'bg-danger',           text: 'text-danger' },
  // Rent
  rent_overdue:         { label: 'Overdue',              dot: 'bg-danger',           text: 'text-danger' },
  rent_partial:         { label: 'Partial payment',      dot: 'bg-warning',          text: 'text-warning' },
  // Tenancy
  tenancy_ending:       { label: 'Ending soon',          dot: 'bg-warning',          text: 'text-warning' },
  tenancy_expired:      { label: 'Tenancy ended',        dot: 'bg-danger',           text: 'text-danger' },
  // Handoff
  handoff_conversation: { label: 'Needs ticket',         dot: 'bg-primary',          text: 'text-primary' },
}

// Recommended next-step descriptions per state
export const NEXT_STEPS: Record<string, string> = {
  pending_review: 'Triage and assign a category',
  handoff_review: 'Review AI conversation and create ticket',
  no_contractors: 'Add or assign a new contractor',
  manager_approval: 'Review quote and approve or decline',
  landlord_declined: 'Contact landlord to discuss alternatives',
  landlord_no_response: 'Follow up with landlord directly',
  job_not_completed: 'Review contractor reason and redispatch',
  ooh_dispatched: 'Waiting for OOH contact response',
  ooh_unresolved: 'Escalate or redispatch to contractor',
  landlord_needs_help: 'Landlord needs help — take over',
}


// ─────────────────────────────────────────────────────────
// Derivation helpers (shared by JobCard + TodoRow)
// ─────────────────────────────────────────────────────────

export type Urgency = 'emergency' | 'urgent' | 'high' | 'medium' | 'low'
export type JobCategory = 'maintenance' | 'compliance' | 'finance'

export function deriveUrgency(item: TodoItem): Urgency {
  if (item.sla_breached || item.priority === 'Emergency') return 'emergency'
  if (item.priority === 'Urgent') return 'urgent'
  // priority_bucket from RPC may escalate beyond static priority (e.g. stale → HIGH)
  if (item.priority_bucket === 'URGENT') return 'urgent'
  if (item.priority_bucket === 'HIGH') return 'high'
  if (item.priority === 'High') return 'high'
  if (item.priority === 'Medium') return 'medium'
  return 'low'
}

export function deriveCategory(item: TodoItem): JobCategory {
  const src = item.source_type || 'ticket'
  if (src === 'compliance') return 'compliance'
  if (src === 'rent' || src === 'tenancy') return 'finance'
  return 'maintenance'
}

export function getTodoHref(item: TodoItem): string | null {
  const src = item.source_type || 'ticket'
  const isTicket = item.id.startsWith('todo_')
  if (isTicket && (src === 'compliance' || src === 'rent')) return null
  if (src === 'compliance') {
    return item.next_action_reason === 'compliance_missing'
      ? `/properties/${item.property_id}`
      : `/compliance/${item.entity_id}`
  }
  if (src === 'rent' || src === 'tenancy') return `/properties/${item.property_id}`
  if (item.next_action_reason === 'handoff_review') return `/tickets?id=${item.ticket_id}&action=complete`
  if (item.next_action_reason === 'pending_review') return `/tickets?id=${item.ticket_id}&action=review`
  return null
}

// ─────────────────────────────────────────────────────────
// Filtering helpers (used in parent to lift counts)
// ─────────────────────────────────────────────────────────

// Aligned with polymorphic dispatch: next_action = 'in_progress' states
export const IN_PROGRESS_REASONS = new Set([
  'scheduled', 'awaiting_booking', 'awaiting_contractor',
  'awaiting_landlord', 'allocated_to_landlord', 'landlord_in_progress',
  'ooh_in_progress',
])

export function filterActionable(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i => {
    if (i.action_type === 'CONTRACTOR_UNRESPONSIVE') return true
    if (i.action_type === 'STALE_AWAITING') return true
    if (i.action_type === 'SCHEDULED_OVERDUE') return true
    if (IN_PROGRESS_REASONS.has(i.next_action_reason || '')) return false
    return true
  })
}

export function filterInProgress(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i => {
    if (i.action_type === 'CONTRACTOR_UNRESPONSIVE') return false
    if (i.action_type === 'STALE_AWAITING') return false
    if (i.action_type === 'SCHEDULED_OVERDUE') return false
    return IN_PROGRESS_REASONS.has(i.next_action_reason || '')
  })
}

