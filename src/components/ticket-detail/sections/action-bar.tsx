'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pause, Play, Archive, XCircle, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getReasonDisplay } from '@/lib/reason-display'
import { StageApproveAction } from '@/components/ticket-detail/stage-approve-action'
import { StageDispatchAction } from '@/components/ticket-detail/stage-dispatch-action'
import { StageAllocateAction } from '@/components/ticket-detail/stage-allocate-action'
import type { TicketDetail, MessageData } from '@/hooks/use-ticket-detail'

// CTA mapping from architecture spec § "CTA buttons"
type CTAType = 'navigate' | 'inline_approve' | 'inline_dispatch' | 'inline_allocate' | 'inline_close' | 'contact' | 'none'

interface CTA {
  label: string
  type: CTAType
  href?: string
  phone?: string
}

function getCTA(reason: string | null, isStuck: boolean, ticket: TicketDetail): CTA {
  if (!reason) return { label: '', type: 'none' }

  // Stuck override: "Chase {role}"
  if (isStuck) {
    const { label } = getReasonDisplay(reason, true)
    // Determine who to chase
    if (reason === 'awaiting_contractor' || reason === 'awaiting_booking')
      return { label, type: 'contact' }
    if (reason === 'awaiting_landlord' || reason === 'allocated_to_landlord')
      return { label, type: 'contact', phone: ticket.landlord?.phone || undefined }
    if (reason === 'ooh_dispatched')
      return { label, type: 'contact' }
    if (reason === 'awaiting_tenant')
      return { label, type: 'contact' }
    if (reason === 'scheduled')
      return { label, type: 'none' } // "Collect report" — no direct action
    return { label, type: 'none' }
  }

  // Waiting / scheduled reasons — no CTA (PM not the actor)
  const waitingReasons = ['awaiting_contractor', 'awaiting_booking', 'awaiting_landlord',
    'allocated_to_landlord', 'ooh_dispatched', 'awaiting_tenant', 'reschedule_pending']
  if (waitingReasons.includes(reason)) return { label: '', type: 'none' }
  if (reason === 'scheduled') return { label: '', type: 'none' }

  // Needs action CTAs
  switch (reason) {
    case 'compliance_needs_dispatch':
      return { label: 'Dispatch contractor', type: 'inline_dispatch' }
    case 'cert_incomplete':
      return { label: 'Complete certificate', type: 'navigate',
        href: ticket.compliance_certificate_id ? `/compliance/${ticket.compliance_certificate_id}` : undefined }
    case 'rent_overdue':
      return { label: 'Contact tenant', type: 'contact', phone: ticket.tenant?.phone || undefined }
    case 'rent_partial_payment':
      return { label: 'Follow up payment', type: 'contact', phone: ticket.tenant?.phone || undefined }
    case 'manager_approval':
      return { label: 'Approve quote', type: 'inline_approve' }
    case 'handoff_review':
      return { label: 'Review & assign', type: 'inline_dispatch' }
    case 'pending_review':
      return { label: 'Triage issue', type: 'inline_dispatch' }
    case 'no_contractors':
      return { label: 'Assign contractor', type: 'inline_dispatch' }
    case 'new':
      return { label: 'Dispatch', type: 'inline_dispatch' }
    case 'landlord_declined':
    case 'landlord_needs_help':
      return { label: 'Contact landlord', type: 'contact', phone: ticket.landlord?.phone || undefined }
    case 'landlord_resolved':
    case 'ooh_resolved':
      return { label: 'Verify & close', type: 'inline_close' }
    case 'ooh_unresolved':
      return { label: 'Reassign', type: 'inline_dispatch' }
    case 'job_not_completed':
      return { label: 'Review & redispatch', type: 'inline_dispatch' }
    default:
      return { label: '', type: 'none' }
  }
}

interface ActionBarProps {
  ticket: TicketDetail
  messages: MessageData | null
  isStuck: boolean
  onToggleHold: () => void
  onArchive: () => void
  onClose: () => void
  onActionTaken: () => void
}

export function ActionBar({ ticket, messages, isStuck, onToggleHold, onArchive, onClose, onActionTaken }: ActionBarProps) {
  const router = useRouter()
  const [showInline, setShowInline] = useState<'approve' | 'dispatch' | 'allocate' | null>(null)

  const isOpen = ticket.status === 'open' && !ticket.archived
  const isOnHold = ticket.on_hold === true
  const cta = getCTA(ticket.next_action_reason, isStuck, ticket)

  const handleCTA = () => {
    if (cta.type === 'navigate' && cta.href) {
      router.push(cta.href)
    } else if (cta.type === 'inline_approve') {
      setShowInline('approve')
    } else if (cta.type === 'inline_dispatch') {
      setShowInline('dispatch')
    } else if (cta.type === 'inline_allocate') {
      setShowInline('allocate')
    } else if (cta.type === 'inline_close') {
      onClose()
    } else if (cta.type === 'contact' && cta.phone) {
      window.open(`tel:${cta.phone}`)
    }
  }

  return (
    <>
      {isOpen && (
        <div className="sticky bottom-0 z-10 bg-card border-t border-border">
          {/* Inline action area — expands above button row */}
          {showInline === 'approve' && (
            <div className="px-4 pt-3">
              <div className="rounded-xl border border-border p-4">
                <StageApproveAction ticketId={ticket.id} messages={messages} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
              </div>
            </div>
          )}
          {showInline === 'dispatch' && (
            <div className="px-4 pt-3">
              <div className="rounded-xl border border-border p-4">
                <StageDispatchAction ticketId={ticket.id} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
              </div>
            </div>
          )}
          {showInline === 'allocate' && (
            <div className="px-4 pt-3">
              <div className="rounded-xl border border-border p-4">
                <StageAllocateAction ticketId={ticket.id} landlordName={ticket.landlord?.name || ''} landlordPhone={ticket.landlord?.phone || ''} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
              </div>
            </div>
          )}

          {/* Button row */}
          <div className="px-5 py-3 flex items-center gap-2">
            {/* Primary CTA */}
            {cta.type !== 'none' && (
              <Button onClick={handleCTA} size="sm" className="flex-1">
                {cta.type === 'contact' && <Phone className="h-3.5 w-3.5 mr-1.5" />}
                {cta.label}
              </Button>
            )}

            {/* Spacer when no CTA */}
            {cta.type === 'none' && <div className="flex-1" />}

            {/* Hold toggle */}
            <Button variant="ghost" size="sm" onClick={onToggleHold}>
              {isOnHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </Button>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onClose}>
                  <XCircle className="h-4 w-4 mr-2" /> Close ticket
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onArchive}>
                  <Archive className="h-4 w-4 mr-2" /> Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </>
  )
}
