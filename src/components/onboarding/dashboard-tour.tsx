'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { OnboardingHelper } from './onboarding-helper'

type TourStep = 'welcome' | 'needs-action' | 'ticket-drawer' | 'done'

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
  // Track which step's card is visible — single source, no competing effects
  const [visibleCard, setVisibleCard] = useState<TourStep | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Fade card in after step change — single effect, no race
  useEffect(() => {
    if (tourStep === 'done') { setVisibleCard(null); return }

    // Clear previous card, then fade in after a beat
    setVisibleCard(null)
    const delay = tourStep === 'ticket-drawer' ? 600 : 300
    const id = setTimeout(() => setVisibleCard(tourStep), delay)
    timerRef.current = id
    return () => clearTimeout(id)
  }, [tourStep])

  // Detect drawer close by user (Escape, click outside)
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      completeTour()
    }
  }, [ticketIdParam, tourStep])

  // Complete tour: update DB, refresh PM, signal parent
  const completeTour = useCallback(async () => {
    setVisibleCard(null)
    setHighlight(null)

    // Close drawer if open
    if (window.location.search.includes('ticketId')) {
      window.history.replaceState(null, '', window.location.pathname)
    }

    try {
      await supabase
        .from('c1_property_managers')
        .update({ onboarding_step: 'simulate' } as never)
        .eq('id', pmId)
      await refreshPM()
    } catch (err) {
      console.error('[tour] Failed to update onboarding_step:', err)
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

    setTourStep('done')
    onTourComplete()
  }, [supabase, pmId, refreshPM, onTourComplete])

  const handleWelcome = useCallback(() => {
    setVisibleCard(null)
    // Measure the demo ticket position, then show the needs-action card
    setTimeout(() => {
      const el = document.querySelector('[data-ticket-id]')
      if (el) {
        const rect = el.getBoundingClientRect()
        setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
      }
      setTourStep('needs-action')
    }, 400)
  }, [])

  const handleSeeIssue = useCallback(() => {
    if (!demoTicketId) { completeTour(); return }
    setVisibleCard(null)
    setHighlight(null)

    // Open ticket drawer, then measure its position
    setTimeout(() => {
      openTicket(demoTicketId)
      setTimeout(() => {
        const drawerEl = document.querySelector('[data-side="right"]')
        if (drawerEl) {
          const rect = drawerEl.getBoundingClientRect()
          setDrawerRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
        }
        setTourStep('ticket-drawer')
      }, 800)
    }, 400)
  }, [demoTicketId, openTicket, completeTour])

  if (tourStep === 'done') return null

  const cardShown = visibleCard === tourStep

  return (
    <>
      <style jsx>{`
        @keyframes tour-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(59, 130, 246, 0.2), 0 0 24px rgba(59, 130, 246, 0.08); }
          50% { box-shadow: 0 0 16px rgba(59, 130, 246, 0.35), 0 0 48px rgba(59, 130, 246, 0.12); }
        }
      `}</style>

      {/* Dim overlay — always visible during tour */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        {!highlight && <div className="absolute inset-0 bg-black/50" />}
      </div>

      {/* Spotlight: glow border with box-shadow darkens everything outside */}
      {highlight && (
        <div
          className="fixed z-40 rounded-xl border-2 border-primary/40 pointer-events-none"
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

      {/* Welcome card */}
      {tourStep === 'welcome' && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-full max-w-sm px-4 transition-opacity duration-500 ${
          cardShown ? 'opacity-100' : 'opacity-0'
        }`}>
          <OnboardingHelper
            title="This is your dashboard"
            description="This is where you manage tasks across your entire portfolio."
            buttonLabel="See how it works"
            onAction={handleWelcome}
          />
        </div>
      )}

      {/* Needs Action card — below highlighted ticket */}
      {tourStep === 'needs-action' && (
        <div
          className={`fixed z-40 pointer-events-auto w-full max-w-sm px-4 transition-opacity duration-500 ${
            cardShown ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            top: highlight ? `${highlight.top + highlight.height + 16}px` : 'auto',
            bottom: highlight ? 'auto' : '2rem',
            left: highlight ? `${Math.max(16, highlight.left)}px` : '50%',
            transform: !highlight ? 'translateX(-50%)' : undefined,
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

      {/* Ticket drawer card — snug against the drawer's left edge */}
      {tourStep === 'ticket-drawer' && (
        <div
          className={`fixed z-[60] pointer-events-auto w-full max-w-xs transition-opacity duration-500 ${
            cardShown ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            top: drawerRect ? `${drawerRect.top + 12}px` : '3rem',
            right: drawerRect ? `${window.innerWidth - drawerRect.left + 4}px` : '52vw',
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
