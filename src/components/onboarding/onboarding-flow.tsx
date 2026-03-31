'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { AccountCard } from './account-card'
import { SuccessCard } from './success-card'
import { DemoWalkthrough } from './demo-walkthrough'

type OnboardingStep = 'account' | 'welcome' | 'demo' | 'done'

function getDemoSeenKey(pmId: string) {
  return `yarro_demo_seen_${pmId}`
}

export function OnboardingFlow() {
  const { propertyManager, authUser, refreshPM } = usePM()
  const router = useRouter()
  const supabase = createClient()

  // Compute initial step synchronously — no flash
  const [step, setStep] = useState<OnboardingStep>(() => {
    if (typeof window === 'undefined') return 'account'
    if (propertyManager) {
      if (localStorage.getItem(getDemoSeenKey(propertyManager.id))) return 'done'
      return 'welcome'
    }
    return 'account'
  })

  // If PM loads after mount (e.g. returning user), advance from account
  useEffect(() => {
    if (!propertyManager || step !== 'account') return
    if (localStorage.getItem(getDemoSeenKey(propertyManager.id))) {
      setStep('done')
    } else {
      setStep('welcome')
    }
  }, [propertyManager, step])

  // done = redirect to dashboard, render nothing
  useEffect(() => {
    if (step === 'done') {
      router.replace('/')
    }
  }, [step, router])

  const handleAccountComplete = async () => {
    try {
      await refreshPM()
      const { data: pm, error: pmErr } = await supabase
        .from('c1_property_managers')
        .select('id')
        .eq('user_id', authUser!.id)
        .single()

      console.log('[onboarding] PM lookup:', pm, pmErr)

      if (pm) {
        const { data: seedResult, error: seedErr } = await supabase.rpc('onboarding_seed_demo', { p_pm_id: pm.id })
        console.log('[onboarding] Seed result:', seedResult, seedErr)
      }
    } catch (err) {
      console.error('[onboarding] Failed to seed demo data:', err)
    }

    setStep('welcome')
  }

  const handleDemoComplete = () => {
    if (propertyManager) {
      localStorage.setItem(getDemoSeenKey(propertyManager.id), 'true')
    }
    setStep('done')
  }

  // Render nothing while redirecting
  if (step === 'done') return null

  if (step === 'demo' && propertyManager) {
    return <DemoWalkthrough onComplete={handleDemoComplete} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg px-4">
        {step === 'account' && authUser && (
          <AccountCard authUser={authUser} onComplete={handleAccountComplete} />
        )}

        {step === 'welcome' && (
          <SuccessCard
            onDismiss={() => setStep('demo')}
            heading={`Welcome, ${propertyManager?.name?.split(' ')[0] || ''}!`}
            subtext="Your account is ready. Let's show you what Yarro can do — walk through a real maintenance job in under a minute."
            buttonLabel="Start the demo"
          />
        )}
      </div>
    </div>
  )
}
