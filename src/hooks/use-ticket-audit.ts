'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database'
import type { AuditEvent } from '@/lib/audit-utils'
import { CAUSAL_ORDER } from '@/lib/audit-utils'
import type {
  TicketBasic,
  ConversationData,
  MessageData,
  CompletionData,
  OutboundLogEntry,
} from './use-ticket-detail'
import { getLogEntries } from './use-ticket-detail'

// Re-export for convenience
export { getLogEntries }
export type {
  TicketBasic,
  ConversationData,
  MessageData,
  CompletionData,
  OutboundLogEntry,
}

export interface ComplianceCert {
  id: string
  cert_type: string
  status: string
  expiry_date: string | null
  document_url: string | null
  notes: string | null
}

export interface UnifiedTimelineEntry {
  id: string
  timestamp: string
  source: 'event'
  event_type: string
  actor: string | null
  actor_type: string | null
  detail: string | null
  data: Record<string, unknown> | null
}

export interface UseTicketAuditResult {
  ticket: TicketBasic | null
  events: AuditEvent[]
  conversation: ConversationData | null
  messages: MessageData | null
  completion: CompletionData | null
  outboundLog: OutboundLogEntry[]
  complianceCert: ComplianceCert | null
  unifiedTimeline: UnifiedTimelineEntry[]
  loading: boolean
  error: string | null
}

export function useTicketAudit(ticketId: string | null): UseTicketAuditResult {
  const [ticket, setTicket] = useState<TicketBasic | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [conversation, setConversation] = useState<ConversationData | null>(null)
  const [messages, setMessages] = useState<MessageData | null>(null)
  const [completion, setCompletion] = useState<CompletionData | null>(null)
  const [outboundLog, setOutboundLog] = useState<OutboundLogEntry[]>([])
  const [complianceCert, setComplianceCert] = useState<ComplianceCert | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      const [ticketRes, eventsRes, messagesRes, completionRes, outboundRes] = await Promise.all([
        supabase
          .from('c1_tickets')
          .select(`
            id, issue_description, status, category, priority,
            date_logged, scheduled_date, contractor_quote, final_amount,
            availability, access, handoff, is_manual, verified_by,
            property_id, tenant_id, contractor_id, conversation_id, room_id,
            archived, images, next_action, next_action_reason, on_hold, sla_due_at, resolved_at,
            ooh_dispatched, ooh_outcome, ooh_notes, ooh_cost, ooh_dispatched_at, ooh_outcome_at, ooh_submissions,
            landlord_allocated, landlord_allocated_at, landlord_outcome, landlord_notes, landlord_cost, landlord_outcome_at, landlord_submissions,
            reschedule_requested, reschedule_date, reschedule_reason, reschedule_status, reschedule_decided_at,
            compliance_certificate_id,
            c1_properties(address),
            c1_tenants(full_name),
            c1_contractors(contractor_name),
            c1_rooms(room_number)
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('c1_events')
          .select('id, event_type, actor_type, actor_name, property_label, occurred_at, metadata, ticket_id')
          .eq('ticket_id', id)
          .order('occurred_at', { ascending: true }),
        supabase
          .from('c1_messages')
          .select('*')
          .eq('ticket_id', id)
          .maybeSingle(),
        supabase
          .from('c1_job_completions')
          .select(`*, c1_contractors(contractor_name)`)
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('c1_outbound_log')
          .select('*')
          .eq('ticket_id', id)
          .order('sent_at', { ascending: true }),
      ])

      if (ticketRes.error) throw new Error(ticketRes.error.message)

      const ticketData = ticketRes.data ? {
        ...ticketRes.data,
        address: (ticketRes.data.c1_properties as unknown as { address: string } | null)?.address,
        tenant_name: (ticketRes.data.c1_tenants as unknown as { full_name: string } | null)?.full_name,
        contractor_name: (ticketRes.data.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
        room_number: (ticketRes.data.c1_rooms as unknown as { room_number: string } | null)?.room_number,
      } : null

      setTicket(ticketData as TicketBasic | null)

      if (eventsRes.error) console.error('Events fetch error:', eventsRes.error)
      setEvents((eventsRes.data as AuditEvent[]) || [])

      if (messagesRes.error) console.error('Messages fetch error:', messagesRes.error)
      setMessages(messagesRes.data || null)

      if (completionRes.error) console.error('Completion fetch error:', completionRes.error)
      if (completionRes.data) {
        setCompletion({
          ...completionRes.data,
          ticket_id: id,
          contractor_name: (completionRes.data.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
        } as CompletionData)
      } else {
        setCompletion(null)
      }

      if (outboundRes.error) console.error('Outbound log fetch error:', outboundRes.error)
      setOutboundLog((outboundRes.data as OutboundLogEntry[]) || [])

      // Conversation — needs conversation_id from ticket
      const conversationId = ticketData?.conversation_id
      if (conversationId) {
        const { data, error } = await supabase
          .from('c1_conversations')
          .select('id, phone, status, stage, caller_name, caller_role, handoff, last_updated, log')
          .eq('id', conversationId)
          .maybeSingle()
        if (error) console.error('Conversation fetch error:', error)
        setConversation(data || null)
      } else {
        setConversation(null)
      }

      // Compliance cert — FK is on c1_tickets, not the cert table
      const certId = (ticketRes.data as Record<string, unknown>)?.compliance_certificate_id as string | null
      if (certId) {
        const { data, error } = await supabase
          .from('c1_compliance_certificates')
          .select('id, cert_type, status, expiry_date, document_url, notes')
          .eq('id', certId)
          .maybeSingle()
        if (error) console.error('Compliance cert fetch error:', error)
        setComplianceCert(data || null)
      } else {
        setComplianceCert(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    if (ticketId) {
      fetchData(ticketId)
    }
  }, [ticketId, fetchData])

  // Build timeline from c1_events (sole source after c1_ledger drop)
  const unifiedTimeline = useMemo((): UnifiedTimelineEntry[] => {
    const entries: UnifiedTimelineEntry[] = events.map(e => {
      const meta = e.metadata
      let detail: string | null = null
      if (meta) {
        if (meta.summary && typeof meta.summary === 'string') detail = meta.summary
        else if (meta.from_reason && meta.to_reason) detail = `${meta.from_reason} → ${meta.to_reason}`
        else if (meta.old_status && meta.new_status) detail = `${meta.old_status} → ${meta.new_status}`
        else if (meta.message && typeof meta.message === 'string') detail = meta.message as string
      }
      return {
        id: e.id,
        timestamp: e.occurred_at,
        source: 'event' as const,
        event_type: e.event_type,
        actor: e.actor_name,
        actor_type: e.actor_type,
        detail,
        data: meta,
      }
    })

    // Sort ascending (oldest first) with causal ordering for same-second events
    entries.sort((a, b) => {
      const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      if (Math.abs(timeDiff) < 2000) {
        const orderA = CAUSAL_ORDER[a.event_type] ?? 5
        const orderB = CAUSAL_ORDER[b.event_type] ?? 5
        if (orderA !== orderB) return orderA - orderB
      }
      return timeDiff
    })

    return entries
  }, [events])

  return {
    ticket,
    events,
    conversation,
    messages,
    completion,
    outboundLog,
    complianceCert,
    unifiedTimeline,
    loading,
    error,
  }
}
