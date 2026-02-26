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
        if (rem >= to) {
          if (partial.hasOwnProperty(toKey)) {
            // Timeout lowered → auto-lower reminder
            const valid = REMINDER_OPTIONS.filter(o => parseInt(o.value) < to)
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

    const { error } = await supabase
      .from('c1_property_managers')
      .update({
        dispatch_mode: draft.dispatch_mode,
        contractor_reminder_minutes: draft.contractor_reminder_on ? parseInt(draft.contractor_reminder) : null,
        contractor_timeout_minutes: parseInt(draft.contractor_timeout),
        landlord_followup_hours: draft.landlord_reminder_on ? parseInt(draft.landlord_reminder) / 60 : null,
        landlord_timeout_hours: parseInt(draft.landlord_timeout) / 60,
        completion_reminder_hours: draft.completion_reminder_on ? parseInt(draft.completion_reminder) / 60 : null,
        completion_timeout_hours: parseInt(draft.completion_timeout) / 60,
      })
      .eq('id', propertyManager.id)

    if (error) {
      toast.error('Failed to save')
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

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-8 flex-shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Rules & Preferences</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Configure how Yarro handles dispatching, approvals, and follow-ups.</p>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto pb-4 max-w-3xl">

        {/* ─── CONTRACTOR DISPATCH ─── */}
        <section className="bg-card rounded-xl border p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold">Contractor Dispatch</h2>
            <p className="text-sm text-muted-foreground mt-0.5">How Yarro contacts contractors when a job comes in.</p>
          </div>

          {/* Dispatch Mode */}
          <div className="space-y-3">
            <span className="text-sm font-medium">Dispatch Mode</span>
            <div className="grid grid-cols-2 gap-3">
              {(['sequential', 'broadcast'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateDraft({ dispatch_mode: mode })}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-all',
                    draft.dispatch_mode === mode
                      ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-sm font-medium block">
                    {mode === 'sequential' ? 'One at a time' : 'All at once'}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    {mode === 'sequential' ? 'Auto-advance on timeout' : 'Choose best quote'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t my-5" />

          {/* Follow-up Reminder */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Follow-up Reminder</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nudge contractor(s) if no response.</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Select
                value={draft.contractor_reminder}
                onValueChange={(v) => updateDraft({ contractor_reminder: v })}
                disabled={!draft.contractor_reminder_on}
              >
                <SelectTrigger className={cn('w-[140px]', !draft.contractor_reminder_on && 'opacity-50')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reminderOpts(draft.contractor_timeout, draft.contractor_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={draft.contractor_reminder_on} onCheckedChange={(on) => handleToggle('contractor', on)} />
            </div>
          </div>

          <div className="border-t my-5" />

          {/* Escalate Timeout */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Escalate to You</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {draft.dispatch_mode === 'broadcast'
                  ? 'Give up if no quotes received.'
                  : 'Advance to next contractor.'}
              </p>
            </div>
            <div className="flex-shrink-0">
              <Select
                value={draft.contractor_timeout}
                onValueChange={(v) => updateDraft({ contractor_timeout: v })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeoutOpts(draft.contractor_reminder, draft.contractor_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ─── LANDLORD APPROVAL ─── */}
        <section className="bg-card rounded-xl border p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold">Landlord Approval</h2>
            <p className="text-sm text-muted-foreground mt-0.5">How Yarro handles landlord approval for quotes above auto-approve limits.</p>
          </div>

          {/* Follow-up Reminder */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Follow-up Reminder</p>
              <p className="text-xs text-muted-foreground mt-0.5">Remind landlord if no response.</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Select
                value={draft.landlord_reminder}
                onValueChange={(v) => updateDraft({ landlord_reminder: v })}
                disabled={!draft.landlord_reminder_on}
              >
                <SelectTrigger className={cn('w-[140px]', !draft.landlord_reminder_on && 'opacity-50')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reminderOpts(draft.landlord_timeout, draft.landlord_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={draft.landlord_reminder_on} onCheckedChange={(on) => handleToggle('landlord', on)} />
            </div>
          </div>

          <div className="border-t my-5" />

          {/* Escalate Timeout */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Escalate to You</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert you if landlord hasn&apos;t responded.</p>
            </div>
            <div className="flex-shrink-0">
              <Select
                value={draft.landlord_timeout}
                onValueChange={(v) => updateDraft({ landlord_timeout: v })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeoutOpts(draft.landlord_reminder, draft.landlord_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ─── JOB COMPLETION ─── */}
        <section className="bg-card rounded-xl border p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold">Job Completion</h2>
            <p className="text-sm text-muted-foreground mt-0.5">After a contractor is booked, ensure they submit an outcome form.</p>
          </div>

          {/* Outcome Form Reminder */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Outcome Form Reminder</p>
              <p className="text-xs text-muted-foreground mt-0.5">Nudge contractor to submit.</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Select
                value={draft.completion_reminder}
                onValueChange={(v) => updateDraft({ completion_reminder: v })}
                disabled={!draft.completion_reminder_on}
              >
                <SelectTrigger className={cn('w-[140px]', !draft.completion_reminder_on && 'opacity-50')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reminderOpts(draft.completion_timeout, draft.completion_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={draft.completion_reminder_on} onCheckedChange={(on) => handleToggle('completion', on)} />
            </div>
          </div>

          <div className="border-t my-5" />

          {/* Escalate Timeout */}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Escalate to You</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert you if no submission received.</p>
            </div>
            <div className="flex-shrink-0">
              <Select
                value={draft.completion_timeout}
                onValueChange={(v) => updateDraft({ completion_timeout: v })}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeoutOpts(draft.completion_reminder, draft.completion_reminder_on).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>

      {/* Save bar */}
      <div className="flex-shrink-0 border-t pt-4 mt-2 flex items-center justify-end gap-3 max-w-3xl">
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
