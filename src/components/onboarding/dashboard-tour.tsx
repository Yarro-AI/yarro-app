'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { OnboardingHelper } from './onboarding-helper'

type TourStep = 'welcome' | 'needs-action' | 'opening-drawer' | 'ticket-drawer' | 'done'

interface Rect { top: number; left: number; width: number; height: number }

interface DashboardTourProps {
  pmId: string
  demoTicketId: string | null
  openTicket: (ticketId: string) => void
  onTourComplete: () => void
}

export function DashboardTour({ pmId, demoTicketId, openTicket, onTourComplete }: DashboardTourProps) {
  const supabase = createClient()
  const { refreshPM } = usePM()
  const [tourStep, setTourStep] = useState<TourStep>('welcome')
  const [highlight, setHighlight] = useState<Rect | null>(null)
  const [drawerRect, setDrawerRect] = useState<Rect | null>(null)
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Detect drawer close by user
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      completeTour()
    }
  }, [ticketIdParam, tourStep])

  const completeTour = useCallback(async () => {
    setTourStep('done')
    setHighlight(null)

    if (window.location.search.includes('ticketId')) {
      window.history.replaceState(null, '', window.location.pathname)
    }

    try {
      await supabase
        .from('c1_property_managers')
        .update({ onboarding_step: 'simulate' } as never)
        .eq('id', pmId)
      await refreshPM()
    } catch {
      try {
        await supabase
          .from('c1_property_managers')
          .update({ onboarding_step: 'simulate' } as never)
          .eq('id', pmId)
        await refreshPM()
      } catch {
        window.location.reload()
        return
      }
    }

    onTourComplete()
  }, [supabase, pmId, refreshPM, onTourComplete])

  const handleWelcome = useCallback(() => {
    const el = document.querySelector('[data-ticket-id]')
    if (el) {
      const rect = el.getBoundingClientRect()
      setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    setTourStep('needs-action')
  }, [])

  const handleSeeIssue = useCallback(() => {
    if (!demoTicketId) { completeTour(); return }

    // Transition state: no helper card shown, dim stays, drawer opens
    setTourStep('opening-drawer')
    setHighlight(null)
    openTicket(demoTicketId)

    // Measure drawer after its open animation
    timerRef.current = setTimeout(() => {
      const drawerEl = document.querySelector('[data-side="right"]')
      if (drawerEl) {
        const rect = drawerEl.getBoundingClientRect()
        setDrawerRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
      }
      setTourStep('ticket-drawer')
    }, 900)
  }, [demoTicketId, openTicket, completeTour])

  if (tourStep === 'done') return null

  return (
    <>
      <style jsx>{`
        @keyframes tour-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(59, 130, 246, 0.2), 0 0 24px rgba(59, 130, 246, 0.08); }
          50% { box-shadow: 0 0 16px rgba(59, 130, 246, 0.35), 0 0 48px rgba(59, 130, 246, 0.12); }
        }
        @keyframes tour-card-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Dim — ALWAYS visible during entire tour. Spotlight overlays on top when active. */}
      <div className="fixed inset-0 z-40 bg-black/55 pointer-events-none" />

      {/* Spotlight: glow cutout on top of the dim */}
      {highlight && (
        <div
          className="fixed z-[41] rounded-xl border-2 border-primary/40 pointer-events-none"
          style={{
            top: highlight.top - 6,
            left: highlight.left - 6,
            width: highlight.width + 12,
            height: highlight.height + 12,
            animation: 'tour-glow 2s ease-in-out infinite',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        />
      )}

      {/* ONLY the active step's card renders. No ghost cards. */}

      {tourStep === 'welcome' && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[42] w-full max-w-sm px-4"
          style={{ animation: 'tour-card-in 0.4s ease-out forwards' }}
        >
          <OnboardingHelper
            title="This is your dashboard"
            description="This is where you manage tasks across your entire portfolio."
            buttonLabel="See how it works"
            onAction={handleWelcome}
          />
        </div>
      )}

      {tourStep === 'needs-action' && highlight && (
        <div
          className="fixed z-[42] w-full max-w-sm px-4"
          style={{
            top: `${highlight.top + highlight.height + 16}px`,
            left: `${Math.max(16, highlight.left)}px`,
            animation: 'tour-card-in 0.4s ease-out forwards',
          }}
        >
          <OnboardingHelper
            title="This is a ticket"
            description="A demo tenant just reported a boiler problem. It's waiting in your Needs Action queue."
            buttonLabel="See the issue"
            onAction={handleSeeIssue}
          />
        </div>
      )}

      {/* opening-drawer: no card shown — just dim + drawer animating in */}

      {tourStep === 'ticket-drawer' && drawerRect && (
        <div
          className="fixed z-[60] w-full max-w-xs"
          style={{
            top: `${drawerRect.top + 40}px`,
            right: `${window.innerWidth - drawerRect.left + 16}px`,
            animation: 'tour-card-in 0.4s ease-out forwards',
          }}
        >
          <OnboardingHelper
            title="This is the ticket detail"
            description="You'll find all the details of any issue and take action from here."
            buttonLabel="Back to dashboard"
            onAction={completeTour}
          />
        </div>
      )}
    </>
  )
}
