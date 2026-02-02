'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { User, Mail, Building2, Lock, Settings2 } from 'lucide-react'

// Timeout options: value in minutes, label for display
const TIMEOUT_OPTIONS = [
  { value: '1', label: '1 minute (testing)' },
  { value: '120', label: '2 hours' },
  { value: '240', label: '4 hours' },
  { value: '360', label: '6 hours (default)' },
  { value: '720', label: '12 hours' },
  { value: '1440', label: '24 hours' },
]

export default function SettingsPage() {
  const { propertyManager, refreshPM } = usePM()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
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

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Password updated')
      setNewPassword('')
      setConfirmPassword('')
    }
    setSaving(false)
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-foreground mb-6">Settings</h1>

      {/* Account Info */}
      <div className="bg-card rounded-xl border p-6 space-y-4 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Account</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="text-sm font-medium">{propertyManager?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-medium">{propertyManager?.email}</p>
            </div>
          </div>
          {propertyManager?.business_name && (
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Business</p>
                <p className="text-sm font-medium">{propertyManager.business_name}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rules & Preferences */}
      <div className="bg-card rounded-xl border p-6 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
          <Settings2 className="h-4 w-4 inline mr-1" />
          Rules & Preferences
        </h2>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Contractor Response Timeout</p>
              <p className="text-xs text-muted-foreground">
                Time to wait before contacting the next contractor if no response
              </p>
            </div>
            <Select
              value={timeoutMinutes}
              onValueChange={handleTimeoutChange}
              disabled={savingTimeout}
            >
              <SelectTrigger className="w-[180px]">
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

      {/* Password Change */}
      <div className="bg-card rounded-xl border p-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-4">
          <Lock className="h-4 w-4 inline mr-1" />
          Change Password
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-3 max-w-sm">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-9"
          />
          <Input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={saving || !newPassword}>
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  )
}
