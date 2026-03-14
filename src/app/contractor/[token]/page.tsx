'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Phone, CalendarClock, Camera, MapPin, AlertTriangle, ChevronLeft, ChevronRight, Upload, X, PoundSterling } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ───────────────────────────────────────────────────────────────

type ContractorTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string | null
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  availability: string | null
  date_logged: string
  status: string
  job_stage: string
  contractor_quote: number | null
  final_amount: number | null
  scheduled_date: string | null
  tenant_name: string | null
  tenant_phone: string | null
  business_name: string
  contractor_name: string | null
  reschedule_requested: boolean
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null
  resolved_at: string | null
  tenant_updates: Array<{ type: string; notes?: string; reason?: string; photos?: string[]; submitted_at: string }>
  min_booking_lead_hours: number
}

type QuoteContext = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_title: string | null
  issue_description: string
  category: string | null
  priority: string
  images: string[]
  availability: string | null
  date_logged: string
  status: string
  contractor_name: string
  contractor_id: string
  contractor_status: string
  quote_amount: string | null
  quote_notes: string | null
  business_name: string
  tenant_name: string | null
  access_info: string
}

type Stage = 'quote' | 'quote_submitted' | 'schedule' | 'complete' | 'done'

// ─── Stage Logic ─────────────────────────────────────────────────────────

function getTicketStage(ticket: ContractorTicket): Stage {
  const stage = (ticket.job_stage || '').toLowerCase()
  if (stage === 'completed' || ticket.resolved_at) return 'done'
  if (stage === 'booked' && ticket.scheduled_date) return 'complete'
  return 'schedule'
}

function getQuoteStage(ctx: QuoteContext): Stage {
  if (ctx.contractor_status === 'replied' || ctx.quote_amount) return 'quote_submitted'
  return 'quote'
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning', range: '09:00–12:00', hour: 9 },
  { value: 'afternoon', label: 'Afternoon', range: '12:00–17:00', hour: 13 },
  { value: 'evening', label: 'Evening', range: '17:00–20:00', hour: 18 },
] as const

/** Returns slot start hours that are still bookable for a given date, respecting lead time. */
function getAvailableSlots(dateStr: string, leadHours: number): Set<number> {
  const now = new Date()
  const available = new Set<number>()
  for (const slot of TIME_SLOTS) {
    // Build the slot start time in local timezone
    const slotStart = new Date(`${dateStr}T${String(slot.hour).padStart(2, '0')}:00:00`)
    const hoursUntilSlot = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntilSlot >= leadHours) {
      available.add(slot.hour)
    }
  }
  return available
}

/** Returns the earliest bookable date (where at least one slot is available). */
function getMinBookableDate(leadHours: number): Date {
  const now = new Date()
  const candidate = new Date(now)
  candidate.setHours(0, 0, 0, 0)
  // Check up to 7 days ahead (lead time can be up to a few days)
  for (let i = 0; i < 14; i++) {
    const dateStr = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`
    if (getAvailableSlots(dateStr, leadHours).size > 0) return candidate
    candidate.setDate(candidate.getDate() + 1)
  }
  return now // fallback
}

function formatScheduledSlot(iso: string): { date: string; slot: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const hour = d.getHours()
  if (hour < 12) return { date, slot: 'Morning (09:00–12:00)' }
  if (hour < 17) return { date, slot: 'Afternoon (12:00–17:00)' }
  return { date, slot: 'Evening (17:00–20:00)' }
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

// ─── Mini Calendar ───────────────────────────────────────────────────────

function MiniCalendar({ selected, onSelect, minDate, isDateDisabled }: { selected: string; onSelect: (d: string) => void; minDate: Date; isDateDisabled?: (dateStr: string) => boolean }) {
  const [viewDate, setViewDate] = useState(() => {
    if (selected) return new Date(selected + 'T00:00:00')
    return new Date()
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay + 6) % 7

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  minDate.setHours(0, 0, 0, 0)

  const monthLabel = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const canGoPrev = new Date(year, month, 1) > minDate

  const days: (number | null)[] = []
  for (let i = 0; i < startOffset; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(d)

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canGoPrev && setViewDate(new Date(year, month - 1, 1))}
          className={`p-1.5 rounded-lg transition-colors ${canGoPrev ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-200 cursor-default'}`}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
          <div key={d} className="text-[10px] font-medium text-gray-400 pb-1.5">{d}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />
          const date = new Date(year, month, day)
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isPast = date < minDate
          const noSlots = !isPast && isDateDisabled?.(dateStr)
          const isDisabled = isPast || !!noSlots
          const isSelected = selected === dateStr
          const isToday = date.getTime() === today.getTime()

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr)}
              className={`h-9 w-full rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold'
                  : isDisabled
                    ? 'text-gray-200 cursor-default'
                    : isToday
                      ? 'bg-blue-50 text-blue-700 font-medium hover:bg-blue-100'
                      : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function ContractorPortalPage() {
  const { token } = useParams<{ token: string }>()

  // Data states — one of these will be populated
  const [ticket, setTicket] = useState<ContractorTicket | null>(null)
  const [quoteCtx, setQuoteCtx] = useState<QuoteContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Quote form
  const [quoteAmount, setQuoteAmount] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [submittingQuote, setSubmittingQuote] = useState(false)

  // Schedule form
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState<'morning' | 'afternoon' | 'evening' | ''>('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [submittingSchedule, setSubmittingSchedule] = useState(false)

  // Completion form
  const [completionStatus, setCompletionStatus] = useState<'complete' | 'not-complete' | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completionReason, setCompletionReason] = useState('')
  const [completionPhotos, setCompletionPhotos] = useState<File[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [submittingCompletion, setSubmittingCompletion] = useState(false)

  // Reschedule decision
  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  const [justSubmitted, setJustSubmitted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  // ─── Load ticket data ────────────────────────────────────────────────

  const loadTicket = useCallback(async () => {
    // Try scheduling/completion token first (c1_tickets.contractor_token)
    const { data: ticketData, error: ticketErr } = await supabase.rpc('c1_get_contractor_ticket', {
      p_token: token,
    })

    if (!ticketErr && ticketData) {
      setTicket(ticketData as ContractorTicket)
      setQuoteCtx(null)
      setLoading(false)
      return
    }

    // Try quote context token (c1_messages.contractors[].portal_token)
    const { data: quoteData, error: quoteErr } = await supabase.rpc('c1_get_contractor_quote_context', {
      p_token: token,
    })

    if (!quoteErr && quoteData) {
      setQuoteCtx(quoteData as QuoteContext)
      setTicket(null)
      setLoading(false)
      return
    }

    // Both failed — invalid token
    setError('This link is invalid or has expired.')
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  // ─── Quote submission ────────────────────────────────────────────────

  async function handleQuoteSubmit() {
    const amount = parseFloat(quoteAmount)
    if (!amount || amount <= 0) return
    setSubmittingQuote(true)
    setError(null)

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: {
          source: 'portal-quote',
          token,
          quote_amount: amount,
          quote_notes: quoteNotes || null,
        },
      })
    } catch (_) { /* server action fires regardless */ }

    await loadTicket()
    setSubmittingQuote(false)
    setSubmitMessage('Quote submitted — the property manager will review and get back to you.')
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  // ─── Schedule submission ─────────────────────────────────────────────

  async function handleSchedule() {
    if (!scheduleDate) return
    setSubmittingSchedule(true)
    setError(null)

    const slotHour = TIME_SLOTS.find(s => s.value === scheduleSlot)?.hour ?? 9
    const dateStr = `${scheduleDate}T${String(slotHour).padStart(2, '0')}:00:00`

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-schedule', token, date: new Date(dateStr).toISOString(), time_slot: scheduleSlot || 'morning', notes: scheduleNotes || null },
      })
    } catch (_) { /* server action fires regardless */ }

    await loadTicket()
    setSubmittingSchedule(false)
    setSubmitMessage('Job booked — the tenant and property manager have been notified.')
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  // ─── Photo handling ──────────────────────────────────────────────────

  function handlePhotoDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    addPhotos(files)
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    addPhotos(Array.from(e.target.files))
  }

  function addPhotos(files: File[]) {
    const MAX_SIZE = 10 * 1024 * 1024
    const valid = files.filter(f => f.size <= MAX_SIZE)
    setCompletionPhotos(prev => [...prev, ...valid].slice(0, 5))
  }

  function removePhoto(idx: number) {
    setCompletionPhotos(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── Completion submission ───────────────────────────────────────────

  async function handleCompletion() {
    if (!completionStatus) return
    setSubmittingCompletion(true)
    setError(null)

    if (completionStatus === 'not-complete') {
      try {
        await supabase.functions.invoke('yarro-scheduling', {
          body: { source: 'portal-completion', token, resolved: false, notes: completionReason || null },
        })
      } catch (_) { /* server action fires regardless */ }

      await loadTicket()
      setSubmittingCompletion(false)
      setCompletionStatus(null)
      setCompletionReason('')
      setSubmitMessage('Report submitted — the property manager has been notified.')
      setJustSubmitted(true)
      setTimeout(() => setJustSubmitted(false), 5000)
      return
    }

    let photoUrls: string[] = []
    if (completionPhotos.length > 0) {
      setUploadingPhotos(true)
      const urls: string[] = []
      for (const file of completionPhotos) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `portal/${token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('ticket-images').upload(path, file, { contentType: file.type })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('ticket-images').getPublicUrl(path)
          if (urlData?.publicUrl) urls.push(urlData.publicUrl)
        }
      }
      photoUrls = urls
      setUploadingPhotos(false)
    }

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'portal-completion', token, resolved: true, notes: completionNotes || null, photos: photoUrls },
      })
    } catch (_) { /* server action fires regardless */ }

    await loadTicket()
    setSubmittingCompletion(false)
    setSubmitMessage('Job marked as complete — the property manager has been notified.')
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  // ─── Reschedule decision ─────────────────────────────────────────────

  async function handleRescheduleDecision(approved: boolean) {
    setSubmittingReschedule(true)
    setError(null)

    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: { source: 'reschedule-decision', token, approved },
      })
    } catch (_) { /* server action fires regardless */ }

    await loadTicket()
    setSubmittingReschedule(false)
    setSubmitMessage(approved ? 'Reschedule approved.' : 'Reschedule declined.')
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  // ─── Loading / Error states ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ colorScheme: 'light' }}>
        <Loader2 className="size-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || (!ticket && !quoteCtx)) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ colorScheme: 'light' }}>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Yarro</h1>
          <p className="mt-4 text-sm text-gray-500">
            {error || 'This link is invalid or has expired.'}
          </p>
        </div>
      </div>
    )
  }

  // ─── Quote flow (portal_token from dispatch) ─────────────────────────

  if (quoteCtx) {
    const stage = getQuoteStage(quoteCtx)

    return (
      <div className="min-h-screen bg-gray-50 text-gray-900" style={{ colorScheme: 'light' }}>
        <div className="mx-auto max-w-lg px-4 py-8">
          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-gray-900">Yarro</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {stage === 'quote' ? 'Submit Your Quote' : 'Quote Submitted'}
            </p>
          </div>

          {/* Success banner */}
          {justSubmitted && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-700">{submitMessage}</p>
            </div>
          )}

          {/* Job details card */}
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5">
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {quoteCtx.issue_title || quoteCtx.issue_description}
                </p>
                <span className="shrink-0 ml-3 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                  T-{quoteCtx.ticket_ref}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Property</span>
                  <span className="text-right font-medium text-gray-900 flex items-center gap-1">
                    <MapPin className="size-3.5 text-gray-400" />
                    {quoteCtx.property_address}
                  </span>
                </div>
                {quoteCtx.category && (
                  <div className="flex justify-between border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Category</span>
                    <span className="font-medium text-gray-900">{quoteCtx.category}</span>
                  </div>
                )}
                {quoteCtx.issue_title && quoteCtx.issue_description && (
                  <div className="border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Details</span>
                    <p className="mt-1 text-gray-700">{quoteCtx.issue_description}</p>
                  </div>
                )}
                {quoteCtx.availability && (
                  <div className="border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Tenant availability</span>
                    <p className="mt-1 text-gray-700">{quoteCtx.availability}</p>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">From</span>
                  <span className="font-medium text-gray-900">{quoteCtx.business_name}</span>
                </div>
              </div>
            </div>

            {/* Images */}
            {quoteCtx.images && quoteCtx.images.length > 0 && (
              <div className="border-t border-gray-100 p-5">
                <div className="flex items-center gap-1.5 mb-3">
                  <Camera className="size-3.5 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500">Photos</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {quoteCtx.images.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                      <img src={url} alt={`Issue photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-200" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quote form */}
          {stage === 'quote' && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="p-5 space-y-4">
                <h3 className="text-sm font-medium text-gray-900">Your Quote</h3>
                <div>
                  <label className="text-sm font-medium text-gray-700">Quote Amount</label>
                  <div className="mt-1.5 relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <PoundSterling className="size-4 text-gray-400" />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0.00"
                      value={quoteAmount}
                      onChange={(e) => setQuoteAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Notes <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={3}
                    placeholder="Any details about the quote, materials needed, timeline..."
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                  />
                </div>
                <button
                  onClick={handleQuoteSubmit}
                  disabled={submittingQuote || !quoteAmount || parseFloat(quoteAmount) <= 0}
                  className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingQuote ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Quote'}
                </button>
              </div>
            </div>
          )}

          {/* Quote submitted state */}
          {stage === 'quote_submitted' && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
              <CheckCircle2 className="size-4 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-700">
                  Quote of {quoteCtx.quote_amount} submitted
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  The property manager will review and get back to you. You&apos;ll receive a notification when approved.
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <p className="mt-10 text-center text-xs text-gray-400">Powered by Yarro</p>
        </div>
      </div>
    )
  }

  // ─── Scheduling / Completion flow (contractor_token from finalize) ───

  const stage = getTicketStage(ticket!)
  const hasPendingReschedule = ticket!.reschedule_requested && ticket!.reschedule_status === 'pending'

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">Yarro</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {stage === 'schedule' ? 'Book This Job' : stage === 'complete' ? 'Job Details' : 'Job Complete'}
          </p>
        </div>

        {/* Success banner */}
        {justSubmitted && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700">{submitMessage}</p>
          </div>
        )}

        {/* Quote approved banner (schedule stage) */}
        {stage === 'schedule' && ticket!.contractor_quote && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-700">
              Your quote of &pound;{Number(ticket!.contractor_quote).toFixed(2)} has been approved.
            </p>
            <p className="mt-0.5 text-xs text-green-600">
              Please review the details and book a slot below.
            </p>
          </div>
        )}

        {/* Reschedule request banner */}
        {hasPendingReschedule && (
          <div className="mt-4 bg-white rounded-xl border-2 border-amber-300 shadow-sm">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="size-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-amber-700">Reschedule Request</h3>
              </div>
              <p className="text-sm text-gray-700">
                The tenant has requested to reschedule to <span className="font-semibold">{ticket!.reschedule_date ? formatDate(ticket!.reschedule_date) : 'a new date'}</span>.
              </p>
              {ticket!.reschedule_reason && (
                <p className="mt-1 text-xs text-gray-500">Reason: {ticket!.reschedule_reason}</p>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleRescheduleDecision(false)}
                  disabled={submittingReschedule}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Decline
                </button>
                <button
                  onClick={() => handleRescheduleDecision(true)}
                  disabled={submittingReschedule}
                  className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {submittingReschedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Job details */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-gray-900">
                {ticket!.issue_title || ticket!.issue_description}
              </p>
              <span className="shrink-0 ml-3 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                T-{ticket!.ticket_ref}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Property</span>
                <span className="text-right font-medium text-gray-900 flex items-center gap-1">
                  <MapPin className="size-3.5 text-gray-400" />
                  {ticket!.property_address}
                </span>
              </div>
              {ticket!.category && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Category</span>
                  <span className="font-medium text-gray-900">{ticket!.category}</span>
                </div>
              )}
              {ticket!.issue_title && ticket!.issue_description && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Details</span>
                  <p className="mt-1 text-gray-700">{ticket!.issue_description}</p>
                </div>
              )}
              {ticket!.availability && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Tenant availability</span>
                  <p className="mt-1 text-gray-700">{ticket!.availability}</p>
                </div>
              )}
              {ticket!.tenant_name && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-medium text-gray-900">
                    {ticket!.tenant_name}
                    {ticket!.tenant_phone && (
                      <a href={`tel:${ticket!.tenant_phone}`} className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline">
                        <Phone className="size-3" />
                        {formatPhone(ticket!.tenant_phone)}
                      </a>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Images */}
          {ticket!.images && ticket!.images.length > 0 && (
            <div className="border-t border-gray-100 p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <Camera className="size-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Photos</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ticket!.images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Issue photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-200" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scheduled date (if booked) */}
        {ticket!.scheduled_date && stage !== 'schedule' && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 flex items-center gap-2.5">
            <CalendarClock className="size-4 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700">
              <span className="font-medium">Scheduled:</span> {formatScheduledSlot(ticket!.scheduled_date).date} &middot; {formatScheduledSlot(ticket!.scheduled_date).slot}
            </p>
          </div>
        )}

        {/* Schedule form */}
        {stage === 'schedule' && (() => {
          const leadHours = ticket!.min_booking_lead_hours ?? 3
          const availableSlots = scheduleDate ? getAvailableSlots(scheduleDate, leadHours) : null
          return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Book a slot</h3>
              <div>
                <label className="text-sm font-medium text-gray-700">Select a date</label>
                <MiniCalendar
                  selected={scheduleDate}
                  onSelect={(d) => { setScheduleDate(d); setScheduleSlot('') }}
                  minDate={getMinBookableDate(leadHours)}
                  isDateDisabled={(dateStr) => getAvailableSlots(dateStr, leadHours).size === 0}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">When can you attend?</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => {
                    const disabled = availableSlots != null && !availableSlots.has(slot.hour)
                    return (
                    <button
                      key={slot.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setScheduleSlot(slot.value)}
                      className={`rounded-lg border-2 px-3 py-2.5 text-center transition-colors ${
                        scheduleSlot === slot.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : disabled
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-medium">{slot.label}</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{slot.range}</span>
                    </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Notes <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="e.g. Will need access to loft..."
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                />
              </div>
              <button
                onClick={handleSchedule}
                disabled={submittingSchedule || !scheduleDate || !scheduleSlot}
                className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submittingSchedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Confirm Booking'}
              </button>
            </div>
          </div>
          )
        })()}

        {/* Previous contractor updates */}
        {ticket!.tenant_updates?.filter(u => u.type === 'contractor_not_completed' || u.type === 'contractor_completed').length > 0 && (
          <div className="mt-4 space-y-2">
            {ticket!.tenant_updates.filter(u => u.type === 'contractor_not_completed' || u.type === 'contractor_completed').map((update, i) => (
              <div key={i} className={`rounded-lg border px-4 py-3 ${
                update.type === 'contractor_not_completed'
                  ? 'border-orange-200 bg-orange-50'
                  : 'border-green-200 bg-green-50'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${
                    update.type === 'contractor_not_completed' ? 'text-orange-600' : 'text-green-600'
                  }`}>
                    {update.type === 'contractor_not_completed' ? 'Reported not complete' : 'Marked complete'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(update.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {(update.reason || update.notes) && (
                  <p className="mt-1 text-sm text-gray-700">{update.reason || update.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Completion form */}
        {stage === 'complete' && !ticket!.resolved_at && ticket!.scheduled_date && new Date(new Date(ticket!.scheduled_date).toDateString()) <= new Date(new Date().toDateString()) && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Has this job been completed?</h3>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCompletionStatus('complete')}
                  className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                    completionStatus === 'complete'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <CheckCircle2 className={`size-5 mx-auto mb-1.5 ${completionStatus === 'complete' ? 'text-green-500' : 'text-gray-400'}`} />
                  Job Complete
                </button>
                <button
                  type="button"
                  onClick={() => setCompletionStatus('not-complete')}
                  className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                    completionStatus === 'not-complete'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <AlertTriangle className={`size-5 mx-auto mb-1.5 ${completionStatus === 'not-complete' ? 'text-orange-500' : 'text-gray-400'}`} />
                  Not Complete
                </button>
              </div>

              {completionStatus === 'complete' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Photos <span className="font-normal text-gray-400">(optional, max 5)</span>
                    </label>
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handlePhotoDrop}
                      className="mt-1.5 relative rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-pointer"
                    >
                      <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                        <Upload className="size-6 text-gray-400 mb-2" />
                        <span className="text-sm text-gray-600 font-medium">Drop photos here or tap to upload</span>
                        <span className="text-xs text-gray-400 mt-1">JPG, PNG up to 10MB each</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handlePhotoSelect}
                        />
                      </label>
                    </div>
                    {completionPhotos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {completionPhotos.map((file, i) => (
                          <div key={i} className="relative group">
                            <div className="size-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                              <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
                            </div>
                            <button
                              type="button"
                              onClick={() => removePhoto(i)}
                              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-gray-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Notes <span className="font-normal text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={3}
                      placeholder="Brief description of work completed..."
                      value={completionNotes}
                      onChange={(e) => setCompletionNotes(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {completionStatus === 'not-complete' && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Reason <span className="font-normal text-gray-400">(required)</span>
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={3}
                      placeholder="Why couldn't the job be completed?"
                      value={completionReason}
                      onChange={(e) => setCompletionReason(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {completionStatus && (
                <button
                  onClick={handleCompletion}
                  disabled={submittingCompletion || uploadingPhotos || (completionStatus === 'not-complete' && !completionReason.trim())}
                  className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    completionStatus === 'complete'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {submittingCompletion || uploadingPhotos ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      {uploadingPhotos ? 'Uploading photos...' : 'Submitting...'}
                    </span>
                  ) : completionStatus === 'complete' ? 'Submit Completion' : 'Report Issue'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Done state */}
        {stage === 'done' && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700">
              This job has been completed. Thank you.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-gray-400">Powered by Yarro</p>
      </div>
    </div>
  )
}
