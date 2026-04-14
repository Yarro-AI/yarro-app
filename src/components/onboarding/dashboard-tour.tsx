'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { SimulationOverlay } from './simulation-overlay'

type TourStep = 'needs-action' | 'ticket-drawer' | 'simulate'

interface DashboardTourProps {
  pmId: string
  demoTicketId: string | null
  openTicket: (ticketId: string) => void
  onTourDone: () => void
}

export function DashboardTour({ pmId, demoTicketId, openTicket, onTourDone }: DashboardTourProps) {
  const [tourStep, setTourStep] = useState<TourStep>('needs-action')
  const searchParams = useSearchParams()

  // Detect when ticket drawer closes (user hit Escape or clicked outside)
  const ticketIdParam = searchParams.get('ticketId')
  useEffect(() => {
    if (tourStep === 'ticket-drawer' && !ticketIdParam) {
      // Drawer was closed — skip to simulate step
      setTourStep('simulate')
    }
  }, [ticketIdParam, tourStep])

  const handleSeeIssue = useCallback(() => {
    if (demoTicketId) {
      openTicket(demoTicketId)
      setTourStep('ticket-drawer')
    } else {
      // No demo ticket — skip to simulate
      setTourStep('simulate')
    }
  }, [demoTicketId, openTicket])

  const handleGotIt = useCallback(() => {
    // Close the drawer by navigating without ticketId param
    window.history.replaceState(null, '', window.location.pathname)
    setTourStep('simulate')
  }, [])

  // Step 3: hand off to SimulationOverlay
  if (tourStep === 'simulate') {
    return (
      <SimulationOverlay
        pmId={pmId}
        onComplete={onTourDone}
      />
    )
  }

  // Step 1: Highlight "Needs Action"
  if (tourStep === 'needs-action') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Dim overlay */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

        {/* Instruction card — positioned bottom center */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto w-full max-w-sm px-4">
          <div className="bg-card rounded-2xl border border-border shadow-2xl p-6">
            <p className="text-base font-semibold text-foreground">
              This is your dashboard
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              A demo tenant just reported a boiler problem. It&apos;s waiting in your &ldquo;Needs Action&rdquo; queue.
            </p>
            <Button
              onClick={handleSeeIssue}
              size="sm"
              className="mt-4"
            >
              See the issue
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Step 2: Highlight ticket drawer
  if (tourStep === 'ticket-drawer') {
    return (
      <div className="fixed inset-0 z-40 pointer-events-none">
        {/* Dim overlay — but let the drawer (right side) be interactive */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />

        {/* Instruction card — positioned left center */}
        <div className="absolute bottom-8 left-8 pointer-events-auto w-full max-w-sm">
          <div className="bg-card rounded-2xl border border-border shadow-2xl p-6">
            <p className="text-base font-semibold text-foreground">
              This is the ticket detail
            </p>
            <p className="text-sm text-muted-foreground mt-1.5">
              Every issue gets triaged, matched to a contractor, and dispatched automatically. Let&apos;s see it in action.
            </p>
            <Button
              onClick={handleGotIt}
              size="sm"
              className="mt-4"
            >
              Show me how
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
