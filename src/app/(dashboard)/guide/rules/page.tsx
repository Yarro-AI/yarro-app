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
import { toast } from 'sonner'
import { Clock } from 'lucide-react'

// Timeout options: value in minutes, label for display
const TIMEOUT_OPTIONS = [
  { value: '1', label: '1 minute (testing)' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours (default)' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
]

export default function RulesPage() {
  const { propertyManager, refreshPM } = usePM()
  const [savingTimeout, setSavingTimeout] = useState(false)
  const [timeoutMinutes, setTimeoutMinutes] = useState<string>('360')
  const supabase = createClient()

  // Initialize timeout from PM settings
  useEffect(() => {
    if (propertyManager?.contractor_timeout_minutes) {
      setTimeoutMinutes(propertyManager.contractor_timeout_minutes.toString())
    }
  }, [propertyManager?.contractor_timeout_minutes])

  const handleTimeoutChange = async (value: string) => {
    setTimeoutMinutes(value)
    setSavingTimeout(true)

    const { error } = await supabase
      .from('c1_property_managers')
      .update({ contractor_timeout_minutes: parseInt(value) })
      .eq('id', propertyManager?.id)

    if (error) {
      toast.error('Failed to update timeout setting')
      // Revert to previous value
      setTimeoutMinutes(propertyManager?.contractor_timeout_minutes?.toString() ?? '360')
    } else {
      toast.success('Contractor timeout updated')
      refreshPM?.()
    }
    setSavingTimeout(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground mb-2">Rules & Preferences</h1>
      <p className="text-muted-foreground mb-6">
        Configure how Yarro handles your tickets and communications.
      </p>

      {/* Contractor Timeout */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-sm font-medium">Contractor Response Timeout</h2>
              <p className="text-sm text-muted-foreground mt-1">
                When a contractor doesn&apos;t respond within this time, Yarro will automatically
                contact the next contractor in your priority list.
              </p>
            </div>
            <Select
              value={timeoutMinutes}
              onValueChange={handleTimeoutChange}
              disabled={savingTimeout}
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
    </div>
  )
}
