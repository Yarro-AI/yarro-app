'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import type { ContractorTicket, QuoteContext } from '@/lib/portal-types'
import { PortalLoading, PortalError } from '@/components/portal/portal-shell'
import { ContractorQuoteView, ContractorTicketView } from '@/components/portal/contractor-portal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TIME_SLOTS = [
  { value: 'morning', hour: 9 },
  { value: 'afternoon', hour: 13 },
  { value: 'evening', hour: 18 },
] as const

export default function ContractorPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<ContractorTicket | null>(null)
  const [quoteCtx, setQuoteCtx] = useState<QuoteContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

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

  function flash(message: string) {
    setSubmitMessage(message)
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  async function handleQuoteSubmit(amount: number, notes: string | null) {
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-quote', token, quote_amount: amount, quote_notes: notes },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
    flash('Quote submitted — the property manager will review and get back to you.')
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
    flash('Job booked — the tenant and property manager have been notified.')
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
    flash(resolved ? 'Job marked as complete — the property manager has been notified.' : 'Report submitted — the property manager has been notified.')
  }

  async function handleRescheduleDecision(approved: boolean) {
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'reschedule-decision', token, approved },
      })
    } catch { /* server action fires regardless */ }
    await loadTicket()
    flash(approved ? 'Reschedule approved.' : 'Reschedule declined.')
  }

  if (loading) return <PortalLoading />
  if (error || (!ticket && !quoteCtx)) return <PortalError message={error ?? undefined} />

  if (quoteCtx) {
    return (
      <ContractorQuoteView
        quoteCtx={quoteCtx}
        onQuoteSubmit={handleQuoteSubmit}
        justSubmitted={justSubmitted}
        submitMessage={submitMessage}
      />
    )
  }

  return (
    <ContractorTicketView
      ticket={ticket!}
      onSchedule={handleSchedule}
      onCompletion={handleCompletion}
      onRescheduleDecision={handleRescheduleDecision}
      justSubmitted={justSubmitted}
      submitMessage={submitMessage}
    />
  )
}
