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
  open:   { border: 'border-primary/40',  text: 'text-primary' },
  closed: { border: 'border-border',      text: 'text-muted-foreground' },

  // Job stages
  created:             { border: 'border-border',       text: 'text-muted-foreground' },
  contractor_notified: { border: 'border-warning/40',   text: 'text-warning' },
  quote_received:      { border: 'border-warning/60',   text: 'text-warning' },
  pm_approved:         { border: 'border-warning/40',   text: 'text-warning' },
  ll_approved:         { border: 'border-success/40',   text: 'text-success' },
  booked:              { border: 'border-primary/40',   text: 'text-primary' },
  scheduled:           { border: 'border-primary/60',   text: 'text-primary' },
  reminder_sent:       { border: 'border-primary/40',   text: 'text-primary' },
  completed:           { border: 'border-success/40',   text: 'text-success' },

  // Priority (low→medium→high→urgent→emergency progression)
  low:         { border: 'border-success/40',  text: 'text-success' },
  medium:      { border: 'border-warning/40',  text: 'text-warning' },
  high:        { border: 'border-warning/60',  text: 'text-warning' },
  urgent:      { border: 'border-danger/60',   text: 'text-danger' },
  emergency:   { border: 'border-danger',      text: 'text-danger' },
  // Legacy priority names (backward compat with existing DB records)
  cosmetic:    { border: 'border-success/40',  text: 'text-success' },
  damaging:    { border: 'border-warning/40',  text: 'text-warning' },
  destructive: { border: 'border-danger/60',   text: 'text-danger' },

  // Display stages
  'awaiting contractor':  { border: 'border-warning/40',  text: 'text-warning' },
  'awaiting manager':     { border: 'border-primary/40',  text: 'text-primary' },
  'awaiting landlord':    { border: 'border-primary/60',  text: 'text-primary' },
  sent:                   { border: 'border-warning/40',  text: 'text-warning' },
  'booking sent':         { border: 'border-primary/40',  text: 'text-primary' },
  'awaiting booking':     { border: 'border-primary/40',  text: 'text-primary' },
  'not completed':        { border: 'border-danger/40',   text: 'text-danger' },
  'handoff':              { border: 'border-danger/40',   text: 'text-danger' },
  'ooh dispatched':       { border: 'border-primary/60',  text: 'text-primary' },
  'ooh resolved':         { border: 'border-success/40',  text: 'text-success' },
  'ooh unresolved':       { border: 'border-danger/40',   text: 'text-danger' },
  'ooh in progress':      { border: 'border-warning/40',  text: 'text-warning' },
  'no contractors':       { border: 'border-danger/40',   text: 'text-danger' },
  'landlord declined':    { border: 'border-danger/40',   text: 'text-danger' },
  'landlord no response': { border: 'border-warning/40',  text: 'text-warning' },
  'landlord managing':    { border: 'border-primary/60',  text: 'text-primary' },
  'landlord needs help':  { border: 'border-danger/40',   text: 'text-danger' },
  'landlord in progress': { border: 'border-warning/40',  text: 'text-warning' },
  'landlord resolved':    { border: 'border-success/40',  text: 'text-success' },
  'reschedule requested': { border: 'border-warning/40',  text: 'text-warning' },
  'job not completed':    { border: 'border-danger/40',   text: 'text-danger' },
  'on hold':              { border: 'border-border',       text: 'text-muted-foreground' },
  'dismissed':            { border: 'border-border',       text: 'text-muted-foreground' },
  'archived':             { border: 'border-border',       text: 'text-muted-foreground' },

  // Conversation stages
  greeting:                { border: 'border-primary/40',  text: 'text-primary' },
  address_collection:      { border: 'border-primary/40',  text: 'text-primary' },
  issue_collection:        { border: 'border-primary/40',  text: 'text-primary' },
  availability_collection: { border: 'border-primary/60',  text: 'text-primary' },

  // Compliance certificate statuses
  valid:             { border: 'border-success/40',  text: 'text-success' },
  expiring:          { border: 'border-warning/40',  text: 'text-warning' },
  'expiring soon':   { border: 'border-warning/40',  text: 'text-warning' },
  expired:           { border: 'border-danger/40',   text: 'text-danger' },
  missing:           { border: 'border-border',      text: 'text-muted-foreground' },
  incomplete:        { border: 'border-warning/40',  text: 'text-warning' },
  review:            { border: 'border-primary/40',  text: 'text-primary' },
  verified:          { border: 'border-success/40',  text: 'text-success' },
  'renewal requested': { border: 'border-warning/40',  text: 'text-warning' },
  'renewal scheduled': { border: 'border-primary/40', text: 'text-primary' },
  'awaiting dispatch':   { border: 'border-warning/40',  text: 'text-warning' },
  'awaiting approval':   { border: 'border-warning/40',  text: 'text-warning' },
  'unknown category':    { border: 'border-danger',       text: 'text-danger' },

  // Rent statuses
  'rent overdue':         { border: 'border-danger/40',   text: 'text-danger' },
  'rent partial payment': { border: 'border-warning/40',  text: 'text-warning' },
  'partial payment':      { border: 'border-warning/40',  text: 'text-warning' },
  'rent cleared':         { border: 'border-success/40',  text: 'text-success' },
  'rent arrears':         { border: 'border-danger/40',   text: 'text-danger' },

  // Compliance ticket statuses
  'compliance pending':   { border: 'border-warning/40',  text: 'text-warning' },
  'cert renewed':         { border: 'border-success/40',  text: 'text-success' },
  'compliance renewal':   { border: 'border-warning/40',  text: 'text-warning' },

  // Default
  default: { border: 'border-border', text: 'text-muted-foreground' },
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b(pm|ll|ooh|sla)\b/gi, (m) => m.toUpperCase()) // Keep PM, LL, OOH, SLA as uppercase acronyms
    .replace(/\b\w/g, (l) => l.toUpperCase())
}

export function StatusBadge({ status, variant = 'default', size = 'sm', className }: StatusBadgeProps) {
  const key = status.toLowerCase().replace(/_/g, ' ')
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
