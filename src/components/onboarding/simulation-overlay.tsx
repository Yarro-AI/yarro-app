'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Zap, MessageSquare, UserSearch, Calculator, Send, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react'
import { typography } from '@/lib/typography'

type OverlayState = 'idle' | 'simulating' | 'result' | 'investment'

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
  const [state, setState] = useState<OverlayState>('idle')
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [smsError, setSmsError] = useState(false)
  const [running, setRunning] = useState(false)
  const mountedRef = useRef(true)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Clean up timeouts on unmount
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

  const runSimulation = useCallback(async () => {
    // Prevent double-click
    if (running) return
    setRunning(true)

    setState('simulating')
    setVisibleSteps(0)
    setSmsError(false)

    // Animate steps sequentially
    for (let i = 0; i < SIMULATION_STEPS.length; i++) {
      await delay(i === 0 ? 300 : 1500)
      if (!mountedRef.current) return
      setVisibleSteps(i + 1)
    }

    // Fire SMS notifications (non-blocking — animation already showing)
    let smsFailed = false
    try {
      // Step 1: tenant alert
      const res1 = await supabase.functions.invoke('yarro-demo-notify', {
        body: { pm_id: pmId, step: 1 },
      })
      if (res1.error || !res1.data?.ok) {
        console.warn('[simulation] Step 1 SMS failed:', res1.error || res1.data?.error)
        smsFailed = true
      }

      // Step 2: auto-approved (slight delay for realism)
      await delay(2000)
      if (!mountedRef.current) return

      const res2 = await supabase.functions.invoke('yarro-demo-notify', {
        body: { pm_id: pmId, step: 2 },
      })
      if (res2.error || !res2.data?.ok) {
        console.warn('[simulation] Step 2 SMS failed:', res2.error || res2.data?.error)
        smsFailed = true
      }
    } catch (err) {
      console.warn('[simulation] SMS dispatch error:', err)
      smsFailed = true
    }

    if (!mountedRef.current) return
    setSmsError(smsFailed)

    // Transition to result
    await delay(1500)
    if (!mountedRef.current) return
    setState('result')

    // Auto-advance to investment CTA
    await delay(2500)
    if (!mountedRef.current) return
    setState('investment')
    setRunning(false)
  }, [supabase, pmId, running, delay])

  const retrySimulation = useCallback(() => {
    setRunning(false)
    setState('idle')
  }, [])

  const wipeDemoAndComplete = async () => {
    try {
      // Wipe all is_demo data + set onboarding_step='complete' in one RPC
      await supabase.rpc('onboarding_wipe_demo', { p_pm_id: pmId })
    } catch (err) {
      console.error('[simulation] Demo wipe failed:', err)
      // Fallback: at least set onboarding_step manually
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
    // Don't call onComplete (which navigates to /import) — just reload the dashboard
    window.location.href = '/'
  }

  // Idle state: pulsing FAB — strong urgency, demands to be clicked
  if (state === 'idle') {
    return (
      <>
        <style jsx>{`
          @keyframes sim-glow-strong {
            0%, 100% {
              box-shadow: 0 0 16px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.12);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 32px rgba(59, 130, 246, 0.5), 0 0 80px rgba(59, 130, 246, 0.2);
              transform: scale(1.02);
            }
          }
        `}</style>
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex flex-col items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground bg-card/90 px-3 py-1 rounded-full border border-border/60 backdrop-blur-sm">
              Click to trigger the automation
            </span>
            <button
              onClick={runSimulation}
              disabled={running}
              className="flex items-center gap-3 px-8 py-5 rounded-2xl bg-primary text-primary-foreground font-semibold text-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{ animation: 'sim-glow-strong 1.5s ease-in-out infinite' }}
            >
              <Zap className="w-6 h-6" />
              Simulate a Maintenance Emergency
            </button>
          </div>
        </div>
      </>
    )
  }

  // Simulation / Result / Investment states: centered card
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md px-4">
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
          <div className="px-8 py-8">

            {/* Simulating state */}
            {state === 'simulating' && (
              <>
                <h2 className={`${typography.pageTitle} text-center`}>
                  Yarro&apos;s brain is working...
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

            {/* Result state */}
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

            {/* Investment CTA state */}
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
