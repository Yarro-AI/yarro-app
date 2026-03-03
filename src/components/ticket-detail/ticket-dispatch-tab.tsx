'use client'

import { useState, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { ChevronRight, ChevronDown, X, MessageCircle, Plus, Loader2, AlertTriangle, Send, Wrench, UserCheck, Building2, CalendarCheck, CheckCircle2, Cog, Check, XCircle, Phone } from 'lucide-react'
import { ChatHistory } from '@/components/chat-message'
import type { MessageData, OutboundLogEntry, OOHSubmission, LandlordSubmission } from '@/hooks/use-ticket-detail'
import { getContractors, getRecipient, getContractorStatus, formatAmount } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { toast } from 'sonner'

// ─── Config ───

const TYPE_LABELS: Record<string, string> = {
  pm_ticket_created: 'Manager Notified',
  ll_ticket_created: 'Landlord Notified',
  pm_handoff: 'Handoff — Manager Alerted',
  ooh_emergency_dispatch: 'OOH Contact Dispatched',
  contractor_job_schedule: 'Contractor Booking Sent',
  contractor_job_confirmed: 'Contractor Confirmed Slot',
  landlord_declined: 'Landlord Declined',
  tenant_job_booked: 'Tenant Notified',
  pm_job_booked: 'Manager Notified',
  landlord_job_booked: 'Landlord Notified',
  ll_job_booked: 'Landlord Notified',
  contractor_job_reminder: 'Day-of Reminder',
  contractor_completion_reminder: 'Completion Reminder',
  pm_completion_overdue: 'Completion Overdue',
  pm_job_completed: 'Job Completed — Manager Notified',
  pm_job_not_completed: 'Job Not Completed — Manager Alerted',
  ll_job_completed: 'Job Completed — Landlord Notified',
  landlord_allocate: 'Allocated to Landlord',
}

const TICKET_CREATED_LOG_TYPES = new Set(['pm_ticket_created', 'll_ticket_created'])
const HANDOFF_LOG_TYPES = new Set(['pm_handoff'])
const OOH_LOG_TYPES = new Set(['ooh_emergency_dispatch'])
const CONTRACTOR_LOG_TYPES = new Set(['contractor_dispatch', 'contractor_reminder', 'no_more_contractors'])
const MANAGER_LOG_TYPES = new Set(['pm_quote'])
const LANDLORD_LOG_TYPES = new Set(['landlord_quote', 'landlord_followup', 'pm_landlord_timeout', 'pm_landlord_approved', 'landlord_declined'])
const BOOKING_LOG_TYPES = new Set(['contractor_job_schedule', 'contractor_job_confirmed', 'tenant_job_booked', 'pm_job_booked', 'landlord_job_booked', 'll_job_booked'])
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

const OOH_OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Handled by OOH Contact',
  unresolved: 'Couldn\'t Resolve',
  in_progress: 'In Progress',
}

const OOH_OUTCOME_STATUS: Record<string, string> = {
  resolved: 'completed',
  unresolved: 'escalation',
  in_progress: 'sent',
}

const LANDLORD_OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Resolved by Landlord',
  in_progress: 'In Progress',
  need_help: 'Needs Help',
}

const LANDLORD_OUTCOME_STATUS: Record<string, string> = {
  resolved: 'completed',
  in_progress: 'sent',
  need_help: 'escalation',
}

const LANDLORD_ALLOCATE_LOG_TYPES = new Set(['landlord_allocate'])

function buildEntries(messages: MessageData | null, outboundLog: OutboundLogEntry[], oohSubmissions?: OOHSubmission[] | null, landlordSubmissions?: LandlordSubmission[] | null): PurposeEntry[] {
  const entries: PurposeEntry[] = []

  const oohLogs = outboundLog.filter(e => OOH_LOG_TYPES.has(e.message_type))
  const ticketCreatedLogs = outboundLog.filter(e => TICKET_CREATED_LOG_TYPES.has(e.message_type))
  const handoffLogs = outboundLog.filter(e => HANDOFF_LOG_TYPES.has(e.message_type))
  const contractorLogs = outboundLog.filter(e => CONTRACTOR_LOG_TYPES.has(e.message_type))
  const managerLogs = outboundLog.filter(e => MANAGER_LOG_TYPES.has(e.message_type))
  const landlordLogs = outboundLog.filter(e => LANDLORD_LOG_TYPES.has(e.message_type))
  const bookingLogs = outboundLog.filter(e => BOOKING_LOG_TYPES.has(e.message_type))
  const completionLogs = outboundLog.filter(e => COMPLETION_LOG_TYPES.has(e.message_type))
  const followupLogs = outboundLog.filter(e => FOLLOWUP_LOG_TYPES.has(e.message_type))

  // ─── OOH: emergency dispatched to OOH contact ───
  for (const entry of oohLogs) {
    entries.push({
      id: entry.id,
      phase: 'OOH Dispatch',
      label: TYPE_LABELS[entry.message_type] || entry.message_type,
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'sent',
      timestamp: entry.sent_at,
      isEscalation: false,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── OOH: contact status updates (from portal submissions) ───
  if (oohSubmissions && oohSubmissions.length > 0) {
    for (let i = 0; i < oohSubmissions.length; i++) {
      const sub = oohSubmissions[i]
      const label = OOH_OUTCOME_LABELS[sub.outcome] || sub.outcome
      const status = OOH_OUTCOME_STATUS[sub.outcome] || 'sent'
      const chatMsgs: ChatMsg[] = []
      if (sub.notes) {
        chatMsgs.push({ role: 'contractor', text: sub.notes, timestamp: sub.submitted_at })
      }
      if (sub.cost != null) {
        chatMsgs.push({ role: 'contractor', text: `Estimated cost: £${Number(sub.cost).toFixed(2)}`, timestamp: sub.submitted_at })
      }
      entries.push({
        id: `ooh-submission-${i}`,
        phase: 'OOH Response',
        label,
        sublabel: format(new Date(sub.submitted_at), 'dd MMM, HH:mm'),
        status,
        amount: sub.cost != null ? `£${Number(sub.cost).toFixed(2)}` : undefined,
        timestamp: sub.submitted_at,
        isEscalation: sub.outcome === 'unresolved',
        isCompleted: sub.outcome === 'resolved',
        chatMessages: chatMsgs,
        subEntries: [],
      })
    }
  }

  // ─── Landlord Allocation: allocated to landlord (outbound log) ───
  const landlordAllocateLogs = outboundLog.filter(e => LANDLORD_ALLOCATE_LOG_TYPES.has(e.message_type))
  for (const entry of landlordAllocateLogs) {
    entries.push({
      id: entry.id,
      phase: 'Landlord Allocation',
      label: 'Allocated to Landlord',
      sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
      status: 'sent',
      timestamp: entry.sent_at,
      isEscalation: false,
      chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
      subEntries: [],
    })
  }

  // ─── Landlord Allocation: status updates (from portal submissions) ───
  if (landlordSubmissions && landlordSubmissions.length > 0) {
    for (let i = 0; i < landlordSubmissions.length; i++) {
      const sub = landlordSubmissions[i]
      const label = LANDLORD_OUTCOME_LABELS[sub.outcome] || sub.outcome
      const status = LANDLORD_OUTCOME_STATUS[sub.outcome] || 'sent'
      const chatMsgs: ChatMsg[] = []
      if (sub.notes) {
        chatMsgs.push({ role: 'landlord', text: sub.notes, timestamp: sub.submitted_at })
      }
      if (sub.cost != null) {
        chatMsgs.push({ role: 'landlord', text: `Cost: £${Number(sub.cost).toFixed(2)}`, timestamp: sub.submitted_at })
      }
      entries.push({
        id: `landlord-submission-${i}`,
        phase: 'Landlord Response',
        label,
        sublabel: format(new Date(sub.submitted_at), 'dd MMM, HH:mm'),
        status,
        amount: sub.cost != null ? `£${Number(sub.cost).toFixed(2)}` : undefined,
        timestamp: sub.submitted_at,
        isEscalation: sub.outcome === 'need_help',
        isCompleted: sub.outcome === 'resolved',
        chatMessages: chatMsgs,
        subEntries: [],
      })
    }
  }

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

  // ─── Contractors: build dispatch rounds from outbound log (source of truth) ───
  // Each contractor_dispatch in the log = a separate timeline entry.
  // This correctly shows re-dispatches as separate rounds even for the same contractor.
  {
    // Sort + deduplicate contractor events (system sends duplicates within ms)
    const sortedContractorEvents = [...contractorLogs].sort(
      (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
    )
    const dedupedEvents: OutboundLogEntry[] = []
    for (const event of sortedContractorEvents) {
      const isDup = dedupedEvents.some(
        (e) =>
          e.message_type === event.message_type &&
          e.recipient_phone === event.recipient_phone &&
          Math.abs(new Date(e.sent_at).getTime() - new Date(event.sent_at).getTime()) < 2000
      )
      if (!isDup) dedupedEvents.push(event)
    }

    // Separate by type — only dispatches WITH a body are real (bodyless = failed flow triggers)
    const dispatchRounds = dedupedEvents.filter((e) => e.message_type === 'contractor_dispatch' && e.body)
    const reminderEvents = dedupedEvents.filter((e) => e.message_type === 'contractor_reminder')
    const noContractorEvents = dedupedEvents.filter((e) => e.message_type === 'no_more_contractors')

    // Known contractors from messages (for name/status/quote matching)
    const knownContractors = messages ? getContractors(messages.contractors) : []

    // Build one timeline entry per dispatch round
    for (let di = 0; di < dispatchRounds.length; di++) {
      const dispatch = dispatchRounds[di]
      const dispatchTime = new Date(dispatch.sent_at).getTime()
      const nextDispatchTime =
        di + 1 < dispatchRounds.length ? new Date(dispatchRounds[di + 1].sent_at).getTime() : Infinity

      // Reminders within this round's window
      const roundReminders = reminderEvents.filter((e) => {
        const t = new Date(e.sent_at).getTime()
        return t > dispatchTime && t < nextDispatchTime
      })

      // Did this round end with no_more_contractors?
      const roundTimedOut = noContractorEvents.some((e) => {
        const t = new Date(e.sent_at).getTime()
        return t > dispatchTime && t < nextDispatchTime
      })

      // Match to a known contractor in messages:
      // Priority 1: timestamp match (sent_at within 5 sec — this is the current/latest round)
      // Priority 2: phone match where contractor's sent_at is AFTER this dispatch (historical round, data was overwritten by redispatch)
      let matched = knownContractors.find(
        (c) => c.sent_at && Math.abs(new Date(c.sent_at).getTime() - dispatchTime) < 5000
      ) || null
      if (!matched) {
        matched = knownContractors.find(
          (c) =>
            c.phone === dispatch.recipient_phone &&
            c.sent_at &&
            new Date(c.sent_at).getTime() > dispatchTime
        ) || null
      }

      // Only show reply/quote data for the contractor's CURRENT round (timestamp-matched)
      const isCurrentRound = !!(
        matched?.sent_at && Math.abs(new Date(matched.sent_at).getTime() - dispatchTime) < 5000
      )

      // Chat messages
      const chatMsgs: ChatMsg[] = []
      if (dispatch.body) {
        chatMsgs.push({ role: 'assistant', text: dispatch.body, timestamp: dispatch.sent_at, allowHtml: true })
      }
      if (isCurrentRound && matched?.reply_text) {
        chatMsgs.push({
          role: 'contractor',
          text: matched.reply_text,
          timestamp: matched.replied_at,
          meta: matched.quote_amount
            ? { quote: formatAmount(matched.quote_amount), approved: matched.manager_decision === 'approved' }
            : undefined,
        })
      }

      // Sub-entries: reminders for this round only
      const subEntries: SubEntry[] = roundReminders.map((r, i) => ({
        id: `dispatch-${di}-reminder-${i}`,
        label: 'Reminder sent',
        timestamp: r.sent_at,
        variant: 'reminder' as const,
        chatMessages: r.body ? [{ role: 'assistant', text: r.body, timestamp: r.sent_at, allowHtml: true }] : [],
      }))

      // Status for THIS round (not the contractor's overall status)
      let status: string
      if (roundTimedOut) {
        status = 'declined' // this round ended with no_more_contractors
      } else if (isCurrentRound && matched) {
        const rawStatus = getContractorStatus(matched)
        status = rawStatus === 'approved' ? 'approved' : rawStatus === 'replied' ? 'quoted' : rawStatus === 'sent' ? 'sent' : 'pending'
      } else {
        status = 'sent'
      }

      // Label
      const name = matched?.name || 'Contractor Dispatched'
      const parts: string[] = []
      if (matched?.category) parts.push(matched.category)
      parts.push(format(new Date(dispatch.sent_at), 'dd MMM, HH:mm'))
      if (isCurrentRound && matched?.quote_notes) parts.push(matched.quote_notes)

      entries.push({
        id: `dispatch-round-${di}`,
        phase: 'Contractor Quotes',
        label: name,
        sublabel: parts.join(' · '),
        status,
        amount: isCurrentRound && matched?.quote_amount ? formatAmount(matched.quote_amount) : undefined,
        timestamp: dispatch.sent_at,
        isEscalation: false,
        chatMessages: chatMsgs,
        subEntries,
      })
    }

    // No contractors available entries — redispatch button only on latest if no dispatch followed it
    const latestDispatchTime =
      dispatchRounds.length > 0 ? new Date(dispatchRounds[dispatchRounds.length - 1].sent_at).getTime() : 0

    for (let i = 0; i < noContractorEvents.length; i++) {
      const entry = noContractorEvents[i]
      const isLast = i === noContractorEvents.length - 1
      const entryTime = new Date(entry.sent_at).getTime()
      const canRedispatch = isLast && entryTime > latestDispatchTime

      entries.push({
        id: entry.id,
        phase: 'Contractor Quotes',
        label: 'No Contractors Available',
        sublabel: format(new Date(entry.sent_at), 'dd MMM, HH:mm'),
        status: 'escalation',
        timestamp: entry.sent_at,
        isEscalation: true,
        isRedispatchable: canRedispatch,
        chatMessages: entry.body ? [{ role: 'assistant', text: entry.body, timestamp: entry.sent_at, allowHtml: true }] : [],
        subEntries: [],
      })
    }
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

  // Sort all entries chronologically — dispatch tab is a timeline, not phase-grouped
  entries.sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0
    return tA - tB
  })

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

// ─── Phase → icon mapping (activity-tab style) ───

const PHASE_ICONS: Record<string, typeof Cog> = {
  'OOH Dispatch': Phone,
  'OOH Response': Phone,
  'Landlord Allocation': Building2,
  'Landlord Response': Building2,
  Handoff: AlertTriangle,
  'Ticket Created': Send,
  'Contractor Quotes': Wrench,
  'Quote Approval': UserCheck,
  'Landlord Approval': Building2,
  'Job Booking': CalendarCheck,
  'Follow-up': MessageCircle,
  Completion: CheckCircle2,
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

// ─── Dispatch Action Bar ───

interface DispatchActionBarProps {
  nextActionReason: string | null | undefined
  messages: MessageData | null
  ticketId: string
  onActionTaken?: () => void
}

function DispatchActionBar({ nextActionReason, messages, ticketId, onActionTaken }: DispatchActionBarProps) {
  const [markup, setMarkup] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const supabase = createClient()

  if (nextActionReason !== 'manager_approval') return null
  if (!messages) return null

  const manager = messages.manager && typeof messages.manager === 'object' && !Array.isArray(messages.manager)
    ? messages.manager as Record<string, unknown>
    : null
  if (!manager || manager.approval != null) return null

  // Find the contractor under review
  const contractors = Array.isArray(messages.contractors) ? messages.contractors as Record<string, unknown>[] : []
  const reviewingId = manager.reviewing_contractor_id as string | undefined
  const repliedContractor = reviewingId
    ? contractors.find(c => c.id === reviewingId)
    : contractors
        .filter(c => c.status === 'replied')
        .sort((a, b) => new Date(b.replied_at as string).getTime() - new Date(a.replied_at as string).getTime())[0]

  const contractorName = (repliedContractor?.name as string) || 'Contractor'
  const quoteAmount = repliedContractor?.quote_amount as string | undefined
  const category = repliedContractor?.category as string | undefined

  const handleDecision = async (approved: boolean) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('c1_manager_decision_from_app' as never, {
      p_ticket_id: ticketId,
      p_approved: approved,
      p_markup: approved && markup.trim() ? markup.trim() : null,
    } as never)
    setLoading(false)

    const result = data as unknown as { ok: boolean; error?: string } | null
    if (error || !result?.ok) {
      toast.error('Action failed', { description: (result as Record<string, unknown>)?.error as string || error?.message || 'Unknown error' })
      return
    }

    if (approved) {
      toast.success('Quote approved', { description: 'Landlord will be notified' })
    } else {
      toast.success('Quote declined', { description: 'Trying next contractor' })
    }
    setConfirmDecline(false)
    onActionTaken?.()
  }

  return (
    <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Quote awaiting your approval</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-medium text-foreground">{contractorName}</span>
          {quoteAmount && <> quoted <span className="font-medium text-foreground">{formatAmount(quoteAmount)}</span></>}
          {category && <> for {category}</>}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Markup for tenant (optional)</label>
        <div className="relative max-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={markup}
            onChange={(e) => setMarkup(e.target.value.replace(/[^0-9.]/g, ''))}
            className="pl-7 h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {confirmDecline ? (
          <>
            <span className="text-xs text-muted-foreground">Decline this quote?</span>
            <Button variant="destructive" size="sm" disabled={loading} onClick={() => handleDecision(false)}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Yes, decline
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDecline(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDecline(true)}>
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Decline
            </Button>
            <Button size="sm" disabled={loading} onClick={() => handleDecision(true)}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Landlord Allocate Bar ───

interface LandlordAllocateBarProps {
  ticketId: string
  nextActionReason: string | null | undefined
  landlordAllocated: boolean | null | undefined
  landlordName: string | null | undefined
  landlordPhone: string | null | undefined
  onActionTaken?: () => void
}

function LandlordAllocateBar({ ticketId, nextActionReason, landlordAllocated, landlordName, landlordPhone, onActionTaken }: LandlordAllocateBarProps) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  // Only show when in handoff_review or no_contractors state, and NOT already allocated
  const isEligible = (nextActionReason === 'handoff_review' || nextActionReason === 'no_contractors') && !landlordAllocated
  if (!isEligible) return null
  if (!landlordName && !landlordPhone) return null

  const handleAllocate = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('c1_allocate_to_landlord' as never, {
      p_ticket_id: ticketId,
    } as never)
    setLoading(false)

    const result = data as unknown as { ok: boolean; landlord_name?: string; error?: string } | null
    if (error || !result?.ok) {
      toast.error('Allocation failed', { description: (result as Record<string, unknown>)?.error as string || error?.message || 'Unknown error' })
      return
    }

    toast.success(`Allocated to ${result.landlord_name || 'landlord'}`, { description: 'Landlord will be notified via WhatsApp' })
    onActionTaken?.()
  }

  return (
    <div className="mb-4 rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium">Allocate to Landlord</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-medium text-foreground">{landlordName || 'Landlord'}</span>
          {landlordPhone && <span className="ml-1.5 text-muted-foreground">{landlordPhone}</span>}
        </p>
      </div>
      <Button size="sm" disabled={loading} onClick={handleAllocate}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Building2 className="h-3.5 w-3.5 mr-1" />}
        Allocate to Landlord
      </Button>
    </div>
  )
}

// ─── Component ───

interface TicketDispatchTabProps {
  messages: MessageData | null
  outboundLog: OutboundLogEntry[]
  ticketId?: string
  onRedispatched?: () => void
  nextActionReason?: string | null
  onActionTaken?: () => void
  oohSubmissions?: OOHSubmission[] | null
  landlordSubmissions?: LandlordSubmission[] | null
  landlordAllocated?: boolean | null
  landlordName?: string | null
  landlordPhone?: string | null
}

export function TicketDispatchTab({ messages, outboundLog, ticketId, onRedispatched, nextActionReason, onActionTaken, oohSubmissions, landlordSubmissions, landlordAllocated, landlordName, landlordPhone }: TicketDispatchTabProps) {
  const [overlay, setOverlay] = useState<{ title: string; messages: ChatMsg[] } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const entries = useMemo(() => buildEntries(messages, outboundLog, oohSubmissions, landlordSubmissions), [messages, outboundLog, oohSubmissions, landlordSubmissions])

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

  return (
    <div className="space-y-0">
      {ticketId && (
        <>
          <DispatchActionBar
            nextActionReason={nextActionReason}
            messages={messages}
            ticketId={ticketId}
            onActionTaken={onActionTaken}
          />
          <LandlordAllocateBar
            ticketId={ticketId}
            nextActionReason={nextActionReason}
            landlordAllocated={landlordAllocated}
            landlordName={landlordName}
            landlordPhone={landlordPhone}
            onActionTaken={onActionTaken}
          />
        </>
      )}
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1
        const isClickable = entry.chatMessages.length > 0
        const hasSubs = entry.subEntries.length > 0
        const isExpanded = expanded.has(entry.id)

        const Icon = PHASE_ICONS[entry.phase] || Cog
        const iconBg = entry.isEscalation
          ? 'bg-red-500/10 text-red-600 dark:text-red-400'
          : entry.isCompleted
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Icon circle + timeline line */}
            <div className="flex flex-col items-center">
              <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', iconBg)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {(!isLast || (hasSubs && isExpanded)) && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className={cn('min-w-0 flex-1 pb-4')}>
              {/* Main row — click for message overlay */}
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
