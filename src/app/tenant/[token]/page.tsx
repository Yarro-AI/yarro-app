'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { CheckCircle2, Loader2, Phone, CalendarClock, ThumbsUp, ThumbsDown, Clock, Search, Wrench, CalendarCheck } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type TenantTicket = {
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
  scheduled_date: string | null
  contractor_name: string | null
  contractor_phone: string | null
  business_name: string
  reschedule_requested: boolean
  reschedule_date: string | null
  reschedule_reason: string | null
  reschedule_status: string | null
  reschedule_decided_at: string | null
  resolved_at: string | null
  confirmation_date: string | null
}

const STAGE_ORDER = ['reported', 'contractor_found', 'booked', 'completed'] as const

function getActiveStage(ticket: TenantTicket): typeof STAGE_ORDER[number] {
  const stage = (ticket.job_stage || '').toLowerCase()
  if (stage === 'completed' || ticket.resolved_at) return 'completed'
  if (stage === 'booked' || ticket.scheduled_date) return 'booked'
  if (['awaiting quote', 'awaiting manager review', 'awaiting landlord approval', 'sent'].includes(stage)) return 'contractor_found'
  return 'reported'
}

const STAGE_LABELS: Record<string, string> = {
  reported: 'Reported',
  contractor_found: 'Contractor Found',
  booked: 'Job Booked',
  completed: 'Completed',
}

const STAGE_ICONS: Record<string, React.ReactNode> = {
  reported: <Wrench className="size-4" />,
  contractor_found: <Search className="size-4" />,
  booked: <CalendarCheck className="size-4" />,
  completed: <CheckCircle2 className="size-4" />,
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatScheduledSlot(iso: string): { date: string; slot: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  const hour = d.getHours()
  if (hour < 12) return { date, slot: 'in the morning (09:00–12:00)' }
  if (hour < 17) return { date, slot: 'in the afternoon (12:00–17:00)' }
  return { date, slot: 'in the evening (17:00–20:00)' }
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

export default function TenantPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<TenantTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Reschedule form
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  // Confirmation form
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmResolved, setConfirmResolved] = useState<boolean | null>(null)
  const [confirmNotes, setConfirmNotes] = useState('')
  const [submittingConfirmation, setSubmittingConfirmation] = useState(false)

  const [justSubmitted, setJustSubmitted] = useState(false)

  const loadTicket = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('c1_get_tenant_ticket', {
      p_token: token,
    })
    if (err || !data) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setTicket(data as TenantTicket)
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  async function handleReschedule() {
    if (!rescheduleDate) return
    setSubmittingReschedule(true)

    const { data: raw, error: err } = await supabase.functions.invoke('yarro-scheduling', {
      body: { source: 'reschedule-request', token, proposed_date: new Date(rescheduleDate).toISOString(), reason: rescheduleReason || null },
    })

    const data = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return raw } })() : raw

    if (err || (!data?.ok && !data?.success)) {
      const msg = data?.error || err?.message || ''
      setError(msg.includes('already requested') ? 'You have already requested a reschedule.' : 'Something went wrong. Please try again.')
      setSubmittingReschedule(false)
      return
    }

    setSubmittingReschedule(false)
    setShowReschedule(false)
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 4000)
  }

  async function handleConfirmation() {
    if (confirmResolved === null) return
    setSubmittingConfirmation(true)

    const { data: raw2, error: err } = await supabase.functions.invoke('yarro-scheduling', {
      body: { source: 'tenant-confirmation', token, resolved: confirmResolved, notes: confirmNotes || null },
    })

    const data = typeof raw2 === 'string' ? (() => { try { return JSON.parse(raw2) } catch { return raw2 } })() : raw2

    if (err || (!data?.ok && !data?.success)) {
      setError('Something went wrong. Please try again.')
      setSubmittingConfirmation(false)
      return
    }

    setSubmittingConfirmation(false)
    setShowConfirmation(false)
    setJustSubmitted(true)
    await loadTicket()
    setTimeout(() => setJustSubmitted(false), 4000)
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

  const activeStage = getActiveStage(ticket)
  const activeIdx = STAGE_ORDER.indexOf(activeStage)
  const isBooked = activeStage === 'booked' || activeStage === 'completed'
  const isCompleted = activeStage === 'completed'
  const canReschedule = activeStage === 'booked' && !ticket.reschedule_requested
  const hasConfirmed = !!ticket.confirmation_date
  const canConfirm = isCompleted && !hasConfirmed

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">Yarro</h1>
          <p className="mt-0.5 text-sm text-gray-500">Maintenance Request</p>
        </div>

        {/* Success banner */}
        {justSubmitted && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700">
              Submitted — {ticket.business_name} has been notified.
            </p>
          </div>
        )}

        {/* Status tracker */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start">
            {STAGE_ORDER.map((stage, i) => {
              const isActive = i <= activeIdx
              const isCurrent = i === activeIdx
              const isLast = i === STAGE_ORDER.length - 1
              return (
                <div key={stage} className="contents">
                  {/* Node */}
                  <div className="flex flex-col items-center shrink-0" style={{ width: 56 }}>
                    <div className={`flex items-center justify-center size-10 rounded-full transition-colors ${
                      isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                      isActive ? 'bg-green-500 text-white' :
                      'bg-gray-200 text-gray-400'
                    }`}>
                      {isActive && !isCurrent ? <CheckCircle2 className="size-4" /> : STAGE_ICONS[stage]}
                    </div>
                    <span className={`mt-2 text-[10px] font-medium text-center leading-tight ${
                      isCurrent ? 'text-blue-600' : isActive ? 'text-green-600' : 'text-gray-400'
                    }`}>
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                  {/* Connector */}
                  {!isLast && (
                    <div className={`h-0.5 flex-1 mt-5 ${
                      i < activeIdx ? 'bg-green-400' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Reschedule status banner */}
        {ticket.reschedule_requested && (
          <div className={`mt-4 rounded-lg border px-4 py-3 flex items-center gap-2.5 ${
            ticket.reschedule_status === 'approved' ? 'border-green-200 bg-green-50' :
            ticket.reschedule_status === 'declined' ? 'border-red-200 bg-red-50' :
            'border-amber-200 bg-amber-50'
          }`}>
            <CalendarClock className={`size-4 shrink-0 ${
              ticket.reschedule_status === 'approved' ? 'text-green-600' :
              ticket.reschedule_status === 'declined' ? 'text-red-600' :
              'text-amber-600'
            }`} />
            <p className={`text-sm font-medium ${
              ticket.reschedule_status === 'approved' ? 'text-green-700' :
              ticket.reschedule_status === 'declined' ? 'text-red-700' :
              'text-amber-700'
            }`}>
              {ticket.reschedule_status === 'approved' && `Reschedule confirmed for ${ticket.reschedule_date ? formatDate(ticket.reschedule_date) : 'new date'}`}
              {ticket.reschedule_status === 'declined' && 'Your reschedule request was declined'}
              {ticket.reschedule_status === 'pending' && 'Reschedule requested — waiting for confirmation'}
            </p>
          </div>
        )}

        {/* Issue details */}
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
                <span className="text-right font-medium text-gray-900">{ticket.property_address}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2">
                <span className="text-gray-500">Reported</span>
                <span className="font-medium text-gray-900">{formatDate(ticket.date_logged)}</span>
              </div>
              {ticket.issue_title && ticket.issue_description && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Details</span>
                  <p className="mt-1 text-gray-700">{ticket.issue_description}</p>
                </div>
              )}
              {ticket.availability && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Your availability</span>
                  <p className="mt-1 text-gray-700">{ticket.availability}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Booking details (when scheduled) */}
        {isBooked && ticket.scheduled_date && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Booking Details
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Date</span>
                  <span className="font-semibold text-gray-900">{formatScheduledSlot(ticket.scheduled_date).date}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Expected arrival</span>
                  <span className="font-medium text-gray-900">{formatScheduledSlot(ticket.scheduled_date).slot}</span>
                </div>
                {ticket.contractor_name && (
                  <div className="flex justify-between border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Contractor</span>
                    <span className="font-medium text-gray-900">{ticket.contractor_name}</span>
                  </div>
                )}
                {ticket.contractor_phone && (
                  <div className="flex justify-between border-t border-gray-100 pt-2">
                    <span className="text-gray-500">Contact</span>
                    <a href={`tel:${ticket.contractor_phone}`} className="flex items-center gap-1.5 font-medium text-blue-600 hover:underline">
                      <Phone className="size-3.5" />
                      {formatPhone(ticket.contractor_phone)}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reschedule button */}
        {canReschedule && !showReschedule && (
          <button
            onClick={() => setShowReschedule(true)}
            className="mt-4 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            <CalendarClock className="size-4 inline mr-2" />
            Request Reschedule
          </button>
        )}

        {/* Reschedule form */}
        {showReschedule && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">Request a new date</h3>
              <div>
                <label className="text-sm font-medium text-gray-700">Preferred date</label>
                <input
                  type="date"
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Reason <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  rows={2}
                  placeholder="e.g. I won't be home that day..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowReschedule(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={submittingReschedule || !rescheduleDate}
                  className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingReschedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Completion confirmation */}
        {canConfirm && !showConfirmation && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5">
              <h3 className="text-sm font-medium text-gray-900">Was the issue resolved?</h3>
              <p className="mt-1 text-xs text-gray-500">Let us know if the work was completed to your satisfaction.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setShowConfirmation(true); setConfirmResolved(true) }}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-600 hover:border-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
                >
                  <ThumbsUp className="size-4" /> Yes, resolved
                </button>
                <button
                  onClick={() => { setShowConfirmation(true); setConfirmResolved(false) }}
                  className="flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-600 hover:border-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                >
                  <ThumbsDown className="size-4" /> No, still an issue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation notes form */}
        {showConfirmation && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-medium text-gray-900">
                {confirmResolved ? 'Great — anything to add?' : 'What\'s still wrong?'}
              </h3>
              <textarea
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={2}
                placeholder={confirmResolved ? 'Optional feedback...' : 'Please describe what still needs fixing...'}
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowConfirmation(false); setConfirmResolved(null); setConfirmNotes('') }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmation}
                  disabled={submittingConfirmation || (!confirmResolved && !confirmNotes)}
                  className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submittingConfirmation ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmed banner */}
        {hasConfirmed && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700">
              You confirmed this issue on {formatDate(ticket.confirmation_date!)}.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-gray-400">Powered by Yarro</p>
      </div>
    </div>
  )
}
