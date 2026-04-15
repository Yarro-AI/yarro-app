'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react'
import { typography } from '@/lib/typography'
import { WhatsAppChat } from './whatsapp-chat'

type OverlayState = 'simulating' | 'result' | 'investment'

interface SimulationOverlayProps {
  pmId: string
  onComplete: () => void
}

export function SimulationOverlay({ pmId, onComplete }: SimulationOverlayProps) {
  const supabase = createClient()
  const [state, setState] = useState<OverlayState>('simulating')
  const [smsError, setSmsError] = useState(false)

  const fireSms = useCallback(async (step: number) => {
    try {
      const res = await supabase.functions.invoke('yarro-demo-notify', {
        body: { pm_id: pmId, step },
      })
      if (res.error || !res.data?.ok) {
        console.warn(`[simulation] SMS step ${step} failed:`, res.error || res.data?.error)
        setSmsError(true)
      }
    } catch (err) {
      console.warn(`[simulation] SMS step ${step} error:`, err)
      setSmsError(true)
    }
  }, [supabase, pmId])

  const handleChatComplete = useCallback(() => {
    setState('result')
    // Auto-advance to investment after 2.5s
    setTimeout(() => setState('investment'), 2500)
  }, [])

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

  const handleRetry = useCallback(() => {
    setSmsError(false)
    setState('simulating')
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md px-4">
        <div className="bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">

          {/* Simulating — WhatsApp chat animation */}
          {state === 'simulating' && (
            <WhatsAppChat
              onSmsStep1={() => fireSms(1)}
              onSmsStep2={() => fireSms(2)}
              onComplete={handleChatComplete}
            />
          )}

          {/* Result */}
          {state === 'result' && (
            <div className="px-8 py-8 text-center">
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
                  onClick={handleRetry}
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
            <div className="px-8 py-8 text-center">
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
  )
}
