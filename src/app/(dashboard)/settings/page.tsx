'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { User, Mail, Building2, Lock } from 'lucide-react'
import { PageShell } from '@/components/page-shell'

export default function SettingsPage() {
  const { propertyManager } = usePM()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

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
    <PageShell title="Settings" subtitle="Account and preferences" scrollable>
      <div className="max-w-2xl">

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
          <InteractiveHoverButton
            type="submit"
            text={saving ? 'Updating...' : 'Update Password'}
            disabled={saving || !newPassword}
            className="w-40 text-sm h-9"
          />
        </form>
      </div>
      </div>
    </PageShell>
  )
}
