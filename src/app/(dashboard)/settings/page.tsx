'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { User, Mail, Building2, Lock, Pencil, Check, X } from 'lucide-react'
import { PageShell } from '@/components/page-shell'

function EditableField({
  icon: Icon,
  label,
  value,
  onSave,
}: {
  icon: React.ElementType
  label: string
  value: string | undefined
  onSave: (val: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!draft.trim() || draft === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    await onSave(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="flex items-center gap-3 group">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {editing ? (
          <div className="flex items-center gap-1.5 mt-0.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-7 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') { setEditing(false); setDraft(value || '') }
              }}
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} disabled={saving}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(false); setDraft(value || '') }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{value || '—'}</p>
            <button
              onClick={() => { setDraft(value || ''); setEditing(true) }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { propertyManager, refreshPM } = usePM()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  const updatePMField = async (field: string, value: string) => {
    const { error } = await supabase
      .from('c1_property_managers')
      .update({ [field]: value })
      .eq('id', propertyManager?.id)
    if (error) {
      toast.error(`Failed to update ${field}`)
    } else {
      toast.success('Updated')
      refreshPM?.()
    }
  }

  const updateEmail = async (newEmail: string) => {
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    if (error) {
      toast.error(error.message)
    } else {
      // Also update the PM table
      await supabase
        .from('c1_property_managers')
        .update({ email: newEmail })
        .eq('id', propertyManager?.id)
      toast.success('Verification email sent — check your inbox')
      refreshPM?.()
    }
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
    <PageShell title="Settings" subtitle="Account and preferences" scrollable>
      <div className="max-w-2xl">

      {/* Account Info */}
      <div className="bg-card rounded-xl border p-6 space-y-4 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Account</h2>
        <div className="space-y-3">
          <EditableField
            icon={User}
            label="Name"
            value={propertyManager?.name}
            onSave={(val) => updatePMField('name', val)}
          />
          <EditableField
            icon={Mail}
            label="Email"
            value={propertyManager?.email}
            onSave={updateEmail}
          />
          <EditableField
            icon={Building2}
            label="Business"
            value={propertyManager?.business_name}
            onSave={(val) => updatePMField('business_name', val)}
          />
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
          />
        </form>
      </div>
      </div>
    </PageShell>
  )
}
