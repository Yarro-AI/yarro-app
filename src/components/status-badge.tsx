'use client'

import { cn } from '@/lib/utils'

type StatusBadgeProps = {
  status: string
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md'
  className?: string
}

const statusColors: Record<string, { bg: string; text: string; dot: string; hideDot?: boolean }> = {
  // Ticket statuses
  open: { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  closed: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },

  // Job stages
  created: { bg: 'bg-slate-500/10 dark:bg-slate-400/15', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400' },
  contractor_notified: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  quote_received: { bg: 'bg-orange-500/10 dark:bg-orange-400/15', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  pm_approved: { bg: 'bg-amber-500/10 dark:bg-amber-400/15', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500' },
  ll_approved: { bg: 'bg-emerald-500/10 dark:bg-emerald-400/15', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  booked: { bg: 'bg-teal-500/10 dark:bg-teal-400/15', text: 'text-teal-700 dark:text-teal-400', dot: 'bg-teal-500', hideDot: true },
  scheduled: { bg: 'bg-purple-500/10 dark:bg-purple-400/15', text: 'text-purple-700 dark:text-purple-400', dot: 'bg-purple-500' },
  reminder_sent: { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500' },
  completed: { bg: 'bg-green-500/10 dark:bg-green-400/15', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500', hideDot: true },

  // Priority (new v2 values)
  emergency: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  urgent: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  destructive: { bg: 'bg-orange-500/10 dark:bg-orange-400/15', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  damaging: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  cosmetic: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  // Legacy (old tickets still in DB)
  high: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  medium: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  low: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },

  // Conversation stages
  greeting: { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  address_collection: { bg: 'bg-cyan-500/10 dark:bg-cyan-400/15', text: 'text-cyan-700 dark:text-cyan-400', dot: 'bg-cyan-500' },
  issue_collection: { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-700 dark:text-indigo-400', dot: 'bg-indigo-500' },
  availability_collection: { bg: 'bg-violet-500/10 dark:bg-violet-400/15', text: 'text-violet-700 dark:text-violet-400', dot: 'bg-violet-500' },
  handoff: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },

  // Default
  default: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b(pm|ll)\b/gi, (m) => m.toUpperCase()) // Keep PM, LL as uppercase acronyms
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function StatusBadge({ status, variant = 'default', size = 'sm', className }: StatusBadgeProps) {
  const colors = statusColors[status.toLowerCase()] || statusColors.default

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        colors.bg,
        colors.text,
        className
      )}
    >
      {!colors.hideDot && <span className={cn('h-1.5 w-1.5 rounded-full', colors.dot)} />}
      {formatStatus(status)}
    </span>
  )
}
