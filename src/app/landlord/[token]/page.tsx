'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { CheckCircle2, HelpCircle, Clock, Loader2, RefreshCw } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type LandlordSubmission = {
  outcome: string
  notes: string | null
  cost: number | null
  submitted_at: string
}

type LandlordTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_description: string
  issue_title: string | null
  tenant_name: string | null
  tenant_phone: string | null
  priority: string
  business_name: string
  landlord_outcome: string | null
  landlord_outcome_at: string | null
  landlord_notes: string | null
  landlord_cost: number | null
  landlord_submissions: LandlordSubmission[]
}

type Outcome = 'resolved' | 'in_progress' | 'need_help'

const OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Resolved',
  in_progress: 'In progress',
  need_help: 'Need help',
}

const OUTCOME_COLORS: Record<string, string> = {
  resolved: 'text-green-700 bg-green-50 border-green-200',
  in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
  need_help: 'text-red-700 bg-red-50 border-red-200',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

export default function LandlordPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<LandlordTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null)
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  const loadTicket = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('c1_get_landlord_ticket', {
      p_token: token,
    })
    if (err || !data) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setTicket(data as LandlordTicket)
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  function resetForm() {
    setSelectedOutcome(null)
    setNotes('')
    setCost('')
  }

  async function handleSubmit() {
    if (!selectedOutcome) return
    setSubmitting(true)

    const { error: err } = await supabase.rpc('c1_submit_landlord_outcome', {
      p_token: token,
      p_outcome: selectedOutcome,
      p_notes: notes || null,
      p_cost: cost ? parseFloat(cost) : null,
    })

    if (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setJustSubmitted(true)
    resetForm()
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

  const submissions = ticket.landlord_submissions || []
  const hasSubmissions = submissions.length > 0

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-lg px-4 py-8">
        <Header />

        {/* Success banner */}
        {justSubmitted && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-green-600 shrink-0" />
            <p className="text-sm font-medium text-green-700">
              Status updated — {ticket.business_name} has been notified.
            </p>
          </div>
        )}

        {/* Issue details */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                  Allocated to you
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {ticket.issue_title || ticket.issue_description}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                T-{ticket.ticket_ref}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Property</span>
                <span className="text-right font-medium text-gray-900">
                  {ticket.property_address}
                </span>
              </div>
              {ticket.issue_title && ticket.issue_description && (
                <div className="border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Details</span>
                  <p className="mt-1 text-gray-700">
                    {ticket.issue_description}
                  </p>
                </div>
              )}
              {ticket.tenant_name && (
                <div className="flex justify-between border-t border-gray-100 pt-2">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-medium text-gray-900">
                    {ticket.tenant_name}
                    {ticket.tenant_phone && (
                      <a
                        href={`tel:${ticket.tenant_phone}`}
                        className="ml-2 text-blue-600 hover:underline"
                      >
                        {formatPhone(ticket.tenant_phone)}
                      </a>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instruction banner */}
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3">
          <RefreshCw className="size-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 leading-relaxed">
            Use this same link to come back and update your status at any time.
            Each update will be shared with {ticket.business_name}.
          </p>
        </div>

        {/* Previous submissions */}
        {hasSubmissions && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Your updates
            </h3>
            <div className="space-y-2">
              {[...submissions].reverse().map((sub, i) => (
                <div
                  key={i}
                  className={`rounded-lg border px-3.5 py-2.5 ${OUTCOME_COLORS[sub.outcome] || 'border-gray-200 bg-gray-50 text-gray-600'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      {OUTCOME_LABELS[sub.outcome] || sub.outcome}
                    </span>
                    <span className="text-[10px] opacity-70">
                      {formatTime(sub.submitted_at)}
                    </span>
                  </div>
                  {sub.notes && (
                    <p className="mt-1 text-xs opacity-80">{sub.notes}</p>
                  )}
                  {sub.cost != null && (
                    <p className="mt-1 text-xs opacity-70">
                      Cost: &pound;{Number(sub.cost).toFixed(2)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status selection */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-900">
            {hasSubmissions ? 'Update status' : 'What\u2019s the status?'}
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <OutcomeButton
              icon={<CheckCircle2 className="size-5" />}
              label="Resolved"
              selected={selectedOutcome === 'resolved'}
              color="green"
              onClick={() => setSelectedOutcome('resolved')}
            />
            <OutcomeButton
              icon={<Clock className="size-5" />}
              label="In progress"
              selected={selectedOutcome === 'in_progress'}
              color="amber"
              onClick={() => setSelectedOutcome('in_progress')}
            />
            <OutcomeButton
              icon={<HelpCircle className="size-5" />}
              label="Need help"
              selected={selectedOutcome === 'need_help'}
              color="red"
              onClick={() => setSelectedOutcome('need_help')}
            />
          </div>
        </div>

        {/* Conditional form fields */}
        {selectedOutcome && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-5 space-y-4">
              {selectedOutcome === 'resolved' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      What was done?
                    </label>
                    <textarea
                      className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      rows={3}
                      placeholder="Brief description of the work..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Cost{' '}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        &pound;
                      </span>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-gray-300 bg-white pl-7 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="0.00"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {selectedOutcome === 'in_progress' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    ETA or notes
                  </label>
                  <textarea
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    placeholder="e.g. Contractor coming tomorrow morning..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}

              {selectedOutcome === 'need_help' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    What do you need?
                  </label>
                  <textarea
                    className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    placeholder="e.g. Can't find a contractor, need Yarro to take over..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}

              <button
                className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (selectedOutcome === 'resolved' && !notes) ||
                  (selectedOutcome === 'need_help' && !notes)
                }
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin mx-auto" />
                ) : hasSubmissions ? (
                  'Update Status'
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </div>
        )}

        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <div>
      <h1 className="text-lg font-semibold tracking-tight text-gray-900">
        Yarro
      </h1>
      <p className="mt-0.5 text-sm text-gray-500">Job Allocated</p>
    </div>
  )
}

function Footer() {
  return (
    <p className="mt-10 text-center text-xs text-gray-400">Powered by Yarro</p>
  )
}

function OutcomeButton({
  icon,
  label,
  selected,
  color,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  selected: boolean
  color: 'green' | 'red' | 'amber'
  onClick: () => void
}) {
  const colors = {
    green: selected
      ? 'border-green-500 bg-green-50 text-green-700'
      : 'border-gray-200 text-gray-600 hover:bg-gray-50',
    red: selected
      ? 'border-red-500 bg-red-50 text-red-700'
      : 'border-gray-200 text-gray-600 hover:bg-gray-50',
    amber: selected
      ? 'border-amber-500 bg-amber-50 text-amber-700'
      : 'border-gray-200 text-gray-600 hover:bg-gray-50',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors bg-white ${colors[color]}`}
    >
      {icon}
      {label}
    </button>
  )
}
