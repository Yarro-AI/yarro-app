'use client'

import { AlertTriangle } from 'lucide-react'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'

interface HandoffTicket {
  id: string
  issue_description: string | null
  address?: string
}

interface HandoffAlertBannerProps {
  tickets: HandoffTicket[]
  onReview: (ticketId: string) => void
}

export function HandoffAlertBanner({ tickets, onReview }: HandoffAlertBannerProps) {
  if (tickets.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-red-300 dark:border-red-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-foreground/70" />
        <p className="text-sm font-medium">
          {tickets.length} ticket{tickets.length > 1 ? 's' : ''} need{tickets.length === 1 ? 's' : ''} your review
        </p>
      </div>
      <div className="flex flex-wrap gap-3 max-h-[180px] overflow-y-auto">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
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
