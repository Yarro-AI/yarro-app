'use client'

import { useState } from 'react'
import { Check, Circle, Wrench, Search, CalendarCheck, CheckCircle2, Loader2, Phone, CalendarClock, AlertTriangle, Upload, X, ShieldCheck, FileText } from 'lucide-react'
import { CERTIFICATE_LABELS, type CertificateType } from '@/lib/constants'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MiniCalendar } from './mini-calendar'
import { MediaGrid } from './media-grid'
import type { ContractorPortalData, ContractorQuoteData } from '@/lib/portal-types'

// ─── Formatting ─────────────────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    + ' \u00b7 '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtShortDatetime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' \u00b7 '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

// ─── Stage Logic ────────────────────────────────────────────────────────

const STAGES = ['assigned', 'booked', 'completed'] as const
type StageKey = typeof STAGES[number]

const STAGE_CONFIG: Record<StageKey, { label: string; icon: React.ReactNode }> = {
  assigned:  { label: 'Assigned',  icon: <Search className="size-4" /> },
  booked:    { label: 'Booked',    icon: <CalendarCheck className="size-4" /> },
  completed: { label: 'Completed', icon: <CheckCircle2 className="size-4" /> },
}

function getActiveStageIdx(data: ContractorPortalData): number {
  if (data.resolved_at) return 2
  if (data.scheduled_date) return 1
  return 0
}

// ─── Time Slots ─────────────────────────────────────────────────────────

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
    if ((slotStart.getTime() - now.getTime()) / (1000 * 60 * 60) >= leadHours) available.add(slot.hour)
  }
  return available
}

function getMinBookableDate(leadHours: number): Date {
  const candidate = new Date()
  candidate.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    const dateStr = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`
    if (getAvailableSlots(dateStr, leadHours).size > 0) return candidate
    candidate.setDate(candidate.getDate() + 1)
  }
  return new Date()
}

// ─── Props ──────────────────────────────────────────────────────────────

export type ContractorPortalV2Props = {
  data: ContractorPortalData
  onSchedule: (date: string, slot: string, notes: string | null) => Promise<void>
  onCompletion: (resolved: boolean, notes: string | null, photos: File[]) => Promise<void>
  onComplianceCompletion?: (data: { expiryDate: string; issuedBy: string; certNumber: string; file: File | null; notes: string }) => Promise<void>
}

// ─── Main Component ─────────────────────────────────────────────────────

export function ContractorPortalV2({ data, onSchedule, onCompletion, onComplianceCompletion }: ContractorPortalV2Props) {
  const activeIdx = getActiveStageIdx(data)
  const needsScheduling = activeIdx === 0
  const isCompliance = !!data.compliance_certificate_id
  const certLabel = data.compliance_cert_type
    ? CERTIFICATE_LABELS[data.compliance_cert_type as CertificateType] || data.compliance_cert_type
    : 'Certificate'

  return (
    <div className="min-h-screen bg-background" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[640px] px-5 py-8 flex flex-col gap-5">
        {/* Overview card */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              T-{data.ticket_ref}
            </span>
            {needsScheduling && data.contractor_quote && (
              <span className="inline-block rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-[11px] font-medium text-green-700">
                Quote approved &middot; &pound;{Number(data.contractor_quote).toFixed(2)}
              </span>
            )}
            {isCompliance && data.compliance_expiry_date && (
              <span className="inline-block rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                Expires {fmtDate(data.compliance_expiry_date)}
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground leading-snug">{data.property_address}</h1>
          <p className="mt-1.5 text-base font-medium text-muted-foreground">{data.issue_title}</p>
          <p className="mt-1 text-xs text-muted-foreground">From {data.agency_name} &middot; {fmtDatetime(data.date_logged)}</p>
        </div>

        {/* Content card */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <Tabs defaultValue={needsScheduling ? 'schedule' : 'action'} className="gap-0">
            <TabsList className="bg-transparent rounded-none border-b border-border p-0 h-auto w-full">
              {needsScheduling ? (
                <>
                  <TabsTrigger value="schedule" className={tabTriggerClass}>Schedule</TabsTrigger>
                  {!isCompliance && <TabsTrigger value="details" className={tabTriggerClass}>Details</TabsTrigger>}
                  <TabsTrigger value="info" className={tabTriggerClass}>Info</TabsTrigger>
                </>
              ) : (
                <>
                  <TabsTrigger value="action" className={tabTriggerClass}>
                    {isCompliance ? 'Renewal' : activeIdx === 1 ? 'Complete' : 'Status'}
                  </TabsTrigger>
                  {!isCompliance && <TabsTrigger value="details" className={tabTriggerClass}>Details</TabsTrigger>}
                  <TabsTrigger value="info" className={tabTriggerClass}>Info</TabsTrigger>
                </>
              )}
            </TabsList>

            {needsScheduling && (
              <TabsContent value="schedule" className="p-5">
                <ScheduleForm data={data} onSchedule={onSchedule} />
              </TabsContent>
            )}
            {!needsScheduling && (
              <TabsContent value="action" className="p-5">
                <ActionTab data={data} onSchedule={onSchedule} onCompletion={onCompletion} onComplianceCompletion={onComplianceCompletion} />
              </TabsContent>
            )}
            {!isCompliance && (
              <TabsContent value="details" className="p-5">
                <DetailsTab data={data} />
              </TabsContent>
            )}
            <TabsContent value="info" className="p-5">
              <ContactTab data={data} isCompliance={isCompliance} certLabel={certLabel} />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground/40">Powered by Yarro</p>
      </div>
    </div>
  )
}

// ─── Content Card ───────────────────────────────────────────────────────

const tabTriggerClass = 'flex-1 rounded-none h-auto text-[13px] py-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground'

// ─── Action Tab ─────────────────────────────────────────────────────────

function ActionTab({ data, onSchedule, onCompletion, onComplianceCompletion }: { data: ContractorPortalData; onSchedule: (date: string, slot: string, notes: string | null) => Promise<void>; onCompletion: (resolved: boolean, notes: string | null, photos: File[]) => Promise<void>; onComplianceCompletion?: (data: { expiryDate: string; issuedBy: string; certNumber: string; file: File | null; notes: string }) => Promise<void> }) {
  const stageIdx = getActiveStageIdx(data)
  const isCompliance = !!data.compliance_certificate_id
  const certLabel = data.compliance_cert_type
    ? CERTIFICATE_LABELS[data.compliance_cert_type as CertificateType] || data.compliance_cert_type
    : 'Certificate'
  const [complianceSubmitted, setComplianceSubmitted] = useState(false)

  // Show success state — either from backend (stageIdx===2) or local submit
  if (stageIdx === 2 || complianceSubmitted) {
    if (isCompliance) {
      return (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-5 text-center">
          <ShieldCheck className="size-10 text-green-600 mx-auto mb-3" />
          <p className="text-base font-semibold text-green-700">Certificate renewed</p>
          <p className="text-sm text-green-600 mt-1">{certLabel} at {data.property_address}</p>
          <p className="text-xs text-green-600/70 mt-3">The property manager has been notified.</p>
        </div>
      )
    }
    return (
      <div className="rounded-md bg-green-50 border border-green-200 px-3 py-3 text-sm text-green-700 flex items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0" />
        This job has been completed. Thank you.
      </div>
    )
  }

  if (stageIdx === 1) {
    if (isCompliance && onComplianceCompletion) {
      return (
        <ComplianceCertForm
          data={data}
          certLabel={certLabel}
          onSubmit={async (formData) => {
            await onComplianceCompletion(formData)
            setComplianceSubmitted(true)
          }}
        />
      )
    }
    return <CompletionForm data={data} onCompletion={onCompletion} />
  }
  return <ScheduleForm data={data} onSchedule={onSchedule} />
}

function ScheduleForm({ data, onSchedule }: { data: ContractorPortalData; onSchedule: (date: string, slot: string, notes: string | null) => Promise<void> }) {
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleSlot, setScheduleSlot] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const leadHours = data.min_booking_lead_hours ?? 24
  const availableSlots = scheduleDate ? getAvailableSlots(scheduleDate, leadHours) : null

  async function handleSubmit() {
    if (!scheduleDate || !scheduleSlot) return
    setSubmitting(true)
    await onSchedule(scheduleDate, scheduleSlot, notes || null)
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      {/* Availability hint — prominent so the contractor knows when to book */}
      {data.availability && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-primary/70 mb-1">Availability</p>
          <p className="text-sm font-medium text-primary">{data.availability}</p>
        </div>
      )}

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
        <label className="text-sm font-medium text-foreground">Time slot</label>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {TIME_SLOTS.map((slot) => {
            const disabled = availableSlots != null && !availableSlots.has(slot.hour)
            return (
              <button key={slot.value} type="button" disabled={disabled} onClick={() => setScheduleSlot(slot.value)}
                className={`rounded-lg border-2 px-3 py-2.5 text-center transition-colors ${
                  scheduleSlot === slot.value ? 'border-primary bg-primary/5 text-primary' :
                  disabled ? 'border-border/50 bg-muted text-muted-foreground/50 cursor-not-allowed' :
                  'border-border bg-card text-muted-foreground hover:border-foreground/30'
                }`}>
                <span className="block text-sm font-medium">{slot.label}</span>
                <span className="block text-[10px] text-muted-foreground mt-0.5">{slot.range}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} placeholder="e.g. Will need access to loft..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button onClick={handleSubmit} disabled={submitting || !scheduleDate || !scheduleSlot} className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Confirm Booking'}
      </button>
    </div>
  )
}

function CompletionForm({ data, onCompletion }: { data: ContractorPortalData; onCompletion: (resolved: boolean, notes: string | null, photos: File[]) => Promise<void> }) {
  const [status, setStatus] = useState<'complete' | 'not-complete' | null>(null)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!status) return
    setSubmitting(true)
    if (status === 'not-complete') await onCompletion(false, reason || null, [])
    else await onCompletion(true, notes || null, photos)
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <SectionLabel>Has this job been completed?</SectionLabel>

      {data.scheduled_date && (
        <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary flex items-center gap-2">
          <CalendarClock className="size-3.5 shrink-0" />
          Scheduled: {fmtDatetime(data.scheduled_date)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setStatus('complete')} className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${status === 'complete' ? 'border-green-500 bg-green-50 text-green-700' : 'border-border bg-card text-foreground hover:border-foreground/30'}`}>
          <CheckCircle2 className={`size-5 mx-auto mb-1.5 ${status === 'complete' ? 'text-green-500' : 'text-muted-foreground'}`} />
          Job Complete
        </button>
        <button type="button" onClick={() => setStatus('not-complete')} className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${status === 'not-complete' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-border bg-card text-foreground hover:border-foreground/30'}`}>
          <AlertTriangle className={`size-5 mx-auto mb-1.5 ${status === 'not-complete' ? 'text-orange-500' : 'text-muted-foreground'}`} />
          Not Complete
        </button>
      </div>

      {status === 'complete' && (
        <>
          <div>
            <label className="text-sm font-medium text-foreground">Photos <span className="font-normal text-muted-foreground">(optional, max 5)</span></label>
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); setPhotos(prev => [...prev, ...files.filter(f => f.size <= 10 * 1024 * 1024)].slice(0, 5)) }} className="mt-1.5 rounded-lg border-2 border-dashed border-border bg-muted hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer">
              <label className="flex flex-col items-center justify-center py-6 cursor-pointer">
                <Upload className="size-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground font-medium">Drop photos or tap to upload</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && setPhotos(prev => [...prev, ...Array.from(e.target.files!).filter(f => f.size <= 10 * 1024 * 1024)].slice(0, 5))} />
              </label>
            </div>
            {photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((file, i) => (
                  <div key={i} className="relative group">
                    <div className="size-16 rounded-lg overflow-hidden border border-border bg-muted"><img src={URL.createObjectURL(file)} alt="" className="size-full object-cover" /></div>
                    <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={3} placeholder="Brief description of work completed..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </>
      )}

      {status === 'not-complete' && (
        <div>
          <label className="text-sm font-medium text-foreground">Reason <span className="font-normal text-muted-foreground">(required)</span></label>
          <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={3} placeholder="Why couldn't the job be completed?" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      )}

      {status && (
        <button onClick={handleSubmit} disabled={submitting || (status === 'not-complete' && !reason.trim())} className={`w-full rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${status === 'complete' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
          {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : status === 'complete' ? 'Submit Completion' : 'Report Issue'}
        </button>
      )}
    </div>
  )
}

// ─── Compliance Cert Form ──────────────────────────────────────────────

function ComplianceCertForm({ data, certLabel, onSubmit }: {
  data: ContractorPortalData
  certLabel: string
  onSubmit: (data: { expiryDate: string; issuedBy: string; certNumber: string; file: File | null; notes: string }) => Promise<void>
}) {
  const [expiryDate, setExpiryDate] = useState('')
  const [issuedBy, setIssuedBy] = useState('')
  const [certNumber, setCertNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!expiryDate || !file) return
    setSubmitting(true)
    await onSubmit({ expiryDate, issuedBy, certNumber, file, notes })
    setSubmitting(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <SectionLabel>Upload renewed {certLabel}</SectionLabel>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">New expiry date *</label>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Issued by</label>
        <input
          type="text"
          value={issuedBy}
          onChange={(e) => setIssuedBy(e.target.value)}
          placeholder="e.g. British Gas, Lambeth Council"
          className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Certificate number</label>
        <input
          type="text"
          value={certNumber}
          onChange={(e) => setCertNumber(e.target.value)}
          placeholder="Optional"
          className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Certificate document *</label>
        {file ? (
          <button
            type="button"
            onClick={() => setFile(null)}
            className="mt-1.5 flex items-center gap-2 w-full px-3 py-2 border border-border rounded-md text-sm hover:bg-muted/50 transition-colors"
          >
            <FileText className="size-4 text-primary shrink-0" />
            <span className="truncate flex-1 text-left text-foreground text-[13px]">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">Change</span>
          </button>
        ) : (
          <label className="mt-1.5 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border bg-muted hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer py-6">
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
                setFile(f)
              }}
            />
          </label>
        )}
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea
          className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          rows={2}
          placeholder="Any notes about the renewal..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !expiryDate || !file}
        className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Certificate'}
      </button>
    </div>
  )
}

// ─── Details Tab (issue + photos) ───────────────────────────────────────

function DetailsTab({ data }: { data: ContractorPortalData }) {
  return (
    <>
      <SectionLabel>Issue</SectionLabel>
      <p className="text-sm text-foreground leading-relaxed mt-2">{data.issue_description}</p>
      <MediaGrid images={data.images} />
    </>
  )
}

// ─── Info Tab (job info + agency + tenant contact) ──────────────────────

function ContactTab({ data, isCompliance, certLabel }: { data: ContractorPortalData; isCompliance?: boolean; certLabel?: string }) {
  return (
    <>
      <SectionLabel>Job info</SectionLabel>
      <div className="mt-2">
        <InfoRow label="Category" value={isCompliance && certLabel ? `${certLabel} Renewal` : data.category || '—'} />
        <InfoRow label="Priority" value={<span className={data.priority === 'urgent' ? 'text-destructive' : ''}>{data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}</span>} />
        <InfoRow label="Reported" value={fmtDate(data.date_logged)} />
        {data.scheduled_date && <InfoRow label="Booked" value={fmtDatetime(data.scheduled_date)} />}
        {data.availability && <InfoRow label="Availability" value={data.availability} last={isCompliance} />}
      </div>

      {!isCompliance && (
        <>
          <div className="border-t border-border my-4" />

          <SectionLabel>Agency</SectionLabel>
          <div className="mt-2">
            <InfoRow label="Agency" value={data.agency_name} />
            {data.agency_phone && <InfoRow label="Phone" value={<a href={`tel:${data.agency_phone}`} className="text-primary hover:underline">{data.agency_phone}</a>} />}
            {data.agency_email && <InfoRow label="Email" value={<a href={`mailto:${data.agency_email}`} className="text-primary hover:underline text-xs">{data.agency_email}</a>} last />}
          </div>

          <div className="border-t border-border my-4" />

          <SectionLabel>Tenant</SectionLabel>
          <div className="mt-2">
            <InfoRow label="Name" value={data.tenant_name || <span className="text-muted-foreground font-normal">Not provided</span>} />
            <InfoRow label="Contact" value={data.tenant_phone ? <a href={`tel:${data.tenant_phone}`} className="text-primary hover:underline inline-flex items-center gap-1"><Phone className="size-3" />{formatPhone(data.tenant_phone)}</a> : <span className="text-muted-foreground font-normal">Not provided</span>} last />
          </div>
        </>
      )}
    </>
  )
}

// ─── Shared ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
}

function InfoRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between items-start gap-4 py-2.5 ${last ? '' : 'border-b border-border/40'}`}>
      <span className="text-[13px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-foreground text-right">{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Contractor Quote Flow (separate entry point — dispatch → quote → schedule)
// ═══════════════════════════════════════════════════════════════════════

export type ContractorQuoteV2Props = {
  data: ContractorQuoteData
  onQuoteSubmit: (amount: number, notes: string | null) => Promise<void>
}

export function ContractorQuoteV2({ data, onQuoteSubmit }: ContractorQuoteV2Props) {
  return (
    <div className="min-h-screen bg-background" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[640px] px-5 py-8 flex flex-col gap-5">
        {/* Overview card */}
        <div className="bg-card rounded-2xl border border-border p-6">
          <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground mb-4">
            T-{data.ticket_ref}
          </span>
          <h1 className="text-xl font-semibold text-foreground leading-snug">{data.property_address}</h1>
          <p className="mt-1.5 text-base font-medium text-muted-foreground">{data.issue_title}</p>
          <p className="mt-1 text-xs text-muted-foreground">From {data.agency_name} &middot; {fmtDatetime(data.date_logged)}</p>
        </div>

        {/* Content card — 2 tabs: Details | Info */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <Tabs defaultValue="details" className="gap-0">
            <TabsList className="bg-transparent rounded-none border-b border-border p-0 h-auto w-full">
              <TabsTrigger value="details" className={tabTriggerClass}>Details</TabsTrigger>
              <TabsTrigger value="info" className={tabTriggerClass}>Info</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="p-5">
              <QuoteDetailsTab data={data} onQuoteSubmit={onQuoteSubmit} />
            </TabsContent>
            <TabsContent value="info" className="p-5">
              <QuoteInfoTab data={data} />
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs text-muted-foreground/40">Powered by Yarro</p>
      </div>
    </div>
  )
}

// ─── Quote Details Tab (issue + photos + quote form or schedule) ────────

function QuoteDetailsTab({ data, onQuoteSubmit }: { data: ContractorQuoteData; onQuoteSubmit: (amount: number, notes: string | null) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  async function handleQuoteSubmit() {
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) return
    setSubmitting(true)
    await onQuoteSubmit(parsed, notes || null)
    setSubmitting(false)
    setShowConfirmation(true)
    setTimeout(() => setShowConfirmation(false), 3000)
  }

  return (
    <>
      {/* Issue */}
      <SectionLabel>Issue</SectionLabel>
      <p className="text-sm text-foreground leading-relaxed mt-2">{data.issue_description}</p>

      <MediaGrid images={data.images} />

      <div className="border-t border-border my-4" />

      {data.quote_status === 'submitted' ? (
        /* Submitted → confirmation banner */
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm font-medium text-green-700">Quote of &pound;{data.quote_amount} submitted</p>
          {data.quote_notes && <p className="text-xs text-green-600 mt-1">{data.quote_notes}</p>}
          <p className="text-xs text-green-600 mt-2">The property manager will review and get back to you.</p>
        </div>
      ) : (
        /* Fresh → quote form (no section title) */
        <div className="space-y-4">
          {showConfirmation && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
              Quote submitted — the property manager has been notified.
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground">Quote amount</label>
            <div className="mt-1.5 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">&pound;</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              rows={3}
              placeholder="Any details about the quote, materials needed, timeline..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            onClick={handleQuoteSubmit}
            disabled={submitting || !amount || parseFloat(amount) <= 0}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : 'Submit Quote'}
          </button>
        </div>
      )}
    </>
  )
}

// ─── Quote Info Tab (job info + agency contact, no tenant) ──────────────

function QuoteInfoTab({ data }: { data: ContractorQuoteData }) {
  return (
    <>
      <SectionLabel>Job info</SectionLabel>
      <div className="mt-2">
        {data.category && <InfoRow label="Category" value={data.category} />}
        <InfoRow
          label="Priority"
          value={<span className={data.priority === 'urgent' ? 'text-destructive' : ''}>{data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}</span>}
        />
        {data.availability && <InfoRow label="Availability" value={data.availability} />}
        <InfoRow label="Reported" value={fmtDate(data.date_logged)} last />
      </div>

      <div className="border-t border-border my-4" />

      <SectionLabel>Agency</SectionLabel>
      <div className="mt-2">
        <InfoRow label="Agency" value={data.agency_name} />
        {data.agency_phone && <InfoRow label="Phone" value={<a href={`tel:${data.agency_phone}`} className="text-primary hover:underline">{data.agency_phone}</a>} />}
        {data.agency_email && <InfoRow label="Email" value={<a href={`mailto:${data.agency_email}`} className="text-primary hover:underline text-xs">{data.agency_email}</a>} last />}
      </div>
    </>
  )
}
