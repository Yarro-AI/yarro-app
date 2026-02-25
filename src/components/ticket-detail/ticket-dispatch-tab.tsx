'use client'

import { useState, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { ChevronRight, ChevronDown, X, MessageCircle, Plus, Loader2 } from 'lucide-react'
import { ChatHistory } from '@/components/chat-message'
import type { MessageData, OutboundLogEntry } from '@/hooks/use-ticket-detail'
import { getContractors, getRecipient, getContractorStatus, formatAmount } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { toast } from 'sonner'

// ─── Config ───

const TYPE_LABELS: Record<string, string> = {
  pm_ticket_created: 'Manager Notified',
  ll_ticket_created: 'Landlord Notified',
  pm_handoff: 'Handoff — Manager Alerted',
  contractor_job_schedule: 'Contractor Booking Sent',
  contractor_job_confirmed: 'Contractor Confirmed Slot',
  landlord_declined: 'Landlord Declined',
  tenant_job_booked: 'Tenant Notified',
  pm_job_booked: 'Manager Notified',
  landlord_job_booked: 'Landlord Notified',
  contractor_job_reminder: 'Day-of Reminder',
  contractor_completion_reminder: 'Completion Reminder',
  pm_completion_overdue: 'Completion Overdue',
  pm_job_completed: 'Job Completed — Manager Notified',
  pm_job_not_completed: 'Job Not Completed — Manager Alerted',
  ll_job_completed: 'Job Completed — Landlord Notified',
}

const TICKET_CREATED_LOG_TYPES = new Set(['pm_ticket_created', 'll_ticket_created'])
const HANDOFF_LOG_TYPES = new Set(['pm_handoff'])
const CONTRACTOR_LOG_TYPES = new Set(['contractor_dispatch', 'contractor_reminder', 'no_more_contractors'])
const MANAGER_LOG_TYPES = new Set(['pm_quote'])
const LANDLORD_LOG_TYPES = new Set(['landlord_quote', 'landlord_followup', 'pm_landlord_timeout', 'pm_landlord_approved', 'landlord_declined'])
const BOOKING_LOG_TYPES = new Set(['contractor_job_schedule', 'contractor_job_confirmed', 'tenant_job_booked', 'pm_job_booked', 'landlord_job_booked'])
const FOLLOWUP_LOG_TYPES = new Set(['contractor_job_reminder', 'contractor_completion_reminder', 'pm_completion_overdue'])
const COMPLETION_LOG_TYPES = new Set(['pm_job_completed', 'pm_job_not_completed', 'll_job_completed'])

// ─── Types ───

type ChatMsg = { role: string; text: string; timestamp?: string; allowHtml?: boolean; meta?: { quote?: string; approved?: boolean; amount?: string } }

interface SubEntry {
  id: string
  label: string
  timestamp: string
  variant: 'reminder' | 'warning'
  chatMessages: ChatMsg[]
}

interface PurposeEntry {
  id: string
  phase: string
  label: string
  sublabel?: string
  status: string
  amount?: string
  timestamp: string
  isEscalation: boolean
  isCompleted?: boolean
  isRedispatchable?: boolean
  chatMessages: ChatMsg[]
  subEntries: SubEntry[]
}

// ─── Status badge styles ───

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  awaiting: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  quoted: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  completed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  declined: 'bg-red-500/10 text-red-700 dark:text-red-400',
  escalation: 'bg-red-500/10 text-red-700 dark:text-red-400',
}

// ─── Build purpose entries ───

function buildEntries(messages: MessageData | null, outboundLog: OutboundLogEntry[]): PurposeEntry[] {
  const entries: PurposeEntry[] = []

  const ticketCreatedLogs = outboundLog.filter(e => TICKET_CREATED_LOG_TYPES.has(e.message_type))
  const handoffLogs = outboundLog.filter(e => HANDOFF_LOG_TYPES.has(e.message_type))
  const contractorLogs = outboundLog.filter(e => CONTRACTOR_LOG_TYPES.has(e.message_type))
  const managerLogs = outboundLog.filter(e => MANAGER_LOG_TYPES.has(e.message_type))
  const landlordLogs = outboundLog.filter(e => LANDLORD_LOG_TYPES.has(e.message_type))
  const bookingLogs = outboundLog.filter(e => BOOKING_LOG_TYPES.has(e.message_type))
  const completionLogs = outboundLog.filter(e => COMPLETION_LOG_TYPES.has(e.message_type))
  const followupLogs = outboundLog.filter(e => FOLLOWUP_LOG_TYPES.has(e.message_type))

  // ─── Handoff: PM alerted for handoff tickets (before Ticket Created) ───
  for (const entry of handoffLogs) {
    entries.push({
      id: entry.id,
      phase: 'Handoff',
      label: TYPE_LABELS[entry.message_type] || entry.message_type,
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'escalation',
      timestamp: entry.sent_at,
      isEscalation: true,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── Ticket Created: PM + LL initial notifications (auto + manual + reviewed) ───
  const sortedCreatedLogs = [...ticketCreatedLogs].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
  for (const entry of sortedCreatedLogs) {
    entries.push({
      id: entry.id,
      phase: 'Ticket Created',
      label: TYPE_LABELS[entry.message_type] || entry.message_type,
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'sent',
      timestamp: entry.sent_at,
      isEscalation: false,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── Contractors: one row per contractor, reminders nested ───
  if (messages) {
    const contractors = getContractors(messages.contractors)
    for (const c of contractors) {
      const rawStatus = getContractorStatus(c)
      const status = rawStatus === 'approved' ? 'approved' : rawStatus === 'replied' ? 'quoted' : rawStatus === 'sent' ? 'sent' : 'pending'
      const myLogs = contractorLogs.filter(e => e.recipient_phone === c.phone)

      // Primary chat: dispatch + reply only
      const chatMsgs: ChatMsg[] = []
      const dispatchLog = myLogs.find(e => e.message_type === 'contractor_dispatch')
      const dispatchBody = dispatchLog?.body || c.body
      if (dispatchBody) chatMsgs.push({ role: 'assistant', text: dispatchBody, timestamp: dispatchLog?.sent_at || c.sent_at, allowHtml: true })
      if (c.reply_text) {
        chatMsgs.push({
          role: 'contractor', text: c.reply_text, timestamp: c.replied_at,
          meta: c.quote_amount ? { quote: formatAmount(c.quote_amount), approved: c.manager_decision === 'approved' } : undefined,
        })
      }

      // Sub-entries: reminders
      const reminderLogs = myLogs.filter(e => e.message_type === 'contractor_reminder')
      const subEntries: SubEntry[] = reminderLogs.map((r, i) => ({
        id: `${c.id}-reminder-${i}`,
        label: 'Reminder sent',
        timestamp: r.sent_at,
        variant: 'reminder' as const,
        chatMessages: r.body ? [{ role: 'assistant', text: r.body, timestamp: r.sent_at, allowHtml: true }] : [],
      }))

      // Sublabel: category + sent time + quote notes
      const parts: string[] = []
      if (c.category) parts.push(c.category)
      if (c.sent_at) parts.push(format(new Date(c.sent_at), 'dd MMM, HH:mm'))
      if (c.quote_notes) parts.push(c.quote_notes)

      entries.push({
        id: `contractor-${c.id}`,
        phase: 'Contractor Quotes',
        label: c.name,
        sublabel: parts.join(' · '),
        status,
        amount: c.quote_amount ? formatAmount(c.quote_amount) : undefined,
        timestamp: c.sent_at || '',
        isEscalation: false,
        chatMessages: chatMsgs,
        subEntries,
      })
    }
  }

  // No contractors available
  for (const entry of contractorLogs.filter(e => e.message_type === 'no_more_contractors')) {
    entries.push({
      id: entry.id,
      phase: 'Contractor Quotes',
      label: 'No Contractors Available',
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'escalation',
      timestamp: entry.sent_at,
      isEscalation: true,
      isRedispatchable: true,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── Manager: one row, no sub-entries ───
  if (messages) {
    const manager = getRecipient(messages.manager)
    if (manager && (manager.review_request_sent_at || managerLogs.length > 0)) {
      const chatMsgs: ChatMsg[] = []
      for (const log of managerLogs) {
        if (log.body) chatMsgs.push({ role: 'assistant', text: log.body, timestamp: log.sent_at, allowHtml: true })
      }
      if (chatMsgs.length === 0 && manager.last_outbound_body) {
        chatMsgs.push({ role: 'assistant', text: manager.last_outbound_body, timestamp: manager.review_request_sent_at, allowHtml: true })
      }
      if (manager.last_text) {
        chatMsgs.push({
          role: 'manager', text: manager.last_text, timestamp: manager.replied_at,
          meta: { approved: manager.approval ?? undefined, amount: manager.approval_amount },
        })
      }

      const status = manager.approval !== undefined
        ? (manager.approval ? 'approved' : 'declined')
        : manager.replied_at ? 'quoted' : 'awaiting'

      entries.push({
        id: 'manager-approval',
        phase: 'Quote Approval',
        label: manager.name || 'Manager Approval',
        sublabel: manager.review_request_sent_at ? `Sent ${format(new Date(manager.review_request_sent_at), 'dd MMM, HH:mm')}` : undefined,
        status,
        amount: manager.approval_amount || undefined,
        timestamp: manager.review_request_sent_at || '',
        isEscalation: false,
        chatMessages: chatMsgs,
        subEntries: [],
      })
    }
  }

  // ─── Landlord: primary row = quote + reply, sub-entries = follow-ups + warnings ───
  if (messages) {
    const landlord = getRecipient(messages.landlord)
    if (landlord && (landlord.review_request_sent_at || landlordLogs.length > 0)) {
      // Primary chat: initial quote + reply only
      const chatMsgs: ChatMsg[] = []
      const quoteLogs = landlordLogs.filter(e => e.message_type === 'landlord_quote')
      for (const log of quoteLogs) {
        if (log.body) chatMsgs.push({ role: 'assistant', text: log.body, timestamp: log.sent_at, allowHtml: true })
      }
      if (chatMsgs.length === 0 && landlord.last_outbound_body) {
        chatMsgs.push({ role: 'assistant', text: landlord.last_outbound_body, timestamp: landlord.review_request_sent_at, allowHtml: true })
      }
      if (landlord.last_text) {
        chatMsgs.push({
          role: 'landlord', text: landlord.last_text, timestamp: landlord.replied_at,
          meta: { approved: landlord.approval ?? undefined },
        })
      }

      // Sub-entries: follow-ups (reminder), timeouts (warning), approval notifs (reminder)
      const subEntries: SubEntry[] = []

      for (const f of landlordLogs.filter(e => e.message_type === 'landlord_followup')) {
        subEntries.push({
          id: f.id,
          label: 'Follow-up to landlord',
          timestamp: f.sent_at,
          variant: 'reminder',
          chatMessages: f.body ? [{ role: 'assistant', text: f.body, timestamp: f.sent_at, allowHtml: true }] : [],
        })
      }

      for (const t of landlordLogs.filter(e => e.message_type === 'pm_landlord_timeout')) {
        subEntries.push({
          id: t.id,
          label: 'Timeout alert to manager',
          timestamp: t.sent_at,
          variant: 'warning',
          chatMessages: t.body ? [{ role: 'assistant', text: t.body, timestamp: t.sent_at, allowHtml: true }] : [],
        })
      }

      for (const a of landlordLogs.filter(e => e.message_type === 'pm_landlord_approved')) {
        subEntries.push({
          id: a.id,
          label: 'Approval sent to manager',
          timestamp: a.sent_at,
          variant: 'reminder',
          chatMessages: a.body ? [{ role: 'assistant', text: a.body, timestamp: a.sent_at, allowHtml: true }] : [],
        })
      }

      for (const d of landlordLogs.filter(e => e.message_type === 'landlord_declined')) {
        subEntries.push({
          id: d.id,
          label: 'Landlord declined — manager alerted',
          timestamp: d.sent_at,
          variant: 'warning',
          chatMessages: d.body ? [{ role: 'assistant', text: d.body, timestamp: d.sent_at, allowHtml: true }] : [],
        })
      }

      // Sort sub-entries by time
      subEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      const status = landlord.approval !== undefined
        ? (landlord.approval ? 'approved' : 'declined')
        : landlord.replied_at ? 'quoted' : 'awaiting'

      entries.push({
        id: 'landlord-approval',
        phase: 'Landlord Approval',
        label: landlord.name || 'Landlord Approval',
        sublabel: landlord.review_request_sent_at ? `Sent ${format(new Date(landlord.review_request_sent_at), 'dd MMM, HH:mm')}` : undefined,
        status,
        timestamp: landlord.review_request_sent_at || '',
        isEscalation: false,
        chatMessages: chatMsgs,
        subEntries,
      })
    }
  }

  // ─── Booking: individual rows ───
  for (const entry of bookingLogs) {
    entries.push({
      id: entry.id,
      phase: 'Job Booking',
      label: TYPE_LABELS[entry.message_type] || entry.message_type,
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'sent',
      timestamp: entry.sent_at,
      isEscalation: false,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── Follow-up: day-of reminder is primary, completion reminders/overdue nested ───
  const dayOfReminders = followupLogs.filter(e => e.message_type === 'contractor_job_reminder')
  const completionReminders = followupLogs.filter(e => e.message_type === 'contractor_completion_reminder')
  const completionOverdue = followupLogs.filter(e => e.message_type === 'pm_completion_overdue')

  const FOLLOWUP_WARNING_TYPES = new Set(['pm_completion_overdue'])
  const FOLLOWUP_SUB_LABELS: Record<string, string> = {
    contractor_completion_reminder: 'Completion reminder to contractor',
    pm_completion_overdue: 'Completion overdue — manager alerted',
  }

  const allFollowupSubs = [...completionReminders, ...completionOverdue]

  if (dayOfReminders.length > 0) {
    const primary = dayOfReminders[0]
    const subEntries: SubEntry[] = []

    for (let i = 1; i < dayOfReminders.length; i++) {
      const r = dayOfReminders[i]
      subEntries.push({
        id: r.id, label: 'Day-of reminder (repeat)', timestamp: r.sent_at, variant: 'reminder',
        chatMessages: r.body ? [{ role: 'assistant', text: r.body, timestamp: r.sent_at, allowHtml: true }] : [],
      })
    }

    for (const r of allFollowupSubs) {
      subEntries.push({
        id: r.id,
        label: FOLLOWUP_SUB_LABELS[r.message_type] || r.message_type,
        timestamp: r.sent_at,
        variant: FOLLOWUP_WARNING_TYPES.has(r.message_type) ? 'warning' : 'reminder',
        chatMessages: r.body ? [{ role: 'assistant', text: r.body, timestamp: r.sent_at, allowHtml: true }] : [],
      })
    }

    subEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    entries.push({
      id: primary.id,
      phase: 'Follow-up',
      label: 'Day-of Reminder',
      sublabel: format(new Date(primary.sent_at), 'dd MMM, HH:mm'),
      status: 'sent',
      timestamp: primary.sent_at,
      isEscalation: false,
      chatMessages: primary.body ? [{ role: 'assistant', text: primary.body, timestamp: primary.sent_at, allowHtml: true }] : [],
      subEntries,
    })
  } else if (allFollowupSubs.length > 0) {
    const sorted = [...allFollowupSubs].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
    const primary = sorted[0]
    const isPrimaryWarning = FOLLOWUP_WARNING_TYPES.has(primary.message_type)

    const subEntries: SubEntry[] = sorted.slice(1).map(r => ({
      id: r.id,
      label: FOLLOWUP_SUB_LABELS[r.message_type] || r.message_type,
      timestamp: r.sent_at,
      variant: (FOLLOWUP_WARNING_TYPES.has(r.message_type) ? 'warning' : 'reminder') as 'warning' | 'reminder',
      chatMessages: r.body ? [{ role: 'assistant', text: r.body, timestamp: r.sent_at, allowHtml: true }] : [],
    }))

    entries.push({
      id: primary.id,
      phase: 'Follow-up',
      label: TYPE_LABELS[primary.message_type] || primary.message_type,
      sublabel: format(new Date(primary.sent_at), 'dd MMM, HH:mm'),
      status: isPrimaryWarning ? 'escalation' : 'sent',
      timestamp: primary.sent_at,
      isEscalation: isPrimaryWarning,
      chatMessages: primary.body ? [{ role: 'assistant', text: primary.body, timestamp: primary.sent_at, allowHtml: true }] : [],
      subEntries,
    })
  }

  // ─── Completion: each submission/notification is its own row, chronological ───
  const sortedCompletionLogs = [...completionLogs].sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
  for (const entry of sortedCompletionLogs) {
    const isWarning = entry.message_type === 'pm_job_not_completed'
    const isCompleted = entry.message_type === 'pm_job_completed' || entry.message_type === 'll_job_completed'
    entries.push({
      id: entry.id,
      phase: 'Completion',
      label: TYPE_LABELS[entry.message_type] || entry.message_type,
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: isWarning ? 'escalation' : isCompleted ? 'completed' : 'sent',
      timestamp: entry.sent_at,
      isEscalation: isWarning,
      isCompleted,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  return entries
}

// ─── Sub-entry toggle label ───

function subEntryLabel(subs: SubEntry[]): string {
  const reminders = subs.filter(s => s.variant === 'reminder')
  const warnings = subs.filter(s => s.variant === 'warning')
  const parts: string[] = []
  if (reminders.length > 0) parts.push(`${reminders.length} follow-up${reminders.length > 1 ? 's' : ''}`)
  if (warnings.length > 0) parts.push(`${warnings.length} alert${warnings.length > 1 ? 's' : ''}`)
  return parts.join(' · ')
}

// ─── Component ───

// ─── Re-dispatch contractor selector ───

interface ContractorOption {
  id: string
  contractor_name: string
  contractor_phone: string
  contractor_email: string | null
}

function RedispatchAction({ ticketId, onDispatched }: { ticketId: string; onDispatched: () => void }) {
  const [open, setOpen] = useState(false)
  const [contractors, setContractors] = useState<ContractorOption[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const supabase = createClient()

  const loadContractors = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('c1_contractors')
      .select('id, contractor_name, contractor_phone, contractor_email')
      .order('contractor_name')
    setContractors(data || [])
    setLoading(false)
  }, [supabase])

  const handleOpen = () => {
    setOpen(true)
    loadContractors()
  }

  const handleDispatch = async () => {
    if (!selectedId) return
    setDispatching(true)
    const { data, error } = await supabase.rpc('c1_redispatch_contractor' as never, {
      p_ticket_id: ticketId,
      p_contractor_id: selectedId,
    } as never)
    setDispatching(false)

    if (error) {
      toast.error('Failed to dispatch', { description: error.message })
      return
    }

    const result = data as unknown as { ok: boolean; contractor_name: string }
    if (result?.ok) {
      toast.success(`Dispatched to ${result.contractor_name}`)
      setOpen(false)
      setSelectedId('')
      onDispatched()
    } else {
      toast.error('Dispatch failed')
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={handleOpen}>
        <Plus className="h-3.5 w-3.5" />
        Add Contractor & Dispatch
      </Button>
    )
  }

  const contractorOptions = contractors.map((c) => ({
    value: c.id,
    label: c.contractor_name,
    description: c.contractor_phone,
  }))

  return (
    <div className="mt-2 p-3 rounded-xl border border-border/60 space-y-3">
      <p className="text-xs font-medium text-card-foreground">Select a contractor to dispatch</p>
      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading contractors...</span>
        </div>
      ) : (
        <>
          <Combobox
            options={contractorOptions}
            value={selectedId}
            onValueChange={setSelectedId}
            placeholder="Choose contractor..."
            searchPlaceholder="Search contractors..."
            emptyText="No contractors found."
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!selectedId || dispatching} onClick={handleDispatch}>
              {dispatching ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Dispatch
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setSelectedId('') }}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Component ───

interface TicketDispatchTabProps {
  messages: MessageData | null
  outboundLog: OutboundLogEntry[]
  ticketId?: string
  onRedispatched?: () => void
}

export function TicketDispatchTab({ messages, outboundLog, ticketId, onRedispatched }: TicketDispatchTabProps) {
  const [overlay, setOverlay] = useState<{ title: string; messages: ChatMsg[] } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const entries = useMemo(() => buildEntries(messages, outboundLog), [messages, outboundLog])

  const hasNoContractors = entries.some(e => e.label === 'No Contractors Available')

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <div className="text-center">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No dispatch activity yet</p>
        </div>
      </div>
    )
  }

  let lastPhase = ''

  return (
    <div>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1
        const showDivider = entry.phase !== lastPhase
        lastPhase = entry.phase

        const isClickable = entry.chatMessages.length > 0
        const hasSubs = entry.subEntries.length > 0
        const isExpanded = expanded.has(entry.id)

        return (
          <div key={entry.id}>
            {/* Phase divider */}
            {showDivider && (
              <div className={cn('flex items-center gap-3', index > 0 ? 'pt-4 pb-2' : 'pb-2')}>
                <div className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{entry.phase}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            {/* Entry row */}
            <div className="flex gap-3">
              {/* Dot + line */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  'rounded-full shrink-0 mt-1.5 h-2.5 w-2.5',
                  entry.isEscalation ? 'bg-red-500' : entry.isCompleted ? 'bg-emerald-500' : 'bg-foreground/40',
                )} />
                {(!isLast || (hasSubs && isExpanded)) && <div className="w-px flex-1 bg-border/40 mt-1" />}
              </div>

              {/* Content */}
              <div className={cn('min-w-0 flex-1', !isLast || (hasSubs && isExpanded) ? 'pb-3' : 'pb-1')}>
                {/* Main row — click for overlay */}
                <button
                  onClick={() => isClickable && setOverlay({ title: entry.label, messages: entry.chatMessages })}
                  disabled={!isClickable}
                  className={cn(
                    'w-full text-left',
                    isClickable && 'hover:bg-muted/30 -mx-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer',
                    !isClickable && 'py-0.5 cursor-default',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{entry.label}</p>
                        {entry.amount && (
                          <span className="text-xs font-medium text-foreground/70">{entry.amount}</span>
                        )}
                        <span className={cn('px-1.5 py-0.5 text-[10px] rounded-full font-medium capitalize', STATUS_STYLES[entry.status] || STATUS_STYLES.pending)}>
                          {entry.status}
                        </span>
                      </div>
                      {entry.sublabel && (
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.sublabel}</p>
                      )}
                    </div>
                    {isClickable && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>
                </button>

                {/* Sub-entry toggle */}
                {hasSubs && (
                  <button
                    onClick={() => toggleExpand(entry.id)}
                    className="flex items-center gap-1 mt-1 ml-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />
                    }
                    <span>{subEntryLabel(entry.subEntries)}</span>
                  </button>
                )}

                {/* Re-dispatch action */}
                {entry.isRedispatchable && ticketId && (
                  <RedispatchAction ticketId={ticketId} onDispatched={() => onRedispatched?.()} />
                )}

                {/* Expanded sub-entries */}
                {hasSubs && isExpanded && (
                  <div className="mt-2 ml-1 space-y-1.5">
                    {entry.subEntries.map(sub => {
                      const subClickable = sub.chatMessages.length > 0
                      return (
                        <button
                          key={sub.id}
                          onClick={() => subClickable && setOverlay({ title: sub.label, messages: sub.chatMessages })}
                          disabled={!subClickable}
                          className={cn(
                            'w-full text-left rounded-md px-2.5 py-2 transition-colors',
                            sub.variant === 'warning'
                              ? 'border border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10'
                              : 'border border-border/50 bg-muted/20 hover:bg-muted/40',
                            !subClickable && 'cursor-default',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {sub.variant === 'warning' && (
                                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">⚠</span>
                              )}
                              <span className={cn(
                                'text-xs',
                                sub.variant === 'warning' ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                              )}>
                                {sub.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {format(new Date(sub.timestamp), 'dd MMM, HH:mm')}
                              </span>
                              {subClickable && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Message overlay — ChatHistory from conversation tab */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOverlay(null)}>
          <div
            className="bg-background border rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-semibold">{overlay.title}</span>
              <button onClick={() => setOverlay(null)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 rounded-b-xl p-4">
              <ChatHistory
                messages={overlay.messages}
                allowHtmlForAssistant
                compact
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
