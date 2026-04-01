'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react'
import type { OOHTicket } from '@/lib/portal-types'
import { formatTime, formatPhone } from '@/lib/portal-utils'
import { PortalShell } from './portal-shell'
import { PortalCard } from './portal-card'
import { PortalBanner } from './portal-banner'
import { InfoRows } from './info-rows'
import { OutcomeButton } from './outcome-button'

type Outcome = 'resolved' | 'unresolved' | 'in_progress'

const UNRESOLVED_REASONS = [
  'Need specialist',
  'Couldn\'t access property',
  'Tenant not home',
  'Other',
] as const

const OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Handled',
  unresolved: 'Couldn\'t resolve',
  in_progress: 'In progress',
}

const OUTCOME_COLORS: Record<string, string> = {
  resolved: 'text-green-700 bg-green-50 border-green-200',
  unresolved: 'text-red-700 bg-red-50 border-red-200',
  in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
}

export type OOHPortalViewProps = {
  ticket: OOHTicket
  onSubmit: (outcome: string, notes: string | null, cost: number | null) => Promise<void>
  justSubmitted: boolean
}

export function OOHPortalView({ ticket, onSubmit, justSubmitted }: OOHPortalViewProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null)
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [unresolvedReason, setUnresolvedReason] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const submissions = ticket.ooh_submissions || []
  const hasSubmissions = submissions.length > 0

  async function handleSubmit() {
    if (!selectedOutcome) return
    setSubmitting(true)

    const submitNotes =
      selectedOutcome === 'unresolved' && unresolvedReason
        ? `${unresolvedReason}${notes ? ': ' + notes : ''}`
        : notes

    await onSubmit(selectedOutcome, submitNotes || null, cost ? parseFloat(cost) : null)
    setSubmitting(false)
    setSelectedOutcome(null)
    setNotes('')
    setCost('')
    setUnresolvedReason(null)
  }

  const detailRows = [
    ...(ticket.issue_title && ticket.issue_description
      ? [{ label: 'Details', value: ticket.issue_description, vertical: true }]
      : []),
    ...(ticket.tenant_name
      ? [{
          label: 'Tenant',
          value: (
            <span>
              {ticket.tenant_name}
              {ticket.tenant_phone && (
                <a href={`tel:${ticket.tenant_phone}`} className="ml-2 text-primary hover:underline">
                  {formatPhone(ticket.tenant_phone)}
                </a>
              )}
            </span>
          ),
        }]
      : []),
  ]

  return (
    <PortalShell
      property={ticket.property_address}
      issue={ticket.issue_title || ticket.issue_description}
      ticketRef={ticket.ticket_ref}
      dateLogged=""
      contextLabel="Emergency"
      contextColor="text-red-600"
    >
      {justSubmitted && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">
            Status updated — {ticket.business_name} has been notified.
          </p>
        </PortalBanner>
      )}

      {/* Issue details */}
      {detailRows.length > 0 && (
        <PortalCard className="mt-6">
          <InfoRows rows={detailRows} />
        </PortalCard>
      )}

      {/* Instruction banner */}
      <PortalBanner variant="info" className="mt-4">
        <RefreshCw className="size-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Use this same link to come back and update your status at any time.
          Each update will be shared with {ticket.business_name}.
        </p>
      </PortalBanner>

      {/* Previous submissions */}
      {hasSubmissions && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Your updates
          </h3>
          <div className="space-y-2">
            {[...submissions].reverse().map((sub, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3.5 py-2.5 ${OUTCOME_COLORS[sub.outcome] || 'border-border bg-muted text-muted-foreground'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    {OUTCOME_LABELS[sub.outcome] || sub.outcome}
                  </span>
                  <span className="text-[10px] opacity-70">
                    {formatTime(sub.submitted_at)}
                  </span>
                </div>
                {sub.notes && <p className="mt-1 text-xs opacity-80">{sub.notes}</p>}
                {sub.cost != null && (
                  <p className="mt-1 text-xs opacity-70">&pound;{Number(sub.cost).toFixed(2)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status selection */}
      <div className="mt-6">
        <h3 className="text-sm font-medium text-foreground">
          {hasSubmissions ? 'Update status' : 'What\u2019s the status?'}
        </h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <OutcomeButton
            icon={<CheckCircle2 className="size-5" />}
            label="Handled"
            selected={selectedOutcome === 'resolved'}
            color="green"
            onClick={() => { setSelectedOutcome('resolved'); setUnresolvedReason(null) }}
          />
          <OutcomeButton
            icon={<AlertTriangle className="size-5" />}
            label="Couldn't resolve"
            selected={selectedOutcome === 'unresolved'}
            color="red"
            onClick={() => setSelectedOutcome('unresolved')}
          />
          <OutcomeButton
            icon={<Clock className="size-5" />}
            label="In progress"
            selected={selectedOutcome === 'in_progress'}
            color="amber"
            onClick={() => { setSelectedOutcome('in_progress'); setUnresolvedReason(null) }}
          />
        </div>
      </div>

      {/* Form fields */}
      {selectedOutcome && (
        <PortalCard className="mt-4 space-y-4">
          {selectedOutcome === 'resolved' && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">What was done?</label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={3}
                  placeholder="Brief description of the work..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Estimated cost <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">&pound;</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-input bg-card pl-7 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                <label className="text-sm font-medium text-foreground">Why couldn&apos;t it be resolved?</label>
                <div className="mt-2 space-y-2">
                  {UNRESOLVED_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setUnresolvedReason(reason)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                        unresolvedReason === reason
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-foreground hover:bg-muted'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              <label className="text-sm font-medium text-foreground">ETA or notes</label>
              <textarea
                className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={2}
                placeholder="e.g. Waiting for parts, back tomorrow morning..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}

          <button
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            onClick={handleSubmit}
            disabled={
              submitting ||
              (selectedOutcome === 'resolved' && !notes) ||
              (selectedOutcome === 'unresolved' && !unresolvedReason)
            }
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin mx-auto" />
            ) : hasSubmissions ? 'Update Status' : 'Submit'}
          </button>
        </PortalCard>
      )}
    </PortalShell>
  )
}
