'use client'

import { useState } from 'react'
import { CheckCircle2, Phone, CalendarClock, ThumbsUp, ThumbsDown, Wrench, Search, CalendarCheck, Loader2 } from 'lucide-react'
import type { TenantTicket } from '@/lib/portal-types'
import { formatDate, formatPhone, formatScheduledSlot } from '@/lib/portal-utils'
import { PortalShell } from './portal-shell'
import { PortalCard } from './portal-card'
import { PortalBanner } from './portal-banner'
import { InfoRows } from './info-rows'
import { MiniCalendar } from './mini-calendar'

// ─── Stage Tracker ──────────────────────────────────────────────────────

const STAGE_ORDER = ['reported', 'contractor_found', 'booked', 'completed'] as const
type Stage = typeof STAGE_ORDER[number]

const STAGE_LABELS: Record<Stage, string> = {
  reported: 'Reported',
  contractor_found: 'Contractor Found',
  booked: 'Job Booked',
  completed: 'Completed',
}

const STAGE_ICONS: Record<Stage, React.ReactNode> = {
  reported: <Wrench className="size-4" />,
  contractor_found: <Search className="size-4" />,
  booked: <CalendarCheck className="size-4" />,
  completed: <CheckCircle2 className="size-4" />,
}

function getActiveStage(ticket: TenantTicket): Stage {
  const stage = (ticket.job_stage || '').toLowerCase()
  if (stage === 'completed' || ticket.resolved_at) return 'completed'
  if (stage === 'booked' || ticket.scheduled_date) return 'booked'
  if (['awaiting quote', 'awaiting manager review', 'awaiting landlord approval', 'sent'].includes(stage)) return 'contractor_found'
  return 'reported'
}

// ─── Props ──────────────────────────────────────────────────────────────

export type TenantPortalViewProps = {
  ticket: TenantTicket
  onReschedule: (date: string, reason: string) => Promise<void>
  onConfirm: (resolved: boolean, notes: string) => Promise<void>
  justSubmitted: boolean
}

// ─── Component ──────────────────────────────────────────────────────────

export function TenantPortalView({ ticket, onReschedule, onConfirm, justSubmitted }: TenantPortalViewProps) {
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmResolved, setConfirmResolved] = useState<boolean | null>(null)
  const [confirmNotes, setConfirmNotes] = useState('')
  const [submittingConfirmation, setSubmittingConfirmation] = useState(false)

  const activeStage = getActiveStage(ticket)
  const activeIdx = STAGE_ORDER.indexOf(activeStage)
  const isBooked = activeStage === 'booked' || activeStage === 'completed'
  const isCompleted = activeStage === 'completed'
  const canReschedule = activeStage === 'booked' && !ticket.reschedule_requested
  const hasConfirmed = !!ticket.confirmation_date
  const canConfirm = isCompleted && !hasConfirmed

  async function handleReschedule() {
    if (!rescheduleDate) return
    setSubmittingReschedule(true)
    await onReschedule(rescheduleDate, rescheduleReason)
    setSubmittingReschedule(false)
    setShowReschedule(false)
    setRescheduleDate('')
    setRescheduleReason('')
  }

  async function handleConfirmation() {
    if (confirmResolved === null) return
    setSubmittingConfirmation(true)
    await onConfirm(confirmResolved, confirmNotes)
    setSubmittingConfirmation(false)
    setShowConfirmation(false)
    setConfirmResolved(null)
    setConfirmNotes('')
  }

  // Detail rows — no property/date/title (those are in the header now)
  const detailRows = [
    ...(ticket.issue_title && ticket.issue_description
      ? [{ label: 'Details', value: ticket.issue_description, vertical: true }]
      : []),
    ...(ticket.availability
      ? [{ label: 'Your availability', value: ticket.availability, vertical: true }]
      : []),
  ]

  return (
    <PortalShell
      property={ticket.property_address}
      issue={ticket.issue_title || ticket.issue_description}
      ticketRef={ticket.ticket_ref}
      dateLogged={ticket.date_logged}
    >
      {/* Success banner */}
      {justSubmitted && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">
            Submitted — {ticket.business_name} has been notified.
          </p>
        </PortalBanner>
      )}

      {/* Status tracker — directly under header */}
      <PortalCard className="mt-6">
        <div className="flex items-start">
          {STAGE_ORDER.map((stage, i) => {
            const isActive = i <= activeIdx
            const isCurrent = i === activeIdx
            const isLast = i === STAGE_ORDER.length - 1
            return (
              <div key={stage} className="contents">
                <div className="flex flex-col items-center shrink-0" style={{ width: 56 }}>
                  <div className={`flex items-center justify-center size-10 rounded-full transition-colors ${
                    isCurrent ? 'bg-blue-600 text-white ring-4 ring-blue-100' :
                    isActive ? 'bg-green-500 text-white' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {isActive && !isCurrent ? <CheckCircle2 className="size-4" /> : STAGE_ICONS[stage]}
                  </div>
                  <span className={`mt-2 text-[10px] font-medium text-center leading-tight ${
                    isCurrent ? 'text-blue-600' : isActive ? 'text-green-600' : 'text-muted-foreground/70'
                  }`}>
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
                {!isLast && (
                  <div className={`h-0.5 flex-1 mt-5 ${
                    i < activeIdx ? 'bg-green-400' : 'bg-border'
                  }`} />
                )}
              </div>
            )
          })}
        </div>
      </PortalCard>

      {/* Reschedule status banner */}
      {ticket.reschedule_requested && (
        <PortalBanner
          variant={ticket.reschedule_status === 'approved' ? 'success' : ticket.reschedule_status === 'declined' ? 'error' : 'warning'}
          className="mt-4"
        >
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
        </PortalBanner>
      )}

      {/* Issue details — only supplementary info (title/property/date are in header) */}
      {detailRows.length > 0 && (
        <PortalCard className="mt-4">
          <InfoRows rows={detailRows} />
        </PortalCard>
      )}

      {/* Booking details */}
      {isBooked && ticket.scheduled_date && (
        <PortalCard className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Booking Details
          </h3>
          <InfoRows rows={[
            { label: 'Date', value: formatScheduledSlot(ticket.scheduled_date).date },
            { label: 'Expected arrival', value: formatScheduledSlot(ticket.scheduled_date).slot },
            ...(ticket.contractor_name
              ? [{ label: 'Contractor', value: ticket.contractor_name }]
              : []),
            ...(ticket.contractor_phone
              ? [{
                  label: 'Contact',
                  value: (
                    <a href={`tel:${ticket.contractor_phone}`} className="flex items-center gap-1.5 font-medium text-primary hover:underline">
                      <Phone className="size-3.5" />
                      {formatPhone(ticket.contractor_phone)}
                    </a>
                  ),
                }]
              : []),
          ]} />
        </PortalCard>
      )}

      {/* Reschedule button */}
      {canReschedule && !showReschedule && (
        <button
          onClick={() => setShowReschedule(true)}
          className="mt-4 w-full rounded-lg border-2 border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
        >
          <CalendarClock className="size-4 inline mr-2" />
          Request Reschedule
        </button>
      )}

      {/* Reschedule form */}
      {showReschedule && (
        <PortalCard className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Request a new date</h3>
          <div>
            <label className="text-sm font-medium text-foreground">Preferred date</label>
            <MiniCalendar
              selected={rescheduleDate}
              onSelect={(d) => setRescheduleDate(d)}
              minDate={new Date(Date.now() + 24 * 60 * 60 * 1000)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              Reason <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="e.g. I won't be home that day..."
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowReschedule(false)}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={submittingReschedule || !rescheduleDate}
              className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submittingReschedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Request'}
            </button>
          </div>
        </PortalCard>
      )}

      {/* Completion confirmation */}
      {canConfirm && !showConfirmation && (
        <PortalCard className="mt-4">
          <h3 className="text-sm font-medium text-foreground">Was the issue resolved?</h3>
          <p className="mt-1 text-xs text-muted-foreground">Let us know if the work was completed to your satisfaction.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowConfirmation(true); setConfirmResolved(true) }}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-3 text-sm font-medium text-muted-foreground hover:border-green-500 hover:bg-green-50 hover:text-green-700 transition-colors"
            >
              <ThumbsUp className="size-4" /> Yes, resolved
            </button>
            <button
              onClick={() => { setShowConfirmation(true); setConfirmResolved(false) }}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-3 py-3 text-sm font-medium text-muted-foreground hover:border-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <ThumbsDown className="size-4" /> No, still an issue
            </button>
          </div>
        </PortalCard>
      )}

      {/* Confirmation notes form */}
      {showConfirmation && (
        <PortalCard className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">
            {confirmResolved ? 'Great — anything to add?' : 'What\'s still wrong?'}
          </h3>
          <textarea
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
            placeholder={confirmResolved ? 'Optional feedback...' : 'Please describe what still needs fixing...'}
            value={confirmNotes}
            onChange={(e) => setConfirmNotes(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={() => { setShowConfirmation(false); setConfirmResolved(null); setConfirmNotes('') }}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmation}
              disabled={submittingConfirmation || (!confirmResolved && !confirmNotes)}
              className="flex-1 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submittingConfirmation ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit'}
            </button>
          </div>
        </PortalCard>
      )}

      {/* Confirmed banner */}
      {hasConfirmed && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">
            You confirmed this issue on {formatDate(ticket.confirmation_date!)}.
          </p>
        </PortalBanner>
      )}
    </PortalShell>
  )
}
