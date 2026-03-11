'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Phone, CalendarClock, Camera, MapPin, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
}

type Stage = 'schedule' | 'complete' | 'done'

function getStage(ticket: ContractorTicket): Stage {
  const stage = (ticket.job_stage || '').toLowerCase()
  if (stage === 'completed' || ticket.resolved_at) return 'done'
  if (stage === 'booked' && ticket.scheduled_date) {
    const jobDate = new Date(ticket.scheduled_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (jobDate <= today) return 'complete'
    return 'complete' // show completion form once booked — contractor can mark complete when ready
  }
  return 'schedule'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning', range: '09:00–12:00', hour: 9 },
  { value: 'afternoon', label: 'Afternoon', range: '12:00–17:00', hour: 13 },
  { value: 'evening', label: 'Evening', range: '17:00–20:00', hour: 18 },
] as const

function formatScheduledSlot(iso: string): { date: string; slot: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const hour = d.getHours()
  if (hour < 12) return { date, slot: 'Morning (09:00–12:00)' }
  if (hour < 17) return { date, slot: 'Afternoon (12:00–17:00)' }
  return { date, slot: 'Evening (17:00–20:00)' }
}

function MiniCalendar({ selected, onSelect, minDate }: { selected: string; onSelect: (d: string) => void; minDate: Date }) {
  const [viewDate, setViewDate] = useState(() => {
    if (selected) return new Date(selected + 'T00:00:00')
    return new Date()
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay + 6) % 7 // Monday start

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
          const isSelected = selected === dateStr
          const isToday = date.getTime() === today.getTime()

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              onClick={() => onSelect(dateStr)}
              className={`h-9 w-full rounded-lg text-sm transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white font-semibold'
                  : isPast
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

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

export default function ContractorPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<ContractorTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Schedule form
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState<'morning' | 'afternoon' | 'evening' | ''>('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [submittingSchedule, setSubmittingSchedule] = useState(false)

  // Completion form
  const [completionNotes, setCompletionNotes] = useState('')
  const [submittingCompletion, setSubmittingCompletion] = useState(false)

  // Reschedule decision
  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  const [justSubmitted, setJustSubmitted] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')

  const loadTicket = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('c1_get_contractor_ticket', {
      p_token: token,
    })
    if (err || !data) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setTicket(data as ContractorTicket)
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  async function handleSchedule() {
    if (!scheduleDate) return
    setSubmittingSchedule(true)

    const slotHour = TIME_SLOTS.find(s => s.value === scheduleSlot)?.hour ?? 9
    const dateStr = `${scheduleDate}T${String(slotHour).padStart(2, '0')}:00:00`

    const { data: raw, error: err } = await supabase.functions.invoke('yarro-scheduling', {
      body: { source: 'portal-schedule', token, date: new Date(dateStr).toISOString(), time_slot: scheduleSlot || 'morning', notes: scheduleNotes || null },
    })

    const data = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return raw } })() : raw

    if (err || (!data?.ok && !data?.success)) {
      const msg = data?.error || err?.message || ''
      setError(msg.includes('already scheduled') ? 'This job has already been scheduled.' : 'Something went wrong. Please try again.')
      setSubmittingSchedule(false)
      return
    }

    setSubmittingSchedule(false)
    setSubmitMessage('Job booked — the tenant and property manager have been notified.')
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  async function handleCompletion() {
    setSubmittingCompletion(true)

    const { data: raw2, error: err } = await supabase.functions.invoke('yarro-scheduling', {
      body: { source: 'portal-completion', token, notes: completionNotes || null, photos: [] },
    })

    const data = typeof raw2 === 'string' ? (() => { try { return JSON.parse(raw2) } catch { return raw2 } })() : raw2

    if (err || (!data?.ok && !data?.success)) {
      setError('Something went wrong. Please try again.')
      setSubmittingCompletion(false)
      return
    }

    setSubmittingCompletion(false)
    setSubmitMessage('Job marked as complete — the property manager has been notified.')
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  async function handleRescheduleDecision(approved: boolean) {
    setSubmittingReschedule(true)

    const { data: raw3, error: err } = await supabase.functions.invoke('yarro-scheduling', {
      body: { source: 'reschedule-decision', token, approved },
    })

    const data = typeof raw3 === 'string' ? (() => { try { return JSON.parse(raw3) } catch { return raw3 } })() : raw3

    if (err || (!data?.ok && !data?.success)) {
      setError('Something went wrong. Please try again.')
      setSubmittingReschedule(false)
      return
    }

    setSubmittingReschedule(false)
    setSubmitMessage(approved ? 'Reschedule approved.' : 'Reschedule declined.')
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 5000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" style={{ colorScheme: 'light' }}>
        <Loader2 className="size-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !ticket) {
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

  const stage = getStage(ticket)
  const hasPendingReschedule = ticket.reschedule_requested && ticket.reschedule_status === 'pending'

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
        {stage === 'schedule' && ticket.contractor_quote && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-700">
              Your quote of &pound;{Number(ticket.contractor_quote).toFixed(2)} has been approved.
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
                The tenant has requested to reschedule to <span className="font-semibold">{ticket.reschedule_date ? formatDate(ticket.reschedule_date) : 'a new date'}</span>.
              </p>
              {ticket.reschedule_reason && (
                <p className="mt-1 text-xs text-gray-500">Reason: {ticket.reschedule_reason}</p>
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
                {ticket.issue_title || ticket.issue_description}
              </p>
              <span className="shrink-0 ml-3 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                T-{ticket.ticket_ref}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Property</span>
                <span className="text-right font-medium text-gray-900 flex items-center gap-1">
                  <MapPin className="size-3.5 text-gray-400" />
                  {ticket.property_address}
                </span>
              </div>
              {ticket.category && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Category</span>
                  <span className="font-medium text-gray-900">{ticket.category}</span>
                </div>
              )}
              {ticket.issue_title && ticket.issue_description && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Details</span>
                  <p className="mt-1 text-gray-700">{ticket.issue_description}</p>
                </div>
              )}
              {ticket.availability && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Tenant availability</span>
                  <p className="mt-1 text-gray-700">{ticket.availability}</p>
                </div>
              )}
              {ticket.tenant_name && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-medium text-gray-900">
                    {ticket.tenant_name}
                    {ticket.tenant_phone && (
                      <a href={`tel:${ticket.tenant_phone}`} className="ml-2 inline-flex items-center gap-1 text-blue-600 hover:underline">
                        <Phone className="size-3" />
                        {formatPhone(ticket.tenant_phone)}
                      </a>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Images */}
          {ticket.images && ticket.images.length > 0 && (
            <div className="border-t border-gray-100 p-5">
              <div className="flex items-center gap-1.5 mb-3">
                <Camera className="size-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500">Photos</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ticket.images.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={`Issue photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-gray-200" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scheduled date (if booked) */}
        {ticket.scheduled_date && stage !== 'schedule' && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 flex items-center gap-2.5">
            <CalendarClock className="size-4 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-700">
              <span className="font-medium">Scheduled:</span> {formatScheduledSlot(ticket.scheduled_date).date} &middot; {formatScheduledSlot(ticket.scheduled_date).slot}
            </p>
          </div>
        )}

        {/* Schedule form */}
        {stage === 'schedule' && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Book a slot</h3>
              <div>
                <label className="text-sm font-medium text-gray-700">Select a date</label>
                <MiniCalendar selected={scheduleDate} onSelect={setScheduleDate} minDate={new Date()} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">When can you attend?</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      onClick={() => setScheduleSlot(slot.value)}
                      className={`rounded-lg border-2 px-3 py-2.5 text-center transition-colors ${
                        scheduleSlot === slot.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-medium">{slot.label}</span>
                      <span className="block text-[10px] text-gray-400 mt-0.5">{slot.range}</span>
                    </button>
                  ))}
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
        )}

        {/* Completion form */}
        {stage === 'complete' && !ticket.resolved_at && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Mark job as complete</h3>
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
              <button
                onClick={handleCompletion}
                disabled={submittingCompletion}
                className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submittingCompletion ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Mark Complete'}
              </button>
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
