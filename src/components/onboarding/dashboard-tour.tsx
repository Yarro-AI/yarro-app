'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { OnboardingHelper } from './onboarding-helper'

type TourStep =
  | 'welcome'
  | 'breathing'
  | 'needs-action'
  | 'opening-ticket'
  | 'ticket-drawer'
  | 'done'

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
  onTourComplete: () => void
}

function getTourDoneKey(pmId: string) {
  return `yarro_tour_done_${pmId}`
}

export function DashboardTour({ pmId, demoTicketId, openTicket, onTourComplete }: DashboardTourProps) {
  const [tourStep, setTourStep] = useState<TourStep>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(getTourDoneKey(pmId))) return 'done'
    return 'welcome'
  })
  const [cardVisible, setCardVisible] = useState(false)
  const [highlight, setHighlight] = useState<HighlightRect | null>(null)
  const [dimVisible, setDimVisible] = useState(true)
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Clean up on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Fade card in when step changes to a card-showing step
  useEffect(() => {
    const cardSteps: TourStep[] = ['welcome', 'needs-action', 'ticket-drawer']
    if (!cardSteps.includes(tourStep)) {
      setCardVisible(false)
      return
    }
    setCardVisible(false)
    const delay = tourStep === 'ticket-drawer' ? 500 : 150
    const id = setTimeout(() => setCardVisible(true), delay)
    return () => clearTimeout(id)
  }, [tourStep])

  // Detect drawer close (user hit Escape)
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      completeTour()
    }
  }, [ticketIdParam, tourStep])

  // If tour is already done, signal parent immediately
  useEffect(() => {
    if (tourStep === 'done') onTourComplete()
  }, [tourStep, onTourComplete])

  const completeTour = useCallback(() => {
    setCardVisible(false)
    setDimVisible(false)
    setHighlight(null)
    localStorage.setItem(getTourDoneKey(pmId), 'true')
    timerRef.current = setTimeout(() => {
      // Close drawer if still open
      if (window.location.search.includes('ticketId')) {
        window.history.replaceState(null, '', window.location.pathname)
      }
      setTourStep('done')
    }, 400)
  }, [pmId])

  const handleWelcome = useCallback(() => {
    setCardVisible(false)
    timerRef.current = setTimeout(() => {
      setTourStep('breathing')
      timerRef.current = setTimeout(() => {
        // Highlight the first ticket
        const el = document.querySelector('[data-ticket-id]')
        if (el) {
          const rect = el.getBoundingClientRect()
          setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
        }
        setTourStep('needs-action')
      }, 600)
    }, 400)
  }, [])

  const handleSeeIssue = useCallback(() => {
    if (!demoTicketId) { completeTour(); return }
    setCardVisible(false)
    setHighlight(null)
    timerRef.current = setTimeout(() => {
      setTourStep('opening-ticket')
      timerRef.current = setTimeout(() => {
        openTicket(demoTicketId)
        // Wait for drawer animation before showing card
        timerRef.current = setTimeout(() => {
          setTourStep('ticket-drawer')
        }, 800)
      }, 500)
    }, 400)
  }, [demoTicketId, openTicket, completeTour])

  const handleBackToDashboard = useCallback(() => {
    completeTour()
  }, [completeTour])

  // Tour complete — render nothing, parent handles simulate FAB
  if (tourStep === 'done') return null

  // Single render tree — no early returns, no mount/unmount swaps
  return (
    <>
      <style jsx>{`
        @keyframes tour-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(59, 130, 246, 0.2), 0 0 24px rgba(59, 130, 246, 0.08); }
          50% { box-shadow: 0 0 16px rgba(59, 130, 246, 0.35), 0 0 48px rgba(59, 130, 246, 0.12); }
        }
      `}</style>

      {/* Persistent dim overlay — fades based on step */}
      <div className={`fixed inset-0 z-40 pointer-events-none transition-opacity duration-500 ${
        dimVisible ? 'opacity-100' : 'opacity-0'
      }`}>
        {!highlight && <div className="absolute inset-0 bg-black/50" />}
      </div>

      {/* Spotlight cutout on highlighted element */}
      {highlight && (
        <div
          className="fixed z-40 rounded-xl border-2 border-primary/40 pointer-events-none transition-all duration-500"
          style={{
            top: highlight.top - 6,
            left: highlight.left - 6,
            width: highlight.width + 12,
            height: highlight.height + 12,
            animation: 'tour-glow 2s ease-in-out infinite',
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
          }}
        />
      )}

      {/* Welcome card — bottom center */}
      {tourStep === 'welcome' && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40 pointer-events-auto w-full max-w-sm px-4 transition-all duration-500 ${
          cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <OnboardingHelper
            title="This is your dashboard"
            description="This is where you manage tasks across your entire portfolio."
            buttonLabel="See how it works"
            onAction={handleWelcome}
          />
        </div>
      )}

      {/* Needs Action card — below the highlighted ticket */}
      {tourStep === 'needs-action' && (
        <div
          className={`fixed z-40 pointer-events-auto w-full max-w-sm px-4 transition-all duration-500 ${
            cardVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            top: highlight ? `${highlight.top + highlight.height + 16}px` : 'auto',
            bottom: highlight ? 'auto' : '2rem',
            left: highlight ? `${Math.max(16, highlight.left)}px` : '50%',
            transform: !highlight && !cardVisible ? 'translateX(-50%)' : undefined,
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

      {/* Ticket drawer card — top-left, outside drawer, aligned with drawer header */}
      {tourStep === 'ticket-drawer' && (
        <div
          className={`fixed z-[60] pointer-events-auto w-full max-w-xs px-4 transition-all duration-500 ease-out ${
            cardVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
          }`}
          style={{
            top: '4rem',
            right: 'calc(min(50vw, 100% - 600px) + min(50vw, 600px) + 1rem)',
          }}
        >
          <OnboardingHelper
            title="This is the ticket detail"
            description="You'll find all the details of any issue and take action from here."
            buttonLabel="Back to dashboard"
            onAction={handleBackToDashboard}
          />
        </div>
      )}
    </>
  )
}
