
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

// Uniform muted style — urgency is shown by meters/borders, not badge colors
const BS = { dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }

// Dot + text badges per next_action_reason — action verb labels
export const REASON_BADGE: Record<string, { label: string; dot: string; text: string }> = {
  // Needs Action — action verbs
  pending_review:       { label: 'Triage issue',          ...BS },
  handoff_review:       { label: 'Review handoff',        ...BS },
  manager_approval:     { label: 'Approve quote',         ...BS },
  no_contractors:       { label: 'Chase contractor',      ...BS },
  job_not_completed:    { label: 'Review incomplete job',  ...BS },
  landlord_declined:    { label: 'Contact landlord',      ...BS },
  landlord_needs_help:  { label: 'Contact landlord',      ...BS },
  landlord_resolved:    { label: 'Review completion',     ...BS },
  landlord_no_response: { label: 'Chase landlord',        ...BS },
  // In Progress — descriptive (PM isn't the actor)
  awaiting_contractor:  { label: 'Awaiting contractor',   ...BS },
  awaiting_booking:     { label: 'Awaiting booking',      ...BS },
  scheduled:            { label: 'Awaiting completion',   ...BS },
  awaiting_landlord:    { label: 'Awaiting landlord',     ...BS },
  allocated_to_landlord:{ label: 'Landlord managing',     ...BS },
  landlord_in_progress: { label: 'Landlord in progress',  ...BS },
  // OOH
  ooh_dispatched:       { label: 'Follow up OOH',         ...BS },
  ooh_resolved:         { label: 'Review completion',     ...BS },
  ooh_unresolved:       { label: 'Chase resolution',      ...BS },
  ooh_in_progress:      { label: 'OOH in progress',       ...BS },
  on_hold:              { label: 'On hold',               ...BS },
  // Compliance
  compliance_pending:   { label: 'Dispatch contractor',   ...BS },
  compliance_expired:   { label: 'Renew certificate',     ...BS },
  compliance_expiring:  { label: 'Schedule renewal',      ...BS },
  compliance_missing:   { label: 'Add certificate',       ...BS },
  // Rent
  rent_overdue:         { label: 'Chase arrears',         ...BS },
  rent_partial:         { label: 'Follow up payment',     ...BS },
  // Tenancy
  tenancy_ending:       { label: 'Review tenancy',        ...BS },
  tenancy_expired:      { label: 'Update tenancy',        ...BS },
  // Handoff
  handoff_conversation: { label: 'Create ticket',         ...BS },
  // Error
  unknown_category:     { label: 'Unknown category',      ...BS },
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
  if (item.next_action_reason === 'handoff_review') return `/tickets?ticketId=${item.ticket_id}&action=complete`
  if (item.next_action_reason === 'pending_review') return `/tickets?ticketId=${item.ticket_id}&action=review`
  return null
}

// ─────────────────────────────────────────────────────────
// Filtering helpers (used in parent to lift counts)
// ─────────────────────────────────────────────────────────
// Classification by nature of the state:
//   Needs Action = PM must make a decision
//   Waiting      = someone else is on it, not timed out
//   Stuck        = someone else dropped the ball OR RPC timeout escalated
//   Scheduled    = booked, waiting for date

export const WAITING_REASONS = new Set([
  'awaiting_contractor', 'awaiting_landlord', 'awaiting_booking',
  'allocated_to_landlord', 'landlord_in_progress', 'ooh_in_progress', 'ooh_dispatched',
])

export const SCHEDULED_REASONS = new Set(['scheduled'])

// Items stuck by nature — someone blocked or failed
export const STUCK_REASONS = new Set([
  'landlord_no_response', 'landlord_declined', 'landlord_needs_help',
  'ooh_unresolved', 'job_not_completed',
])

// RPC timeout escalations that promote waiting → stuck
export const STUCK_ACTION_TYPES = new Set([
  'CONTRACTOR_UNRESPONSIVE',
  'STALE_AWAITING',
  'SCHEDULED_OVERDUE',
])

// Keep for backward compat — union of waiting + scheduled
export const IN_PROGRESS_REASONS = new Set([...WAITING_REASONS, ...SCHEDULED_REASONS])

export function filterActionable(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i => {
    if (STUCK_ACTION_TYPES.has(i.action_type)) return false
    if (STUCK_REASONS.has(i.next_action_reason || '')) return false
    if (WAITING_REASONS.has(i.next_action_reason || '')) return false
    if (SCHEDULED_REASONS.has(i.next_action_reason || '')) return false
    return true
  })
}

export function filterInProgress(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i => {
    if (STUCK_ACTION_TYPES.has(i.action_type)) return false
    if (STUCK_REASONS.has(i.next_action_reason || '')) return false
    return WAITING_REASONS.has(i.next_action_reason || '') || SCHEDULED_REASONS.has(i.next_action_reason || '')
  })
}

export function filterStuck(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i =>
    STUCK_ACTION_TYPES.has(i.action_type) || STUCK_REASONS.has(i.next_action_reason || '')
  )
}

