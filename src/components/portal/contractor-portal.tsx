'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Phone, CalendarClock, Camera, MapPin, AlertTriangle, Upload, X, PoundSterling, FileText, ShieldCheck } from 'lucide-react'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import type { ContractorTicket, QuoteContext } from '@/lib/portal-types'
import { formatDate, formatPhone, formatScheduledSlot } from '@/lib/portal-utils'
import { PortalShell } from './portal-shell'
import { PortalCard } from './portal-card'
import { PortalBanner } from './portal-banner'
import { InfoRows } from './info-rows'
import { MiniCalendar } from './mini-calendar'

// ─── Helpers ────────────────────────────────────────────────────────────

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return /\.(mp4|mov|webm|avi|mkv|3gp)/.test(lower) || lower.includes('/video/')
}

type TicketStage = 'schedule' | 'complete' | 'done'
type QuoteStage = 'quote' | 'quote_submitted'

function getTicketStage(ticket: ContractorTicket): TicketStage {
  if (ticket.resolved_at) return 'done'
  if (ticket.scheduled_date) return 'complete'
  return 'schedule'
}

function getQuoteStage(ctx: QuoteContext): QuoteStage {
  if (ctx.contractor_status === 'replied' || ctx.quote_amount) return 'quote_submitted'
  return 'quote'
}

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning', range: '09:00\u201312:00', hour: 9 },
  { value: 'afternoon', label: 'Afternoon', range: '12:00\u201317:00', hour: 13 },
  { value: 'evening', label: 'Evening', range: '17:00\u201320:00', hour: 18 },
] as const

function getAvailableSlots(dateStr: string, leadHours: number): Set<number> {
  const now = new Date()
  const available = new Set<number>()
  for (const slot of TIME_SLOTS) {
    const slotStart = new Date(`${dateStr}T${String(slot.hour).padStart(2, '0')}:00:00`)
    const hoursUntilSlot = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntilSlot >= leadHours) available.add(slot.hour)
  }
  return available
}

function getMinBookableDate(leadHours: number): Date {
  const now = new Date()
  const candidate = new Date(now)
  candidate.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    const dateStr = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`
    if (getAvailableSlots(dateStr, leadHours).size > 0) return candidate
    candidate.setDate(candidate.getDate() + 1)
  }
  return now
}

// ─── Media Grid ─────────────────────────────────────────────────────────

function MediaGrid({ images }: { images: string[] }) {
  if (!images || images.length === 0) return null
  return (
    <div className="border-t border-border/40 p-5">
      <div className="flex items-center gap-1.5 mb-3">
        <Camera className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Photos & Videos</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {images.map((url, i) =>
          isVideoUrl(url) ? (
            <video key={i} src={url} controls playsInline className="w-full h-32 object-cover rounded-lg border border-border" />
          ) : (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
              <img src={url} alt={`Issue photo ${i + 1}`} className="w-full h-32 object-cover rounded-lg border border-border" />
            </a>
          )
        )}
      </div>
    </div>
  )
}

// ─── Quote Flow ─────────────────────────────────────────────────────────

export type ContractorQuoteViewProps = {
  quoteCtx: QuoteContext
  onQuoteSubmit: (amount: number, notes: string | null) => Promise<void>
  justSubmitted: boolean
  submitMessage: string
}

export function ContractorQuoteView({ quoteCtx, onQuoteSubmit, justSubmitted, submitMessage }: ContractorQuoteViewProps) {
  const [quoteAmount, setQuoteAmount] = useState('')
  const [quoteNotes, setQuoteNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const stage = getQuoteStage(quoteCtx)

  async function handleSubmit() {
    const amount = parseFloat(quoteAmount)
    if (!amount || amount <= 0) return
    setSubmitting(true)
    await onQuoteSubmit(amount, quoteNotes || null)
    setSubmitting(false)
  }

  const detailRows = [
    ...(quoteCtx.category ? [{ label: 'Category', value: quoteCtx.category }] : []),
    ...(quoteCtx.issue_title && quoteCtx.issue_description
      ? [{ label: 'Details', value: quoteCtx.issue_description, vertical: true }]
      : []),
    ...(quoteCtx.availability
      ? [{ label: 'Tenant availability', value: quoteCtx.availability, vertical: true }]
      : []),
    { label: 'From', value: quoteCtx.business_name },
  ]

  return (
    <PortalShell
      property={quoteCtx.property_address}
      issue={quoteCtx.issue_title || quoteCtx.issue_description}
      ticketRef={quoteCtx.ticket_ref}
      dateLogged={quoteCtx.date_logged}
    >
      {justSubmitted && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">{submitMessage}</p>
        </PortalBanner>
      )}

      {/* Details + media */}
      <div className="mt-6 bg-card rounded-xl border border-border">
        <div className="p-5">
          <InfoRows rows={detailRows} />
        </div>
        <MediaGrid images={quoteCtx.images} />
      </div>

      {stage === 'quote' && (
        <PortalCard className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Your Quote</h3>
          <div>
            <label className="text-sm font-medium text-foreground">Quote Amount</label>
            <div className="mt-1.5 relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <PoundSterling className="size-4 text-muted-foreground" />
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-lg border border-input bg-card pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0.00"
                value={quoteAmount}
                onChange={(e) => setQuoteAmount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Any details about the quote, materials needed, timeline..."
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || !quoteAmount || parseFloat(quoteAmount) <= 0}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Quote'}
          </button>
        </PortalCard>
      )}

      {stage === 'quote_submitted' && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-700">
              Quote of {quoteCtx.quote_amount} submitted
            </p>
            <p className="text-xs text-green-600 mt-0.5">
              The property manager will review and get back to you. You&apos;ll receive a notification when approved.
            </p>
          </div>
        </PortalBanner>
      )}
    </PortalShell>
  )
}

// ─── Ticket Flow (Schedule / Complete / Done) ───────────────────────────

export type ContractorTicketViewProps = {
  ticket: ContractorTicket
  onSchedule: (date: string, slot: string, notes: string | null) => Promise<void>
  onCompletion: (resolved: boolean, notes: string | null, photos: File[]) => Promise<void>
  onComplianceCompletion?: (data: { expiryDate: string; issuedBy: string; certNumber: string; file: File | null; notes: string }) => Promise<void>
  onRescheduleDecision: (approved: boolean) => Promise<void>
  justSubmitted: boolean
  submitMessage: string
}

export function ContractorTicketView({
  ticket,
  onSchedule,
  onCompletion,
  onComplianceCompletion,
  onRescheduleDecision,
  justSubmitted,
  submitMessage,
}: ContractorTicketViewProps) {
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState<'morning' | 'afternoon' | 'evening' | ''>('')
  const [scheduleNotes, setScheduleNotes] = useState('')
  const [submittingSchedule, setSubmittingSchedule] = useState(false)

  const [completionStatus, setCompletionStatus] = useState<'complete' | 'not-complete' | null>(null)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completionReason, setCompletionReason] = useState('')
  const [completionPhotos, setCompletionPhotos] = useState<File[]>([])
  const [submittingCompletion, setSubmittingCompletion] = useState(false)

  const [submittingReschedule, setSubmittingReschedule] = useState(false)

  // Compliance renewal state
  const isComplianceRenewal = !!ticket.compliance_certificate_id
  const [certExpiryDate, setCertExpiryDate] = useState('')
  const [certIssuedBy, setCertIssuedBy] = useState('')
  const [certNumber, setCertNumber] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [certNotes, setCertNotes] = useState('')
  const [submittingCert, setSubmittingCert] = useState(false)

  const certLabel = ticket.compliance_cert_type
    ? CERTIFICATE_LABELS[ticket.compliance_cert_type as CertificateType] || ticket.compliance_cert_type
    : 'Certificate'

  async function handleCertCompletion() {
    if (!certExpiryDate || !onComplianceCompletion) return
    setSubmittingCert(true)
    await onComplianceCompletion({
      expiryDate: certExpiryDate,
      issuedBy: certIssuedBy,
      certNumber,
      file: certFile,
      notes: certNotes,
    })
    setSubmittingCert(false)
  }

  const stage = getTicketStage(ticket)
  const hasPendingReschedule = ticket.reschedule_requested && ticket.reschedule_status === 'pending'

  async function handleSchedule() {
    if (!scheduleDate || !scheduleSlot) return
    setSubmittingSchedule(true)
    await onSchedule(scheduleDate, scheduleSlot, scheduleNotes || null)
    setSubmittingSchedule(false)
  }

  async function handleCompletion() {
    if (!completionStatus) return
    setSubmittingCompletion(true)
    if (completionStatus === 'not-complete') {
      await onCompletion(false, completionReason || null, [])
      setCompletionStatus(null)
      setCompletionReason('')
    } else {
      await onCompletion(true, completionNotes || null, completionPhotos)
    }
    setSubmittingCompletion(false)
  }

  async function handleReschedule(approved: boolean) {
    setSubmittingReschedule(true)
    await onRescheduleDecision(approved)
    setSubmittingReschedule(false)
  }

  function addPhotos(files: File[]) {
    const MAX_SIZE = 10 * 1024 * 1024
    const valid = files.filter(f => f.size <= MAX_SIZE)
    setCompletionPhotos(prev => [...prev, ...valid].slice(0, 5))
  }

  const detailRows = [
    ...(ticket.category ? [{ label: 'Category', value: ticket.category }] : []),
    ...(ticket.issue_title && ticket.issue_description
      ? [{ label: 'Details', value: ticket.issue_description, vertical: true }]
      : []),
    ...(ticket.availability
      ? [{ label: 'Tenant availability', value: ticket.availability, vertical: true }]
      : []),
    ...(ticket.tenant_name
      ? [{
          label: 'Tenant',
          value: (
            <span>
              {ticket.tenant_name}
              {ticket.tenant_phone && (
                <a href={`tel:${ticket.tenant_phone}`} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                  <Phone className="size-3" />
                  {formatPhone(ticket.tenant_phone)}
                </a>
              )}
            </span>
          ),
        }]
      : []),
  ]

  const leadHours = ticket.min_booking_lead_hours ?? 3
  const availableSlots = scheduleDate ? getAvailableSlots(scheduleDate, leadHours) : null

  return (
    <PortalShell
      property={ticket.property_address}
      issue={ticket.issue_title || ticket.issue_description}
      ticketRef={ticket.ticket_ref}
      dateLogged={ticket.date_logged}
    >
      {justSubmitted && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">{submitMessage}</p>
        </PortalBanner>
      )}

      {/* Quote approved banner */}
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
        <div className="mt-4 bg-card rounded-xl border-2 border-amber-300">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="size-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-700">Reschedule Request</h3>
            </div>
            <p className="text-sm text-foreground">
              The tenant has requested to reschedule to <span className="font-semibold">{ticket.reschedule_date ? formatDate(ticket.reschedule_date) : 'a new date'}</span>.
            </p>
            {ticket.reschedule_reason && (
              <p className="mt-1 text-xs text-muted-foreground">Reason: {ticket.reschedule_reason}</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => handleReschedule(false)}
                disabled={submittingReschedule}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
              >
                Decline
              </button>
              <button
                onClick={() => handleReschedule(true)}
                disabled={submittingReschedule}
                className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
              >
                {submittingReschedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job details + media */}
      <div className="mt-4 bg-card rounded-xl border border-border">
        <div className="p-5">
          <InfoRows rows={detailRows} />
        </div>
        <MediaGrid images={ticket.images} />
      </div>

      {/* Scheduled date info */}
      {ticket.scheduled_date && stage !== 'schedule' && (
        <PortalBanner variant="info" className="mt-4">
          <CalendarClock className="size-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700">
            <span className="font-medium">Scheduled:</span> {formatScheduledSlot(ticket.scheduled_date).date} &middot; {formatScheduledSlot(ticket.scheduled_date).slot}
          </p>
        </PortalBanner>
      )}

      {/* Schedule form */}
      {stage === 'schedule' && (
        <PortalCard className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Book a slot</h3>
          <div>
            <label className="text-sm font-medium text-foreground">Select a date</label>
            <MiniCalendar
              selected={scheduleDate}
              onSelect={(d) => { setScheduleDate(d); setScheduleSlot('') }}
              minDate={getMinBookableDate(leadHours)}
              isDateDisabled={(dateStr) => getAvailableSlots(dateStr, leadHours).size === 0}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">When can you attend?</label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => {
                const disabled = availableSlots != null && !availableSlots.has(slot.hour)
                return (
                  <button
                    key={slot.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => setScheduleSlot(slot.value as typeof scheduleSlot)}
                    className={`rounded-lg border-2 px-3 py-2.5 text-center transition-colors ${
                      scheduleSlot === slot.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : disabled
                          ? 'border-border/50 bg-muted text-muted-foreground/50 cursor-not-allowed'
                          : 'border-border bg-card text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    <span className="block text-sm font-medium">{slot.label}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">{slot.range}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="e.g. Will need access to loft..."
              value={scheduleNotes}
              onChange={(e) => setScheduleNotes(e.target.value)}
            />
          </div>
          <button
            onClick={handleSchedule}
            disabled={submittingSchedule || !scheduleDate || !scheduleSlot}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submittingSchedule ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Confirm Booking'}
          </button>
        </PortalCard>
      )}

      {/* Previous contractor updates */}
      {ticket.tenant_updates?.filter(u => u.type === 'contractor_not_completed' || u.type === 'contractor_completed').length > 0 && (
        <div className="mt-4 space-y-2">
          {ticket.tenant_updates.filter(u => u.type === 'contractor_not_completed' || u.type === 'contractor_completed').map((update, i) => (
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
                <span className="text-xs text-muted-foreground">
                  {new Date(update.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {(update.reason || update.notes) && (
                <p className="mt-1 text-sm text-foreground">{update.reason || update.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Compliance renewal form */}
      {stage === 'complete' && isComplianceRenewal && !ticket.resolved_at && ticket.scheduled_date && new Date(new Date(ticket.scheduled_date).toDateString()) <= new Date(new Date().toDateString()) && (
        <PortalCard className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Upload renewed {certLabel}</h3>
          </div>

          {ticket.compliance_expiry_date && (
            <p className="text-xs text-muted-foreground">
              Current certificate expired {formatDate(ticket.compliance_expiry_date)}
            </p>
          )}

          <div>
            <label className="text-sm font-medium text-foreground">New expiry date *</label>
            <input
              type="date"
              value={certExpiryDate}
              onChange={(e) => setCertExpiryDate(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Issued by</label>
            <input
              type="text"
              value={certIssuedBy}
              onChange={(e) => setCertIssuedBy(e.target.value)}
              placeholder="e.g. British Gas, Lambeth Council"
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Certificate number</label>
            <input
              type="text"
              value={certNumber}
              onChange={(e) => setCertNumber(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">
              Certificate document *
            </label>
            {certFile ? (
              <button
                type="button"
                onClick={() => setCertFile(null)}
                className="mt-1.5 flex items-center gap-2 w-full px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted/50 transition-colors"
              >
                <FileText className="size-4 text-primary shrink-0" />
                <span className="truncate flex-1 text-left text-foreground">{certFile.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">Change</span>
              </button>
            ) : (
              <label className="mt-1.5 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer py-6">
                <Upload className="size-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground font-medium">Upload certificate</span>
                <span className="text-xs text-muted-foreground/70 mt-1">PDF, JPG, PNG up to 10MB</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    if (f.size > 10 * 1024 * 1024) return
                    setCertFile(f)
                  }}
                />
              </label>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              rows={2}
              placeholder="Any notes about the renewal..."
              value={certNotes}
              onChange={(e) => setCertNotes(e.target.value)}
            />
          </div>

          <button
            onClick={handleCertCompletion}
            disabled={submittingCert || !certExpiryDate || !certFile}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submittingCert ? (
              <Loader2 className="size-4 animate-spin mx-auto" />
            ) : 'Submit Certificate'}
          </button>
        </PortalCard>
      )}

      {/* Maintenance completion form (not shown for compliance tickets) */}
      {stage === 'complete' && !isComplianceRenewal && !ticket.resolved_at && ticket.scheduled_date && new Date(new Date(ticket.scheduled_date).toDateString()) <= new Date(new Date().toDateString()) && (
        <PortalCard className="mt-4 space-y-4">
          <h3 className="text-sm font-medium text-foreground">Has this job been completed?</h3>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setCompletionStatus('complete')}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                completionStatus === 'complete'
                  ? 'border-green-500 bg-green-50 text-green-700'
                  : 'border-border bg-card text-foreground hover:border-foreground/30'
              }`}
            >
              <CheckCircle2 className={`size-5 mx-auto mb-1.5 ${completionStatus === 'complete' ? 'text-green-500' : 'text-muted-foreground'}`} />
              Job Complete
            </button>
            <button
              type="button"
              onClick={() => setCompletionStatus('not-complete')}
              className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                completionStatus === 'not-complete'
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-border bg-card text-foreground hover:border-foreground/30'
              }`}
            >
              <AlertTriangle className={`size-5 mx-auto mb-1.5 ${completionStatus === 'not-complete' ? 'text-orange-500' : 'text-muted-foreground'}`} />
              Not Complete
            </button>
          </div>

          {completionStatus === 'complete' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Photos <span className="font-normal text-muted-foreground">(optional, max 5)</span>
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addPhotos(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))) }}
                  className="mt-1.5 relative rounded-lg border-2 border-dashed border-border bg-muted hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                    <Upload className="size-6 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground font-medium">Drop photos here or tap to upload</span>
                    <span className="text-xs text-muted-foreground/70 mt-1">JPG, PNG up to 10MB each</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && addPhotos(Array.from(e.target.files))}
                    />
                  </label>
                </div>
                {completionPhotos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {completionPhotos.map((file, i) => (
                      <div key={i} className="relative group">
                        <div className="size-16 rounded-lg overflow-hidden border border-border bg-muted">
                          <img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" />
                        </div>
                        <button
                          type="button"
                          onClick={() => setCompletionPhotos(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                <label className="text-sm font-medium text-foreground">
                  Reason <span className="font-normal text-muted-foreground">(required)</span>
                </label>
                <textarea
                  className="mt-1.5 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
              disabled={submittingCompletion || (completionStatus === 'not-complete' && !completionReason.trim())}
              className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                completionStatus === 'complete'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {submittingCompletion ? (
                <Loader2 className="size-4 animate-spin mx-auto" />
              ) : completionStatus === 'complete' ? 'Submit Completion' : 'Report Issue'}
            </button>
          )}
        </PortalCard>
      )}

      {/* Done state */}
      {stage === 'done' && (
        <PortalBanner variant="success" className="mt-4">
          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-700">
            This job has been completed. Thank you.
          </p>
        </PortalBanner>
      )}
    </PortalShell>
  )
}
