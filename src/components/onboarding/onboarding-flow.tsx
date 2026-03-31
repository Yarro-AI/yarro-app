'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { AccountCard } from './account-card'
import { PropertyCard } from './property-card'
import { DemoWalkthrough } from './demo-walkthrough'
import { toast } from 'sonner'

type OnboardingStep = 'account' | 'demo' | 'property'

export function OnboardingFlow() {
  const { propertyManager, authUser, refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<OnboardingStep>('account')
  const [dismissing, setDismissing] = useState(false)

  // If PM exists but no real properties, show property card
  // If PM exists and has demo data, show demo walkthrough
  useEffect(() => {
    if (!propertyManager) return
    if (step === 'account') {
      // PM exists — check if they've seen the demo
      const hasDemoProperty = propertyManager.onboarding_completed_at === null
      if (hasDemoProperty) {
        setStep('demo')
      } else {
        setStep('property')
      }
    }
  }, [propertyManager, step])

  const handleAccountComplete = async () => {
    // Seed demo data after account creation
    try {
      await refreshPM()
      // Get fresh PM ID after refresh
      const { data: pm } = await supabase
        .from('c1_property_managers')
        .select('id')
        .eq('user_id', authUser!.id)
        .single()

      if (pm) {
        const { error } = await supabase.rpc('onboarding_seed_demo', { p_pm_id: pm.id })
        if (error) {
          console.error('Demo seed error:', error)
        }
      }
    } catch (err) {
      console.error('Failed to seed demo data:', err)
    }

    setStep('demo')
  }

  const handleDemoComplete = () => {
    setDismissing(true)
    setTimeout(() => {
      router.push('/')
    }, 600)
  }

  const handlePropertyComplete = () => {
    setDismissing(true)
    setTimeout(() => {
      router.push('/')
    }, 600)
  }

  // The demo walkthrough handles its own overlay
  if (step === 'demo' && propertyManager) {
    return <DemoWalkthrough onComplete={handleDemoComplete} />
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
            onComplete={handleAccountComplete}
          />
        )}

        {step === 'property' && propertyManager && (
          <PropertyCard
            pmId={propertyManager.id}
            onComplete={handlePropertyComplete}
          />
        )}
      </div>
    </div>
  )
}
