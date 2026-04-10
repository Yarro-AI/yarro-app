'use client'

import { AlertTriangle, Clock, Pause, ShieldCheck } from 'lucide-react'
import { getReasonDisplay, getContextWithData, HANDOFF_REASON_DISPLAY } from '@/lib/reason-display'
import { cn } from '@/lib/utils'

interface StageCardProps {
  reason: string | null
  isStuck: boolean
  isOnHold: boolean
  handoffReason: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ticketData: Record<string, any>
}

function getStageIcon(reason: string | null, isStuck: boolean, isOnHold: boolean) {
  if (isOnHold) return { icon: Pause, bg: 'bg-muted', color: 'text-muted-foreground' }
  if (isStuck) return { icon: AlertTriangle, bg: 'bg-danger/10', color: 'text-danger' }
  // needs_action reasons
  const needsAction = ['new', 'pending_review', 'handoff_review', 'manager_approval', 'no_contractors',
    'landlord_declined', 'landlord_needs_help', 'landlord_resolved', 'ooh_resolved', 'ooh_unresolved',
    'job_not_completed', 'compliance_needs_dispatch', 'cert_incomplete', 'rent_overdue', 'rent_partial_payment']
  if (reason && needsAction.includes(reason)) return { icon: AlertTriangle, bg: 'bg-warning/10', color: 'text-warning' }
  // terminal
  if (reason === 'completed' || reason === 'cert_renewed' || reason === 'rent_cleared')
    return { icon: ShieldCheck, bg: 'bg-success/10', color: 'text-success' }
  // waiting / scheduled
  return { icon: Clock, bg: 'bg-primary/10', color: 'text-primary' }
}

export function StageCard({ reason, isStuck, isOnHold, handoffReason, ticketData }: StageCardProps) {
  const { label } = getReasonDisplay(reason, isStuck)
  const context = getContextWithData(reason, isStuck, ticketData)
  const displayLabel = isOnHold ? 'On hold' : label
  const displayContext = isOnHold ? 'Ticket paused — resume when ready' : context

  const { icon: Icon, bg, color } = getStageIcon(reason, isStuck, isOnHold)

  // Handoff reason shown immediately for handoff_review
  const handoffText = reason === 'handoff_review' && handoffReason
    ? HANDOFF_REASON_DISPLAY[handoffReason] || handoffReason.replace(/_/g, ' ')
    : null

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Current Stage</p>
      <div className="flex items-start gap-4">
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
          <Icon className={cn('w-5 h-5', color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{displayLabel}</p>
          {displayContext && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{displayContext}</p>
          )}
          {handoffText && (
            <p className="text-sm text-warning font-medium mt-2">{handoffText}</p>
          )}
        </div>
      </div>
    </div>
  )
}
