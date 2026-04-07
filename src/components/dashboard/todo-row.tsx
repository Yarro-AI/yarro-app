'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status-badge'
import { SlaBadge } from '@/components/sla-badge'
import { REASON_BADGE } from '@/components/dashboard/todo-panel'
import type { TodoItem } from '@/components/dashboard/todo-panel'
import {
  ShieldCheck,
  Banknote,
  CalendarDays,
  MessageSquare,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface TodoRowProps {
  item: TodoItem
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
}

export function TodoRow({ item, onHandoffClick, onTicketClick }: TodoRowProps) {
  const borderAccent = (item.sla_breached || item.priority_bucket === 'URGENT')
    ? 'border-l-[3px] border-l-danger'
    : item.priority_bucket === 'HIGH'
    ? 'border-l-[3px] border-l-warning'
    : ''
  const src = item.source_type || 'ticket'

  const SourceIcon = src === 'compliance' ? ShieldCheck
    : src === 'rent' ? Banknote
    : src === 'tenancy' ? CalendarDays
    : src === 'handoff' ? MessageSquare
    : null

  const ctaText = (() => {
    if (src === 'compliance') {
      if (item.next_action_reason === 'compliance_expired') return 'Renew'
      if (item.next_action_reason === 'compliance_expiring') return 'Schedule'
      if (item.next_action_reason === 'compliance_missing') return 'Add'
      return 'View'
    }
    if (src === 'rent') return item.next_action_reason === 'rent_partial' ? 'Follow up' : 'Chase'
    if (src === 'tenancy') return item.next_action_reason === 'tenancy_expired' ? 'Update' : 'Review'
    if (src === 'handoff') return 'Create ticket'
    return ({'Review issue': 'Triage', 'Needs attention': 'Review', 'Landlord declined': 'Review', 'Job not completed': 'Review', 'Assign contractor': 'Assign', 'Review quote': 'Approve', 'Awaiting landlord': 'Follow up', 'Contractor unresponsive': 'Redispatch', 'OOH dispatched': 'Review', 'OOH resolved': 'Close', 'OOH unresolved': 'Review', 'OOH in progress': 'View'} as Record<string, string>)[item.action_label] || 'View'
  })()

  const isTicket = item.id.startsWith('todo_')

  const getHref = (): string | null => {
    // Ticket-sourced compliance/rent items → open ticket detail, not extras page
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
  const href = getHref()

  const handleClick = () => {
    if (src === 'handoff') {
      onHandoffClick(item)
      return
    }
    onTicketClick(item)
  }

  const badge = REASON_BADGE[item.next_action_reason || ''] || { label: item.action_label, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
  const waitHrs = (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
  const waitStyle = waitHrs > 48 ? 'text-xs font-medium text-danger' : waitHrs > 24 ? 'text-xs font-medium text-warning' : 'text-[11px] text-muted-foreground/60'

  const rowContent = (
    <>
      {SourceIcon && (
        <SourceIcon className="h-4 w-4 text-muted-foreground/60 flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
          {item.priority && <StatusBadge status={item.priority} size="sm" className="border-border/50 text-muted-foreground/70" />}
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{item.issue_summary}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
          </span>
          <span className={waitStyle}>{formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}</span>
          {item.sla_due_at && (
            <SlaBadge slaDueAt={item.sla_due_at} priority={item.priority} />
          )}
        </div>
      </div>
      <span className="text-sm font-medium text-primary hover:text-primary/70 transition-colors flex-shrink-0 whitespace-nowrap pt-0.5">{ctaText}</span>
    </>
  )

  const rowClass = cn("flex items-start gap-3 py-3 px-4 transition-colors min-w-0 hover:bg-muted/30 group cursor-pointer", borderAccent)

  if (href) {
    return <Link href={href} className={rowClass}>{rowContent}</Link>
  }
  return (
    <button onClick={handleClick} className={cn(rowClass, 'w-full text-left')}>
      {rowContent}
    </button>
  )
}
