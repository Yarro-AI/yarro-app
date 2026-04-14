'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { OnboardingHelper } from './onboarding-helper'
import { SimulationOverlay } from './simulation-overlay'

type TourStep =
  | 'welcome'          // "This is your dashboard"
  | 'needs-action'     // Card near the demo ticket
  | 'opening-ticket'   // Brief pause simulating click
  | 'ticket-drawer'    // Card while drawer is open
  | 'simulate'         // Hand off to SimulationOverlay

interface DashboardTourProps {
  pmId: string
  demoTicketId: string | null
  openTicket: (ticketId: string) => void
  onTourDone: () => void
}

export function DashboardTour({ pmId, demoTicketId, openTicket, onTourDone }: DashboardTourProps) {
  const [tourStep, setTourStep] = useState<TourStep>('welcome')
  const searchParams = useSearchParams()

  // Detect when ticket drawer closes (user hit Escape or clicked outside)
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      setTourStep('simulate')
    }
  }, [ticketIdParam, tourStep])

  const handleWelcome = useCallback(() => {
    setTourStep('needs-action')
  }, [])

  const handleSeeIssue = useCallback(() => {
    if (!demoTicketId) {
      setTourStep('simulate')
      return
    }
    setTourStep('opening-ticket')
    // Brief pause to simulate the click, then open the ticket
    setTimeout(() => {
      openTicket(demoTicketId)
      setTourStep('ticket-drawer')
    }, 600)
  }, [demoTicketId, openTicket])

  const handleDrawerDone = useCallback(() => {
    // Close the drawer by clearing the URL param
    window.history.replaceState(null, '', window.location.pathname)
    setTourStep('simulate')
  }, [])

  // Step: Simulate — hand off to SimulationOverlay
  if (tourStep === 'simulate') {
    return (
      <SimulationOverlay
        pmId={pmId}
        onComplete={onTourDone}
      />
    )
  }

  // Step: Welcome — "This is your dashboard"
  if (tourStep === 'welcome') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-sm px-4">
          <OnboardingHelper
            title="This is your dashboard"
            description="This is where you manage tasks across your entire portfolio."
            buttonLabel="See how it works"
            onAction={handleWelcome}
          />
        </div>
      </div>
    )
  }

  // Step: Needs Action — card near the demo ticket
  if (tourStep === 'needs-action') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-sm px-4">
          <OnboardingHelper
            title="This is a ticket"
            description="A demo tenant just reported a boiler problem. It's waiting in your Needs Action queue."
            buttonLabel="See the issue"
            onAction={handleSeeIssue}
          />
        </div>
      </div>
    )
  }

  // Step: Opening ticket — brief pause with dimmed screen
  if (tourStep === 'opening-ticket') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
      </div>
    )
  }

  // Step: Ticket drawer — instruction card while drawer is open
  if (tourStep === 'ticket-drawer') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-8 left-8 pointer-events-auto w-full max-w-sm">
          <OnboardingHelper
            title="This is the ticket detail"
            description="Every issue gets triaged, matched to a contractor, and dispatched automatically. Let's see it in action."
            buttonLabel="Show me how"
            onAction={handleDrawerDone}
          />
        </div>
      </div>
    )
  }

  return null
}
