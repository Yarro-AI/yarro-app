'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { StatusBadge } from '@/components/status-badge'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import {
  Clock,
  Hourglass,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'

interface KanbanTicket {
  id: string
  issue_description: string | null
  status: string
  job_stage: string | null
  category: string | null
  priority: string | null
  date_logged: string
  scheduled_date?: string | null
  final_amount?: number | null
  address?: string
  handoff?: boolean
  next_action?: string | null
  next_action_reason?: string | null
}

interface KanbanBoardProps {
  tickets: KanbanTicket[]
  onTicketClick?: (ticketId: string) => void
  onHandoffReview?: (ticketId: string) => void
}

type ColumnType = 'open' | 'awaiting' | 'scheduled' | 'done'
type AwaitingSubgroup = 'quote' | 'landlord' | 'booking'

interface GroupedTicket extends KanbanTicket {
  column: ColumnType
  subgroup?: AwaitingSubgroup
  waitDays?: number
}

export function KanbanBoard({ tickets, onTicketClick, onHandoffReview }: KanbanBoardProps) {
  const groupedTickets = useMemo(() => {
    const result: Record<ColumnType, GroupedTicket[]> = {
      open: [],
      awaiting: [],
      scheduled: [],
      done: [],
    }

    tickets.forEach((ticket) => {
      const reason = ticket.next_action_reason || ''

      // Done column
      if (reason === 'completed' || reason === 'dismissed') {
        result.done.push({ ...ticket, column: 'done' })
        return
      }

      // Scheduled column
      if (reason === 'scheduled') {
        result.scheduled.push({ ...ticket, column: 'scheduled' })
        return
      }

      // Awaiting column - sub-grouped by next_action_reason
      if (reason === 'awaiting_contractor' || reason === 'manager_approval' || reason === 'no_contractors') {
        const waitDays = differenceInDays(new Date(), new Date(ticket.date_logged))
        result.awaiting.push({ ...ticket, column: 'awaiting', subgroup: 'quote', waitDays })
        return
      }

      if (reason === 'awaiting_landlord' || reason === 'landlord_declined' || reason === 'landlord_no_response') {
        const waitDays = differenceInDays(new Date(), new Date(ticket.date_logged))
        result.awaiting.push({ ...ticket, column: 'awaiting', subgroup: 'landlord', waitDays })
        return
      }

      if (reason === 'awaiting_booking') {
        const waitDays = differenceInDays(new Date(), new Date(ticket.date_logged))
        result.awaiting.push({ ...ticket, column: 'awaiting', subgroup: 'booking', waitDays })
        return
      }

      if (reason === 'job_not_completed') {
        const waitDays = differenceInDays(new Date(), new Date(ticket.date_logged))
        result.awaiting.push({ ...ticket, column: 'awaiting', subgroup: 'quote', waitDays })
        return
      }

      // Open column (handoff_review, new, or anything else)
      result.open.push({ ...ticket, column: 'open' })
    })

    // Sort open: handoffs first
    result.open.sort((a, b) => {
      if (a.handoff && !b.handoff) return -1
      if (!a.handoff && b.handoff) return 1
      return new Date(b.date_logged).getTime() - new Date(a.date_logged).getTime()
    })

    // Sort done by date
    result.done.sort((a, b) => new Date(b.date_logged).getTime() - new Date(a.date_logged).getTime())

    return result
  }, [tickets])

  const columnCounts = {
    open: groupedTickets.open.length,
    awaiting: groupedTickets.awaiting.length,
    scheduled: groupedTickets.scheduled.length,
    done: groupedTickets.done.length,
  }

  // Sub-group awaiting tickets
  const awaitingBySubgroup = useMemo(() => {
    const quote = groupedTickets.awaiting.filter((t) => t.subgroup === 'quote')
    const landlord = groupedTickets.awaiting.filter((t) => t.subgroup === 'landlord')
    const booking = groupedTickets.awaiting.filter((t) => t.subgroup === 'booking')
    return { quote, landlord, booking }
  }, [groupedTickets.awaiting])

  // Split open into handoffs and new
  const openHandoffs = groupedTickets.open.filter((t) => t.handoff)
  const openNew = groupedTickets.open.filter((t) => !t.handoff)

  const MAX_VISIBLE = 5

  return (
    <div className="grid grid-cols-4 gap-3 h-full min-h-0">
      {/* OPEN Column */}
      <Column
        title="Open"
        count={columnCounts.open}
        color="blue"
      >
        {openHandoffs.length > 0 && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1.5 px-1">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Handoffs</span>
            </div>
            <div className="space-y-1.5">
              {openHandoffs.slice(0, 3).map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onClick={() => onTicketClick?.(ticket.id)}
                  variant="handoff"
                  action={
                    <InteractiveHoverButton
                      text="Review"
                      className="w-20 text-xs h-6 p-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        onHandoffReview?.(ticket.id)
                      }}
                    />
                  }
                />
              ))}
              {openHandoffs.length > 3 && (
                <MoreLink count={openHandoffs.length - 3} href="/tickets?filter=handoff" />
              )}
            </div>
            <div className="border-t border-dashed border-border my-2" />
          </div>
        )}
        <div className="space-y-1.5">
          {openNew.slice(0, MAX_VISIBLE).map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => onTicketClick?.(ticket.id)}
            />
          ))}
          {openNew.length > MAX_VISIBLE && (
            <MoreLink count={openNew.length - MAX_VISIBLE} href="/tickets" />
          )}
          {openNew.length === 0 && openHandoffs.length === 0 && (
            <EmptyState text="No open tickets" />
          )}
        </div>
      </Column>

      {/* AWAITING Column */}
      <Column
        title="Awaiting"
        count={columnCounts.awaiting}
        color="amber"
      >
        {/* Quote sub-group */}
        {awaitingBySubgroup.quote.length > 0 && (
          <Subgroup
            icon={<Clock className="h-3 w-3" />}
            label="Quote"
            count={awaitingBySubgroup.quote.length}
          >
            {awaitingBySubgroup.quote.slice(0, 2).map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick?.(ticket.id)}
                showWait
              />
            ))}
            {awaitingBySubgroup.quote.length > 2 && (
              <MoreLink count={awaitingBySubgroup.quote.length - 2} href="/tickets" />
            )}
          </Subgroup>
        )}

        {/* Landlord sub-group */}
        {awaitingBySubgroup.landlord.length > 0 && (
          <Subgroup
            icon={<Hourglass className="h-3 w-3" />}
            label="Landlord"
            count={awaitingBySubgroup.landlord.length}
            highlighted
          >
            {awaitingBySubgroup.landlord.slice(0, 2).map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick?.(ticket.id)}
                variant="landlord"
                showWait
              />
            ))}
            {awaitingBySubgroup.landlord.length > 2 && (
              <MoreLink count={awaitingBySubgroup.landlord.length - 2} href="/tickets" />
            )}
          </Subgroup>
        )}

        {/* Booking sub-group */}
        {awaitingBySubgroup.booking.length > 0 && (
          <Subgroup
            icon={<Calendar className="h-3 w-3" />}
            label="Booking"
            count={awaitingBySubgroup.booking.length}
          >
            {awaitingBySubgroup.booking.slice(0, 2).map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick?.(ticket.id)}
                showWait
              />
            ))}
            {awaitingBySubgroup.booking.length > 2 && (
              <MoreLink count={awaitingBySubgroup.booking.length - 2} href="/tickets" />
            )}
          </Subgroup>
        )}

        {columnCounts.awaiting === 0 && (
          <EmptyState text="Nothing awaiting" />
        )}
      </Column>

      {/* SCHEDULED Column */}
      <Column
        title="Scheduled"
        count={columnCounts.scheduled}
        color="teal"
      >
        <div className="space-y-1.5">
          {groupedTickets.scheduled.slice(0, MAX_VISIBLE).map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => onTicketClick?.(ticket.id)}
              showScheduledDate
            />
          ))}
          {groupedTickets.scheduled.length > MAX_VISIBLE && (
            <MoreLink count={groupedTickets.scheduled.length - MAX_VISIBLE} href="/tickets" />
          )}
          {groupedTickets.scheduled.length === 0 && (
            <EmptyState text="No scheduled jobs" />
          )}
        </div>
      </Column>

      {/* DONE Column */}
      <Column
        title="Done"
        count={columnCounts.done}
        color="green"
      >
        <div className="space-y-1.5">
          {groupedTickets.done.slice(0, MAX_VISIBLE).map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={() => onTicketClick?.(ticket.id)}
              variant="done"
              showAmount
            />
          ))}
          {groupedTickets.done.length > MAX_VISIBLE && (
            <MoreLink count={groupedTickets.done.length - MAX_VISIBLE} href="/tickets" />
          )}
          {groupedTickets.done.length === 0 && (
            <EmptyState text="No completed tickets" />
          )}
        </div>
      </Column>
    </div>
  )
}

// Column component
function Column({
  title,
  count,
  color,
  children,
}: {
  title: string
  count: number
  color: 'blue' | 'amber' | 'teal' | 'green'
  children: React.ReactNode
}) {
  const colorClasses = {
    blue: 'border-blue-200 dark:border-blue-900',
    amber: 'border-amber-200 dark:border-amber-900',
    teal: 'border-teal-200 dark:border-teal-900',
    green: 'border-green-200 dark:border-green-900',
  }

  const badgeClasses = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    teal: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  }

  return (
    <div className={`bg-card rounded-xl border ${colorClasses[color]} flex flex-col min-h-0`}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${badgeClasses[color]}`}>
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {children}
      </div>
    </div>
  )
}

// Subgroup component for Awaiting column
function Subgroup({
  icon,
  label,
  count,
  highlighted,
  children,
}: {
  icon: React.ReactNode
  label: string
  count: number
  highlighted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`mb-3 ${highlighted ? 'p-1.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1.5 px-1">
        <span className={highlighted ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
          {icon}
        </span>
        <span className={`text-xs font-medium ${highlighted ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {label}
        </span>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      <div className="space-y-1.5">
        {children}
      </div>
    </div>
  )
}

// Ticket card component
function TicketCard({
  ticket,
  onClick,
  variant,
  showWait,
  showScheduledDate,
  showAmount,
  action,
}: {
  ticket: GroupedTicket
  onClick?: () => void
  variant?: 'handoff' | 'landlord' | 'done'
  showWait?: boolean
  showScheduledDate?: boolean
  showAmount?: boolean
  action?: React.ReactNode
}) {
  const borderClass = {
    handoff: 'border-l-2 border-l-amber-500',
    landlord: 'border-l-2 border-l-amber-500',
    done: 'border-l-2 border-l-green-500 opacity-75',
    default: 'border-l-2 border-l-blue-500',
  }

  return (
    <div
      onClick={onClick}
      className={`p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer ${borderClass[variant || 'default']}`}
    >
      <p className="text-xs font-medium text-card-foreground truncate">
        {ticket.issue_description || 'No description'}
      </p>
      <p className="text-xs text-muted-foreground truncate mt-0.5">
        {ticket.address || 'No address'}
      </p>
      <div className="flex items-center justify-between mt-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {ticket.priority && <StatusBadge status={ticket.priority} size="sm" />}
          {showWait && ticket.waitDays !== undefined && ticket.waitDays > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {ticket.waitDays}d
            </span>
          )}
          {showScheduledDate && ticket.scheduled_date && (
            <span className="text-xs text-teal-600 dark:text-teal-400 whitespace-nowrap flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {format(new Date(ticket.scheduled_date), 'dd MMM')}
            </span>
          )}
          {showAmount && ticket.final_amount && (
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              £{ticket.final_amount}
            </span>
          )}
        </div>
        {action}
      </div>
    </div>
  )
}

// More link component
function MoreLink({ count, href }: { count: number; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-1 py-1.5 text-xs text-primary hover:text-primary/80 hover:underline"
    >
      <ChevronDown className="h-3 w-3" />
      +{count} more
    </Link>
  )
}

// Empty state component
function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-6 text-center">
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  )
}
