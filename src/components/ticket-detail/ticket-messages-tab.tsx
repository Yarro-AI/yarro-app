'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import {
  Wrench,
  User,
  Building2,
  Phone,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Bell,
  AlertTriangle,
} from 'lucide-react'
import type { OutboundLogEntry } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'

// ─── Message type config ───

interface MessageTypeConfig {
  label: string
  phase: 'dispatch' | 'approval' | 'booking' | 'completion'
  isFollowUp?: boolean
  isEscalation?: boolean
}

const MESSAGE_TYPES: Record<string, MessageTypeConfig> = {
  pm_ticket_created: { label: 'Manager Notified', phase: 'dispatch' },
  ll_ticket_created: { label: 'Landlord Notified', phase: 'dispatch' },
  pm_handoff: { label: 'Handoff — Manager Alerted', phase: 'dispatch', isEscalation: true },
  contractor_dispatch: { label: 'Contractor Dispatched', phase: 'dispatch' },
  contractor_reminder: { label: 'Contractor Reminder', phase: 'dispatch', isFollowUp: true },
  no_more_contractors: { label: 'No Contractors Available', phase: 'dispatch', isEscalation: true },
  pm_quote: { label: 'Quote Sent to Manager', phase: 'approval' },
  landlord_quote: { label: 'Quote Sent to Landlord', phase: 'approval' },
  landlord_followup: { label: 'Landlord Follow-up', phase: 'approval', isFollowUp: true },
  pm_landlord_timeout: { label: 'Landlord Timeout Alert', phase: 'approval', isEscalation: true },
  pm_landlord_approved: { label: 'Landlord Approved', phase: 'approval' },
  landlord_declined: { label: 'Landlord Declined', phase: 'approval', isEscalation: true },
  contractor_job_schedule: { label: 'Contractor Booking Sent', phase: 'booking' },
  contractor_job_confirmed: { label: 'Contractor Confirmed Slot', phase: 'booking' },
  tenant_job_booked: { label: 'Job Booked — Tenant', phase: 'booking' },
  pm_job_booked: { label: 'Job Booked — Manager', phase: 'booking' },
  landlord_job_booked: { label: 'Job Booked — Landlord', phase: 'booking' },
  contractor_job_reminder: { label: 'Outcome Form Reminder', phase: 'completion' },
  contractor_completion_reminder: { label: 'Completion Reminder', phase: 'completion', isFollowUp: true },
  pm_completion_overdue: { label: 'Completion Overdue', phase: 'completion', isEscalation: true },
  pm_job_completed: { label: 'Job Completed — Manager', phase: 'completion' },
  pm_job_not_completed: { label: 'Job Not Completed — Manager', phase: 'completion', isEscalation: true },
  ll_job_completed: { label: 'Job Completed — Landlord', phase: 'completion' },
}

// ─── Role config ───

interface RoleConfig {
  icon: typeof Wrench
  color: string
  dotBg: string
  label: string
}

const ROLE_CONFIG: Record<string, RoleConfig> = {
  contractor: {
    icon: Wrench,
    color: 'text-blue-600 dark:text-blue-400',
    dotBg: 'bg-blue-500/10 dark:bg-blue-400/15',
    label: 'Contractor',
  },
  manager: {
    icon: User,
    color: 'text-violet-600 dark:text-violet-400',
    dotBg: 'bg-violet-500/10 dark:bg-violet-400/15',
    label: 'Manager',
  },
  landlord: {
    icon: Building2,
    color: 'text-amber-600 dark:text-amber-400',
    dotBg: 'bg-amber-500/10 dark:bg-amber-400/15',
    label: 'Landlord',
  },
  tenant: {
    icon: Phone,
    color: 'text-emerald-600 dark:text-emerald-400',
    dotBg: 'bg-emerald-500/10 dark:bg-emerald-400/15',
    label: 'Tenant',
  },
}

// ─── Phase badge config ───

const PHASE_BADGE: Record<string, { label: string; className: string }> = {
  dispatch: { label: 'dispatch', className: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  approval: { label: 'approval', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-400' },
  booking: { label: 'booking', className: 'bg-green-500/10 text-green-700 dark:text-green-400' },
  completion: { label: 'completion', className: 'bg-orange-500/10 text-orange-700 dark:text-orange-400' },
}

// ─── Format WhatsApp-style body ───

function formatBody(body: string): string {
  return body
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

// ─── Component ───

interface TicketMessagesTabProps {
  outboundLog: OutboundLogEntry[]
}

export function TicketMessagesTab({ outboundLog }: TicketMessagesTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (outboundLog.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No messages sent yet</p>
          <p className="text-xs mt-1 opacity-60">Outbound messages will appear here as the ticket progresses</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {outboundLog.map((entry, index) => {
        const typeConfig = MESSAGE_TYPES[entry.message_type]
        const roleConfig = ROLE_CONFIG[entry.recipient_role] || ROLE_CONFIG.contractor
        const RoleIcon = roleConfig.icon
        const isOpen = expanded.has(entry.id)
        const isLast = index === outboundLog.length - 1
        const isFollowUp = typeConfig?.isFollowUp
        const isEscalation = typeConfig?.isEscalation
        const phase = typeConfig?.phase || 'dispatch'
        const phaseBadge = PHASE_BADGE[phase]

        return (
          <div
            key={entry.id}
            className={cn('flex gap-3', (isFollowUp || isEscalation) && 'ml-5')}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
                isEscalation
                  ? 'bg-red-500/10 dark:bg-red-400/15'
                  : roleConfig.dotBg
              )}>
                {isEscalation ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                ) : isFollowUp ? (
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <RoleIcon className={cn('h-3.5 w-3.5', roleConfig.color)} />
                )}
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/50" />}
            </div>

            {/* Content */}
            <div className={cn('pb-3 min-w-0 flex-1', !isLast && 'pb-4')}>
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full text-left group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">
                        {typeConfig?.label || entry.message_type.replace(/_/g, ' ')}
                      </p>
                      {(isFollowUp || isEscalation) && (
                        <span className={cn(
                          'px-1.5 py-0.5 text-[10px] rounded-full font-medium',
                          isEscalation
                            ? 'bg-red-500/10 text-red-700 dark:text-red-400'
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {isEscalation ? 'escalation' : 'follow-up'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={cn(
                        'px-1.5 py-0.5 text-[10px] rounded-full font-medium',
                        roleConfig.dotBg, roleConfig.color
                      )}>
                        {roleConfig.label}
                      </span>
                      {phaseBadge && (
                        <span className={cn(
                          'px-1.5 py-0.5 text-[10px] rounded-full font-medium',
                          phaseBadge.className
                        )}>
                          {phaseBadge.label}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/60">
                        {format(new Date(entry.sent_at), 'dd MMM, HH:mm')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    <span className={cn(
                      'px-1.5 py-0.5 text-[10px] rounded-full',
                      entry.status === 'delivered' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                      entry.status === 'sent' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                      entry.status === 'queued' ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' :
                      entry.status === 'failed' ? 'bg-red-500/10 text-red-700 dark:text-red-400' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {entry.status || 'sent'}
                    </span>
                    {entry.body && (
                      isOpen
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded body */}
              {isOpen && entry.body && (
                <div className="mt-2 rounded-lg bg-muted/30 border px-3 py-2.5">
                  <p
                    className="text-xs text-foreground/80 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: formatBody(entry.body) }}
                  />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
