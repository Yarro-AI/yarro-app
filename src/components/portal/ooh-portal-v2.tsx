'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle, Clock, Loader2, Phone } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { OOHPortalData } from '@/lib/portal-types'

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

function formatPhone(raw: string): string {
  const digits = raw.replace(/^\+/, '')
  if (digits.startsWith('44') && digits.length === 12) {
    return `+44 ${digits.slice(2, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
  }
  return '+' + digits.replace(/(\d{2})(\d{4})(\d+)/, '$1 $2 $3')
}

// ─── Props ──────────────────────────────────────────────────────────────

export type OOHPortalV2Props = {
  data: OOHPortalData
  onSubmit: (outcome: string, notes: string | null, cost: number | null) => Promise<void>
}

// ─── Constants ──────────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<string, string> = {
  resolved: 'Handled',
  unresolved: 'Couldn\u2019t resolve',
  in_progress: 'In progress',
}

const OUTCOME_COLORS: Record<string, string> = {
  resolved: 'text-green-700 bg-green-50 border-green-200',
  unresolved: 'text-red-700 bg-red-50 border-red-200',
  in_progress: 'text-amber-700 bg-amber-50 border-amber-200',
}

const UNRESOLVED_REASONS = [
  'Need specialist',
  'Couldn\u2019t access property',
  'Tenant not home',
  'Other',
] as const

type Outcome = 'resolved' | 'unresolved' | 'in_progress'

// ─── Main Component ─────────────────────────────────────────────────────

export function OOHPortalV2({ data, onSubmit }: OOHPortalV2Props) {
  return (
    <div className="min-h-screen bg-background" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[640px] px-5 py-8 flex flex-col gap-5">
        <OverviewCard data={data} />
        <ContentCard data={data} onSubmit={onSubmit} />
        <p className="text-center text-xs text-muted-foreground/40">Powered by Yarro</p>
      </div>
    </div>
  )
}

// ─── Overview Card ──────────────────────────────────────────────────────

function OverviewCard({ data }: { data: OOHPortalData }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          T-{data.ticket_ref}
        </span>
        <span className="text-xs font-medium text-red-600">Emergency</span>
      </div>

      <h1 className="mt-3 text-xl font-semibold text-foreground leading-snug">
        {data.property_address}
      </h1>
      <p className="mt-1.5 text-base font-medium text-muted-foreground">
        {data.issue_title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reported {fmtDatetime(data.date_logged)}
      </p>

      {data.submissions.length > 0 && (
        <>
          <div className="border-t border-border my-4" />
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              OUTCOME_COLORS[data.submissions[data.submissions.length - 1].outcome] || 'bg-muted text-muted-foreground'
            }`}>
              {OUTCOME_LABELS[data.submissions[data.submissions.length - 1].outcome] || 'Updated'}
            </span>
            <span className="text-xs text-muted-foreground">
              {fmtShortDatetime(data.submissions[data.submissions.length - 1].submitted_at)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Content Card ───────────────────────────────────────────────────────

const tabTriggerClass = 'flex-1 rounded-none h-auto text-[13px] py-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground'

function ContentCard({ data, onSubmit }: { data: OOHPortalData; onSubmit: (outcome: string, notes: string | null, cost: number | null) => Promise<void> }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <Tabs defaultValue="response" className="gap-0">
        <TabsList className="bg-transparent rounded-none border-b border-border p-0 h-auto w-full">
          <TabsTrigger value="response" className={tabTriggerClass}>Response</TabsTrigger>
          <TabsTrigger value="updates" className={tabTriggerClass}>Updates</TabsTrigger>
          <TabsTrigger value="contact" className={tabTriggerClass}>Contact</TabsTrigger>
        </TabsList>

        <TabsContent value="response" className="p-5">
          <ResponseTab data={data} onSubmit={onSubmit} />
        </TabsContent>
        <TabsContent value="updates" className="p-5">
          <UpdatesTab data={data} />
        </TabsContent>
        <TabsContent value="contact" className="p-5">
          <ContactTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Response Tab ───────────────────────────────────────────────────────

function ResponseTab({ data, onSubmit }: { data: OOHPortalData; onSubmit: (outcome: string, notes: string | null, cost: number | null) => Promise<void> }) {
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null)
  const [notes, setNotes] = useState('')
  const [cost, setCost] = useState('')
  const [unresolvedReason, setUnresolvedReason] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const hasSubmissions = data.submissions.length > 0

  async function handleSubmit() {
    if (!selectedOutcome) return
    setSubmitting(true)
    const submitNotes = selectedOutcome === 'unresolved' && unresolvedReason
      ? `${unresolvedReason}${notes ? ': ' + notes : ''}`
      : notes
    await onSubmit(selectedOutcome, submitNotes || null, cost ? parseFloat(cost) : null)
    setSubmitting(false)
    setSelectedOutcome(null)
    setNotes('')
    setCost('')
    setUnresolvedReason(null)
    setShowConfirmation(true)
    setTimeout(() => setShowConfirmation(false), 3000)
  }

  return (
    <>
      <SectionLabel>{hasSubmissions ? 'Update status' : 'What\u2019s the status?'}</SectionLabel>

      {showConfirmation && (
        <div className="mt-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
          Status updated — {data.agency_name} has been notified.
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <OutcomeButton icon={<CheckCircle2 className="size-5" />} label="Handled" selected={selectedOutcome === 'resolved'} color="green" onClick={() => { setSelectedOutcome('resolved'); setUnresolvedReason(null) }} />
        <OutcomeButton icon={<AlertTriangle className="size-5" />} label="Can't resolve" selected={selectedOutcome === 'unresolved'} color="red" onClick={() => setSelectedOutcome('unresolved')} />
        <OutcomeButton icon={<Clock className="size-5" />} label="In progress" selected={selectedOutcome === 'in_progress'} color="amber" onClick={() => { setSelectedOutcome('in_progress'); setUnresolvedReason(null) }} />
      </div>

      {selectedOutcome && (
        <div className="mt-4 space-y-3">
          {selectedOutcome === 'resolved' && (
            <>
              <div>
                <label className="text-sm font-medium text-foreground">What was done?</label>
                <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={3} placeholder="Brief description of the work..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Estimated cost <span className="font-normal text-muted-foreground">(optional)</span></label>
                <div className="relative mt-1.5">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">&pound;</span>
                  <input type="number" className="w-full rounded-md border border-input bg-background pl-7 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" placeholder="0.00" value={cost} onChange={(e) => setCost(e.target.value)} />
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
                    <button key={reason} type="button" onClick={() => setUnresolvedReason(reason)} className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${unresolvedReason === reason ? 'border-primary bg-primary/5 text-primary' : 'border-border text-foreground hover:bg-muted'}`}>
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
                <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} placeholder="Any additional details..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </>
          )}
          {selectedOutcome === 'in_progress' && (
            <div>
              <label className="text-sm font-medium text-foreground">ETA or notes</label>
              <textarea className="mt-1.5 w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} placeholder="e.g. Waiting for parts, back tomorrow morning..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || (selectedOutcome === 'resolved' && !notes) || (selectedOutcome === 'unresolved' && !unresolvedReason)}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? <Loader2 className="size-4 animate-spin mx-auto" /> : hasSubmissions ? 'Update Status' : 'Submit'}
          </button>
        </div>
      )}

      {hasSubmissions && (
        <>
          <div className="border-t border-border my-4" />
          <SectionLabel>Your updates</SectionLabel>
          <div className="mt-2 space-y-2">
            {[...data.submissions].reverse().map((sub, i) => (
              <div key={i} className={`rounded-lg border px-3.5 py-2.5 ${OUTCOME_COLORS[sub.outcome] || 'border-border bg-muted text-muted-foreground'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{OUTCOME_LABELS[sub.outcome] || sub.outcome}</span>
                  <span className="text-[10px] opacity-70">{fmtShortDatetime(sub.submitted_at)}</span>
                </div>
                {sub.notes && <p className="mt-1 text-xs opacity-80">{sub.notes}</p>}
                {sub.cost != null && <p className="mt-1 text-xs opacity-70">&pound;{Number(sub.cost).toFixed(2)}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ─── Updates Tab ────────────────────────────────────────────────────────

function UpdatesTab({ data }: { data: OOHPortalData }) {
  const sorted = [...data.activity].reverse()
  return (
    <>
      <SectionLabel>Activity</SectionLabel>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <div className="mt-3">
          {sorted.map((entry, i) => (
            <div key={i} className={`flex gap-2.5 py-2.5 ${i < sorted.length - 1 ? 'border-b border-border/40' : ''}`}>
              <div className={`size-2 rounded-full shrink-0 mt-[7px] ${i === 0 ? 'bg-primary' : 'bg-border'}`} />
              <div className="min-w-0">
                <p className="text-[13px] text-foreground leading-relaxed">{entry.message}</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">{fmtShortDatetime(entry.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ─── Contact Tab ────────────────────────────────────────────────────────

function ContactTab({ data }: { data: OOHPortalData }) {
  return (
    <>
      <SectionLabel>Your agency</SectionLabel>
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

function OutcomeButton({ icon, label, selected, color, onClick }: { icon: React.ReactNode; label: string; selected: boolean; color: 'green' | 'red' | 'amber'; onClick: () => void }) {
  const colors = {
    green: selected ? 'border-green-500 bg-green-50 text-green-700' : 'border-border text-muted-foreground hover:bg-muted',
    red: selected ? 'border-red-500 bg-red-50 text-red-700' : 'border-border text-muted-foreground hover:bg-muted',
    amber: selected ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border text-muted-foreground hover:bg-muted',
  }
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-medium transition-colors bg-card ${colors[color]}`}>
      {icon}
      {label}
    </button>
  )
}
