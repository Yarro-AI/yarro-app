'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, AlertTriangle, Clock, Loader2 } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type OOHTicket = {
  ticket_id: string
  ticket_ref: string
  property_address: string
  issue_description: string
  issue_title: string | null
  tenant_name: string | null
  tenant_phone: string | null
  priority: string
  business_name: string
  ooh_outcome: string | null
  ooh_outcome_at: string | null
  ooh_notes: string | null
  ooh_cost: number | null
}

type Outcome = 'resolved' | 'unresolved' | 'in_progress'

const UNRESOLVED_REASONS = [
  'Need specialist',
  'Couldn\'t access property',
  'Tenant not home',
  'Other',
] as const

export default function OOHResponsePage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<OOHTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null)
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [unresolvedReason, setUnresolvedReason] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase.rpc('c1_get_ooh_ticket', {
        p_token: token,
      })
      if (err || !data) {
        setError('This link is invalid or has expired.')
        setLoading(false)
        return
      }
      setTicket(data as OOHTicket)
      if (data.ooh_outcome) {
        setSubmitted(true)
        setSelectedOutcome(data.ooh_outcome as Outcome)
        setNotes(data.ooh_notes || '')
        setCost(data.ooh_cost?.toString() || '')
      }
      setLoading(false)
    }
    load()
  }, [token])

  async function handleSubmit() {
    if (!selectedOutcome) return
    setSubmitting(true)

    const submitNotes =
      selectedOutcome === 'unresolved' && unresolvedReason
        ? `${unresolvedReason}${notes ? ': ' + notes : ''}`
        : notes

    const { error: err } = await supabase.rpc('c1_submit_ooh_outcome', {
      p_token: token,
      p_outcome: selectedOutcome,
      p_notes: submitNotes || null,
      p_cost: cost ? parseFloat(cost) : null,
    })

    if (err) {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-gray-900">Yarro</h1>
          <p className="mt-4 text-sm text-gray-500">
            {error || 'This link is invalid or has expired.'}
          </p>
        </div>
      </div>
    )
  }

  // Already submitted — read-only view
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-lg px-4 py-8">
          <Header />

          <Card className="mt-6">
            <CardContent className="pt-6 text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 className="size-6 text-green-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">
                Status reported
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {ticket.business_name} will follow up from here.
              </p>

              <div className="mt-5 rounded-lg bg-gray-50 p-4 text-left text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium text-gray-900 capitalize">
                    {selectedOutcome === 'in_progress'
                      ? 'In progress'
                      : selectedOutcome === 'resolved'
                        ? 'Handled'
                        : 'Couldn\'t resolve'}
                  </span>
                </div>
                {notes && (
                  <div className="mt-3 border-t pt-3">
                    <span className="text-gray-500">Notes</span>
                    <p className="mt-1 text-gray-900">{notes}</p>
                  </div>
                )}
                {cost && (
                  <div className="mt-3 flex justify-between border-t pt-3">
                    <span className="text-gray-500">Estimated cost</span>
                    <span className="font-medium text-gray-900">
                      &pound;{parseFloat(cost).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg px-4 py-8">
        <Header />

        {/* Issue details */}
        <Card className="mt-6">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-red-600">
                  Emergency
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
                <div className="border-t pt-2">
                  <span className="text-gray-500">Details</span>
                  <p className="mt-1 text-gray-700">
                    {ticket.issue_description}
                  </p>
                </div>
              )}
              {ticket.tenant_name && (
                <div className="flex justify-between border-t pt-2">
                  <span className="text-gray-500">Tenant</span>
                  <span className="font-medium text-gray-900">
                    {ticket.tenant_name}
                    {ticket.tenant_phone && (
                      <a
                        href={`tel:${ticket.tenant_phone}`}
                        className="ml-2 text-blue-600 hover:underline"
                      >
                        {ticket.tenant_phone}
                      </a>
                    )}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status selection */}
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-900">
            What&apos;s the status?
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <OutcomeButton
              icon={<CheckCircle2 className="size-5" />}
              label="Handled"
              selected={selectedOutcome === 'resolved'}
              color="green"
              onClick={() => {
                setSelectedOutcome('resolved')
                setUnresolvedReason(null)
              }}
            />
            <OutcomeButton
              icon={<AlertTriangle className="size-5" />}
              label="Couldn't resolve"
              selected={selectedOutcome === 'unresolved'}
              color="red"
              onClick={() => {
                setSelectedOutcome('unresolved')
              }}
            />
            <OutcomeButton
              icon={<Clock className="size-5" />}
              label="In progress"
              selected={selectedOutcome === 'in_progress'}
              color="amber"
              onClick={() => {
                setSelectedOutcome('in_progress')
                setUnresolvedReason(null)
              }}
            />
          </div>
        </div>

        {/* Conditional form fields */}
        {selectedOutcome && (
          <Card className="mt-4">
            <CardContent className="pt-6 space-y-4">
              {selectedOutcome === 'resolved' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      What was done?
                    </label>
                    <Textarea
                      className="mt-1.5"
                      rows={3}
                      placeholder="Brief description of the work..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Estimated cost{' '}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        &pound;
                      </span>
                      <Input
                        type="number"
                        className="pl-7"
                        placeholder="0.00"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              )}

              {selectedOutcome === 'unresolved' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Why couldn&apos;t it be resolved?
                    </label>
                    <div className="mt-2 space-y-2">
                      {UNRESOLVED_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setUnresolvedReason(reason)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            unresolvedReason === reason
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      Notes{' '}
                      <span className="font-normal text-gray-400">
                        (optional)
                      </span>
                    </label>
                    <Textarea
                      className="mt-1.5"
                      rows={2}
                      placeholder="Any additional details..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </>
              )}

              {selectedOutcome === 'in_progress' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    ETA or notes
                  </label>
                  <Textarea
                    className="mt-1.5"
                    rows={2}
                    placeholder="e.g. Waiting for parts, back tomorrow morning..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (selectedOutcome === 'resolved' && !notes) ||
                  (selectedOutcome === 'unresolved' && !unresolvedReason)
                }
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  'Submit'
                )}
              </Button>
            </CardContent>
          </Card>
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
      <p className="mt-0.5 text-sm text-gray-500">Emergency Response</p>
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
      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors ${colors[color]}`}
    >
      {icon}
      {label}
    </button>
  )
}
