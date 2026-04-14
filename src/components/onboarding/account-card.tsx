'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft, Lock } from 'lucide-react'
import { typography } from '@/lib/typography'

interface AccountCardProps {
  authUser: { id: string; email: string; name?: string }
  onComplete: (pmId: string) => void
}

type Step = 'name' | 'phone'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

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

  // Display name for the identity pill
  const displayIdentity = authUser.name?.trim() || authUser.email

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
            {/* Identity pill */}
            <div className="flex justify-center mb-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border/60 text-xs text-muted-foreground">
                <GoogleIcon className="w-3.5 h-3.5" />
                Signed in as {authUser.email}
              </div>
            </div>

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
            {/* Identity pill */}
            <div className="flex justify-center mb-5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border/60 text-xs text-muted-foreground">
                <GoogleIcon className="w-3.5 h-3.5" />
                Signed in as {displayIdentity}
              </div>
            </div>

            <h2 className={`${typography.pageTitle} text-center`}>
              What&apos;s your mobile number?
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-2">
              We&apos;ll show you how Yarro works in 60 seconds.
            </p>
            <div className="mt-6">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 07456789123"
                className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePhoneSubmit() } }}
              />
              {/* Privacy reassurance */}
              <div className="flex items-center justify-center gap-1.5 mt-2.5">
                <Lock className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-xs text-muted-foreground/60">Your number stays private — only used for alerts</span>
              </div>
            </div>
            {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
            <Button onClick={handlePhoneSubmit} className="w-full mt-6" size="lg" disabled={saving}>
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
