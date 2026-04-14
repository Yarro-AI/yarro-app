'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft } from 'lucide-react'
import { typography } from '@/lib/typography'

interface AccountCardProps {
  authUser: { id: string; email: string; name?: string }
  onComplete: (pmId: string) => void
}

type Step = 'name' | 'phone' | 'role'

export function AccountCard({ authUser, onComplete }: AccountCardProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasGoogleName = !!authUser.name?.trim()
  const initialStep: Step = hasGoogleName ? 'phone' : 'name'
  const [step, setStep] = useState<Step>(initialStep)

  const [name, setName] = useState(authUser.name?.trim() || '')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<string | null>(null)

  const steps: Step[] = hasGoogleName ? ['phone', 'role'] : ['name', 'phone', 'role']
  const stepIndex = steps.indexOf(step)

  const handleBack = () => {
    if (stepIndex > 0) {
      setStep(steps[stepIndex - 1])
      setError(null)
    }
  }

  const handleNameNext = () => {
    if (!name.trim()) { setError('Your name is required'); return }
    setError(null)
    setStep('phone')
  }

  const handlePhoneNext = () => {
    if (!phone.trim()) { setError('Your mobile number is required for alerts'); return }
    if (!isValidUKPhone(phone)) { setError('Enter a valid UK phone number'); return }
    setError(null)
    setStep('role')
  }

  const handleRoleSelect = async (selectedRole: string) => {
    setRole(selectedRole)
    setError(null)
    setSaving(true)

    try {
      const { data, error: rpcError } = await supabase.rpc('onboarding_create_account', {
        p_user_id: authUser.id,
        p_name: name.trim(),
        p_email: authUser.email,
        p_phone: normalizePhone(phone),
        p_preferred_contact: 'whatsapp',
        p_business_name: '',
        p_role: selectedRole,
      })

      if (rpcError) {
        setError(rpcError.message)
        setSaving(false)
        setRole(null)
        return
      }

      const pmId = data?.id
      if (!pmId) {
        setError('Account created but no ID returned. Please refresh.')
        setSaving(false)
        setRole(null)
        return
      }

      onComplete(pmId)
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
      setRole(null)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
      <div className="flex items-center px-6 pt-6 pb-2">
        {stepIndex > 0 ? (
          <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-8" />
        )}
        <div className="flex-1">
          <ProgressDots current={stepIndex + 1} total={steps.length} />
        </div>
        <div className="w-8" />
      </div>

      <div className="px-10 pb-10 pt-6">
        {/* Step: Name (only if Google didn't provide it) */}
        {step === 'name' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>What&apos;s your full name?</h2>
            <div className="mt-8">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
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

        {/* Step: Phone */}
        {step === 'phone' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>
              What&apos;s your mobile number?
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-2">
              We&apos;ll send you a real automation alert in 60 seconds.
            </p>
            <div className="mt-8">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 07456789123"
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

        {/* Step: Role */}
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
