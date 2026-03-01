'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database'

// --- Types ---

export interface TicketContext {
  ticket_id: string
  ticket_status: string
  date_logged: string
  issue_description: string
  category: string
  priority: string
  job_stage: string
  access: string
  access_granted: boolean
  availability: string
  reporter_role: string
  updates_recipient: string
  handoff: boolean
  is_matched_tenant: boolean
  has_images: boolean
  // Tenant
  tenant_name: string
  tenant_phone: string
  tenant_email: string
  tenant_role_tag: string
  tenant_verified_by: string
  // Property
  property_id: string
  property_address: string
  property_manager_id: string
  manager_name: string
  manager_phone: string
  manager_email: string
  business_name: string
  landlord_name: string
  landlord_email: string
  landlord_phone: string
  access_instructions: string
  emergency_access_contact: string
  auto_approve_limit: number
  contractor_mapping: Json
  // Caller
  caller_name: string
  caller_phone: string
  caller_role: string
  caller_tag: string
  // Contacts
  recipient: Json
  update_contact: Json
  tenant_contact: Json
  // Conversation
  conversation_id: string | null
  label: string | null
}

export interface TicketBasic {
  id: string
  issue_description: string | null
  status: string
  job_stage: string | null
  category: string | null
  priority: string | null
  date_logged: string
  scheduled_date: string | null
  contractor_quote: number | null
  final_amount: number | null
  availability: string | null
  access: string | null
  handoff: boolean | null
  is_manual: boolean | null
  verified_by: string | null
  property_id: string | null
  tenant_id: string | null
  contractor_id: string | null
  conversation_id: string | null
  archived: boolean | null
  images: string[] | null
  next_action: string | null
  next_action_reason: string | null
  on_hold: boolean | null
  sla_due_at: string | null
  resolved_at: string | null
  address?: string
  tenant_name?: string
  contractor_name?: string
}

export interface ConversationData {
  id: string
  phone: string
  status: string
  stage: string | null
  caller_name: string | null
  caller_role: string | null
  handoff: boolean | null
  last_updated: string
  log: Json
}

export interface ContractorEntry {
  id: string
  name: string
  phone?: string
  body?: string
  status?: string
  sent_at?: string
  replied_at?: string
  reply_text?: string
  quote_amount?: string
  quote_notes?: string
  manager_decision?: string
  category?: string
}

export interface RecipientEntry {
  name?: string
  phone?: string
  approval?: boolean
  last_text?: string
  replied_at?: string
  last_outbound_body?: string
  review_request_sent_at?: string
  approval_amount?: string
}

export interface MessageData {
  ticket_id: string
  stage: string | null
  contractors: Json | null
  landlord: Json | null
  manager: Json | null
  created_at: string | null
  updated_at: string | null
}

export interface CompletionData {
  id: string
  ticket_id: string | null
  completed: boolean | null
  source: string | null
  notes: string | null
  reason: string | null
  completion_text: string | null
  quote_amount: number | null
  markup_amount: number | null
  total_amount: number | null
  media_urls: Json | null
  received_at: string
  created_at: string
  property_id: string | null
  tenant_id: string | null
  contractor_id: string | null
  contractor_name?: string
}

export interface LedgerEntry {
  id: string
  ticket_id: string
  event_type: string
  actor_role: string
  data: Record<string, unknown> | null
  created_at: string
}

export interface OutboundLogEntry {
  id: string
  ticket_id: string
  message_type: string
  recipient_phone: string | null
  recipient_role: string
  twilio_sid: string | null
  template_sid: string | null
  body: string | null
  status: string | null
  sent_at: string
}

export interface LogEntry {
  role?: string
  direction?: 'in' | 'out' | 'inbound' | 'outbound'
  text?: string
  content?: string
  message?: string
  timestamp?: string
  label?: string
}

// --- Helpers (exported for use in tab components) ---

export function getContractors(json: Json | null): ContractorEntry[] {
  if (!json) return []
  if (Array.isArray(json)) return json as unknown as ContractorEntry[]
  return []
}

export function getRecipient(json: Json | null): RecipientEntry | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  return json as unknown as RecipientEntry
}

export function getContractorStatus(contractor: ContractorEntry): 'sent' | 'replied' | 'approved' | 'pending' {
  if (contractor.manager_decision === 'approved') return 'approved'
  if (contractor.replied_at) return 'replied'
  if (contractor.sent_at) return 'sent'
  return 'pending'
}

export function getRecipientStatus(json: Json | null): 'sent' | 'replied' | 'pending' | 'none' {
  const entry = getRecipient(json)
  if (!entry) return 'none'
  if (entry.replied_at) return 'replied'
  if (entry.review_request_sent_at) return 'sent'
  return 'pending'
}

export function formatAmount(amount: string | undefined): string {
  if (!amount) return ''
  return amount.startsWith('£') ? amount : `£${amount}`
}

export function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return `£${amount.toFixed(2)}`
}

export function getMediaUrls(mediaUrls: Json | null): string[] {
  if (!mediaUrls || !Array.isArray(mediaUrls)) return []
  return mediaUrls as unknown as string[]
}

export function getLogEntries(log: Json): { role: string; text: string; timestamp?: string }[] {
  if (!log) return []

  if (Array.isArray(log)) {
    return (log as unknown as LogEntry[])
      .filter(entry => {
        if (entry.label) return false
        return entry && (entry.text || entry.content || entry.message)
      })
      .map(entry => {
        let role = entry.role || 'system'
        if (entry.direction === 'in' || entry.direction === 'inbound') role = 'tenant'
        if (entry.direction === 'out' || entry.direction === 'outbound') role = 'assistant'
        return {
          role,
          text: entry.text || entry.content || entry.message || '',
          timestamp: entry.timestamp,
        }
      })
  }

  if (typeof log === 'object') {
    const obj = log as Record<string, unknown>
    if (Array.isArray(obj.messages)) return getLogEntries(obj.messages as Json)
    if (Array.isArray(obj.log)) return getLogEntries(obj.log as Json)
  }

  return []
}

export function getContractorMessages(contractors: ContractorEntry[]) {
  const messages: { role: string; text: string; timestamp?: string; allowHtml?: boolean; meta?: { quote?: string; approved?: boolean } }[] = []

  contractors.forEach(contractor => {
    const status = getContractorStatus(contractor)

    if (contractor.body) {
      messages.push({
        role: 'assistant',
        text: `<strong>${contractor.name}</strong>${contractor.category ? ` <span style="opacity:0.7">(${contractor.category})</span>` : ''}<br/><br/>${contractor.body}`,
        timestamp: contractor.sent_at,
        allowHtml: true,
      })
    }

    if (contractor.reply_text) {
      messages.push({
        role: 'tenant',
        text: contractor.reply_text,
        timestamp: contractor.replied_at,
        meta: contractor.quote_amount ? {
          quote: formatAmount(contractor.quote_amount),
          approved: status === 'approved',
        } : undefined,
      })
    }
  })

  return messages
}

export function getRecipientMessages(entry: RecipientEntry | null, title: string) {
  if (!entry) return []

  const messages: { role: string; text: string; timestamp?: string; allowHtml?: boolean; meta?: { approved?: boolean; amount?: string } }[] = []

  if (entry.last_outbound_body) {
    messages.push({
      role: 'assistant',
      text: entry.last_outbound_body,
      timestamp: entry.review_request_sent_at,
      allowHtml: true,
    })
  }

  if (entry.last_text) {
    messages.push({
      role: 'tenant',
      text: entry.last_text,
      timestamp: entry.replied_at,
      meta: {
        approved: entry.approval,
        amount: entry.approval_amount,
      },
    })
  }

  return messages
}

// --- Hook ---

interface UseTicketDetailResult {
  context: TicketContext | null
  basic: TicketBasic | null
  conversation: ConversationData | null
  messages: MessageData | null
  completion: CompletionData | null
  ledger: LedgerEntry[]
  outboundLog: OutboundLogEntry[]
  loading: boolean
  error: string | null
  refetch: () => void
  hasConversation: boolean
  hasDispatch: boolean
  hasCompletion: boolean
  hasOutboundLog: boolean
  previouslyApprovedContractor: string | null
  displayStage: string | null
}

export function useTicketDetail(ticketId: string | null): UseTicketDetailResult {
  const [context, setContext] = useState<TicketContext | null>(null)
  const [basic, setBasic] = useState<TicketBasic | null>(null)
  const [conversation, setConversation] = useState<ConversationData | null>(null)
  const [messages, setMessages] = useState<MessageData | null>(null)
  const [completion, setCompletion] = useState<CompletionData | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [outboundLog, setOutboundLog] = useState<OutboundLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const reset = useCallback(() => {
    setContext(null)
    setBasic(null)
    setConversation(null)
    setMessages(null)
    setCompletion(null)
    setLedger([])
    setOutboundLog([])
    setError(null)
  }, [])

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      // Batch 1: ticket context RPC + basic ticket row (always, parallel)
      const [contextRes, basicRes] = await Promise.all([
        supabase.rpc('c1_ticket_context', { ticket_uuid: id }),
        supabase
          .from('c1_tickets')
          .select(`
            id, issue_description, status, job_stage, category, priority,
            date_logged, scheduled_date, contractor_quote, final_amount,
            availability, access, handoff, is_manual, verified_by,
            property_id, tenant_id, contractor_id, conversation_id,
            archived, images, next_action, next_action_reason, on_hold, sla_due_at, resolved_at,
            c1_properties(address),
            c1_tenants(full_name),
            c1_contractors(contractor_name)
          `)
          .eq('id', id)
          .single(),
      ])

      if (contextRes.error) throw new Error(contextRes.error.message)
      if (basicRes.error) throw new Error(basicRes.error.message)

      const ctx = contextRes.data?.[0] || null
      const basicData = basicRes.data ? {
        ...basicRes.data,
        address: (basicRes.data.c1_properties as unknown as { address: string } | null)?.address,
        tenant_name: (basicRes.data.c1_tenants as unknown as { full_name: string } | null)?.full_name,
        contractor_name: (basicRes.data.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
      } : null

      setContext(ctx)
      setBasic(basicData as TicketBasic | null)

      // Batch 2: conditional fetches (parallel)
      const conversationId = ctx?.conversation_id || basicData?.conversation_id

      const fetchConversation = async () => {
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
      }

      const fetchMessages = async () => {
        const { data, error: msgError } = await supabase
          .from('c1_messages')
          .select('*')
          .eq('ticket_id', id)
          .maybeSingle()
        if (msgError) console.error('Messages fetch error:', msgError)
        setMessages(data || null)
      }

      const fetchCompletion = async () => {
        const { data, error: compError } = await supabase
          .from('c1_job_completions')
          .select(`
            *,
            c1_contractors(contractor_name)
          `)
          .eq('id', id)
          .maybeSingle()
        if (compError) console.error('Completion fetch error:', compError)
        if (data) {
          setCompletion({
            ...data,
            ticket_id: id,
            contractor_name: (data.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
          } as CompletionData)
        } else {
          setCompletion(null)
        }
      }

      const fetchLedger = async () => {
        const { data, error: ledgerError } = await supabase
          .from('c1_ledger')
          .select('*')
          .eq('ticket_id', id)
          .order('created_at', { ascending: true })
        if (ledgerError) console.error('Ledger fetch error:', ledgerError)
        setLedger((data as LedgerEntry[]) || [])
      }

      const fetchOutboundLog = async () => {
        const { data, error: logError } = await supabase
          .from('c1_outbound_log')
          .select('*')
          .eq('ticket_id', id)
          .order('sent_at', { ascending: true })
        if (logError) console.error('Outbound log fetch error:', logError)
        setOutboundLog((data as OutboundLogEntry[]) || [])
      }

      await Promise.all([fetchConversation(), fetchMessages(), fetchCompletion(), fetchLedger(), fetchOutboundLog()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket details')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const refetch = useCallback(() => {
    if (ticketId) fetchData(ticketId)
  }, [ticketId, fetchData])

  useEffect(() => {
    if (ticketId) {
      fetchData(ticketId)
    } else {
      reset()
    }
  }, [ticketId])

  // Derived state
  const hasConversation = !!conversation
  const hasDispatch = !!messages && (
    getContractors(messages.contractors).length > 0 ||
    getRecipient(messages.manager) !== null ||
    getRecipient(messages.landlord) !== null
  )
  const hasCompletion = !!completion
  const hasOutboundLog = outboundLog.length > 0

  // Check for previously approved contractor — only relevant during awaiting_manager with multiple quotes
  const previouslyApprovedContractor = messages?.contractors
    ? (() => {
        const msgStage = (messages.stage || '').toLowerCase()
        if (msgStage !== 'awaiting_manager') return null
        const contractors = getContractors(messages.contractors)
        const approved = contractors.find(c => c.manager_decision === 'approved')
        if (!approved) return null
        // Only warn if multiple contractors have sent quotes
        const quotedCount = contractors.filter(c => c.replied_at || c.quote_amount).length
        if (quotedCount < 2) return null
        return approved.name
      })()
    : null

  // Display stage from next_action_reason (single source of truth, computed by DB trigger)
  const displayStage = (() => {
    if (!basic) return null
    const reasonMap: Record<string, string> = {
      on_hold: 'On Hold',
      pending_review: 'Needs Review',
      handoff_review: 'Handoff',
      manager_approval: 'Awaiting Manager',
      no_contractors: 'No Contractors',
      landlord_declined: 'Landlord Declined',
      landlord_no_response: 'Landlord No Response',
      job_not_completed: 'Not Completed',
      awaiting_contractor: 'Awaiting Contractor',
      awaiting_landlord: 'Awaiting Landlord',
      awaiting_booking: 'Awaiting Booking',
      scheduled: 'Scheduled',
      completed: 'Completed',
      dismissed: 'Dismissed',
      new: 'Created',
    }
    return reasonMap[basic.next_action_reason || ''] || reasonMap[basic.next_action || ''] || 'Created'
  })()

  return {
    context,
    basic,
    conversation,
    messages,
    completion,
    ledger,
    outboundLog,
    loading,
    error,
    refetch,
    hasConversation,
    hasDispatch,
    hasCompletion,
    hasOutboundLog,
    previouslyApprovedContractor,
    displayStage,
  }
}
