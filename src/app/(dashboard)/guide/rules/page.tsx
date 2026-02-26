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
import {
  SlidersHorizontal,
  Save,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

// Landlord & completion columns store integer hours — exclude sub-hour options
const HOUR_REMINDER_OPTIONS = REMINDER_OPTIONS.filter(o => parseInt(o.value) >= 60)

// ─── Draft (all stored in minutes internally) ───

interface DraftSettings {
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
}

const DEFAULTS: DraftSettings = {
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
}

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<DraftSettings>(DEFAULTS)
  const [saved, setSaved] = useState<DraftSettings>(DEFAULTS)
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    const pm = propertyManager as any
    const fromPM: DraftSettings = {
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
    }
    setDraft(fromPM)
    setSaved(fromPM)
  }, [propertyManager])

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
        const baseRemOpts = onKey === 'contractor_reminder_on' ? REMINDER_OPTIONS : HOUR_REMINDER_OPTIONS
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
      const baseRemOpts = key === 'contractor' ? REMINDER_OPTIONS : HOUR_REMINDER_OPTIONS
      const timeout = parseInt((draft as any)[`${key}_timeout`])
      const reminder = parseInt((draft as any)[`${key}_reminder`])
      if (reminder >= timeout || (key !== 'contractor' && parseInt((draft as any)[`${key}_reminder`]) < 60)) {
        const valid = baseRemOpts.filter(o => parseInt(o.value) < timeout)
        if (valid.length > 0) (updates as any)[`${key}_reminder`] = valid[valid.length - 1].value
      }
    }
    updateDraft(updates)
  }

  const handleSave = async () => {
    if (!propertyManager) return
    setSaving(true)

    const payload = {
      dispatch_mode: draft.dispatch_mode,
      contractor_reminder_minutes: draft.contractor_reminder_on ? parseInt(draft.contractor_reminder) : null,
      contractor_timeout_minutes: parseInt(draft.contractor_timeout),
      landlord_followup_hours: draft.landlord_reminder_on ? Math.round(parseInt(draft.landlord_reminder) / 60) : null,
      landlord_timeout_hours: Math.round(parseInt(draft.landlord_timeout) / 60),
      completion_reminder_hours: draft.completion_reminder_on ? Math.round(parseInt(draft.completion_reminder) / 60) : null,
      completion_timeout_hours: Math.round(parseInt(draft.completion_timeout) / 60),
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

  const reminderOpts = (timeoutVal: string, on: boolean, hourOnly = false) => {
    const base = hourOnly ? HOUR_REMINDER_OPTIONS : REMINDER_OPTIONS
    if (!on) return base
    return base.filter(o => parseInt(o.value) < parseInt(timeoutVal))
  }

  const timeoutOpts = (reminderVal: string, on: boolean) => {
    if (!on) return TIMEOUT_OPTIONS
    return TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > parseInt(reminderVal))
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
    <div className="h-full flex flex-col p-6 px-8">
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Rules & Preferences</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Configure how Yarro handles dispatching, approvals, and follow-ups.</p>
      </div>

      <div className="flex-1 overflow-y-auto pb-4 space-y-6">

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
              reminderOptions={reminderOpts(draft.landlord_timeout, draft.landlord_reminder_on, true)}
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
              reminderOptions={reminderOpts(draft.completion_timeout, draft.completion_reminder_on, true)}
              escalateDesc="Alert you if not submitted."
              escalateValue={draft.completion_timeout}
              escalateOnChange={(v) => updateDraft({ completion_timeout: v })}
              escalateOptions={timeoutOpts(draft.completion_reminder, draft.completion_reminder_on)}
            />
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
    </div>
  )
}
