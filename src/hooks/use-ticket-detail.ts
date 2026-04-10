'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database'
import { getReasonDisplay } from '@/lib/reason-display'

// --- Types ---

// RPC response shape (c1_ticket_detail returns flat JSONB)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RpcTicket = Record<string, any>

export interface TicketContext {
  ticket_id: string
  ticket_status: string
  date_logged: string
  issue_description: string
  category: string
  priority: string
  access: string
  access_granted: boolean
  availability: string
  reporter_role: string
  updates_recipient: string
  handoff: boolean
  is_matched_tenant: boolean
  has_images: boolean
  tenant_name: string
  tenant_phone: string
  tenant_email: string
  tenant_role_tag: string
  tenant_verified_by: string
  property_id: string
  property_address: string
  property_manager_id: string
  manager_name: string
  manager_phone: string
  manager_email: string
  business_name: string
  landlord_id: string | null
  landlord_name: string
  landlord_email: string
  landlord_phone: string
  access_instructions: string
  emergency_access_contact: string
  auto_approve_limit: number
  contractor_mapping: Json
  caller_name: string
  caller_phone: string
  caller_role: string
  caller_tag: string
  recipient: Json
  update_contact: Json
  tenant_contact: Json
  conversation_id: string | null
  label: string | null
}

export interface TicketBasic {
  id: string
  issue_title: string | null
  issue_description: string | null
  status: string
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
  ooh_dispatched: boolean | null
  ooh_outcome: string | null
  ooh_notes: string | null
  ooh_cost: number | null
  ooh_dispatched_at: string | null
  ooh_outcome_at: string | null
  ooh_submissions: OOHSubmission[] | null
  landlord_allocated: boolean | null
  landlord_allocated_at: string | null
  landlord_outcome: string | null
  landlord_notes: string | null
  landlord_cost: number | null
  landlord_outcome_at: string | null
  landlord_submissions: LandlordSubmission[] | null
  reschedule_requested: boolean | null
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null
  reschedule_decided_at: string | null
  room_id: string | null
  compliance_certificate_id: string | null
  address?: string
  tenant_name?: string
  contractor_name?: string
  room_number?: string
}

export interface ComplianceCertData {
  id: string
  certificate_type: string
  expiry_date: string | null
  issued_date: string | null
  certificate_number: string | null
  issued_by: string | null
  document_url: string | null
  status: string
  notes: string | null
  contractor_id: string | null
  contractor_name: string | null
}

export interface RentLedgerRow {
  id: string
  due_date: string
  amount_due: number
  amount_paid: number | null
  status: string
  room_id: string
  paid_at: string | null
  payment_method: string | null
  notes: string | null
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

export interface OOHSubmission {
  outcome: string
  notes: string | null
  cost: number | null
  submitted_at: string
}

export interface LandlordSubmission {
  outcome: string
  notes: string | null
  cost: number | null
  submitted_at: string
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

// --- Map RPC response to legacy shapes (backward compat for modal) ---

function rpcToContext(t: RpcTicket): TicketContext {
  const tenant = t.tenant as Record<string, string> | null
  const landlord = t.landlord as Record<string, string> | null
  const manager = t.manager as Record<string, string> | null
  return {
    ticket_id: t.id,
    ticket_status: t.status,
    date_logged: t.date_logged,
    issue_description: t.issue_description || '',
    category: t.category || '',
    priority: t.priority || '',
    access: t.access || '',
    access_granted: t.access_granted ?? false,
    availability: t.availability || '',
    reporter_role: '',
    updates_recipient: '',
    handoff: t.handoff ?? false,
    is_matched_tenant: !!tenant,
    has_images: Array.isArray(t.images) && t.images.length > 0,
    tenant_name: tenant?.name || '',
    tenant_phone: tenant?.phone || '',
    tenant_email: tenant?.email || '',
    tenant_role_tag: '',
    tenant_verified_by: '',
    property_id: t.property_id || '',
    property_address: t.property_address || '',
    property_manager_id: manager?.id || '',
    manager_name: manager?.name || '',
    manager_phone: manager?.phone || '',
    manager_email: manager?.email || '',
    business_name: manager?.business_name || '',
    landlord_id: landlord?.id || null,
    landlord_name: landlord?.name || '',
    landlord_email: landlord?.email || '',
    landlord_phone: landlord?.phone || '',
    access_instructions: '',
    emergency_access_contact: '',
    auto_approve_limit: t.auto_approve_limit ?? 0,
    contractor_mapping: null,
    caller_name: '',
    caller_phone: '',
    caller_role: '',
    caller_tag: '',
    recipient: null,
    update_contact: null,
    tenant_contact: null,
    conversation_id: t.conversation_id,
    label: t.label || null,
  }
}

function rpcToBasic(t: RpcTicket): TicketBasic {
  const tenant = t.tenant as Record<string, string> | null
  const contractor = t.contractor as Record<string, string> | null
  return {
    id: t.id,
    issue_title: t.issue_title,
    issue_description: t.issue_description,
    status: t.status,
    category: t.category,
    priority: t.priority,
    date_logged: t.date_logged,
    scheduled_date: t.scheduled_date,
    contractor_quote: t.contractor_quote,
    final_amount: t.final_amount,
    availability: t.availability,
    access: t.access,
    handoff: t.handoff,
    is_manual: t.is_manual,
    verified_by: t.verified_by,
    property_id: t.property_id,
    tenant_id: t.tenant_id,
    contractor_id: t.contractor_id,
    conversation_id: t.conversation_id,
    archived: t.archived,
    images: t.images,
    next_action: t.next_action,
    next_action_reason: t.next_action_reason,
    on_hold: t.on_hold,
    sla_due_at: t.sla_due_at,
    resolved_at: t.resolved_at,
    ooh_dispatched: t.ooh_dispatched,
    ooh_outcome: t.ooh_outcome,
    ooh_notes: t.ooh_notes,
    ooh_cost: t.ooh_cost,
    ooh_dispatched_at: t.ooh_dispatched_at,
    ooh_outcome_at: t.ooh_outcome_at,
    ooh_submissions: t.ooh_submissions,
    landlord_allocated: t.landlord_allocated,
    landlord_allocated_at: t.landlord_allocated_at,
    landlord_outcome: t.landlord_outcome,
    landlord_notes: t.landlord_notes,
    landlord_cost: t.landlord_cost,
    landlord_outcome_at: t.landlord_outcome_at,
    landlord_submissions: t.landlord_submissions,
    reschedule_requested: t.reschedule_requested,
    reschedule_date: t.reschedule_date,
    reschedule_reason: t.reschedule_reason,
    reschedule_status: t.reschedule_status,
    reschedule_decided_at: t.reschedule_decided_at,
    room_id: t.room_id,
    compliance_certificate_id: t.compliance_certificate_id,
    address: t.property_address,
    tenant_name: tenant?.name,
    contractor_name: contractor?.name,
  }
}

function rpcToComplianceCert(t: RpcTicket): ComplianceCertData | null {
  const c = t.compliance as Record<string, string> | null
  if (!c) return null
  return {
    id: c.cert_id,
    certificate_type: c.cert_type,
    expiry_date: c.expiry_date,
    issued_date: c.issued_date,
    certificate_number: c.certificate_number,
    issued_by: c.issued_by,
    document_url: c.document_url,
    status: c.status,
    notes: null,
    contractor_id: c.contractor_id || null,
    contractor_name: null,
  }
}

function rpcToRentLedger(t: RpcTicket): RentLedgerRow[] {
  const rows = t.rent_ledger
  if (!rows || !Array.isArray(rows)) return []
  return rows as RentLedgerRow[]
}

// --- Hook ---

interface UseTicketDetailResult {
  context: TicketContext | null
  basic: TicketBasic | null
  conversation: ConversationData | null
  messages: MessageData | null
  completion: CompletionData | null
  outboundLog: OutboundLogEntry[]
  complianceCert: ComplianceCertData | null
  rentLedger: RentLedgerRow[]
  categoryDataLoading: boolean
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
  const [outboundLog, setOutboundLog] = useState<OutboundLogEntry[]>([])
  const [complianceCert, setComplianceCert] = useState<ComplianceCertData | null>(null)
  const [rentLedger, setRentLedger] = useState<RentLedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const reset = useCallback(() => {
    setContext(null)
    setBasic(null)
    setConversation(null)
    setMessages(null)
    setCompletion(null)
    setOutboundLog([])
    setComplianceCert(null)
    setRentLedger([])
    setError(null)
  }, [])

  const fetchData = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)

    try {
      // 1 RPC + 3 parallel queries (was 1 RPC + 7 queries)
      const [detailRes, messagesRes, completionRes, outboundRes] = await Promise.all([
        supabase.rpc('c1_ticket_detail', { p_ticket_id: id }),
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

      if (detailRes.error) throw new Error(detailRes.error.message)

      const t = detailRes.data as RpcTicket | null
      if (!t) throw new Error('Ticket not found')

      // Map RPC response to legacy shapes
      setContext(rpcToContext(t))
      setBasic(rpcToBasic(t))
      setComplianceCert(rpcToComplianceCert(t))
      setRentLedger(rpcToRentLedger(t))

      // Process messages
      if (messagesRes.error) console.error('Messages fetch error:', messagesRes.error)
      setMessages(messagesRes.data || null)

      // Process completion
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

      // Process outbound log
      if (outboundRes.error) console.error('Outbound log fetch error:', outboundRes.error)
      setOutboundLog((outboundRes.data as OutboundLogEntry[]) || [])

      // Conversation (only if ticket has one)
      if (t.conversation_id) {
        const { data, error } = await supabase
          .from('c1_conversations')
          .select('id, phone, status, stage, caller_name, caller_role, handoff, last_updated, log')
          .eq('id', t.conversation_id)
          .maybeSingle()
        if (error) console.error('Conversation fetch error:', error)
        setConversation(data || null)
      } else {
        setConversation(null)
      }
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
  }, [ticketId, fetchData, reset])

  // Derived state
  const hasConversation = !!conversation
  const hasDispatch = !!messages && (
    getContractors(messages.contractors).length > 0 ||
    getRecipient(messages.manager) !== null ||
    getRecipient(messages.landlord) !== null
  )
  const hasCompletion = !!completion
  const hasOutboundLog = outboundLog.length > 0

  const previouslyApprovedContractor = messages?.contractors
    ? (() => {
        const msgStage = (messages.stage || '').toLowerCase()
        if (msgStage !== 'awaiting_manager') return null
        const contractors = getContractors(messages.contractors)
        const approved = contractors.find(c => c.manager_decision === 'approved')
        if (!approved) return null
        const quotedCount = contractors.filter(c => c.replied_at || c.quote_amount).length
        if (quotedCount < 2) return null
        return approved.name
      })()
    : null

  // Display stage from REASON_DISPLAY (single source of truth)
  const displayStage = (() => {
    if (!basic) return null
    if (basic.on_hold) return 'On Hold'
    const { label } = getReasonDisplay(basic.next_action_reason, false)
    return label
  })()

  return {
    context,
    basic,
    conversation,
    messages,
    completion,
    outboundLog,
    complianceCert,
    rentLedger,
    categoryDataLoading: false,
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
