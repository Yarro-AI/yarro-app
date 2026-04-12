'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/status-badge'
import { getReasonDisplay } from '@/lib/reason-display'
import type { TodoItem } from '@/components/dashboard/todo-panel'
import {
  ShieldCheck,
  Banknote,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface TodoRowProps {
  item: TodoItem
  onHandoffClick: (item: TodoItem) => void
  onTicketClick: (item: TodoItem) => void
}

export function TodoRow({ item, onHandoffClick, onTicketClick }: TodoRowProps) {
  const borderAccent = (item.priority === 'Emergency' || item.priority === 'Urgent')
    ? 'border-l-[3px] border-l-danger'
    : item.priority === 'High'
    ? 'border-l-[3px] border-l-warning'
    : ''

  const SourceIcon = item.category === 'compliance_renewal' ? ShieldCheck
    : item.category === 'rent_arrears' ? Banknote
    : null

  const getHref = (): string | null => {
    if (item.category === 'compliance_renewal' && item.compliance_certificate_id) {
      return `/compliance/${item.compliance_certificate_id}`
    }
    if (item.next_action_reason === 'handoff_review') return `/tickets?ticketId=${item.ticket_id}&action=complete`
    if (item.next_action_reason === 'pending_review') return `/tickets?ticketId=${item.ticket_id}&action=review`
    return null
  }
  const href = getHref()

  const handleClick = () => {
    if (item.next_action_reason === 'handoff_review') {
      onHandoffClick(item)
      return
    }
    onTicketClick(item)
  }

  const { label } = getReasonDisplay(item.next_action_reason, item.is_past_timeout ?? false)
  const waitingSince = item.waiting_since || item.created_at
  const waitHrs = waitingSince ? (Date.now() - new Date(waitingSince).getTime()) / 3_600_000 : 0
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
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {item.issue_summary}
          {item.is_former_tenant && (
            <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">Former</span>
          )}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </span>
          {waitingSince && (
            <span className={waitStyle}>{formatDistanceToNow(new Date(waitingSince), { addSuffix: true })}</span>
          )}
        </div>
      </div>
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
