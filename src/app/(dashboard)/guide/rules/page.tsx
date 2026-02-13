'use client'

import { useState, useEffect } from 'react'
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
import { Clock, Users, Bell } from 'lucide-react'
import { cn } from '@/lib/utils'

// Timeout options: value in minutes, label for display
const TIMEOUT_OPTIONS = [
  { value: '1', label: '1 minute (testing)' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours (default)' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
]

const REMINDER_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
]

type DispatchMode = 'sequential' | 'broadcast'

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [saving, setSaving] = useState<string | null>(null)
  const [timeoutMinutes, setTimeoutMinutes] = useState<string>('360')
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>('sequential')
  const [reminderEnabled, setReminderEnabled] = useState(false)
  const [reminderMinutes, setReminderMinutes] = useState<string>('120')
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
    }
  }, [propertyManager])

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
  }

  const handleReminderToggle = (checked: boolean) => {
    setReminderEnabled(checked)
    if (checked) {
      updateSetting('contractor_reminder_minutes', parseInt(reminderMinutes))
    } else {
      updateSetting('contractor_reminder_minutes', null)
    }
  }

  const handleReminderChange = (value: string) => {
    setReminderMinutes(value)
    updateSetting('contractor_reminder_minutes', parseInt(value))
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground mb-2">Rules & Preferences</h1>
      <p className="text-muted-foreground mb-6">
        Configure how Yarro handles your tickets and communications.
      </p>

      <div className="space-y-6">
        {/* Dispatch Mode */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-sm font-medium">Contractor Selection Mode</h2>
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
                    Contact contractors sequentially. If one doesn&apos;t respond, move to the next in your priority list.
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
                    Send to all available contractors simultaneously. Choose the best quote from responses.
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
                <h2 className="text-sm font-medium">Contractor Response Timeout</h2>
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

        {/* Contractor Reminder */}
        <div className="bg-card rounded-xl border p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium">Contractor Reminder</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Send a follow-up reminder to contractors who haven&apos;t responded before timing out.
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
                      {REMINDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {dispatchMode === 'sequential'
                      ? `A reminder will be sent after ${REMINDER_OPTIONS.find(o => o.value === reminderMinutes)?.label || reminderMinutes + ' minutes'}, then the next contractor will be contacted after ${TIMEOUT_OPTIONS.find(o => o.value === timeoutMinutes)?.label?.replace(' (default)', '') || timeoutMinutes + ' minutes'} if still no response.`
                      : `Contractors who haven't responded will receive a reminder after ${REMINDER_OPTIONS.find(o => o.value === reminderMinutes)?.label || reminderMinutes + ' minutes'}.`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
