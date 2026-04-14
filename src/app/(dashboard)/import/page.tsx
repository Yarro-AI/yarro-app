'use client'

import { useRouter } from 'next/navigation'
import { usePM } from '@/contexts/pm-context'
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow'
import { PropertyCard } from '@/components/onboarding/property-card'
import { SuccessCard } from '@/components/onboarding/success-card'
import { useState } from 'react'
import { X } from 'lucide-react'

export default function ImportPage() {
  const { propertyManager } = usePM()
  const router = useRouter()
  const [propertyDone, setPropertyDone] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  // No PM yet → full onboarding (account + demo)
  if (!propertyManager) {
    return <OnboardingFlow />
  }

  // PM exists but demo not seen → onboarding flow handles it
  const demoSeen = localStorage.getItem(`yarro_demo_seen_${propertyManager.id}`)
  if (!demoSeen) {
    return <OnboardingFlow />
  }

  const handleDismiss = () => {
    setDismissing(true)
    setTimeout(() => router.push('/'), 600)
  }

  // PM exists + demo seen → property creation flow
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
