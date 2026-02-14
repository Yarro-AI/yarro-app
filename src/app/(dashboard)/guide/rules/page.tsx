'use client'

import { useState, useEffect, useMemo } from 'react'
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
import { toast } from 'sonner'
import { Clock, Users, Bell, SlidersHorizontal, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// Contractor timeout options (minutes)
const TIMEOUT_OPTIONS = [
  { value: '1', label: '1 minute (testing)' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours (default)' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
]

// Contractor reminder options (minutes) — filtered dynamically to <= half timeout
const ALL_REMINDER_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours' },
  { value: '480', label: '8 hours' },
  { value: '720', label: '12 hours' },
]

// Landlord follow-up options (hours)
const LANDLORD_FOLLOWUP_OPTIONS = [
  { value: '6', label: '6 hours' },
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours (default)' },
  { value: '36', label: '36 hours' },
  { value: '48', label: '48 hours' },
]

// Landlord timeout options (hours) — filtered dynamically to > followup
const ALL_LANDLORD_TIMEOUT_OPTIONS = [
  { value: '12', label: '12 hours' },
  { value: '24', label: '24 hours' },
  { value: '48', label: '48 hours (default)' },
  { value: '72', label: '3 days' },
  { value: '96', label: '4 days' },
  { value: '120', label: '5 days' },
]

type DispatchMode = 'sequential' | 'broadcast'

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [saving, setSaving] = useState<string | null>(null)

  // Contractor settings
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('sequential')
  const [timeoutMinutes, setTimeoutMinutes] = useState<string>('360')
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState<string>('120')

  // Landlord settings
  const [landlordFollowupHours, setLandlordFollowupHours] = useState<string>('24')
  const [landlordTimeoutHours, setLandlordTimeoutHours] = useState<string>('48')

  const supabase = createClient()

  // Initialize from PM settings
  useEffect(() => {
    if (propertyManager) {
      if (propertyManager.contractor_timeout_minutes) {
        setTimeoutMinutes(propertyManager.contractor_timeout_minutes.toString())
      }
      setDispatchMode((propertyManager.dispatch_mode as DispatchMode) || 'sequential')
      if (propertyManager.contractor_reminder_minutes) {
        setReminderEnabled(true)
        setReminderMinutes(propertyManager.contractor_reminder_minutes.toString())
      } else {
        setReminderEnabled(false)
      }
      if (propertyManager.landlord_followup_hours) {
        setLandlordFollowupHours(propertyManager.landlord_followup_hours.toString())
      }
      if (propertyManager.landlord_timeout_hours) {
        setLandlordTimeoutHours(propertyManager.landlord_timeout_hours.toString())
      }
    }
  }, [propertyManager])

  // Filter reminder options: must be <= half the timeout
  const availableReminderOptions = useMemo(() => {
    const maxReminder = parseInt(timeoutMinutes) / 2
    return ALL_REMINDER_OPTIONS.filter(o => parseInt(o.value) <= maxReminder)
  }, [timeoutMinutes])

  // Filter landlord timeout options: must be > followup hours
  const availableLandlordTimeoutOptions = useMemo(() => {
    const minTimeout = parseInt(landlordFollowupHours)
    return ALL_LANDLORD_TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > minTimeout)
  }, [landlordFollowupHours])

  // Can the reminder be enabled? Only if timeout long enough for at least 1 option
  const canEnableReminder = availableReminderOptions.length > 0

  const updateSetting = async (field: string, value: string | number | null) => {
    setSaving(field)
    const { error } = await supabase
      .from('c1_property_managers')
      .update({ [field]: value })
      .eq('id', propertyManager?.id)

    if (error) {
      toast.error('Failed to update setting')
    } else {
      toast.success('Setting updated')
      refreshPM?.()
    }
    setSaving(null)
  }

  const handleDispatchModeChange = (mode: DispatchMode) => {
    setDispatchMode(mode)
    updateSetting('dispatch_mode', mode)
  }

  const handleTimeoutChange = (value: string) => {
    setTimeoutMinutes(value)
    updateSetting('contractor_timeout_minutes', parseInt(value))

    // If reminder is enabled and exceeds new max, reset it
    const newMax = parseInt(value) / 2
    if (reminderEnabled && parseInt(reminderMinutes) > newMax) {
      const validOptions = ALL_REMINDER_OPTIONS.filter(o => parseInt(o.value) <= newMax)
      if (validOptions.length > 0) {
        const newReminder = validOptions[validOptions.length - 1].value
        setReminderMinutes(newReminder)
        updateSetting('contractor_reminder_minutes', parseInt(newReminder))
      } else {
        setReminderEnabled(false)
        updateSetting('contractor_reminder_minutes', null)
      }
    }
  }

  const handleReminderToggle = (checked: boolean) => {
    setReminderEnabled(checked)
    if (checked) {
      const defaultOption = availableReminderOptions.length > 0
        ? availableReminderOptions[Math.floor(availableReminderOptions.length / 2)].value
        : reminderMinutes
      setReminderMinutes(defaultOption)
      updateSetting('contractor_reminder_minutes', parseInt(defaultOption))
    } else {
      updateSetting('contractor_reminder_minutes', null)
    }
  }

  const handleReminderChange = (value: string) => {
    setReminderMinutes(value)
    updateSetting('contractor_reminder_minutes', parseInt(value))
  }

  const handleLandlordFollowupChange = (value: string) => {
    setLandlordFollowupHours(value)
    updateSetting('landlord_followup_hours', parseInt(value))

    // If timeout is now <= followup, bump it to first valid option
    if (parseInt(landlordTimeoutHours) <= parseInt(value)) {
      const validOptions = ALL_LANDLORD_TIMEOUT_OPTIONS.filter(o => parseInt(o.value) > parseInt(value))
      if (validOptions.length > 0) {
        const newTimeout = validOptions[0].value
        setLandlordTimeoutHours(newTimeout)
        updateSetting('landlord_timeout_hours', parseInt(newTimeout))
      }
    }
  }

  const handleLandlordTimeoutChange = (value: string) => {
    setLandlordTimeoutHours(value)
    updateSetting('landlord_timeout_hours', parseInt(value))
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5" />
          Rules & Preferences
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how Yarro handles your tickets and communications.
        </p>
      </div>

      <div className="space-y-6">
        {/* ─── CONTRACTOR DISPATCH ─── */}
        <div className="space-y-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contractor Dispatch</h2>
        </div>

        {/* Dispatch Mode */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Selection Mode</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose how contractors are contacted when a new job is dispatched.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleDispatchModeChange('sequential')}
                  disabled={saving === 'dispatch_mode'}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors',
                    dispatchMode === 'sequential'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-sm font-medium">One at a time</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Contact contractors sequentially. If one doesn&apos;t respond, move to the next.
                  </span>
                </button>
                <button
                  onClick={() => handleDispatchModeChange('broadcast')}
                  disabled={saving === 'dispatch_mode'}
                  className={cn(
                    'flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-colors',
                    dispatchMode === 'broadcast'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <span className="text-sm font-medium">All at once</span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    Send to all available contractors simultaneously. Choose the best quote.
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Contractor Response Timeout */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Response Timeout</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {dispatchMode === 'sequential'
                    ? "When a contractor doesn't respond within this time, Yarro will automatically contact the next contractor in your priority list."
                    : "When contractors don't respond within this time, Yarro will flag the job for your review."}
                </p>
              </div>
              <Select
                value={timeoutMinutes}
                onValueChange={handleTimeoutChange}
                disabled={saving === 'contractor_timeout_minutes'}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select timeout" />
                </SelectTrigger>
                <SelectContent>
                  {TIMEOUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Contractor Reminder — only shown if timeout is long enough */}
        {canEnableReminder && (
          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-medium">Reminder Before Timeout</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Send a nudge to contractors who haven&apos;t responded yet.
                    </p>
                  </div>
                  <Switch
                    checked={reminderEnabled}
                    onCheckedChange={handleReminderToggle}
                    disabled={saving === 'contractor_reminder_minutes'}
                  />
                </div>
                {reminderEnabled && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Remind after:
                    </p>
                    <Select
                      value={reminderMinutes}
                      onValueChange={handleReminderChange}
                      disabled={saving === 'contractor_reminder_minutes'}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select reminder time" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableReminderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {dispatchMode === 'sequential'
                        ? `A reminder will be sent after ${availableReminderOptions.find(o => o.value === reminderMinutes)?.label || reminderMinutes + ' minutes'}, then the next contractor will be contacted after ${TIMEOUT_OPTIONS.find(o => o.value === timeoutMinutes)?.label?.replace(' (default)', '') || timeoutMinutes + ' minutes'} if still no response.`
                        : `Contractors who haven't responded will receive a reminder after ${availableReminderOptions.find(o => o.value === reminderMinutes)?.label || reminderMinutes + ' minutes'}.`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── LANDLORD APPROVAL ─── */}
        <div className="space-y-1 pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Landlord Approval</h2>
        </div>

        {/* Landlord Follow-up Reminder */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Landlord Reminder</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  If a landlord hasn&apos;t responded to an approval request, Yarro will send them a follow-up reminder after this time.
                </p>
              </div>
              <Select
                value={landlordFollowupHours}
                onValueChange={handleLandlordFollowupChange}
                disabled={saving === 'landlord_followup_hours'}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {LANDLORD_FOLLOWUP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Landlord Timeout → PM Escalation */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Escalate to You</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  If the landlord still hasn&apos;t responded after the reminder, Yarro will alert you to follow up directly. The ticket will be marked as &quot;Landlord No Response&quot;.
                </p>
              </div>
              <Select
                value={landlordTimeoutHours}
                onValueChange={handleLandlordTimeoutChange}
                disabled={saving === 'landlord_timeout_hours'}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {availableLandlordTimeoutOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Landlord gets a reminder at {LANDLORD_FOLLOWUP_OPTIONS.find(o => o.value === landlordFollowupHours)?.label?.replace(' (default)', '') || landlordFollowupHours + ' hours'}, then you&apos;re alerted at {availableLandlordTimeoutOptions.find(o => o.value === landlordTimeoutHours)?.label?.replace(' (default)', '') || landlordTimeoutHours + ' hours'} if still no response.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
