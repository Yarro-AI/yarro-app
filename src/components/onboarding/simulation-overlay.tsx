'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { MessageSquare, UserSearch, Calculator, Send, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react'
import { typography } from '@/lib/typography'

type OverlayState = 'simulating' | 'result' | 'investment'

interface SimulationOverlayProps {
  pmId: string
  onComplete: () => void
}

const SIMULATION_STEPS = [
  { icon: MessageSquare, label: 'Receiving tenant report...', delay: 0 },
  { icon: UserSearch, label: 'Matching contractor...', delay: 1500 },
  { icon: Calculator, label: 'Checking budget...', delay: 3000 },
  { icon: Send, label: 'Dispatching quote request...', delay: 4500 },
] as const

export function SimulationOverlay({ pmId, onComplete }: SimulationOverlayProps) {
  const supabase = createClient()
  const [state, setState] = useState<OverlayState>('simulating')
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [smsError, setSmsError] = useState(false)
  const mountedRef = useRef(true)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timeoutsRef.current.forEach(clearTimeout)
      timeoutsRef.current = []
    }
  }, [])

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const id = setTimeout(() => {
        if (mountedRef.current) resolve()
      }, ms)
      timeoutsRef.current.push(id)
    })
  }, [])

  // Auto-run simulation on mount
  useEffect(() => {
    runSimulation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runSimulation = useCallback(async () => {
    setState('simulating')
    setVisibleSteps(0)
    setSmsError(false)

    // Animate steps
    for (let i = 0; i < SIMULATION_STEPS.length; i++) {
      await delay(i === 0 ? 300 : 1500)
      if (!mountedRef.current) return
      setVisibleSteps(i + 1)
    }

    // Fire SMS
    let smsFailed = false
    try {
      const res1 = await supabase.functions.invoke('yarro-demo-notify', {
        body: { pm_id: pmId, step: 1 },
      })
      if (res1.error || !res1.data?.ok) smsFailed = true

      await delay(2000)
      if (!mountedRef.current) return

      const res2 = await supabase.functions.invoke('yarro-demo-notify', {
        body: { pm_id: pmId, step: 2 },
      })
      if (res2.error || !res2.data?.ok) smsFailed = true
    } catch {
      smsFailed = true
    }

    if (!mountedRef.current) return
    setSmsError(smsFailed)

    await delay(1500)
    if (!mountedRef.current) return
    setState('result')

    await delay(2500)
    if (!mountedRef.current) return
    setState('investment')
  }, [supabase, pmId, delay])

  const wipeDemoAndComplete = async () => {
    try {
      await supabase.rpc('onboarding_wipe_demo', { p_pm_id: pmId })
    } catch (err) {
      console.error('[simulation] Demo wipe failed:', err)
      await supabase
        .from('c1_property_managers')
        .update({ onboarding_step: 'complete' } as never)
        .eq('id', pmId)
    }
  }

  const handleMakeItReal = async () => {
    await wipeDemoAndComplete()
    onComplete()
  }

  const handleExploreFirst = async () => {
    await wipeDemoAndComplete()
    window.location.href = '/'
  }

  const retrySimulation = useCallback(() => {
    runSimulation()
  }, [runSimulation])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md px-4">
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
          <div className="px-8 py-8">

            {/* Simulating */}
            {state === 'simulating' && (
              <>
                <h2 className={`${typography.pageTitle} text-center`}>
                  Processing emergency...
                </h2>
                <div className="mt-8 space-y-4">
                  {SIMULATION_STEPS.map((step, i) => {
                    const Icon = step.icon
                    const visible = i < visibleSteps
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 transition-all duration-500 ${
                          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          visible ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{step.label}</span>
                        {visible && i === visibleSteps - 1 && (
                          <div className="ml-auto flex gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Result */}
            {state === 'result' && (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h2 className={`${typography.pageTitle}`}>
                  {smsError ? 'Here\u2019s what just happened.' : 'Check your phone.'}
                </h2>
                <p className="text-sm text-muted-foreground mt-2">
                  {smsError
                    ? 'Yarro triaged the issue, matched a contractor, checked the budget, and dispatched a quote \u2014 all automatically.'
                    : 'That just happened for real. Your contractor would already be on their way.'}
                </p>
                {smsError && (
                  <button
                    onClick={retrySimulation}
                    className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Try again
                  </button>
                )}
              </div>
            )}

            {/* Investment CTA */}
            {state === 'investment' && (
              <div className="text-center">
                <h2 className={`${typography.pageTitle}`}>
                  That took 6 seconds.
                </h2>
                <p className="text-sm text-muted-foreground mt-2 mb-8">
                  To put Yarro to work on a real property:
                </p>
                <Button onClick={handleMakeItReal} size="lg" className="w-full">
                  Let&apos;s make it real
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <button
                  onClick={handleExploreFirst}
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  I&apos;ll explore first
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
