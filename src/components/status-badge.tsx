'use client'

import { cn } from '@/lib/utils'
import { PRIORITY_DESCRIPTIONS } from '@/lib/constants'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type StatusBadgeProps = {
  status: string
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md'
  className?: string
}

const statusColors: Record<string, { bg: string; text: string }> = {
  // Ticket statuses
  open: { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-700 dark:text-blue-400' },
  closed: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400' },

  // Job stages
  created: { bg: 'bg-slate-500/10 dark:bg-slate-400/15', text: 'text-slate-600 dark:text-slate-400' },
  contractor_notified: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400' },
  quote_received: { bg: 'bg-orange-500/10 dark:bg-orange-400/15', text: 'text-orange-700 dark:text-orange-400' },
  pm_approved: { bg: 'bg-amber-500/10 dark:bg-amber-400/15', text: 'text-amber-700 dark:text-amber-400' },
  ll_approved: { bg: 'bg-emerald-500/10 dark:bg-emerald-400/15', text: 'text-emerald-700 dark:text-emerald-400' },
  booked: { bg: 'bg-teal-500/10 dark:bg-teal-400/15', text: 'text-teal-700 dark:text-teal-400' },
  scheduled: { bg: 'bg-purple-500/10 dark:bg-purple-400/15', text: 'text-purple-700 dark:text-purple-400' },
  reminder_sent: { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-700 dark:text-indigo-400' },
  completed: { bg: 'bg-green-500/10 dark:bg-green-400/15', text: 'text-green-700 dark:text-green-400' },

  // Legacy (old tickets still in DB)
  high: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400' },
  medium: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400' },
  low: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400' },

  // Display stages (derived from dashboard logic)
  'awaiting contractor': { bg: 'bg-amber-500/10 dark:bg-amber-400/15', text: 'text-amber-700 dark:text-amber-400' },
  'awaiting manager': { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-700 dark:text-blue-400' },
  'awaiting landlord': { bg: 'bg-violet-500/10 dark:bg-violet-400/15', text: 'text-violet-700 dark:text-violet-400' },
  sent: { bg: 'bg-yellow-500/10 dark:bg-yellow-400/15', text: 'text-yellow-700 dark:text-yellow-400' },
  'booking sent': { bg: 'bg-cyan-500/10 dark:bg-cyan-400/15', text: 'text-cyan-700 dark:text-cyan-400' },
  'awaiting booking': { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-700 dark:text-indigo-400' },
  'not completed': { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400' },

  // Conversation stages
  greeting: { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-700 dark:text-blue-400' },
  address_collection: { bg: 'bg-cyan-500/10 dark:bg-cyan-400/15', text: 'text-cyan-700 dark:text-cyan-400' },
  issue_collection: { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-700 dark:text-indigo-400' },
  availability_collection: { bg: 'bg-violet-500/10 dark:bg-violet-400/15', text: 'text-violet-700 dark:text-violet-400' },
  handoff: { bg: 'bg-red-500/10 dark:bg-red-400/15', text: 'text-red-700 dark:text-red-400' },

  // Default
  default: { bg: 'bg-gray-500/10 dark:bg-gray-400/15', text: 'text-gray-600 dark:text-gray-400' },
}

// Priority uses outline-only style, green→red scale (visually distinct from filled stage badges)
const priorityStyles: Record<string, { border: string; text: string }> = {
  cosmetic:    { border: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  damaging:    { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  destructive: { border: 'border-orange-400 dark:border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  urgent:      { border: 'border-red-400 dark:border-red-500', text: 'text-red-600 dark:text-red-400' },
  emergency:   { border: 'border-red-600 dark:border-red-400', text: 'text-red-700 dark:text-red-300' },
  // Legacy
  low:         { border: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  medium:      { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  high:        { border: 'border-red-400 dark:border-red-500', text: 'text-red-600 dark:text-red-400' },
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b(pm|ll)\b/gi, (m) => m.toUpperCase()) // Keep PM, LL as uppercase acronyms
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function StatusBadge({ status, variant = 'default', size = 'sm', className }: StatusBadgeProps) {
  const key = status.toLowerCase()
  const priorityStyle = priorityStyles[key]
  const priorityDesc = PRIORITY_DESCRIPTIONS[status] || PRIORITY_DESCRIPTIONS[status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()]

  // Priority badges: outline-only, no fill
  if (priorityStyle) {
    const badge = (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-medium rounded-full border bg-transparent',
          size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
          priorityStyle.border,
          priorityStyle.text,
          className
        )}
      >
        {formatStatus(status)}
      </span>
    )

    if (priorityDesc) {
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent><p className="text-xs">{priorityDesc}</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    return badge
  }

  // Stage/status badges: filled style
  const colors = statusColors[key] || statusColors.default
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
      {formatStatus(status)}
    </span>
  )
}
