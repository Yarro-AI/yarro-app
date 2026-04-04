'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status-badge'
import { useOpenTicket } from '@/hooks/use-open-ticket'
import { formatDistanceToNow } from 'date-fns'

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
function getCtaText(item: TodoItem): string {
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
// Filtering helpers (used in parent to lift counts)
// ─────────────────────────────────────────────────────────

export function filterActionable(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i => {
    // Non-ticket items are always actionable
    if (i.source_type && i.source_type !== 'ticket') return true
    // Ticket-specific filtering
    if (i.action_type === 'FOLLOW_UP') return false
    if (i.next_action_reason === 'awaiting_landlord') {
      const hrs = (Date.now() - new Date(i.waiting_since).getTime()) / 3_600_000
      if (hrs < 24) return false
    }
    return true
  })
}

export function filterInProgress(todoItems: TodoItem[]): TodoItem[] {
  return todoItems.filter(i =>
    (!i.source_type || i.source_type === 'ticket') && i.action_type === 'FOLLOW_UP'
  )
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

interface TodoPanelProps {
  actionable: TodoItem[]
  inProgressItems: TodoItem[]
}

export function TodoPanel({ actionable, inProgressItems }: TodoPanelProps) {
  const [leftTab, setLeftTab] = useState<'todo' | 'in_progress'>('todo')
  const openTicket = useOpenTicket()

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">

      {/* Tab row */}
      <div className="flex items-center justify-between px-6 flex-shrink-0 pt-3 pb-3 border-b border-foreground/10">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setLeftTab('todo')}
            className="flex items-center gap-1.5 transition-colors group focus:outline-none"
          >
            <span className={cn(
              'text-base font-semibold transition-colors',
              leftTab === 'todo'
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground'
            )}>
              To-do
            </span>
            {actionable.length > 0 && (
              <span className={cn(
                'text-xs font-medium transition-colors',
                leftTab === 'todo' ? 'text-primary/60' : 'text-muted-foreground/50'
              )}>
                {actionable.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setLeftTab('in_progress')}
            className="flex items-center gap-1.5 transition-colors group focus:outline-none"
          >
            <span className={cn(
              'text-base font-semibold transition-colors',
              leftTab === 'in_progress'
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground'
            )}>
              In Progress
            </span>
            {inProgressItems.length > 0 && (
              <span className={cn(
                'text-xs font-medium transition-colors',
                leftTab === 'in_progress' ? 'text-primary/60' : 'text-muted-foreground/50'
              )}>
                {inProgressItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {leftTab === 'todo' ? (
      actionable.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-emerald-600 font-medium">All clear — nothing needs your attention</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/40 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {actionable.map(item => {
            const ctaText = getCtaText(item)
            const isHandoff = item.next_action_reason === 'handoff_review'
            const isPendingReview = item.next_action_reason === 'pending_review'
            const needsDispatchTab = item.next_action_reason === 'no_contractors' || item.next_action_reason === 'manager_approval' || item.action_type === 'CONTRACTOR_UNRESPONSIVE'

            const actionHref = isHandoff
              ? `/tickets?id=${item.ticket_id}&action=complete`
              : isPendingReview
              ? `/tickets?id=${item.ticket_id}&action=review`
              : null

            const rowContent = (
              <>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
                    {item.priority && (
                      <StatusBadge
                        status={item.priority}
                        size="sm"
                        className="border-border/50 text-muted-foreground/70"
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{item.issue_summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const badge = REASON_BADGE[item.next_action_reason || ''] || { label: item.action_label, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
                      return (
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                        </span>
                      )
                    })()}
                    {(() => {
                      const waitHrs = (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
                      const waitStyle = waitHrs > 48 ? 'text-xs font-medium text-danger'
                        : waitHrs > 24 ? 'text-xs font-medium text-warning'
                        : 'text-[11px] text-muted-foreground/60'
                      return <span className={waitStyle}>{formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}</span>
                    })()}
                  </div>
                </div>

                <span className="text-sm font-medium text-primary hover:text-primary/70 transition-colors flex-shrink-0 whitespace-nowrap pt-0.5">
                  {ctaText}
                </span>
              </>
            )

            const borderAccent = (item.sla_breached || item.priority_bucket === 'URGENT')
              ? 'border-l-[3px] border-l-danger'
              : item.priority_bucket === 'HIGH'
              ? 'border-l-[3px] border-l-warning'
              : ''
            const rowClass = cn("flex items-start gap-3 py-3 px-6 transition-colors min-w-0 hover:bg-muted/30 group cursor-pointer", borderAccent)

            if (actionHref) {
              return <Link key={item.id} href={actionHref} className={rowClass}>{rowContent}</Link>
            }

            return (
              <button
                key={item.id}
                onClick={() => openTicket(item.ticket_id, needsDispatchTab ? 'dispatch' : undefined)}
                className={cn(rowClass, 'w-full text-left')}
              >
                {rowContent}
              </button>
            )
          })}
        </div>
      )
      ) : (
        /* In Progress tab */
        inProgressItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">No tickets in progress</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/40 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {inProgressItems.map(item => {
              const ctaText = getCtaText(item)
              const badge = REASON_BADGE[item.next_action_reason || ''] || { label: item.action_label, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
              return (
                <button
                  key={item.id}
                  onClick={() => openTicket(item.ticket_id)}
                  className="flex items-start gap-3 py-3 px-6 transition-colors min-w-0 hover:bg-muted/30 group cursor-pointer w-full text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
                      {item.priority && (
                        <StatusBadge
                          status={item.priority}
                          size="sm"
                          className="border-border/50 text-muted-foreground/70"
                        />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{item.issue_summary}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                      </span>
                      {(() => {
                        const waitHrs = (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
                        const waitStyle = waitHrs > 48 ? 'text-xs font-medium text-danger'
                          : waitHrs > 24 ? 'text-xs font-medium text-warning'
                          : 'text-[11px] text-muted-foreground/60'
                        return <span className={waitStyle}>{formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}</span>
                      })()}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-primary hover:text-primary/70 transition-colors flex-shrink-0 whitespace-nowrap pt-0.5">
                    {ctaText}
                  </span>
                </button>
              )
            })}
          </div>
        )
      )}

    </div>
  )
}
