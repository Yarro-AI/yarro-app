'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import {
  Wrench,
  User,
  Building2,
  Phone,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Bell,
  MessageCircle,
  ArrowDownLeft,
} from 'lucide-react'
import type { MessageData, OutboundLogEntry } from '@/hooks/use-ticket-detail'
import { getContractors, getRecipient } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'

// ─── Config ───

const ROLE_ICONS: Record<string, typeof Wrench> = {
  contractor: Wrench,
  manager: User,
  landlord: Building2,
  tenant: Phone,
}

const ROLE_COLORS: Record<string, string> = {
  contractor: 'text-blue-500',
  manager: 'text-violet-500',
  landlord: 'text-amber-500',
  tenant: 'text-emerald-500',
}

const ROLE_DOT_BG: Record<string, string> = {
  contractor: 'bg-blue-500/10',
  manager: 'bg-violet-500/10',
  landlord: 'bg-amber-500/10',
  tenant: 'bg-emerald-500/10',
}

const TYPE_LABELS: Record<string, string> = {
  contractor_dispatch: 'Contractor Dispatched',
  contractor_reminder: 'Contractor Reminder',
  no_contractors_left: 'No Contractors Available',
  pm_quote: 'Quote Sent to Manager',
  landlord_quote: 'Quote Sent to Landlord',
  landlord_followup: 'Landlord Follow-up',
  pm_landlord_timeout: 'Landlord Timeout Alert',
  pm_landlord_approved: 'Landlord Approved — PM Notified',
  tenant_job_booked: 'Job Booked — Tenant',
  pm_job_booked: 'Job Booked — Manager',
  landlord_job_booked: 'Job Booked — Landlord',
  contractor_job_reminder: 'Job Reminder',
  contractor_completion_reminder: 'Completion Reminder',
  pm_completion_overdue: 'Completion Overdue',
  contractor_reply: 'Contractor Quoted',
  manager_reply: 'Manager Responded',
  landlord_reply: 'Landlord Responded',
}

const INTERACTION_TYPES = new Set(['contractor_dispatch', 'pm_quote', 'landlord_quote'])
const FOLLOWUP_TYPES = new Set(['contractor_reminder', 'landlord_followup', 'contractor_completion_reminder'])
const ESCALATION_TYPES = new Set(['pm_landlord_timeout', 'pm_completion_overdue', 'no_contractors_left'])

// ─── Timeline types ───

interface TimelineItem {
  id: string
  timestamp: string
  direction: 'outbound' | 'inbound'
  messageType: string
  role: string
  label: string
  sublabel?: string
  body?: string | null
  status?: string | null
  isInteraction: boolean
  isFollowUp: boolean
  isEscalation: boolean
  badge?: { text: string; color: string }
}

// ─── Build unified timeline ───

function buildTimeline(messages: MessageData | null, outboundLog: OutboundLogEntry[]): TimelineItem[] {
  const items: TimelineItem[] = []
  const logTypePhones = new Set(outboundLog.map(e => `${e.message_type}:${e.recipient_phone}`))

  // 1. All outbound log entries
  for (const entry of outboundLog) {
    const item: TimelineItem = {
      id: entry.id,
      timestamp: entry.sent_at,
      direction: 'outbound',
      messageType: entry.message_type,
      role: entry.recipient_role,
      label: TYPE_LABELS[entry.message_type] || entry.message_type.replace(/_/g, ' '),
      body: entry.body,
      status: entry.status,
      isInteraction: INTERACTION_TYPES.has(entry.message_type),
      isFollowUp: FOLLOWUP_TYPES.has(entry.message_type),
      isEscalation: ESCALATION_TYPES.has(entry.message_type),
    }

    // Enrich contractor entries with name from JSONB
    if (messages && entry.recipient_role === 'contractor') {
      const contractors = getContractors(messages.contractors)
      const match = contractors.find(c => c.phone === entry.recipient_phone)
      if (match) {
        item.sublabel = `${match.name}${match.category ? ` · ${match.category}` : ''}`
      }
    }

    items.push(item)
  }

  // 2. Synthetic entries from JSONB (where not in outbound log)
  if (messages) {
    const contractors = getContractors(messages.contractors)
    for (const c of contractors) {
      // Synthetic dispatch
      if (c.sent_at && !logTypePhones.has(`contractor_dispatch:${c.phone}`)) {
        items.push({
          id: `synth-dispatch-${c.id}`,
          timestamp: c.sent_at,
          direction: 'outbound',
          messageType: 'contractor_dispatch',
          role: 'contractor',
          label: 'Contractor Dispatched',
          sublabel: `${c.name}${c.category ? ` · ${c.category}` : ''}`,
          body: c.body || null,
          isInteraction: true,
          isFollowUp: false,
          isEscalation: false,
        })
      }

      // Contractor reply (always synthetic — inbound)
      if (c.replied_at) {
        items.push({
          id: `synth-reply-${c.id}`,
          timestamp: c.replied_at,
          direction: 'inbound',
          messageType: 'contractor_reply',
          role: 'contractor',
          label: `${c.name} quoted${c.quote_amount ? ` ${c.quote_amount}` : ''}`,
          sublabel: c.quote_notes || undefined,
          isInteraction: false,
          isFollowUp: false,
          isEscalation: false,
          badge: c.manager_decision === 'approved'
            ? { text: `Approved${c.quote_amount ? ` ${c.quote_amount}` : ''}`, color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
            : { text: `Quoted${c.quote_amount ? ` ${c.quote_amount}` : ''}`, color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
        })
      }
    }

    const manager = getRecipient(messages.manager)
    if (manager) {
      if (manager.review_request_sent_at && !logTypePhones.has(`pm_quote:${manager.phone}`)) {
        items.push({
          id: 'synth-pm-quote',
          timestamp: manager.review_request_sent_at,
          direction: 'outbound',
          messageType: 'pm_quote',
          role: 'manager',
          label: 'Quote Sent to Manager',
          body: manager.last_outbound_body || null,
          isInteraction: true,
          isFollowUp: false,
          isEscalation: false,
        })
      }
      if (manager.replied_at) {
        items.push({
          id: 'synth-manager-reply',
          timestamp: manager.replied_at,
          direction: 'inbound',
          messageType: 'manager_reply',
          role: 'manager',
          label: manager.approval ? 'Manager Approved' : manager.approval === false ? 'Manager Declined' : 'Manager Replied',
          isInteraction: false,
          isFollowUp: false,
          isEscalation: false,
          badge: manager.approval
            ? { text: `Approved${manager.approval_amount ? ` ${manager.approval_amount}` : ''}`, color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
            : manager.approval === false
            ? { text: 'Declined', color: 'bg-red-500/10 text-red-700 dark:text-red-400' }
            : { text: 'Replied', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
        })
      }
    }

    const landlord = getRecipient(messages.landlord)
    if (landlord) {
      if (landlord.review_request_sent_at && !logTypePhones.has(`landlord_quote:${landlord.phone}`)) {
        items.push({
          id: 'synth-ll-quote',
          timestamp: landlord.review_request_sent_at,
          direction: 'outbound',
          messageType: 'landlord_quote',
          role: 'landlord',
          label: 'Quote Sent to Landlord',
          body: landlord.last_outbound_body || null,
          isInteraction: true,
          isFollowUp: false,
          isEscalation: false,
        })
      }
      if (landlord.replied_at) {
        items.push({
          id: 'synth-landlord-reply',
          timestamp: landlord.replied_at,
          direction: 'inbound',
          messageType: 'landlord_reply',
          role: 'landlord',
          label: landlord.approval ? 'Landlord Approved' : landlord.approval === false ? 'Landlord Declined' : 'Landlord Replied',
          isInteraction: false,
          isFollowUp: false,
          isEscalation: false,
          badge: landlord.approval
            ? { text: 'Approved', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' }
            : landlord.approval === false
            ? { text: 'Declined', color: 'bg-red-500/10 text-red-700 dark:text-red-400' }
            : { text: 'Replied', color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
        })
      }
    }
  }

  // 3. Sort by timestamp
  items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  return items
}

function formatBody(body: string): string {
  return body
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

// ─── Component ───

interface TicketDispatchTabProps {
  messages: MessageData | null
  outboundLog: OutboundLogEntry[]
}

export function TicketDispatchTab({ messages, outboundLog }: TicketDispatchTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const timeline = useMemo(() => buildTimeline(messages, outboundLog), [messages, outboundLog])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (timeline.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="text-center">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No dispatch activity yet</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {timeline.map((item, index) => {
        const isLast = index === timeline.length - 1
        const isOpen = expanded.has(item.id)
        const RoleIcon = ROLE_ICONS[item.role] || MessageCircle
        const roleColor = ROLE_COLORS[item.role] || 'text-muted-foreground'
        const dotBg = ROLE_DOT_BG[item.role] || 'bg-muted'
        const isInbound = item.direction === 'inbound'

        return (
          <div
            key={item.id}
            className={cn(
              'flex gap-3',
              (isInbound || item.isFollowUp) && 'ml-5',
            )}
          >
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div className={cn(
                'rounded-full flex items-center justify-center shrink-0',
                item.isInteraction ? 'h-8 w-8' : 'h-7 w-7',
                item.isEscalation ? 'bg-red-500/10' : dotBg,
              )}>
                {item.isEscalation ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                ) : isInbound ? (
                  <ArrowDownLeft className={cn('h-3.5 w-3.5', roleColor)} />
                ) : item.isFollowUp ? (
                  <Bell className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <RoleIcon className={cn(item.isInteraction ? 'h-4 w-4' : 'h-3.5 w-3.5', roleColor)} />
                )}
              </div>
              {!isLast && <div className="w-px flex-1 bg-border/50" />}
            </div>

            {/* Content */}
            <div className={cn('min-w-0 flex-1', !isLast ? 'pb-4' : 'pb-1')}>
              {item.isInteraction ? (
                /* ─── INTERACTION CARD (bold, bordered) ─── */
                <div className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => item.body && toggle(item.id)}
                    className="w-full text-left p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.label}</p>
                        {item.sublabel && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.sublabel}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(item.timestamp), 'dd MMM, HH:mm')}
                        </span>
                        {item.body && (
                          isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isOpen && item.body && (
                    <div className="px-3 pb-3 border-t bg-muted/20">
                      <p
                        className="text-xs text-foreground/80 leading-relaxed pt-2"
                        dangerouslySetInnerHTML={{ __html: formatBody(item.body) }}
                      />
                    </div>
                  )}
                </div>

              ) : isInbound ? (
                /* ─── INBOUND REPLY ─── */
                <div className="py-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.badge && (
                        <span className={cn('px-1.5 py-0.5 text-[10px] rounded-full font-medium', item.badge.color)}>
                          {item.badge.text}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {format(new Date(item.timestamp), 'dd MMM, HH:mm')}
                    </span>
                  </div>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground mt-0.5 italic">&ldquo;{item.sublabel}&rdquo;</p>
                  )}
                </div>

              ) : (
                /* ─── NOTIFICATION (light, expandable) ─── */
                <div className="py-0.5">
                  <button
                    onClick={() => item.body && toggle(item.id)}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.isEscalation && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-red-500/10 text-red-700 dark:text-red-400">
                            escalation
                          </span>
                        )}
                        {item.isFollowUp && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-muted text-muted-foreground">
                            follow-up
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(item.timestamp), 'dd MMM, HH:mm')}
                        </span>
                        {item.body && (
                          isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isOpen && item.body && (
                    <div className="mt-2 rounded-lg bg-muted/30 border px-3 py-2.5">
                      <p
                        className="text-xs text-foreground/80 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: formatBody(item.body) }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
