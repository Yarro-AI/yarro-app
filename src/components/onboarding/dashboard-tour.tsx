'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { OnboardingHelper } from './onboarding-helper'
import { SimulationOverlay } from './simulation-overlay'

type TourStep =
  | 'welcome'
  | 'breathing'         // Pause between steps — no card, dashboard visible
  | 'needs-action'
  | 'opening-ticket'
  | 'ticket-drawer'
  | 'simulate'

interface HighlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface DashboardTourProps {
  pmId: string
  demoTicketId: string | null
  openTicket: (ticketId: string) => void
  onTourDone: () => void
}

export function DashboardTour({ pmId, demoTicketId, openTicket, onTourDone }: DashboardTourProps) {
  const [tourStep, setTourStep] = useState<TourStep>('welcome')
  const [cardVisible, setCardVisible] = useState(false)
  const [highlight, setHighlight] = useState<HighlightRect | null>(null)
  const [nextStep, setNextStep] = useState<TourStep | null>(null)
  const searchParams = useSearchParams()
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Fade card in after mount / step change
  useEffect(() => {
    if (tourStep === 'breathing' || tourStep === 'opening-ticket' || tourStep === 'simulate') return
    const id = setTimeout(() => setCardVisible(true), 100)
    return () => clearTimeout(id)
  }, [tourStep])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current)
    }
  }, [])

  // Detect when ticket drawer closes
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      transitionTo('simulate')
    }
  }, [ticketIdParam, tourStep])

  // Transition: fade out card → breathing pause → update highlight → fade in next card
  const transitionTo = useCallback((next: TourStep) => {
    setCardVisible(false)
    setNextStep(next)

    // After card fades out (400ms), enter breathing state
    transitionTimer.current = setTimeout(() => {
      setTourStep('breathing')
      setHighlight(null)

      // After breathing pause (600ms), switch to next step with highlight
      transitionTimer.current = setTimeout(() => {
        // Position highlight on the target element for the next step
        if (next === 'needs-action') {
          const el = document.getElementById('tour-needs-action')
          if (el) {
            const rect = el.getBoundingClientRect()
            setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
          }
        } else {
          setHighlight(null)
        }

        setTourStep(next)
        setNextStep(null)
      }, 600)
    }, 400)
  }, [])

  const handleWelcome = useCallback(() => {
    transitionTo('needs-action')
  }, [transitionTo])

  const handleSeeIssue = useCallback(() => {
    if (!demoTicketId) {
      transitionTo('simulate')
      return
    }
    setCardVisible(false)
    setHighlight(null)

    transitionTimer.current = setTimeout(() => {
      setTourStep('opening-ticket')
      // Brief pause, then open the ticket
      transitionTimer.current = setTimeout(() => {
        openTicket(demoTicketId)
        setTourStep('ticket-drawer')
        setTimeout(() => setCardVisible(true), 300)
      }, 600)
    }, 400)
  }, [demoTicketId, openTicket])

  const handleDrawerDone = useCallback(() => {
    setCardVisible(false)
    transitionTimer.current = setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname)
      setTourStep('simulate')
    }, 400)
  }, [])

  // Simulate — hand off entirely
  if (tourStep === 'simulate') {
    return <SimulationOverlay pmId={pmId} onComplete={onTourDone} />
  }

  // Breathing state — just the dim overlay, no card
  if (tourStep === 'breathing') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/40 transition-opacity duration-500" />
      </div>
    )
  }

  // Opening ticket — dimmed, no card
  if (tourStep === 'opening-ticket') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/40" />
      </div>
    )
  }

  return (
    <>
      <style jsx>{`
        @keyframes tour-glow {
          0%, 100% {
            box-shadow: 0 0 8px rgba(59, 130, 246, 0.2), 0 0 24px rgba(59, 130, 246, 0.08);
          }
          50% {
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.35), 0 0 48px rgba(59, 130, 246, 0.12);
          }
        }
      `}</style>

      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Dim overlay */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

        {/* Glow highlight on target element */}
        {highlight && (
          <div
            className="absolute rounded-xl border-2 border-primary/40 pointer-events-none transition-all duration-500"
            style={{
              top: highlight.top - 4,
              left: highlight.left - 4,
              width: highlight.width + 8,
              height: highlight.height + 8,
              animation: 'tour-glow 2s ease-in-out infinite',
              // Cut through the dim overlay so the highlighted area is visible
              backgroundColor: 'transparent',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
              // This creates a "spotlight" effect — everything outside is dark
            }}
          />
        )}

        {/* Welcome — bottom center */}
        {tourStep === 'welcome' && (
          <div
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-sm px-4 transition-all duration-400 ${
              cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <OnboardingHelper
              title="This is your dashboard"
              description="This is where you manage tasks across your entire portfolio."
              buttonLabel="See how it works"
              onAction={handleWelcome}
            />
          </div>
        )}

        {/* Needs Action — positioned near the highlighted column */}
        {tourStep === 'needs-action' && (
          <div
            className={`absolute pointer-events-auto w-full max-w-sm px-4 transition-all duration-400 ${
              cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
            style={{
              bottom: '2rem',
              left: highlight ? `${highlight.left + highlight.width / 2}px` : '50%',
              transform: cardVisible
                ? `translateX(-50%) translateY(0)`
                : `translateX(-50%) translateY(1rem)`,
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

        {/* Ticket drawer — left side */}
        {tourStep === 'ticket-drawer' && (
          <div
            className={`absolute bottom-8 left-8 pointer-events-auto w-full max-w-sm transition-all duration-400 ${
              cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <OnboardingHelper
              title="This is the ticket detail"
              description="Every issue gets triaged, matched to a contractor, and dispatched automatically. Let's see it in action."
              buttonLabel="Show me how"
              onAction={handleDrawerDone}
            />
          </div>
        )}
      </div>
    </>
  )
}
