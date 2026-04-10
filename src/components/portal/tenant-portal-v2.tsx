'use client'

import { useState } from 'react'
import { Check, Circle, Wrench, Search, CalendarCheck, CheckCircle2, Phone } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { TenantPortalData } from '@/lib/portal-types'

// ─── Date Formatting ────────────────────────────────────────────────────

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

const STAGES = ['reported', 'contractor_found', 'booked', 'completed'] as const
type StageKey = typeof STAGES[number]

const STAGE_CONFIG: Record<StageKey, {
  label: string
  icon: React.ReactNode
}> = {
  reported:         { label: 'Reported',          icon: <Wrench className="size-4" /> },
  contractor_found: { label: 'Contractor found',  icon: <Search className="size-4" /> },
  booked:           { label: 'Job booked',         icon: <CalendarCheck className="size-4" /> },
  completed:        { label: 'Completed',          icon: <CheckCircle2 className="size-4" /> },
}

function getActiveStageIdx(data: TenantPortalData): number {
  if (data.resolved_at) return 3
  if (data.scheduled_date) return 2
  if (data.contractor_name) return 1
  return 0
}

// ─── Props ──────────────────────────────────────────────────────────────

export type TenantPortalV2Props = {
  data: TenantPortalData
  onAvailabilityUpdate: (text: string) => Promise<void>
}

// ─── Main Component ─────────────────────────────────────────────────────

export function TenantPortalV2({ data, onAvailabilityUpdate }: TenantPortalV2Props) {
  const activeIdx = getActiveStageIdx(data)

  return (
    <div className="min-h-screen bg-background" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-[640px] px-5 py-8 flex flex-col gap-5">
        {/* Top — Overview card */}
        <OverviewCard data={data} activeIdx={activeIdx} />

        {/* Bottom — Tabbed content */}
        <ContentCard data={data} onAvailabilityUpdate={onAvailabilityUpdate} />

        <p className="text-center text-xs text-muted-foreground/40">Powered by Yarro</p>
      </div>
    </div>
  )
}

// ─── Overview Card ──────────────────────────────────────────────────────

function OverviewCard({ data, activeIdx }: { data: TenantPortalData; activeIdx: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6">
      {/* Badge */}
      <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground mb-4">
        T-{data.ticket_ref}
      </span>

      {/* Identity */}
      <h1 className="text-xl font-semibold text-foreground leading-snug">
        {data.property_address}
      </h1>
      <p className="mt-1.5 text-base font-medium text-muted-foreground">
        {data.issue_title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Reported {fmtDatetime(data.date_logged)}
      </p>

      {/* Divider */}
      <div className="border-t border-border my-5" />

      {/* Horizontal progress tracker */}
      <div className="flex items-start">
        {STAGES.map((stageKey, i) => {
          const config = STAGE_CONFIG[stageKey]
          const isDone = i < activeIdx
          const isActive = i === activeIdx
          const isPending = i > activeIdx
          const isLast = i === STAGES.length - 1

          return (
            <div key={stageKey} className="contents">
              {/* Node */}
              <div className="flex flex-col items-center shrink-0" style={{ width: 64 }}>
                <div className={`flex items-center justify-center size-7 rounded-full transition-colors ${
                  isActive
                    ? 'bg-primary text-white ring-4 ring-primary/20'
                    : isDone
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {isDone ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : isActive ? (
                    <Circle className="size-2 fill-white text-white" />
                  ) : (
                    config.icon
                  )}
                </div>
                <span className={`mt-2 text-[10px] font-medium text-center leading-tight ${
                  isActive ? 'text-primary' : isDone ? 'text-green-600' : 'text-muted-foreground'
                }`}>
                  {config.label}
                </span>
              </div>

              {/* Connector */}
              {!isLast && (
                <div className={`h-0.5 flex-1 mt-3.5 ${
                  i < activeIdx ? 'bg-green-400' : 'bg-border'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Content Card ───────────────────────────────────────────────────────

const tabTriggerClass = 'flex-1 rounded-none h-auto text-[13px] py-3 border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:font-medium data-[state=active]:shadow-none text-muted-foreground hover:text-foreground'

function ContentCard({ data, onAvailabilityUpdate }: { data: TenantPortalData; onAvailabilityUpdate: (text: string) => Promise<void> }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <Tabs defaultValue="details" className="gap-0">
        <TabsList className="bg-transparent rounded-none border-b border-border p-0 h-auto w-full">
          <TabsTrigger value="details" className={tabTriggerClass}>Details</TabsTrigger>
          <TabsTrigger value="updates" className={tabTriggerClass}>Updates</TabsTrigger>
          <TabsTrigger value="contact" className={tabTriggerClass}>Contact</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="p-5">
          <DetailsTab data={data} onAvailabilityUpdate={onAvailabilityUpdate} />
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

// ─── Details Tab ────────────────────────────────────────────────────────

function DetailsTab({ data, onAvailabilityUpdate }: { data: TenantPortalData; onAvailabilityUpdate: (text: string) => Promise<void> }) {
  const stageIdx = getActiveStageIdx(data)
  const stageLabel = STAGE_CONFIG[STAGES[stageIdx]].label

  return (
    <>
      <SectionLabel>Issue</SectionLabel>
      <p className="text-sm text-foreground leading-relaxed mt-2">
        {data.issue_description}
      </p>

      <div className="border-t border-border my-4" />

      <SectionLabel>Ticket info</SectionLabel>
      <div className="mt-2">
        <InfoRow label="Reference" value={`T-${data.ticket_ref}`} />
        {data.category && <InfoRow label="Category" value={data.category} />}
        <InfoRow
          label="Priority"
          value={<span className={data.priority === 'urgent' ? 'text-destructive' : ''}>{data.priority.charAt(0).toUpperCase() + data.priority.slice(1)}</span>}
        />
        <InfoRow label="Status" value={stageLabel} />
        <InfoRow label="Reported" value={fmtDate(data.date_logged)} last />
      </div>

      <div className="border-t border-border my-4" />

      <SectionLabel>Your availability</SectionLabel>
      <AvailabilityEditor current={data.availability} onSave={onAvailabilityUpdate} />
    </>
  )
}

// ─── Updates Tab ────────────────────────────────────────────────────────

function UpdatesTab({ data }: { data: TenantPortalData }) {
  const sorted = [...data.activity].reverse()

  return (
    <>
      <SectionLabel>Activity</SectionLabel>
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No updates yet.</p>
      ) : (
        <div className="mt-3">
          {sorted.map((entry, i) => (
            <div
              key={i}
              className={`flex gap-2.5 py-2.5 ${i < sorted.length - 1 ? 'border-b border-border/40' : ''}`}
            >
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

function ContactTab({ data }: { data: TenantPortalData }) {
  return (
    <>
      <SectionLabel>Your agency</SectionLabel>
      <div className="mt-2">
        <InfoRow label="Agency" value={data.agency_name} />
        {data.agency_phone && (
          <InfoRow label="Phone" value={<a href={`tel:${data.agency_phone}`} className="text-primary hover:underline">{data.agency_phone}</a>} />
        )}
        {data.agency_email && (
          <InfoRow label="Email" value={<a href={`mailto:${data.agency_email}`} className="text-primary hover:underline text-xs">{data.agency_email}</a>} last />
        )}
      </div>

      <div className="border-t border-border my-4" />

      <SectionLabel>Assigned contractor</SectionLabel>
      <div className="mt-2">
        <InfoRow label="Name" value={data.contractor_name || <span className="text-muted-foreground font-normal">TBC</span>} />
        {data.contractor_trade && <InfoRow label="Trade" value={data.contractor_trade} />}
        <InfoRow
          label="Contact"
          value={
            data.contractor_phone ? (
              <a href={`tel:${data.contractor_phone}`} className="text-primary hover:underline inline-flex items-center gap-1">
                <Phone className="size-3" />
                {formatPhone(data.contractor_phone)}
              </a>
            ) : (
              <span className="text-muted-foreground font-normal">Pending assignment</span>
            )
          }
          last
        />
      </div>
    </>
  )
}

// ─── Availability Editor ────────────────────────────────────────────────

function AvailabilityEditor({ current, onSave }: { current: string | null; onSave: (text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current || '')
  const [saving, setSaving] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    await onSave(value.trim())
    setSaving(false)
    setEditing(false)
    setShowConfirmation(true)
    setTimeout(() => setShowConfirmation(false), 2000)
  }

  if (editing) {
    return (
      <div className="mt-2 space-y-3">
        <textarea
          className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save & notify contractor'}
          </button>
          <button
            onClick={() => { setEditing(false); setValue(current || '') }}
            className="rounded-md border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-foreground leading-relaxed flex-1">
          {current || <span className="text-muted-foreground italic">No availability set</span>}
        </p>
        <button
          onClick={() => { setEditing(true); setValue(current || '') }}
          className="text-xs text-primary hover:underline shrink-0"
        >
          Edit
        </button>
      </div>
      {showConfirmation && (
        <div className="mt-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
          Contractor notified of your updated availability.
        </div>
      )}
    </div>
  )
}

// ─── Shared Small Components ────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

function InfoRow({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between items-start gap-4 py-2.5 ${last ? '' : 'border-b border-border/40'}`}>
      <span className="text-[13px] text-muted-foreground shrink-0">{label}</span>
      <span className="text-[13px] font-medium text-foreground text-right">{value}</span>
    </div>
  )
}
