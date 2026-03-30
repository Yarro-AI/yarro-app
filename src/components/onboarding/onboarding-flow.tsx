'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePM } from '@/contexts/pm-context'
import { AccountCard } from './account-card'
import { PropertyCard } from './property-card'
import { CheckCircle } from 'lucide-react'
import { typography } from '@/lib/typography'
import { Button } from '@/components/ui/button'

type OnboardingStep = 'account' | 'property' | 'complete'

export function OnboardingFlow() {
  const { propertyManager, authUser } = usePM()
  const router = useRouter()
  const [step, setStep] = useState<OnboardingStep>('account')
  const [dismissing, setDismissing] = useState(false)

  // If PM exists, skip account step
  useEffect(() => {
    if (propertyManager && step === 'account') {
      setStep('property')
    }
  }, [propertyManager, step])

  const handleComplete = () => {
    setStep('complete')
  }

  const handleDismiss = () => {
    setDismissing(true)
    // Let the fade animation play, then navigate
    setTimeout(() => {
      router.push('/')
    }, 600)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing
          ? 'bg-black/0 backdrop-blur-0'
          : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-lg px-4 transition-all duration-500 ${
          dismissing
            ? 'opacity-0 scale-95 translate-y-4'
            : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {step === 'account' && authUser && (
          <AccountCard
            authUser={authUser}
            onComplete={() => setStep('property')}
          />
        )}

        {step === 'property' && propertyManager && (
          <PropertyCard
            pmId={propertyManager.id}
            onComplete={handleComplete}
          />
        )}

        {step === 'complete' && (
          <div className="bg-card rounded-2xl border border-border p-8 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle className="w-7 h-7 text-primary" />
            </div>
            <h2 className={typography.pageTitle}>Property set up</h2>
            <p className={`${typography.bodyText} mt-2 mb-6`}>
              Next up: adding your tenants and linking them to rooms. This step is coming soon.
            </p>
            <Button onClick={handleDismiss} size="lg" className="w-full">
              Go to dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

