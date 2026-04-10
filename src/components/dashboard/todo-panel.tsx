
// ─────────────────────────────────────────────────────────
// Types (shared — exported for use in page.tsx)
// ─────────────────────────────────────────────────────────

export interface TodoItem {
  id: string
  ticket_id: string
  property_id: string | null
  category: string | null           // replaces source_type
  maintenance_trade: string | null
  issue_summary: string
  property_label: string
  bucket: string                     // needs_action | waiting | scheduled | stuck
  next_action: string | null         // raw bucket from ticket row (before stuck override)
  next_action_reason: string | null
  priority: string | null            // replaces priority_bucket
  priority_score: number | null
  is_past_timeout: boolean | null
  sla_due_at: string | null
  deadline_date: string | null
  waiting_since: string | null
  contractor_sent_at: string | null
  scheduled_date: string | null
  landlord_allocated_at: string | null
  ooh_dispatched_at: string | null
  tenant_contacted_at: string | null
  compliance_certificate_id: string | null
  created_at: string | null
  reschedule_initiated_by: string | null
}

export interface TicketSummary {
  id: string
  issue_description: string | null
  status: string
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
// Derivation helpers (shared by JobCard + TodoRow)
// ─────────────────────────────────────────────────────────

export type Urgency = 'emergency' | 'urgent' | 'high' | 'medium' | 'low'
export type JobCategory = 'maintenance' | 'compliance' | 'finance'

export function deriveUrgency(item: TodoItem): Urgency {
  if (item.priority === 'Emergency') return 'emergency'
  if (item.priority === 'Urgent') return 'urgent'
  if (item.priority === 'High') return 'high'
  if (item.priority === 'Medium') return 'medium'
  return 'low'
}

export function deriveCategory(item: TodoItem): JobCategory {
  if (item.category === 'compliance_renewal') return 'compliance'
  if (item.category === 'rent_arrears') return 'finance'
  return 'maintenance'
}

export function getTodoHref(item: TodoItem): string | null {
  // Compliance items open the drawer (not direct cert link) — PM reviews ticket first
  if (item.next_action_reason === 'handoff_review') return `/tickets?ticketId=${item.ticket_id}&action=complete`
  if (item.next_action_reason === 'pending_review') return `/tickets?ticketId=${item.ticket_id}&action=review`
  return null
}
