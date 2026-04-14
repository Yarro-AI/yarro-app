'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { AccountCard } from './account-card'
import { PainPointPicker } from './pain-point-picker'
import { Loader2 } from 'lucide-react'
import { typography } from '@/lib/typography'

type OnboardingStep = 'account' | 'pain-point' | 'transition' | 'done'

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
      if (dbStep === 'simulation' || dbStep === 'complete' || dbStep === null) return 'done'
      if (dbStep === 'segment') return 'pain-point'
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
    // Show narrative transition before redirecting to dashboard
    setStep('transition')

    // Refresh PM so dashboard has onboarding_step='simulation'
    await refreshPM()

    // Minimum display time so the message registers
    await new Promise((resolve) => setTimeout(resolve, 1800))

    setStep('done')
  }

  if (step === 'done') return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-muted">
      <div className="w-full max-w-lg px-4">
        {step === 'account' && authUser && (
          <AccountCard authUser={authUser} onComplete={handleAccountComplete} />
        )}

        {step === 'pain-point' && pmId && (
          <PainPointPicker pmId={pmId} onComplete={handlePainPointComplete} />
        )}

        {step === 'transition' && (
          <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="px-10 py-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-6" />
              <h2 className={`${typography.pageTitle}`}>
                A tenant just reported a boiler problem...
              </h2>
              <p className="text-sm text-muted-foreground mt-3">
                Loading your dashboard
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
