'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import type { ContractorTicket, QuoteContext, ContractorPortalData, ContractorQuoteData } from '@/lib/portal-types'
import { PortalLoading, PortalError } from '@/components/portal/portal-shell'
import { ContractorPortalV2, ContractorQuoteV2 } from '@/components/portal/contractor-portal-v2'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TIME_SLOTS = [
  { value: 'morning', hour: 9 },
  { value: 'afternoon', hour: 13 },
  { value: 'evening', hour: 18 },
] as const

// ─── Data Mapping ─────────────────────────────────────────────────────

function mapTicketToPortalData(ticket: ContractorTicket): ContractorPortalData {
  return {
    ticket_id: ticket.ticket_id,
    ticket_ref: ticket.ticket_ref,
    property_address: ticket.property_address,
    issue_title: ticket.issue_title || '',
    issue_description: ticket.issue_description,
    category: ticket.category,
    priority: ticket.priority,
    images: ticket.images,
    date_logged: ticket.date_logged,
    scheduled_date: ticket.scheduled_date,
    scheduled_window: null,
    min_booking_lead_hours: ticket.min_booking_lead_hours,
    tenant_name: ticket.tenant_name,
    tenant_phone: ticket.tenant_phone,
    availability: ticket.availability,
    agency_name: ticket.business_name,
    agency_phone: null,
    agency_email: null,
    contractor_name: ticket.contractor_name,
    contractor_quote: ticket.contractor_quote,
    activity: (ticket.tenant_updates || []).map(u => ({
      message: u.type.replace(/_/g, ' '),
      timestamp: u.submitted_at,
    })),
    resolved_at: ticket.resolved_at,
    compliance_certificate_id: ticket.compliance_certificate_id,
    compliance_cert_type: ticket.compliance_cert_type,
    compliance_expiry_date: ticket.compliance_expiry_date,
  }
}

function mapQuoteToQuoteData(ctx: QuoteContext): ContractorQuoteData {
  return {
    ticket_id: ctx.ticket_id,
    ticket_ref: ctx.ticket_ref,
    property_address: ctx.property_address,
    issue_title: ctx.issue_title || '',
    issue_description: ctx.issue_description,
    category: ctx.category,
    priority: ctx.priority,
    images: ctx.images,
    date_logged: ctx.date_logged,
    tenant_name: ctx.tenant_name,
    tenant_phone: null,
    availability: ctx.availability,
    agency_name: ctx.business_name,
    agency_phone: null,
    agency_email: null,
    contractor_name: ctx.contractor_name,
    quote_amount: ctx.quote_amount,
    quote_notes: ctx.quote_notes,
    quote_status: ctx.contractor_status || 'pending',
    min_booking_lead_hours: 3,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function ContractorPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<ContractorTicket | null>(null)
  const [quoteCtx, setQuoteCtx] = useState<QuoteContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTicket = useCallback(async () => {
    // Try scheduling/completion token first
    const { data: ticketData, error: ticketErr } = await supabase.rpc('c1_get_contractor_ticket', {
      p_token: token,
    })
    if (!ticketErr && ticketData) {
      setTicket(ticketData as ContractorTicket)
      setQuoteCtx(null)
      setLoading(false)
      return
    }

    // Try quote context token
    const { data: quoteData, error: quoteErr } = await supabase.rpc('c1_get_contractor_quote_context', {
      p_token: token,
    })
    if (!quoteErr && quoteData) {
      setQuoteCtx(quoteData as QuoteContext)
      setTicket(null)
      setLoading(false)
      return
    }

    setError('This link is invalid or has expired.')
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  async function handleQuoteSubmit(amount: number, notes: string | null) {
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-quote', token, quote_amount: amount, quote_notes: notes },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
  }

  async function handleSchedule(date: string, slot: string, notes: string | null) {
    const slotHour = TIME_SLOTS.find(s => s.value === slot)?.hour ?? 9
    const dateStr = `${date}T${String(slotHour).padStart(2, '0')}:00:00`
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-schedule', token, date: new Date(dateStr).toISOString(), time_slot: slot, notes },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
  }

  async function handleCompletion(resolved: boolean, notes: string | null, photos: File[]) {
    let photoUrls: string[] = []
    if (photos.length > 0) {
      for (const file of photos) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `portal/${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('ticket-images').upload(path, file, { contentType: file.type })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-images').getPublicUrl(path)
          if (urlData?.publicUrl) photoUrls.push(urlData.publicUrl)
        }
      }
    }

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-completion', token, resolved, notes, photos: photoUrls },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
  }

  async function handleComplianceCompletion(data: { expiryDate: string; issuedBy: string; certNumber: string; file: File | null; notes: string }) {
    let documentUrl: string | null = null
    if (data.file) {
      const ext = data.file.name.split('.').pop() || 'pdf'
      const path = `portal/${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('compliance-documents').upload(path, data.file, { contentType: data.file.type })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('compliance-documents').getPublicUrl(path)
        if (urlData?.publicUrl) documentUrl = urlData.publicUrl
      }
    }

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: {
          source: 'portal-compliance-completion',
          token,
          document_url: documentUrl,
          expiry_date: data.expiryDate,
          issued_by: data.issuedBy || null,
          certificate_number: data.certNumber || null,
          notes: data.notes || null,
        },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
  }

  if (loading) return <PortalLoading />
  if (error || (!ticket && !quoteCtx)) return <PortalError message={error ?? undefined} />

  if (quoteCtx) {
    return <ContractorQuoteV2 data={mapQuoteToQuoteData(quoteCtx)} onQuoteSubmit={handleQuoteSubmit} />
  }

  return (
    <ContractorPortalV2
      data={mapTicketToPortalData(ticket!)}
      onSchedule={handleSchedule}
      onCompletion={handleCompletion}
      onComplianceCompletion={handleComplianceCompletion}
    />
  )
}
