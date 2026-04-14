'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { AccountCard } from './account-card'
import { PainPointPicker } from './pain-point-picker'

type OnboardingStep = 'account' | 'pain-point' | 'done'

export function OnboardingFlow() {
  const { propertyManager, authUser, refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()

  // onboarding_step is added by migration but not yet in generated types
  const getOnboardingStep = (pm: typeof propertyManager) =>
    (pm as unknown as Record<string, unknown>)?.onboarding_step as string | null | undefined

  const [step, setStep] = useState<OnboardingStep>(() => {
    if (propertyManager) {
      const dbStep = getOnboardingStep(propertyManager)
      // If simulation or later, they should be on the dashboard
      if (dbStep === 'simulation' || dbStep === 'complete' || dbStep === null) return 'done'
      // If segment step, show pain-point picker
      if (dbStep === 'segment') return 'pain-point'
      // Otherwise still in account creation
      return 'account'
    }
    return 'account'
  })

  const [pmId, setPmId] = useState<string | null>(propertyManager?.id ?? null)

  useEffect(() => {
    if (step === 'done') {
      router.replace('/')
    }
  }, [step, router])

  // If PM loads after initial render, check their onboarding_step
  useEffect(() => {
    if (!propertyManager || step !== 'account') return
    setPmId(propertyManager.id)
    const dbStep = getOnboardingStep(propertyManager)
    if (dbStep === 'simulation' || dbStep === 'complete' || dbStep === null) {
      setStep('done')
    } else if (dbStep === 'segment') {
      setStep('pain-point')
    }
  }, [propertyManager, step])

  const handleAccountComplete = async (newPmId: string) => {
    setPmId(newPmId)

    // Seed demo data synchronously — prevents race condition on dashboard
    try {
      await supabase.rpc('onboarding_seed_demo', { p_pm_id: newPmId })
    } catch (err) {
      console.error('[onboarding] Demo seed failed:', err)
      // Non-fatal — user can still proceed, dashboard will just be empty
    }

    // Refresh PM context so downstream components have the PM record
    try {
      await refreshPM()
    } catch (err) {
      console.error('[onboarding] refreshPM failed:', err)
    }

    setStep('pain-point')
  }

  const handlePainPointComplete = async () => {
    // onboarding_step is set to 'simulation' by PainPointPicker in DB
    // Must refresh PM context so dashboard sees the new value
    await refreshPM()
    setStep('done') // redirects to dashboard where SimulationOverlay renders
  }

  if (step === 'done') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg px-4">
        {step === 'account' && authUser && (
          <AccountCard authUser={authUser} onComplete={handleAccountComplete} />
        )}

        {step === 'pain-point' && pmId && (
          <PainPointPicker pmId={pmId} onComplete={handlePainPointComplete} />
        )}
      </div>
    </div>
  )
}
