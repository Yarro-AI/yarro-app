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
import type { TicketBasic, TicketContext, MessageData } from '@/hooks/use-ticket-detail'

// CTA mapping from architecture spec § "CTA buttons"
type CTAType = 'navigate' | 'inline_approve' | 'inline_dispatch' | 'inline_allocate' | 'inline_close' | 'contact' | 'none'

interface CTA {
  label: string
  type: CTAType
  href?: string
  phone?: string
}

function getCTA(reason: string | null, isStuck: boolean, basic: TicketBasic, context: TicketContext): CTA {
  if (!reason) return { label: '', type: 'none' }

  // Stuck override: "Chase {role}"
  if (isStuck) {
    const { label } = getReasonDisplay(reason, true)
    // Determine who to chase
    if (reason === 'awaiting_contractor' || reason === 'awaiting_booking')
      return { label, type: 'contact', phone: basic.contractor_name ? undefined : undefined }
    if (reason === 'awaiting_landlord' || reason === 'allocated_to_landlord')
      return { label, type: 'contact', phone: context.landlord_phone || undefined }
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
      return { label: 'Dispatch contractor', type: 'navigate',
        href: basic.compliance_certificate_id ? `/compliance/${basic.compliance_certificate_id}` : undefined }
    case 'cert_incomplete':
      return { label: 'Complete certificate', type: 'navigate',
        href: basic.compliance_certificate_id ? `/compliance/${basic.compliance_certificate_id}` : undefined }
    case 'rent_overdue':
      return { label: 'Contact tenant', type: 'contact' }
    case 'rent_partial_payment':
      return { label: 'Follow up payment', type: 'contact' }
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
      return { label: 'Contact landlord', type: 'contact', phone: context.landlord_phone || undefined }
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
  basic: TicketBasic
  context: TicketContext
  messages: MessageData | null
  isStuck: boolean
  onToggleHold: () => void
  onArchive: () => void
  onClose: () => void
  onActionTaken: () => void
}

export function ActionBar({ basic, context, messages, isStuck, onToggleHold, onArchive, onClose, onActionTaken }: ActionBarProps) {
  const router = useRouter()
  const [showInline, setShowInline] = useState<'approve' | 'dispatch' | 'allocate' | null>(null)

  const isOpen = basic.status === 'open' && !basic.archived
  const isOnHold = basic.on_hold === true
  const cta = getCTA(basic.next_action_reason, isStuck, basic, context)

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
      {/* Inline action area (renders above the bar) */}
      {showInline === 'approve' && (
        <div className="px-4 pb-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <StageApproveAction ticketId={basic.id} messages={messages} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
          </div>
        </div>
      )}
      {showInline === 'dispatch' && (
        <div className="px-4 pb-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <StageDispatchAction ticketId={basic.id} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
          </div>
        </div>
      )}
      {showInline === 'allocate' && (
        <div className="px-4 pb-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <StageAllocateAction ticketId={basic.id} landlordName={context.landlord_name} landlordPhone={context.landlord_phone} onActionTaken={() => { setShowInline(null); onActionTaken() }} />
          </div>
        </div>
      )}

      {/* Sticky bar */}
      {isOpen && (
        <div className="sticky bottom-0 z-10 bg-card border-t border-border px-5 py-3 flex items-center gap-2">
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
      )}
    </>
  )
}
