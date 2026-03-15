'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
  Save,
  Check,
  Clock,
  UserPlus,
  X,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/page-shell'
import { normalizePhone } from '@/lib/normalize'

// ─── Shared options (all values in minutes) ───

const REMINDER_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours' },
  { value: '480', label: '8 hours' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
]

const TIMEOUT_OPTIONS = [
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours' },
  { value: '480', label: '8 hours' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
  { value: '2880', label: '48 hours' },
  { value: '4320', label: '3 days' },
]

// ─── Draft (all stored in minutes internally) ───

interface DraftSettings {
  ticket_mode: 'auto' | 'review'
  dispatch_mode: 'sequential' | 'broadcast'
  contractor_reminder_on: boolean
  contractor_reminder: string
  contractor_timeout: string
  landlord_reminder_on: boolean
  landlord_reminder: string
  landlord_timeout: string
  completion_reminder_on: boolean
  completion_reminder: string
  completion_timeout: string
  ooh_enabled: boolean
  business_hours_start: string
  business_hours_end: string
  business_days: string[]
  ooh_routine_action: 'queue_review' | 'dispatch'
  min_booking_lead_hours: string
}

const LEAD_TIME_OPTIONS = [
  { value: '1', label: '1 hour' },
  { value: '2', label: '2 hours' },
  { value: '3', label: '3 hours' },
  { value: '4', label: '4 hours' },
  { value: '6', label: '6 hours' },
  { value: '8', label: '8 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '1 day' },
  { value: '48', label: '2 days' },
  { value: '72', label: '3 days' },
]

const DEFAULTS: DraftSettings = {
  ticket_mode: 'auto',
  dispatch_mode: 'sequential',
  contractor_reminder_on: true,
  contractor_reminder: '360',
  contractor_timeout: '720',
  landlord_reminder_on: true,
  landlord_reminder: '1440',
  landlord_timeout: '2880',
  completion_reminder_on: true,
  completion_reminder: '360',
  completion_timeout: '720',
  ooh_enabled: false,
  business_hours_start: '09:00',
  business_hours_end: '17:00',
  business_days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  ooh_routine_action: 'queue_review',
  min_booking_lead_hours: '3',
}

const ALL_DAYS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, '0')
  return { value: `${h}:00`, label: `${h}:00` }
})

interface OOHContact {
  id: string
  name: string
  phone: string
  contractor_id: string | null
  active: boolean
}

interface Contractor {
  id: string
  contractor_name: string
  contractor_phone: string
  category: string | null
}

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<DraftSettings>(DEFAULTS)
  const [saved, setSaved] = useState<DraftSettings>(DEFAULTS)
  const supabase = createClient()

  // OOH contacts state (separate from draft — immediate CRUD)
  const [oohContacts, setOohContacts] = useState<OOHContact[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [showAddContact, setShowAddContact] = useState(false)
  const [addMode, setAddMode] = useState<'contractor' | 'manual' | null>(null)
  const [newContactName, setNewContactName] = useState('')
  const [newContactPhone, setNewContactPhone] = useState('')
  const [selectedContractorId, setSelectedContractorId] = useState('')
  const [addingContact, setAddingContact] = useState(false)

  useEffect(() => {
    if (!propertyManager) return
    const pm = propertyManager as any
    const fromPM: DraftSettings = {
      ticket_mode: (pm.ticket_mode as 'auto' | 'review') || 'auto',
      dispatch_mode: (pm.dispatch_mode as 'sequential' | 'broadcast') || 'sequential',
      contractor_reminder_on: pm.contractor_reminder_minutes != null,
      contractor_reminder: (pm.contractor_reminder_minutes || 360).toString(),
      contractor_timeout: (pm.contractor_timeout_minutes || 720).toString(),
      landlord_reminder_on: pm.landlord_followup_hours != null,
      landlord_reminder: ((pm.landlord_followup_hours || 24) * 60).toString(),
      landlord_timeout: ((pm.landlord_timeout_hours || 48) * 60).toString(),
      completion_reminder_on: pm.completion_reminder_hours != null,
      completion_reminder: ((pm.completion_reminder_hours || 6) * 60).toString(),
      completion_timeout: ((pm.completion_timeout_hours || 12) * 60).toString(),
      ooh_enabled: pm.ooh_enabled || false,
      business_hours_start: (pm.business_hours_start || '09:00:00').slice(0, 5),
      business_hours_end: (pm.business_hours_end || '17:00:00').slice(0, 5),
      business_days: pm.business_days || ['mon', 'tue', 'wed', 'thu', 'fri'],
      ooh_routine_action: pm.ooh_routine_action || 'queue_review',
      min_booking_lead_hours: (pm.min_booking_lead_hours ?? 3).toString(),
    }
    setDraft(fromPM)
    setSaved(fromPM)
  }, [propertyManager])

  // Load OOH contacts + contractors
  useEffect(() => {
    if (!propertyManager) return
    const loadContacts = async () => {
      const { data } = await supabase
        .from('c1_profiles')
        .select('id, name, phone, contractor_id, active')
        .eq('pm_id', propertyManager.id)
        .eq('is_ooh_contact', true)
        .eq('active', true)
        .order('created_at')
      setOohContacts((data as OOHContact[]) || [])
    }
    const loadContractors = async () => {
      const { data } = await supabase
        .from('c1_contractors')
        .select('id, contractor_name, contractor_phone, category')
        .eq('property_manager_id', propertyManager.id)
        .eq('active', true)
        .order('contractor_name')
      setContractors((data as Contractor[]) || [])
    }
    loadContacts()
    loadContractors()
  }, [propertyManager, supabase])

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  const updateDraft = useCallback((partial: Partial<DraftSettings>) => {
    setDraft(prev => {
      const next = { ...prev, ...partial }

      const pairs: [keyof DraftSettings, keyof DraftSettings, keyof DraftSettings][] = [
        ['contractor_reminder_on', 'contractor_reminder', 'contractor_timeout'],
        ['landlord_reminder_on', 'landlord_reminder', 'landlord_timeout'],
        ['completion_reminder_on', 'completion_reminder', 'completion_timeout'],
      ]

      for (const [onKey, remKey, toKey] of pairs) {
        if (!next[onKey]) continue
        const rem = parseInt(next[remKey] as string)
        const to = parseInt(next[toKey] as string)
        const baseRemOpts = REMINDER_OPTIONS
        if (rem >= to) {
          if (partial.hasOwnProperty(toKey)) {
            // Timeout lowered → auto-lower reminder
            const valid = baseRemOpts.filter(o => parseInt(o.value) < to)
            if (valid.length > 0) (next as any)[remKey] = valid[valid.length - 1].value
          } else {
            // Reminder raised → auto-raise timeout
            const valid = TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > rem)
            if (valid.length > 0) (next as any)[toKey] = valid[0].value
          }
        }
      }

      return next
    })
  }, [])

  const handleToggle = (key: 'contractor' | 'landlord' | 'completion', on: boolean) => {
    const updates: Partial<DraftSettings> = { [`${key}_reminder_on`]: on } as any
    if (on) {
      const timeout = parseInt((draft as any)[`${key}_timeout`])
      const reminder = parseInt((draft as any)[`${key}_reminder`])
      if (reminder >= timeout) {
        const valid = REMINDER_OPTIONS.filter(o => parseInt(o.value) < timeout)
        if (valid.length > 0) (updates as any)[`${key}_reminder`] = valid[valid.length - 1].value
      }
    }
    updateDraft(updates)
  }

  const handleSave = async () => {
    if (!propertyManager) return
    setSaving(true)

    const payload = {
      ticket_mode: draft.ticket_mode,
      dispatch_mode: draft.dispatch_mode,
      contractor_reminder_minutes: draft.contractor_reminder_on ? parseInt(draft.contractor_reminder) : null,
      contractor_timeout_minutes: parseInt(draft.contractor_timeout),
      landlord_followup_hours: draft.landlord_reminder_on ? parseInt(draft.landlord_reminder) / 60 : null,
      landlord_timeout_hours: parseInt(draft.landlord_timeout) / 60,
      completion_reminder_hours: draft.completion_reminder_on ? parseInt(draft.completion_reminder) / 60 : null,
      completion_timeout_hours: parseInt(draft.completion_timeout) / 60,
      ooh_enabled: draft.ooh_enabled,
      business_hours_start: draft.business_hours_start,
      business_hours_end: draft.business_hours_end,
      business_days: draft.business_days,
      ooh_routine_action: draft.ooh_routine_action,
      min_booking_lead_hours: parseInt(draft.min_booking_lead_hours) || 3,
    }

    const { error } = await supabase
      .from('c1_property_managers')
      .update(payload)
      .eq('id', propertyManager.id)

    if (error) {
      console.error('Rules save error:', error)
      toast.error(error.message || 'Failed to save')
    } else {
      toast.success('Settings saved')
      setSaved({ ...draft })
      refreshPM?.()
    }
    setSaving(false)
  }

  const reminderOpts = (timeoutVal: string, on: boolean) => {
    if (!on) return REMINDER_OPTIONS
    return REMINDER_OPTIONS.filter(o => parseInt(o.value) < parseInt(timeoutVal))
  }

  const timeoutOpts = (reminderVal: string, on: boolean) => {
    if (!on) return TIMEOUT_OPTIONS
    return TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > parseInt(reminderVal))
  }

  // OOH contact CRUD handlers
  const addOOHContact = async () => {
    if (!propertyManager) return
    setAddingContact(true)

    let name = ''
    let phone = ''
    let contractorId: string | null = null

    if (addMode === 'contractor' && selectedContractorId) {
      const c = contractors.find(c => c.id === selectedContractorId)
      if (!c) { setAddingContact(false); return }
      name = c.contractor_name
      phone = c.contractor_phone
      contractorId = c.id
    } else if (addMode === 'manual') {
      name = newContactName.trim()
      phone = newContactPhone.trim()
    }

    if (!name || !phone) {
      toast.error('Name and phone are required')
      setAddingContact(false)
      return
    }

    phone = normalizePhone(phone)

    const { data, error } = await supabase
      .from('c1_profiles')
      .insert({
        pm_id: propertyManager.id,
        name,
        phone,
        is_ooh_contact: true,
        contractor_id: contractorId,
      })
      .select('id, name, phone, contractor_id, active')
      .single()

    if (error) {
      toast.error(error.message || 'Failed to add contact')
    } else if (data) {
      setOohContacts(prev => [...prev, data as OOHContact])
      toast.success(`${name} added as OOH contact`)
    }

    setShowAddContact(false)
    setAddMode(null)
    setNewContactName('')
    setNewContactPhone('')
    setSelectedContractorId('')
    setAddingContact(false)
  }

  const removeOOHContact = async (contactId: string) => {
    const { error } = await supabase
      .from('c1_profiles')
      .update({ is_ooh_contact: false, active: false })
      .eq('id', contactId)

    if (error) {
      toast.error('Failed to remove contact')
    } else {
      setOohContacts(prev => prev.filter(c => c.id !== contactId))
      toast.success('Contact removed')
    }
  }

  const toggleDay = (day: string) => {
    const current = draft.business_days
    const next = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day]
    if (next.length === 0) return // must have at least one day
    updateDraft({ business_days: next })
  }

  // Reusable timing card
  const TimingCard = ({
    title,
    description,
    reminderLabel,
    reminderDesc,
    reminderValue,
    reminderOnChange,
    reminderOn,
    onToggle,
    reminderOptions: remOpts,
    escalateDesc,
    escalateValue,
    escalateOnChange,
    escalateOptions: escOpts,
  }: {
    title: string
    description: string
    reminderLabel: string
    reminderDesc: string
    reminderValue: string
    reminderOnChange: (v: string) => void
    reminderOn: boolean
    onToggle: (on: boolean) => void
    reminderOptions: { value: string; label: string }[]
    escalateDesc: string
    escalateValue: string
    escalateOnChange: (v: string) => void
    escalateOptions: { value: string; label: string }[]
  }) => (
    <div className="bg-card rounded-xl border p-5 flex flex-col">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{description}</p>

      <div className="space-y-3 flex-1">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium">{reminderLabel}</span>
            <Switch checked={reminderOn} onCheckedChange={onToggle} />
          </div>
          <Select value={reminderValue} onValueChange={reminderOnChange} disabled={!reminderOn}>
            <SelectTrigger className={cn('w-full', !reminderOn && 'opacity-50')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {remOpts.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={cn('text-[11px] text-muted-foreground mt-1', !reminderOn && 'opacity-50')}>{reminderDesc}</p>
        </div>

        <div className="border-t" />

        <div>
          <span className="text-xs font-medium block mb-1.5">Escalate to You</span>
          <Select value={escalateValue} onValueChange={escalateOnChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {escOpts.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">{escalateDesc}</p>
        </div>
      </div>
    </div>
  )

  return (
    <PageShell title="Rules & Preferences" subtitle="Configure how Yarro handles dispatching, approvals, and follow-ups.">

      <div className="flex-1 overflow-y-auto pb-4 space-y-6">

        {/* ─── TICKET HANDLING ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ticket Handling</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['auto', 'review'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updateDraft({ ticket_mode: mode })}
                className={cn(
                  'rounded-xl border p-5 text-left transition-all',
                  draft.ticket_mode === mode
                    ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className="text-sm font-semibold block">
                  {mode === 'auto' ? 'Auto-dispatch' : 'Review first'}
                </span>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {mode === 'auto'
                    ? 'New tickets are automatically dispatched to contractors based on your property mappings.'
                    : 'New tickets land in a review queue. You triage and dispatch manually from the dashboard.'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─── DISPATCH MODE ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dispatch Mode</h2>
          <div className="grid grid-cols-2 gap-3">
            {(['sequential', 'broadcast'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => updateDraft({ dispatch_mode: mode })}
                className={cn(
                  'rounded-xl border p-5 text-left transition-all',
                  draft.dispatch_mode === mode
                    ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <span className="text-sm font-semibold block">
                  {mode === 'sequential' ? 'One at a time' : 'All at once'}
                </span>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {mode === 'sequential'
                    ? 'Contact contractors sequentially. If one doesn\'t respond, auto-advance to the next.'
                    : 'Message all assigned contractors at once and choose the best quote.'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─── BUSINESS HOURS ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Business Hours</h2>
          <div className="bg-card rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold">Out-of-hours handling</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Route emergencies to trusted contacts outside your working hours.
                </p>
              </div>
              <Switch
                checked={draft.ooh_enabled}
                onCheckedChange={(on) => updateDraft({ ooh_enabled: on })}
              />
            </div>

            {draft.ooh_enabled && (
              <div className="mt-5 space-y-4 border-t pt-4">
                {/* Time range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1.5">Start</label>
                    <Select value={draft.business_hours_start} onValueChange={(v) => updateDraft({ business_hours_start: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1.5">End</label>
                    <Select value={draft.business_hours_end} onValueChange={(v) => updateDraft({ business_hours_end: v })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Working days */}
                <div>
                  <label className="text-xs font-medium block mb-1.5">Working days</label>
                  <div className="flex gap-1.5">
                    {ALL_DAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => toggleDay(d.value)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          draft.business_days.includes(d.value)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Routine ticket handling */}
                <div>
                  <label className="text-xs font-medium block mb-1.5">Non-urgent tickets outside hours</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'queue_review', label: 'Hold for morning review', desc: 'Queue for your review when you\'re back.' },
                      { value: 'dispatch', label: 'Dispatch normally', desc: 'Auto-dispatch regardless of time.' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateDraft({ ooh_routine_action: opt.value })}
                        className={cn(
                          'rounded-lg border p-3 text-left transition-all',
                          draft.ooh_routine_action === opt.value
                            ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                            : 'border-border hover:border-muted-foreground/30'
                        )}
                      >
                        <span className="text-xs font-semibold block">{opt.label}</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5 block">{opt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ─── OOH CONTACTS ─── */}
        <section className={cn(!draft.ooh_enabled && 'opacity-50 pointer-events-none')}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
            OOH Contacts
          </h2>
          <div className="bg-card rounded-xl border p-5">
            <p className="text-xs text-muted-foreground mb-4">
              These people receive emergency tickets outside your business hours.
            </p>

            {oohContacts.length > 0 && (
              <div className="space-y-2 mb-4">
                {oohContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{contact.name}</span>
                      <span className="text-xs text-muted-foreground">{contact.phone}</span>
                      {contact.contractor_id && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Contractor
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeOOHContact(contact.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!showAddContact ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddContact(true)}
                disabled={!draft.ooh_enabled}
              >
                <UserPlus className="h-4 w-4 mr-1.5" />
                Add contact
              </Button>
            ) : (
              <div className="rounded-lg border p-4 space-y-3">
                {!addMode && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAddMode('contractor')}
                      className="rounded-lg border p-3 text-left hover:bg-muted transition-colors"
                    >
                      <span className="text-xs font-semibold block">From contractors</span>
                      <span className="text-[11px] text-muted-foreground">Pick an existing contractor</span>
                    </button>
                    <button
                      onClick={() => setAddMode('manual')}
                      className="rounded-lg border p-3 text-left hover:bg-muted transition-colors"
                    >
                      <span className="text-xs font-semibold block">New contact</span>
                      <span className="text-[11px] text-muted-foreground">Add name and phone</span>
                    </button>
                  </div>
                )}

                {addMode === 'contractor' && (() => {
                  const available = contractors.filter(c =>
                    c.contractor_phone && !oohContacts.some(oc => oc.contractor_id === c.id)
                  )

                  return (
                    <>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {available.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 text-center">No contractors available</p>
                        ) : available.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedContractorId(c.id)}
                            className={cn(
                              'w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all',
                              selectedContractorId === c.id
                                ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                                : 'border-border hover:bg-muted'
                            )}
                          >
                            <span className="text-sm font-medium truncate">{c.contractor_name}</span>
                            {c.category && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                                {c.category}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">+{c.contractor_phone}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={addOOHContact} disabled={!selectedContractorId || addingContact}>
                          {addingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setShowAddContact(false); setAddMode(null); setSelectedContractorId('') }}>
                          Cancel
                        </Button>
                      </div>
                    </>
                  )
                })()}

                {addMode === 'manual' && (
                  <>
                    <Input placeholder="Name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
                    <Input placeholder="Phone (e.g. 447700900123)" value={newContactPhone} onChange={(e) => setNewContactPhone(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={addOOHContact} disabled={!newContactName || !newContactPhone || addingContact}>
                        {addingContact ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setShowAddContact(false); setAddMode(null); setNewContactName(''); setNewContactPhone('') }}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ─── TIMING & FOLLOW-UPS ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Timing & Follow-ups</h2>
          <div className="grid grid-cols-3 gap-4">
            <TimingCard
              title="Contractors"
              description="After dispatching a job"
              reminderLabel="Follow-up Reminder"
              reminderDesc="Nudge if no response."
              reminderValue={draft.contractor_reminder}
              reminderOnChange={(v) => updateDraft({ contractor_reminder: v })}
              reminderOn={draft.contractor_reminder_on}
              onToggle={(on) => handleToggle('contractor', on)}
              reminderOptions={reminderOpts(draft.contractor_timeout, draft.contractor_reminder_on)}
              escalateDesc={draft.dispatch_mode === 'broadcast' ? 'Give up if no quotes.' : 'Advance to next contractor.'}
              escalateValue={draft.contractor_timeout}
              escalateOnChange={(v) => updateDraft({ contractor_timeout: v })}
              escalateOptions={timeoutOpts(draft.contractor_reminder, draft.contractor_reminder_on)}
            />
            <TimingCard
              title="Landlords"
              description="After requesting approval"
              reminderLabel="Follow-up Reminder"
              reminderDesc="Remind if no response."
              reminderValue={draft.landlord_reminder}
              reminderOnChange={(v) => updateDraft({ landlord_reminder: v })}
              reminderOn={draft.landlord_reminder_on}
              onToggle={(on) => handleToggle('landlord', on)}
              reminderOptions={reminderOpts(draft.landlord_timeout, draft.landlord_reminder_on)}
              escalateDesc="Alert you if no response."
              escalateValue={draft.landlord_timeout}
              escalateOnChange={(v) => updateDraft({ landlord_timeout: v })}
              escalateOptions={timeoutOpts(draft.landlord_reminder, draft.landlord_reminder_on)}
            />
            <TimingCard
              title="Job Completion"
              description="After a job is booked"
              reminderLabel="Outcome Form Reminder"
              reminderDesc="Nudge contractor to submit."
              reminderValue={draft.completion_reminder}
              reminderOnChange={(v) => updateDraft({ completion_reminder: v })}
              reminderOn={draft.completion_reminder_on}
              onToggle={(on) => handleToggle('completion', on)}
              reminderOptions={reminderOpts(draft.completion_timeout, draft.completion_reminder_on)}
              escalateDesc="Alert you if not submitted."
              escalateValue={draft.completion_timeout}
              escalateOnChange={(v) => updateDraft({ completion_timeout: v })}
              escalateOptions={timeoutOpts(draft.completion_reminder, draft.completion_reminder_on)}
            />
          </div>
        </section>

        {/* Booking Rules */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Booking</h3>
            <p className="text-xs text-muted-foreground">Contractor scheduling rules</p>
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Minimum booking lead time</p>
                <p className="text-xs text-muted-foreground">
                  How far in advance a contractor must book. Slots within this window are unavailable.
                </p>
              </div>
              <Select
                value={draft.min_booking_lead_hours}
                onValueChange={(v) => updateDraft({ min_booking_lead_hours: v })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TIME_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>

      {/* Save bar */}
      <div className="flex-shrink-0 border-t pt-4 mt-2 flex items-center justify-end gap-3">
        {isDirty && (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        )}
        <Button
          onClick={handleSave}
          disabled={!isDirty || saving}
          size="sm"
          className={cn(
            'min-w-[100px]',
            isDirty ? '' : 'bg-muted text-muted-foreground'
          )}
        >
          {saving ? (
            <span className="flex items-center gap-1.5">
              <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Saving...
            </span>
          ) : isDirty ? (
            <span className="flex items-center gap-1.5">
              <Save className="h-4 w-4" />
              Save changes
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </Button>
      </div>
    </PageShell>
  )
}
