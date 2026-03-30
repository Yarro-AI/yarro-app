'use client'

import { useState, useMemo } from 'react'
import { ChatHistory } from '@/components/chat-message'
import { Phone, User, Mail } from 'lucide-react'
import { format } from 'date-fns'
import { formatPhoneDisplay } from '@/lib/normalize'
import { cn } from '@/lib/utils'
import type { ConversationData, OutboundLogEntry, MessageData } from '@/hooks/use-ticket-detail'
import { getLogEntries, getContractors } from '@/hooks/use-ticket-detail'

// ─── Stage labels for dividers ───
const STAGE_MAP: Record<string, string> = {
  pm_ticket_created: 'Ticket Created',
  pm_ticket_review: 'Ticket Created',
  ll_ticket_created: 'Ticket Created',
  pm_handoff: 'Handoff',
  ooh_emergency_dispatch: 'OOH Dispatch',
  contractor_dispatch: 'Dispatch',
  pm_quote: 'Quote Review',
  landlord_quote: 'Quote Approval',
  pm_landlord_approved: 'Quote Approved',
  landlord_declined: 'Quote Declined',
  landlord_followup: 'Follow-up',
  pm_landlord_timeout: 'Landlord Timeout',
  contractor_job_schedule: 'Job Booking',
  contractor_job_confirmed: 'Booking Confirmed',
  tenant_job_booked: 'Booking Confirmed',
  pm_job_booked: 'Booking Confirmed',
  ll_job_booked: 'Booking Confirmed',
  contractor_job_reminder: 'Day-of Reminder',
  tenant_job_reminder: 'Day-of Reminder',
  contractor_completion_reminder: 'Completion Reminder',
  pm_completion_overdue: 'Completion Overdue',
  pm_job_completed: 'Job Completed',
  pm_job_not_completed: 'Job Not Completed',
  ll_job_completed: 'Job Completed',
  tenant_job_completed: 'Job Completed',
  landlord_allocate: 'Allocated to Landlord',
  contractor_reschedule_request: 'Reschedule',
  tenant_reschedule_approved: 'Reschedule Approved',
  tenant_reschedule_declined: 'Reschedule Declined',
  pm_reschedule_approved: 'Reschedule Approved',
  tenant_portal_link: 'Portal Link Sent',
  contractor_reminder: 'Reminder',
  no_more_contractors: 'No Contractors Available',
}

type SubTab = 'tenant' | 'manager' | 'contractors' | 'landlord'

// ─── Unified thread message type ───
interface ThreadMessage {
  id: string
  sender: 'system' | 'inbound'
  senderName: string
  body: string
  timestamp: string
  stage?: string | null
  channel?: 'whatsapp' | 'email' | 'portal'
}

// ─── Parse flow reply JSON into clean text ───
function parseFlowReply(body: string): string | null {
  const flowMatch = body.match(/\(flow reply: ({.*})\)/)
  if (!flowMatch) return null
  try {
    const json = JSON.parse(flowMatch[1])
    const parts: string[] = []
    for (const page of json.pages || []) {
      for (const item of page.items || []) {
        const label = (item.label || '').replace(/_/g, ' ').replace(/\(£\)/g, '').trim()
        const value = item.value || ''
        if (label.toLowerCase().includes('decision')) {
          if (value.toLowerCase().includes('approve')) parts.push('Approved')
          else if (value.toLowerCase().includes('decline')) parts.push('Declined')
          else parts.push(value)
        } else if (label.toLowerCase().includes('markup') || label.toLowerCase().includes('charge')) {
          if (value && value !== '0') parts.push(`Markup: £${value}`)
        } else if (label.toLowerCase().includes('quote') || label.toLowerCase().includes('amount')) {
          parts.push(`Quote: £${value}`)
        } else if (label.toLowerCase().includes('note') || label.toLowerCase().includes('reason')) {
          if (value) parts.push(value)
        } else if (value) {
          parts.push(`${label}: ${value}`)
        }
      }
    }
    return parts.join(' · ') || null
  } catch {
    return null
  }
}

// ─── Format outbound body for display ───
function formatBody(entry: OutboundLogEntry): string {
  if (!entry.body) return `[${entry.message_type}]`

  // Parse flow replies
  if (entry.body.startsWith('(flow reply:')) {
    return parseFlowReply(entry.body) || entry.body
  }

  // Clean markdown bold and trim
  let text = entry.body.replace(/\*([^*]+)\*/g, '$1').trim()

  // Skip if just a bare keyword like "Approve"
  if (text.length < 2) return `[${entry.message_type}]`

  return text
}

function deriveChannel(templateSid: string | null): 'whatsapp' | 'email' | undefined {
  if (!templateSid) return undefined
  if (templateSid.startsWith('email:')) return 'email'
  if (templateSid.startsWith('HX')) return 'whatsapp'
  return undefined
}

// ─── Build unified thread from outbound log + inbound replies ───
function buildThread(
  outbound: OutboundLogEntry[],
  inboundReplies: { name: string; text: string; timestamp: string; channel?: 'whatsapp' | 'email' | 'portal' }[]
): ThreadMessage[] {
  const messages: ThreadMessage[] = []

  for (const entry of outbound) {
    // Skip outbound_reply — these are raw flow responses; inbound replies from
    // messages JSONB are cleaner and already added below
    if (entry.message_type === 'outbound_reply') continue

    messages.push({
      id: entry.id,
      sender: 'system',
      senderName: 'Yarro',
      body: formatBody(entry),
      timestamp: entry.sent_at,
      stage: STAGE_MAP[entry.message_type] || null,
      channel: deriveChannel(entry.template_sid),
    })
  }

  // Add inbound replies from messages JSONB
  for (const reply of inboundReplies) {
    messages.push({
      id: `reply-${reply.timestamp}`,
      sender: 'inbound',
      senderName: reply.name,
      body: reply.text,
      timestamp: reply.timestamp,
      channel: reply.channel,
    })
  }

  return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}

type InboundReply = { name: string; text: string; timestamp: string; channel?: 'whatsapp' | 'email' | 'portal' }

// ─── Extract inbound replies from messages data ───
function getContractorReplies(messages: MessageData | null, outboundLog: OutboundLogEntry[], scheduledDate?: string | null): InboundReply[] {
  if (!messages?.contractors) return []
  const contractors = getContractors(messages.contractors)
  const replies: InboundReply[] = []

  // Detect if contractor channel is email (check if dispatch was email)
  const dispatchEntry = outboundLog.find(e => e.message_type === 'contractor_dispatch' && e.recipient_role === 'contractor')
  const contractorChannel = dispatchEntry ? deriveChannel(dispatchEntry.template_sid) : undefined

  for (const c of contractors) {
    if (c.replied_at) {
      const parts: string[] = []
      if (c.quote_amount) parts.push(`Quote: ${c.quote_amount}`)
      if (c.quote_notes) parts.push(`Notes: ${c.quote_notes}`)
      // Skip reply_text if it's just a number (duplicates quote) or matches notes
      if (c.reply_text && c.reply_text !== c.quote_amount && c.reply_text !== c.quote_notes && !/^\d+(\.\d+)?$/.test(c.reply_text.trim())) {
        parts.push(c.reply_text)
      }
      replies.push({
        name: c.name || 'Contractor',
        text: parts.length > 0 ? parts.join(' · ') : 'Replied',
        timestamp: c.replied_at,
        channel: contractorChannel === 'email' ? 'portal' : undefined,
      })
    }
  }

  // Add scheduling submission if contractor booked via portal
  if (scheduledDate) {
    // Find the booking confirmation outbound (sent after contractor booked)
    const bookingConfirm = outboundLog.find(e =>
      e.recipient_role === 'tenant' && e.message_type === 'tenant_job_booked'
    )
    if (bookingConfirm) {
      // Contractor submitted their booking just before the confirmations went out
      const bookTime = new Date(bookingConfirm.sent_at)
      bookTime.setSeconds(bookTime.getSeconds() - 2)
      const contractorName = contractors[0]?.name || 'Contractor'
      replies.push({
        name: contractorName,
        text: (() => {
          const d = new Date(scheduledDate)
          const h = d.getHours()
          const slot = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
          return `Booked: ${format(d, 'dd MMM yyyy')} · ${slot}`
        })(),
        timestamp: bookTime.toISOString(),
        channel: contractorChannel === 'email' ? 'portal' : undefined,
      })
    }
  }

  return replies
}

function getManagerReplies(messages: MessageData | null): InboundReply[] {
  if (!messages?.manager) return []
  const mgr = messages.manager as Record<string, unknown>
  if (!mgr.replied_at) return []
  const parts: string[] = []
  if (mgr.approval === true) parts.push('Approved')
  else if (mgr.approval === false) parts.push('Declined')
  if (mgr.approval_amount) parts.push(`Markup: ${mgr.approval_amount}`)
  return [{
    name: 'Manager',
    text: parts.length > 0 ? parts.join(' · ') : 'Replied',
    timestamp: mgr.replied_at as string,
  }]
}

function getLandlordReplies(messages: MessageData | null): InboundReply[] {
  if (!messages?.landlord) return []
  const ll = messages.landlord as Record<string, unknown>
  if (!ll.replied_at) return []
  const parts: string[] = []
  if (ll.approval === true) parts.push('Approved')
  else if (ll.approval === false) parts.push('Declined')
  if (ll.reason && typeof ll.reason === 'string') parts.push(ll.reason)
  return [{
    name: 'Landlord',
    text: parts.length > 0 ? parts.join(' · ') : 'Replied',
    timestamp: ll.replied_at as string,
  }]
}

// ─── Thread renderer ───
function MessageThread({ thread }: { thread: ThreadMessage[] }) {
  if (thread.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <p className="text-sm">No messages yet</p>
      </div>
    )
  }

  let lastStage: string | null = null

  return (
    <div className="space-y-3">
      {thread.map((msg) => {
        const showDivider = msg.stage && msg.stage !== lastStage
        if (msg.stage) lastStage = msg.stage
        const isInbound = msg.sender === 'inbound'

        return (
          <div key={msg.id}>
            {showDivider && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{msg.stage}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <div className={cn('flex gap-3', isInbound && 'flex-row-reverse')}>
              <div className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
                isInbound ? 'bg-muted' : 'bg-primary'
              )}>
                {msg.channel === 'email' ? (
                  <Mail className={cn('w-3.5 h-3.5', isInbound ? 'text-foreground' : 'text-primary-foreground')} />
                ) : (
                  <span className={cn('text-[10px] font-bold', isInbound ? 'text-foreground' : 'text-primary-foreground')}>
                    {isInbound ? msg.senderName.charAt(0) : 'Y'}
                  </span>
                )}
              </div>
              <div className={cn('flex-1 min-w-0 space-y-1', isInbound && 'flex flex-col items-end')}>
                <div className={cn('flex items-center gap-1.5', isInbound && 'flex-row-reverse')}>
                  <span className="text-xs font-medium text-muted-foreground">{msg.senderName}</span>
                  {msg.channel === 'email' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">EMAIL</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/70">
                    {format(new Date(msg.timestamp), 'dd MMM, HH:mm')}
                  </span>
                </div>
                <div className={cn(
                  'px-3.5 py-2.5 text-sm whitespace-pre-wrap max-w-[85%]',
                  isInbound
                    ? 'rounded-2xl rounded-tr-sm bg-muted text-foreground'
                    : msg.channel === 'email'
                      ? 'rounded-2xl rounded-tl-sm bg-primary/80 text-primary-foreground border border-primary/20'
                      : 'rounded-2xl rounded-tl-sm bg-primary text-primary-foreground'
                )}>
                  {msg.body}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ───
interface TicketConversationTabProps {
  conversation: ConversationData | null
  outboundLog?: OutboundLogEntry[]
  messages?: MessageData | null
  scheduledDate?: string | null
}

export function TicketConversationTab({ conversation, outboundLog = [], messages = null, scheduledDate = null }: TicketConversationTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('tenant')

  const tenantMessages = useMemo(() => conversation ? getLogEntries(conversation.log) : [], [conversation])

  const tenantOutbound = useMemo(() =>
    outboundLog.filter(e => e.recipient_role === 'tenant' && e.message_type !== 'outbound_reply'),
    [outboundLog]
  )

  const managerThread = useMemo(() => buildThread(
    outboundLog.filter(e => e.recipient_role === 'manager'),
    getManagerReplies(messages)
  ), [outboundLog, messages])

  const contractorThread = useMemo(() => buildThread(
    outboundLog.filter(e => e.recipient_role === 'contractor'),
    getContractorReplies(messages, outboundLog, scheduledDate)
  ), [outboundLog, messages, scheduledDate])

  const landlordThread = useMemo(() => buildThread(
    outboundLog.filter(e => e.recipient_role === 'landlord'),
    getLandlordReplies(messages)
  ), [outboundLog, messages])

  const tenantThread = useMemo(() => buildThread(tenantOutbound, []), [tenantOutbound])

  const tabs: { key: SubTab; label: string; count: number }[] = [
    { key: 'tenant', label: 'Tenant', count: tenantMessages.length + tenantThread.length },
    { key: 'manager', label: 'Manager', count: managerThread.length },
    { key: 'contractors', label: 'Contractors', count: contractorThread.length },
    { key: 'landlord', label: 'Landlord', count: landlordThread.length },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs — flush with content, no extra border */}
      <div className="flex items-center gap-0.5 flex-shrink-0 mb-3">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors border-b-2',
              subTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 text-[10px] opacity-50">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 rounded-xl p-4">
        {subTab === 'tenant' && (
          <div>
            {tenantMessages.length > 0 && (
              <>
                <div className="flex items-center gap-3 pb-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">AI Conversation</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {conversation && (
                  <div className="flex items-center gap-3 mb-3">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">{formatPhoneDisplay(conversation.phone) || conversation.phone}</span>
                    {conversation.caller_name && (
                      <>
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{conversation.caller_name}</span>
                      </>
                    )}
                  </div>
                )}
                <ChatHistory messages={tenantMessages} />
              </>
            )}
            {tenantThread.length > 0 && (
              <div className={tenantMessages.length > 0 ? 'mt-4' : ''}>
                <MessageThread thread={tenantThread} />
              </div>
            )}
            {tenantMessages.length === 0 && tenantThread.length === 0 && (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <p className="text-sm">No tenant messages</p>
              </div>
            )}
          </div>
        )}

        {subTab === 'manager' && <MessageThread thread={managerThread} />}
        {subTab === 'contractors' && <MessageThread thread={contractorThread} />}
        {subTab === 'landlord' && <MessageThread thread={landlordThread} />}
      </div>
    </div>
  )
}
