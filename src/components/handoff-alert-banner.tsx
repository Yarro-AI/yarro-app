'use client'

import { AlertTriangle, Clock } from 'lucide-react'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'

interface HandoffTicket {
  id: string
  issue_description: string | null
  address?: string
  ooh_dispatched?: boolean | null
}

interface HandoffAlertBannerProps {
  tickets: HandoffTicket[]
  onReview: (ticketId: string) => void
}

export function HandoffAlertBanner({ tickets, onReview }: HandoffAlertBannerProps) {
  if (tickets.length === 0) return null

  const oohCount = tickets.filter(t => t.ooh_dispatched).length
  const regularCount = tickets.length - oohCount

  return (
    <div className="mb-6 rounded-xl border p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <p className="text-sm font-medium">
          {tickets.length} ticket{tickets.length > 1 ? 's' : ''} need{tickets.length === 1 ? 's' : ''} your review
          {oohCount > 0 && regularCount > 0 && (
            <span className="text-muted-foreground font-normal"> ({oohCount} OOH)</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 max-h-[180px] overflow-y-auto">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
              {ticket.ooh_dispatched && (
                <p className="flex items-center gap-1 text-xs font-medium text-purple-600 mb-0.5">
                  <Clock className="h-3 w-3" />
                  OOH — No response
                </p>
              )}
              <p className="text-sm font-medium truncate max-w-[200px]">
                {ticket.issue_description || 'No description'}
              </p>
              {ticket.address && (
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {ticket.address}
                </p>
              )}
            </div>
            <InteractiveHoverButton
              text="Review"
              className="w-24 text-xs h-8"
              onClick={() => onReview(ticket.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
