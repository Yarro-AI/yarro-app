'use client'

import { useRouter } from 'next/navigation'
import { usePM } from '@/contexts/pm-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { PropertyCard } from '@/components/onboarding/property-card'
import { SuccessCard } from '@/components/onboarding/success-card'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getOnboardingStep } from '@/lib/onboarding'

export default function ImportPage() {
  const { propertyManager } = usePM()
  const router = useRouter()
  const [propertyDone, setPropertyDone] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const onboardingStep = getOnboardingStep(propertyManager)

  // Redirect to dashboard if tour or simulate step — overlays render there
  useEffect(() => {
    if (onboardingStep === 'tour' || onboardingStep === 'simulate') {
      router.replace('/')
    }
  }, [onboardingStep, router])

  // No PM yet → full onboarding (account + pain-point picker)
  if (!propertyManager) {
    return <OnboardingFlow />
  }

  // Still in onboarding flow (account or segment step) → show onboarding
  if (onboardingStep === 'account' || onboardingStep === 'segment') {
    return <OnboardingFlow />
  }

  // Tour/simulate step → useEffect handles redirect above
  if (onboardingStep === 'tour' || onboardingStep === 'simulate') {
    return null
  }

  // onboarding_step is 'complete' or null → show property creation
  const handleDismiss = () => {
    setDismissing(true)
    setTimeout(() => router.push('/'), 600)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${
        dismissing ? 'bg-black/0 backdrop-blur-0' : 'bg-black/40 backdrop-blur-sm'
      }`}
    >
      <div
        className={`w-full max-w-lg px-4 transition-all duration-500 ${
          dismissing ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'
        }`}
      >
        {!propertyDone ? (
          <div className="relative">
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-muted/80 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <PropertyCard
            pmId={propertyManager.id}
            onComplete={() => setPropertyDone(true)}
          />
          </div>
        ) : (
          <SuccessCard
            onDismiss={handleDismiss}
            heading="Property added!"
            subtext="Head to your dashboard to add tenants and contractors."
            showConfetti={false}
          />
        )}
      </div>
    </div>
  )
}
