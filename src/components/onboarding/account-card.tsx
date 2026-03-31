'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { normalizePhone, isValidUKPhone } from '@/lib/normalize'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ChevronLeft } from 'lucide-react'
import { typography } from '@/lib/typography'

interface AccountCardProps {
  authUser: { id: string; email: string }
  onComplete: () => void
}

type Step = 'name' | 'contact' | 'contact-detail' | 'role'

export function AccountCard({ authUser, onComplete }: AccountCardProps) {
  const { refreshPM } = usePM()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('name')

  const [name, setName] = useState('')
  const [preferredContact, setPreferredContact] = useState<'whatsapp' | 'email'>('whatsapp')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(authUser.email)
  const [role, setRole] = useState<string | null>(null)

  const steps: Step[] = ['name', 'contact', 'contact-detail', 'role']
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
    setStep('contact')
  }

  const handleContactSelect = (method: 'whatsapp' | 'email') => {
    setPreferredContact(method)
    setStep('contact-detail')
  }

  const handleContactDetailNext = () => {
    if (preferredContact === 'whatsapp') {
      if (!phone.trim()) { setError('Your WhatsApp number is required'); return }
      if (!isValidUKPhone(phone)) { setError('Enter a valid UK phone number'); return }
    } else {
      if (!email.trim()) { setError('Your email is required'); return }
    }
    setError(null)
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
        p_email: preferredContact === 'email' ? email.trim().toLowerCase() : authUser.email,
        p_phone: preferredContact === 'whatsapp' ? normalizePhone(phone) : '',
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
      onComplete()
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
          <ProgressDots current={stepIndex + 1} total={4} />
        </div>
        <div className="w-8" />
      </div>

      <div className="px-10 pb-10 pt-6">
        {/* Step 1: Name */}
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

        {/* Step 2: Contact method */}
        {step === 'contact' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>How should we contact you?</h2>
            <div className="mt-8 space-y-3">
              <OptionButton label="WhatsApp" selected={false} onClick={() => handleContactSelect('whatsapp')} />
              <OptionButton label="Email" selected={false} onClick={() => handleContactSelect('email')} />
            </div>
          </>
        )}

        {/* Step 3: Contact detail */}
        {step === 'contact-detail' && (
          <>
            <h2 className={`${typography.pageTitle} text-center`}>
              {preferredContact === 'whatsapp'
                ? "What\u2019s your WhatsApp number?"
                : "What\u2019s your email?"
              }
            </h2>
            <div className="mt-8">
              {preferredContact === 'whatsapp' ? (
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 07456789123"
                  className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleContactDetailNext() } }}
                />
              ) : (
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  type="email"
                  className="h-14 text-center !text-lg !font-medium rounded-xl placeholder:!text-lg placeholder:!font-medium"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleContactDetailNext() } }}
                />
              )}
            </div>
            {error && <p className="text-sm text-destructive mt-3 text-center">{error}</p>}
            <Button onClick={handleContactDetailNext} className="w-full mt-8" size="lg">
              Continue
            </Button>
          </>
        )}

        {/* Step 4: Role */}
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
