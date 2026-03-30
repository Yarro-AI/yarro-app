'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { typography } from '@/lib/typography'

interface AccountCardProps {
  authUser: { id: string; email: string }
  onComplete: () => void
}

type Step = 'name' | 'phone' | 'contact' | 'role'

export function AccountCard({ authUser, onComplete }: AccountCardProps) {
  const { refreshPM } = usePM()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('name')

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredContact, setPreferredContact] = useState('whatsapp')
  const [role, setRole] = useState<string | null>(null)

  const handleNameNext = () => {
    if (!name.trim()) { setError('Your name is required'); return }
    setError(null)
    setStep('phone')
  }

  const handlePhoneNext = () => {
    if (!phone.trim()) { setError('Your number is required'); return }
    if (!isValidUKPhone(phone)) { setError('Enter a valid UK phone number'); return }
    setError(null)
    setStep('contact')
  }

  const handleContactNext = (method: string) => {
    setPreferredContact(method)
    setStep('role')
  }

  const handleRoleSelect = async (selectedRole: string) => {
    setRole(selectedRole)
    setError(null)
    setSaving(true)

    try {
      const { error: rpcError } = await supabase.rpc('onboarding_create_account', {
        p_user_id: authUser.id,
        p_name: name.trim(),
        p_email: authUser.email,
        p_phone: normalizePhone(phone),
        p_preferred_contact: preferredContact,
        p_business_name: '',
        p_role: selectedRole,
      })

      if (rpcError) {
        setError(rpcError.message)
        setSaving(false)
        setRole(null)
        return
      }

      await refreshPM()
      toast.success('Account created')
      onComplete()
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
      setRole(null)
    }
  }

  const stepIndex = ['name', 'phone', 'contact', 'role'].indexOf(step)

  return (
    <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className="px-10 pt-8 pb-2">
        <ProgressDots current={stepIndex + 1} total={4} />
      </div>

      <div className="px-10 pb-10 pt-6">
        {step === 'name' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>What&apos;s your full name?</h2>
            <div className="mt-8">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. John Doe"
                className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleNameNext() } }}
              />
            </div>
            {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
            <Button onClick={handleNameNext} className="w-full mt-8" size="lg">
              Continue
            </Button>
          </>
        )}

        {step === 'phone' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>What&apos;s your number?</h2>
            <p className={`${typography.bodyText} text-center mt-1`}>
              We&apos;ll use this for notifications and tenant messages.
            </p>
            <div className="mt-8">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 07700 900000"
                className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePhoneNext() } }}
              />
            </div>
            {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
            <Button onClick={handlePhoneNext} className="w-full mt-8" size="lg">
              Continue
            </Button>
          </>
        )}

        {step === 'contact' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>How should we reach you?</h2>
            <div className="mt-8 space-y-3">
              <OptionButton
                label="WhatsApp"
                selected={false}
                onClick={() => handleContactNext('whatsapp')}
              />
              <OptionButton
                label="Email"
                selected={false}
                onClick={() => handleContactNext('email')}
              />
            </div>
          </>
        )}

        {step === 'role' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>I am a...</h2>
            <div className="mt-8 space-y-3">
              <OptionButton
                label="Property owner"
                selected={role === 'owner'}
                onClick={() => handleRoleSelect('owner')}
                loading={saving && role === 'owner'}
              />
              <OptionButton
                label="Property manager"
                selected={role === 'manager'}
                onClick={() => handleRoleSelect('manager')}
                loading={saving && role === 'manager'}
              />
            </div>
            {error && <p className="text-sm text-destructive mt-4 text-center">{error}</p>}
          </>
        )}
      </div>
    </div>
  )
}

function OptionButton({ label, selected, onClick, loading }: {
  label: string
  selected: boolean
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`w-full text-center px-5 py-5 rounded-xl border transition-all bg-transparent ${
        selected
          ? 'border-primary text-primary'
          : 'border-border/60 text-foreground hover:border-primary/30'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        <span className="text-lg font-medium">{label}</span>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>
    </button>
  )
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1 rounded-full transition-all ${
            i + 1 === current ? 'w-6 bg-primary' : i + 1 < current ? 'w-6 bg-primary/30' : 'w-1.5 bg-border'
          }`}
        />
      ))}
    </div>
  )
}
