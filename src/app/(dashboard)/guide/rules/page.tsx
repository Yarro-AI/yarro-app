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
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Users,
  Bell,
  SlidersHorizontal,
  ShieldCheck,
  Save,
  Check,
  ClipboardCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Option constants ───

const CONTRACTOR_REMINDER_OPTIONS = [
  { value: '1', label: '1 min (testing)' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours' },
  { value: '480', label: '8 hours' },
  { value: '720', label: '12 hours' },
]

const LANDLORD_FOLLOWUP_OPTIONS = [
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '36', label: '36 hours' },
  { value: '48', label: '48 hours' },
]

const COMPLETION_REMINDER_OPTIONS = [
  { value: '3', label: '3 hours' },
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
]

const ALL_LANDLORD_TIMEOUT_OPTIONS = [
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours' },
  { value: '72', label: '3 days' },
  { value: '96', label: '4 days' },
  { value: '120', label: '5 days' },
]

// ─── Draft settings ───

interface DraftSettings {
  dispatch_mode: 'sequential' | 'broadcast'
  contractor_reminder_minutes: string
  landlord_followup_hours: string
  landlord_timeout_hours: string
  completion_reminder_hours: string
}

const DEFAULTS: DraftSettings = {
  dispatch_mode: 'sequential',
  contractor_reminder_minutes: '360',
  landlord_followup_hours: '24',
  landlord_timeout_hours: '48',
  completion_reminder_hours: '6',
}

function formatAutoTimeout(reminderMinutes: number): string {
  const timeout = reminderMinutes * 2
  if (timeout >= 60) return `${timeout / 60} hours`
  return `${timeout} min`
}

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<DraftSettings>(DEFAULTS)
  const [saved, setSaved] = useState<DraftSettings>(DEFAULTS)
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    const fromPM: DraftSettings = {
      dispatch_mode: (propertyManager.dispatch_mode as 'sequential' | 'broadcast') || 'sequential',
      contractor_reminder_minutes: (propertyManager.contractor_reminder_minutes || 360).toString(),
      landlord_followup_hours: (propertyManager.landlord_followup_hours || 24).toString(),
      landlord_timeout_hours: (propertyManager.landlord_timeout_hours || 48).toString(),
      completion_reminder_hours: (propertyManager.completion_reminder_hours || 6).toString(),
    }
    setDraft(fromPM)
    setSaved(fromPM)
  }, [propertyManager])

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  const availableLandlordTimeoutOptions = useMemo(() => {
    const minTimeout = parseInt(draft.landlord_followup_hours)
    return ALL_LANDLORD_TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > minTimeout)
  }, [draft.landlord_followup_hours])

  const updateDraft = useCallback((partial: Partial<DraftSettings>) => {
    setDraft(prev => ({ ...prev, ...partial }))
  }, [])

  const handleLandlordFollowupChange = (value: string) => {
    const updates: Partial<DraftSettings> = { landlord_followup_hours: value }
    if (parseInt(draft.landlord_timeout_hours) <= parseInt(value)) {
      const valid = ALL_LANDLORD_TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > parseInt(value))
      if (valid.length > 0) updates.landlord_timeout_hours = valid[0].value
    }
    updateDraft(updates)
  }

  const handleSave = async () => {
    if (!propertyManager) return
    setSaving(true)

    // Timeout always = 2× reminder (auto-calculated for both modes)
    const reminderMinutes = parseInt(draft.contractor_reminder_minutes)
    const timeoutMinutes = reminderMinutes * 2

    const { error } = await supabase
      .from('c1_property_managers')
      .update({
        dispatch_mode: draft.dispatch_mode,
        contractor_timeout_minutes: timeoutMinutes,
        contractor_reminder_minutes: reminderMinutes,
        landlord_followup_hours: parseInt(draft.landlord_followup_hours),
        landlord_timeout_hours: parseInt(draft.landlord_timeout_hours),
        completion_reminder_hours: parseInt(draft.completion_reminder_hours),
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

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6 flex-shrink-0">
        <SlidersHorizontal className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Rules & Preferences</h1>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-8 overflow-y-auto pb-20">

        {/* ─── CONTRACTOR DISPATCH ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Contractor Dispatch</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Dispatch Mode — full width */}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Dispatch Mode</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['sequential', 'broadcast'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateDraft({ dispatch_mode: mode })}
                    className={cn(
                      'rounded-lg border-2 p-3 text-left transition-colors',
                      draft.dispatch_mode === mode
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <span className="text-sm font-medium block">
                      {mode === 'sequential' ? 'One at a time' : 'All at once'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {mode === 'sequential' ? 'Auto-advance on timeout' : 'Choose best quote'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Follow-up Reminder */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Follow-up Reminder</span>
              </div>
              <Select
                value={draft.contractor_reminder_minutes}
                onValueChange={(v) => updateDraft({ contractor_reminder_minutes: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACTOR_REMINDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {draft.dispatch_mode === 'broadcast'
                  ? 'Nudge all contractors who haven\'t responded after this time.'
                  : 'Nudge the current contractor if no response.'}
              </p>
            </div>

            {/* Escalate to You — auto 2× */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Escalate to You</span>
              </div>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/30">
                <span className="text-sm text-muted-foreground">
                  {formatAutoTimeout(parseInt(draft.contractor_reminder_minutes))} (auto)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {draft.dispatch_mode === 'broadcast'
                  ? '2× the reminder if still no quotes received.'
                  : '2× the reminder — advance to next contractor.'}
              </p>
            </div>
          </div>
        </section>

        {/* ─── LANDLORD APPROVAL ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Landlord Approval</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Follow-up Reminder</span>
              </div>
              <Select value={draft.landlord_followup_hours} onValueChange={handleLandlordFollowupChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANDLORD_FOLLOWUP_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Remind landlord if no response after this time.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Escalate to You</span>
              </div>
              <Select
                value={draft.landlord_timeout_hours}
                onValueChange={(v) => updateDraft({ landlord_timeout_hours: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLandlordTimeoutOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Alert you if landlord hasn&apos;t responded.</p>
            </div>
          </div>
        </section>

        {/* ─── JOB COMPLETION ─── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Job Completion</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Outcome Form Reminder</span>
              </div>
              <Select
                value={draft.completion_reminder_hours}
                onValueChange={(v) => updateDraft({ completion_reminder_hours: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPLETION_REMINDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Nudge contractor to submit after this time.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Escalate to You</span>
              </div>
              <div className="flex items-center h-9 px-3 rounded-md border bg-muted/30">
                <span className="text-sm text-muted-foreground">
                  {parseInt(draft.completion_reminder_hours) * 2} hours (auto)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">2× the reminder if still no submission.</p>
            </div>
          </div>
        </section>
      </div>

      {/* Save bar — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur px-6 py-3 flex items-center gap-3 z-10">
        <Button
          onClick={handleSave}
          disabled={!isDirty || saving}
          size="sm"
          className={cn(
            'min-w-[120px]',
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
        {isDirty && (
          <span className="text-xs text-muted-foreground">You have unsaved changes</span>
        )}
      </div>
    </div>
  )
}
