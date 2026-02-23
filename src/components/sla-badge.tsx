'use client'

import { cn } from '@/lib/utils'
import { SLA_WINDOWS } from '@/lib/constants'

interface SlaBadgeProps {
  slaDueAt: string | null
  resolvedAt?: string | null
  priority?: string | null
  dateLogged?: string | null
  archived?: boolean | null
  ticketStatus?: string | null
  className?: string
}

function getMinutesRemaining(slaDueAt: string): number {
  const due = new Date(slaDueAt).getTime()
  const now = Date.now()
  return Math.round((due - now) / 60000)
}

function formatDuration(totalMinutes: number): string {
  const abs = Math.abs(totalMinutes)
  const sign = totalMinutes < 0 ? '-' : ''

  if (abs < 60) return `${sign}${abs}m`
  if (abs < 1440) {
    const hours = Math.floor(abs / 60)
    const mins = abs % 60
    return mins > 0 ? `${sign}${hours}h ${mins}m` : `${sign}${hours}h`
  }
  const days = Math.floor(abs / 1440)
  const hours = Math.floor((abs % 1440) / 60)
  return hours > 0 ? `${sign}${days}d ${hours}h` : `${sign}${days}d`
}

type SlaStatus = 'green' | 'amber' | 'red' | 'breached' | 'resolved'

function getSlaStatus(slaDueAt: string, resolvedAt?: string | null, priority?: string | null, dateLogged?: string | null): { status: SlaStatus; label: string } {
  if (resolvedAt) {
    if (dateLogged) {
      const logged = new Date(dateLogged).getTime()
      const resolved = new Date(resolvedAt).getTime()
      const resolutionMinutes = Math.round((resolved - logged) / 60000)
      return { status: 'resolved', label: `Resolved in ${formatDuration(resolutionMinutes)}` }
    }
    return { status: 'resolved', label: 'Resolved' }
  }

  const minutesRemaining = getMinutesRemaining(slaDueAt)
  const totalWindow = SLA_WINDOWS[priority || ''] || 10080

  if (minutesRemaining <= 0) {
    return { status: 'breached', label: `BREACHED ${formatDuration(minutesRemaining)}` }
  }

  const percentRemaining = (minutesRemaining / totalWindow) * 100

  if (percentRemaining <= 10) {
    return { status: 'red', label: formatDuration(minutesRemaining) }
  }
  if (percentRemaining <= 50) {
    return { status: 'amber', label: formatDuration(minutesRemaining) }
  }
  return { status: 'green', label: formatDuration(minutesRemaining) }
}

const statusStyles: Record<SlaStatus, string> = {
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400 font-semibold',
  breached: 'bg-red-500/15 text-red-600 dark:text-red-400 font-bold',
  resolved: 'bg-muted text-muted-foreground',
}

export function SlaBadge({ slaDueAt, resolvedAt, priority, dateLogged, archived, ticketStatus, className }: SlaBadgeProps) {
  if (!slaDueAt) return null

  // Archived without resolution — no badge
  if (archived && !resolvedAt) return null

  // Ticket is closed/completed but resolved_at was never set — show "Resolved" without time
  const isClosed = ticketStatus?.toLowerCase() === 'closed'
  if (isClosed && !resolvedAt) {
    return (
      <span className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs whitespace-nowrap',
        statusStyles.resolved,
        className,
      )}>
        Resolved
      </span>
    )
  }

  const { status, label } = getSlaStatus(slaDueAt, resolvedAt, priority, dateLogged)

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs whitespace-nowrap',
      statusStyles[status],
      className,
    )}>
      {label}
    </span>
  )
}
