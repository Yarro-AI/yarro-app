'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft } from 'lucide-react'
import { typography } from '@/lib/typography'

interface AccountCardProps {
  authUser: { id: string; email: string; name?: string }
  onComplete: (pmId: string) => void
}

type Step = 'name' | 'phone'

export function AccountCard({ authUser, onComplete }: AccountCardProps) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasGoogleName = !!authUser.name?.trim()
  const initialStep: Step = hasGoogleName ? 'phone' : 'name'
  const [step, setStep] = useState<Step>(initialStep)

  const [name, setName] = useState(authUser.name?.trim() || '')
  const [phone, setPhone] = useState('')

  const steps: Step[] = hasGoogleName ? ['phone'] : ['name', 'phone']
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

  const handlePhoneSubmit = async () => {
    if (!phone.trim()) { setError('Your mobile number is required'); return }
    if (!isValidUKPhone(phone)) { setError('Enter a valid UK phone number'); return }
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
        p_role: 'manager',
      })

      if (rpcError) {
        setError(rpcError.message)
        setSaving(false)
        return
      }

      const pmId = data?.id
      if (!pmId) {
        setError('Account created but no ID returned. Please refresh.')
        setSaving(false)
        return
      }

      onComplete(pmId)
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
      {steps.length > 1 && (
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
      )}

      <div className="px-8 pb-8 pt-6">
        {/* Step: Name (only if Google didn't provide it) */}
        {step === 'name' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>What&apos;s your full name?</h2>
            <div className="mt-8">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setName(prev => prev.replace(/\b\w/g, c => c.toUpperCase()))}
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

        {/* Step: Phone (submits account on continue) */}
        {step === 'phone' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>
              What&apos;s your mobile number?
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-2">
              We&apos;ll show you how Yarro works in 60 seconds.
            </p>
            <div className="mt-8">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 07456789123"
                className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePhoneSubmit() } }}
              />
            </div>
            {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
            <Button onClick={handlePhoneSubmit} className="w-full mt-8" size="lg" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Setting up...
                </span>
              ) : (
                'Continue'
              )}
            </Button>
          </>
        )}
      </div>
    </div>
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
