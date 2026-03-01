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

// All badges use outline style: border + colored text, no fill
const badgeStyles: Record<string, { border: string; text: string }> = {
  // Ticket statuses
  open:   { border: 'border-blue-400 dark:border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  closed: { border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-500 dark:text-gray-400' },

  // Job stages
  created:             { border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-500 dark:text-slate-400' },
  contractor_notified: { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  quote_received:      { border: 'border-orange-400 dark:border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  pm_approved:         { border: 'border-amber-400 dark:border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  ll_approved:         { border: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  booked:              { border: 'border-teal-400 dark:border-teal-500', text: 'text-teal-600 dark:text-teal-400' },
  scheduled:           { border: 'border-purple-400 dark:border-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  reminder_sent:       { border: 'border-indigo-400 dark:border-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  completed:           { border: 'border-green-400 dark:border-green-500', text: 'text-green-600 dark:text-green-400' },

  // Priority (green→yellow→amber→orange→red progression)
  low:         { border: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  medium:      { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  high:        { border: 'border-amber-400 dark:border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  urgent:      { border: 'border-orange-500 dark:border-orange-400', text: 'text-orange-600 dark:text-orange-400' },
  emergency:   { border: 'border-red-600 dark:border-red-500', text: 'text-red-700 dark:text-red-300' },
  // Legacy priority names (backward compat with existing DB records)
  cosmetic:    { border: 'border-emerald-400 dark:border-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  damaging:    { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  destructive: { border: 'border-orange-400 dark:border-orange-500', text: 'text-orange-600 dark:text-orange-400' },

  // Display stages
  'awaiting contractor': { border: 'border-amber-400 dark:border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  'awaiting manager':    { border: 'border-blue-400 dark:border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  'awaiting landlord':   { border: 'border-violet-400 dark:border-violet-500', text: 'text-violet-600 dark:text-violet-400' },
  sent:                  { border: 'border-yellow-400 dark:border-yellow-500', text: 'text-yellow-600 dark:text-yellow-400' },
  'booking sent':        { border: 'border-cyan-400 dark:border-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
  'awaiting booking':    { border: 'border-indigo-400 dark:border-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  'not completed':       { border: 'border-red-400 dark:border-red-500', text: 'text-red-600 dark:text-red-400' },
  'handoff':             { border: 'border-red-400 dark:border-red-500', text: 'text-red-600 dark:text-red-400' },
  'ooh dispatched':      { border: 'border-purple-400 dark:border-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  'no contractors':      { border: 'border-orange-400 dark:border-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  'landlord declined':   { border: 'border-red-400 dark:border-red-500', text: 'text-red-600 dark:text-red-400' },
  'landlord no response':{ border: 'border-amber-400 dark:border-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  'on hold':             { border: 'border-gray-400 dark:border-gray-500', text: 'text-gray-500 dark:text-gray-400' },
  'dismissed':           { border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-500 dark:text-gray-400' },
  'archived':            { border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-400 dark:text-gray-500' },

  // Conversation stages
  greeting:                { border: 'border-blue-400 dark:border-blue-500', text: 'text-blue-600 dark:text-blue-400' },
  address_collection:      { border: 'border-cyan-400 dark:border-cyan-500', text: 'text-cyan-600 dark:text-cyan-400' },
  issue_collection:        { border: 'border-indigo-400 dark:border-indigo-500', text: 'text-indigo-600 dark:text-indigo-400' },
  availability_collection: { border: 'border-violet-400 dark:border-violet-500', text: 'text-violet-600 dark:text-violet-400' },

  // Default
  default: { border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-500 dark:text-gray-400' },
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
  const style = badgeStyles[key] || badgeStyles.default
  const priorityDesc = PRIORITY_DESCRIPTIONS[status] || PRIORITY_DESCRIPTIONS[status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()]

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border bg-transparent',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        style.border,
        style.text,
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
