'use client'

import { useState } from 'react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Users, Wrench, Crown, Phone, Play, Calendar, AlertTriangle, RotateCcw, Check, Circle, CircleDollarSign, XCircle, HelpCircle, AlertCircle, MessageSquare, CalendarClock, Pause, CheckCircle2 } from 'lucide-react'
import type { TicketContext, TicketBasic, MessageData } from '@/hooks/use-ticket-detail'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { formatCurrency } from '@/hooks/use-ticket-detail'
import { StatusBadge } from '@/components/status-badge'
import { StageApproveAction } from './stage-approve-action'
import { StageDispatchAction } from './stage-dispatch-action'
import { StageAllocateAction } from './stage-allocate-action'
import { ShieldCheck, DollarSign } from 'lucide-react'
import { cn } from '@/lib/utils'

// --- Helpers ---

const CATEGORY_ICON = { maintenance: Wrench, compliance: ShieldCheck, finance: DollarSign } as const
const CATEGORY_BG = { maintenance: 'bg-primary', compliance: 'bg-warning', finance: 'bg-success' } as const
type TicketCategory = keyof typeof CATEGORY_ICON

function deriveCategoryFromTicket(category: string | null): TicketCategory {
  if (category === 'compliance_renewal') return 'compliance'
  if (category === 'rent_arrears') return 'finance'
  return 'maintenance'
}

// --- Timeline ---

interface TimelineStep { label: string; complete: boolean; active: boolean }

function deriveTimeline(basic: TicketBasic): TimelineStep[] {
  const reason = basic.next_action_reason || ''
  const isCompleted = reason === 'completed' || reason === 'cert_renewed' || reason === 'rent_cleared'
  const isScheduled = !!basic.scheduled_date || basic.job_stage === 'booked' || basic.job_stage === 'scheduled'
  const isApproved = isScheduled || isCompleted || ['awaiting_booking', 'scheduled', 'job_not_completed'].includes(reason)
  const isQuoted = !!basic.contractor_quote || isApproved
  const isDispatched = !!basic.job_stage || isQuoted || ['awaiting_contractor', 'awaiting_landlord', 'awaiting_booking', 'no_contractors', 'manager_approval'].includes(reason)

  const steps: TimelineStep[] = [
    { label: 'Reported', complete: true, active: false },
    { label: 'Dispatched', complete: isDispatched, active: false },
    { label: 'Quoted', complete: isQuoted, active: false },
    { label: 'Approved', complete: isApproved, active: false },
    { label: 'Scheduled', complete: isScheduled, active: false },
    { label: 'Completed', complete: isCompleted, active: false },
  ]
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].complete) { steps[i].active = true; break }
  }
  return steps
}

function HorizontalTimeline({ steps }: { steps: TimelineStep[] }) {
  const allDone = steps.every(s => s.complete)
  const doneCircle = allDone ? 'bg-success/20' : 'bg-primary/15'
  const doneCheck = allDone ? 'text-success' : 'text-primary/60'
  const doneLine = allDone ? 'bg-success/30' : 'bg-primary/20'

  return (
    <div className="flex items-start w-full">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-start flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
              step.active
                ? allDone ? 'bg-success' : 'bg-primary'
                : step.complete
                ? doneCircle
                : 'border-2 border-border bg-transparent'
            )}>
              {step.active && <div className="w-2 h-2 rounded-full bg-white" />}
              {step.complete && !step.active && <Check className={cn('w-3 h-3', doneCheck)} />}
            </div>
            <span className={cn(
              'text-[10px] whitespace-nowrap',
              step.active ? (allDone ? 'font-semibold text-success' : 'font-semibold text-primary') : step.complete ? 'text-muted-foreground' : 'text-muted-foreground/50'
            )}>
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn(
              'flex-1 h-px mx-1 mt-[10px]',
              steps[i + 1].complete ? doneLine : 'bg-border'
            )} />
          )}
        </div>
      ))}
    </div>
  )
}

// --- Stage Config ---

interface StageEntry {
  icon: LucideIcon
  iconBg: string
  iconColor: string
  title: string
  description: string | ((basic: TicketBasic, context: TicketContext) => string)
  timer?: (basic: TicketBasic) => string | null
  cta?: {
    label: string
    action: 'navigate' | 'tab' | 'toggle_hold' | 'inline_approve' | 'inline_dispatch'
    destination?: string
  }
}

const STAGE_CONFIG: Record<string, StageEntry> = {
  // --- Needs your attention ---
  new: {
    icon: Circle,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Ready to dispatch',
    description: "This one just came in. Have a look at the details and send it out to a contractor when you're ready.",
    timer: (b) => b.date_logged ? `Reported ${formatDistanceToNow(new Date(b.date_logged), { addSuffix: true })}` : null,
    cta: { label: 'Dispatch', action: 'inline_dispatch' },
  },
  manager_approval: {
    icon: CircleDollarSign,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: "There's a quote waiting for your approval",
    description: "A contractor has come back with a price. Take a look and decide if you're happy to go ahead.",
    cta: { label: 'Approve', action: 'inline_approve' },
  },
  no_contractors: {
    icon: AlertTriangle,
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    title: 'No contractors available',
    description: "Every contractor on your list has been contacted and none could take this on. You'll need to add someone new or hand it to the landlord.",
    cta: { label: 'Dispatch', action: 'inline_dispatch' },
  },
  landlord_declined: {
    icon: XCircle,
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    title: 'Landlord declined the quote',
    description: "The landlord wasn't happy with the price. Worth getting in touch to talk through what they'd be comfortable with.",
    cta: { label: 'Contact Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  landlord_no_response: {
    icon: HelpCircle,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    title: "Landlord hasn't responded",
    description: "The approval request went out but there's been no reply. Might be worth a nudge.",
    timer: () => null, // TODO: compute from outbound log timestamp
    cta: { label: 'Contact Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  landlord_needs_help: {
    icon: AlertCircle,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    title: 'Landlord needs a hand',
    description: 'The landlord was handling this but has asked for help. Time to step in and take over.',
    cta: { label: 'Contact Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  job_not_completed: {
    icon: AlertTriangle,
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    title: 'Job came back incomplete',
    description: "The contractor flagged this as not finished. Check the completion report to see what went wrong and decide what to do next.",
    cta: { label: 'Review Report', action: 'tab', destination: 'completion' },
  },
  ooh_unresolved: {
    icon: AlertTriangle,
    iconBg: 'bg-danger/10',
    iconColor: 'text-danger',
    title: "OOH couldn't fix it",
    description: "The out-of-hours contact had a go but couldn't sort it. This needs to go out to a contractor now.",
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors' },
  },
  pending_review: {
    icon: MessageSquare,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Conversation ready for review',
    description: "The AI couldn't handle this one. Have a read through and manually create a ticket from it.",
    cta: { label: 'Review', action: 'tab', destination: 'conversation' },
  },
  handoff_review: {
    icon: MessageSquare,
    iconBg: 'bg-warning/10',
    iconColor: 'text-warning',
    title: 'Needs a human',
    description: 'The AI got stuck on this one and passed it over. Review what happened and take it from here.',
    cta: { label: 'Review', action: 'tab', destination: 'conversation' },
  },
  // --- Waiting ---
  awaiting_contractor: {
    icon: Wrench,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    title: 'Waiting on the contractor',
    description: "The job's been sent out. Sitting tight until a contractor gets back to you with a quote.",
    timer: (b) => b.date_logged ? `Sent ${formatDistanceToNow(new Date(b.date_logged), { addSuffix: true })}` : null,
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors/{contractor_id}' },
  },
  awaiting_landlord: {
    icon: Crown,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    title: 'With the landlord',
    description: "The quote's been sent over for approval. Ball's in their court.",
    timer: (b) => b.date_logged ? `Sent ${formatDistanceToNow(new Date(b.date_logged), { addSuffix: true })}` : null,
    cta: { label: 'Follow Up', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  awaiting_booking: {
    icon: CalendarClock,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    title: 'Waiting for a date',
    description: "Quote's approved — now waiting for the contractor to lock in a time.",
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors/{contractor_id}' },
  },
  scheduled: {
    icon: CalendarClock,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'Booked in',
    description: (basic) => {
      if (!basic.scheduled_date) return 'The job has been scheduled with the contractor.'
      const d = new Date(basic.scheduled_date)
      const days = differenceInDays(d, new Date())
      if (days >= 0) return `All sorted — the contractor's coming on ${format(d, 'd MMM yyyy')}.`
      return `The contractor was booked for ${format(d, 'd MMM yyyy')} — that was ${Math.abs(days)} days ago.`
    },
    timer: (b) => {
      if (!b.scheduled_date) return null
      const days = differenceInDays(new Date(b.scheduled_date), new Date())
      return days >= 0 ? `In ${days} days` : `${Math.abs(days)} days ago`
    },
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors/{contractor_id}' },
  },
  allocated_to_landlord: {
    icon: Crown,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: "Landlord's handling it",
    description: "This one's been handed to the landlord to sort out directly.",
    timer: (b) => b.landlord_allocated_at ? `Allocated ${formatDistanceToNow(new Date(b.landlord_allocated_at), { addSuffix: true })}` : null,
    cta: { label: 'Follow Up', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  ooh_dispatched: {
    icon: Phone,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-600',
    title: 'OOH on it',
    description: 'The out-of-hours contact has been notified. Waiting to hear back.',
    timer: (b) => b.ooh_dispatched_at ? `Dispatched ${formatDistanceToNow(new Date(b.ooh_dispatched_at), { addSuffix: true })}` : null,
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors' },
  },
  on_hold: {
    icon: Pause,
    iconBg: 'bg-muted',
    iconColor: 'text-muted-foreground',
    title: 'Paused',
    description: "This ticket's on hold. Hit resume when you're ready to pick it back up.",
    cta: { label: 'Resume', action: 'toggle_hold' },
  },
  // --- Done ---
  completed: {
    icon: CheckCircle2,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    title: 'All done',
    description: "The contractor's finished the job. This one's wrapped up.",
    cta: { label: 'Resume', action: 'toggle_hold' },
  },
  ooh_resolved: {
    icon: CheckCircle2,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    title: 'Sorted by OOH',
    description: 'The out-of-hours contact handled it. No further action needed.',
    cta: { label: 'Resume', action: 'toggle_hold' },
  },
  landlord_resolved: {
    icon: CheckCircle2,
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    title: 'Landlord sorted it',
    description: 'The landlord took care of this one themselves.',
    cta: { label: 'Resume', action: 'toggle_hold' },
  },
  ooh_in_progress: {
    icon: Phone,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: 'OOH working on it',
    description: 'The out-of-hours contact is on the case. Hang tight.',
    cta: { label: 'Follow Up', action: 'navigate', destination: '/contractors' },
  },
  landlord_in_progress: {
    icon: Crown,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    title: "Landlord's on it",
    description: 'The landlord is actively working on this one.',
    timer: (b) => b.landlord_allocated_at ? `Started ${formatDistanceToNow(new Date(b.landlord_allocated_at), { addSuffix: true })}` : null,
    cta: { label: 'Follow Up', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
}

// --- Component ---

interface TicketOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  messages?: MessageData | null
  onTabChange?: (tab: string) => void
  onActionTaken?: () => void
  onToggleHold?: () => void
  onClose?: () => void
}

export function TicketOverviewTab({ context, basic, messages, onTabChange, onActionTaken, onToggleHold, onClose }: TicketOverviewTabProps) {
  const router = useRouter()
  const [showNotes, setShowNotes] = useState(false)
  const images = basic.images || []
  const markup = basic.final_amount && basic.contractor_quote
    ? Math.abs(basic.final_amount - basic.contractor_quote)
    : null
  const shortTitle = basic.issue_title || context.label || 'Maintenance Request'
  const longDescription = (basic.issue_title || context.label) ? context.issue_description : null
  const category = deriveCategoryFromTicket(basic.category)
  const CatIcon = CATEGORY_ICON[category]
  const timelineSteps = deriveTimeline(basic)

  // Resolve stage config
  const reason = basic.next_action_reason || (basic.status === 'closed' ? 'completed' : 'new')
  const stage = STAGE_CONFIG[reason] || STAGE_CONFIG.new
  const StageIcon = stage.icon
  const stageDesc = typeof stage.description === 'function' ? stage.description(basic, context) : stage.description
  const stageTimer = stage.timer?.(basic)

  // Check if this state has notes to show
  const hasNotes = !!(
    ((reason === 'ooh_unresolved' || reason === 'ooh_resolved' || reason === 'ooh_dispatched') && basic.ooh_notes) ||
    ((reason === 'ooh_unresolved' || reason === 'ooh_resolved') && basic.ooh_cost != null && basic.ooh_cost > 0) ||
    ((reason === 'landlord_resolved' || reason === 'landlord_needs_help') && basic.landlord_notes) ||
    (reason === 'landlord_resolved' && basic.landlord_cost != null && basic.landlord_cost > 0)
  )

  const handleCta = () => {
    if (!stage.cta) return
    if (stage.cta.action === 'tab') {
      onTabChange?.(stage.cta.destination || 'overview')
    } else if (stage.cta.action === 'toggle_hold') {
      onToggleHold?.()
    } else if (stage.cta.action === 'navigate' && stage.cta.destination) {
      const url = stage.cta.destination
        .replace('{landlord_id}', context.landlord_id || '')
        .replace('{contractor_id}', basic.contractor_id || '')
      console.log('[CTA navigate]', { destination: stage.cta.destination, url, landlord_id: context.landlord_id, contractor_id: basic.contractor_id })
      // Don't navigate if ID was missing (URL ends with /)
      if (url.endsWith('/')) return
      onClose?.()
      router.push(url)
    }
    // inline_approve and inline_dispatch handled by rendering components below
  }

  return (
    <div className="px-4 pb-4 space-y-3">

      {/* ── Card 1: Title ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', CATEGORY_BG[category])}>
            <CatIcon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-card-foreground truncate">{shortTitle}</p>
            <p className="text-sm text-muted-foreground truncate">{context.property_address}</p>
          </div>
        </div>

        {longDescription && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{longDescription}</p>
        )}

        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Reported on {basic.date_logged
              ? format(new Date(basic.date_logged), "d MMM yyyy 'at' HH:mm")
              : context.date_logged
              ? format(new Date(context.date_logged), "d MMM yyyy 'at' HH:mm")
              : '—'}
          </div>
          {basic.priority && <StatusBadge status={basic.priority} size="md" />}
        </div>
      </div>

      {/* ── Card 2: Current Stage ── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">Current Stage</p>

        <HorizontalTimeline steps={timelineSteps} />

        {/* Stage block */}
        <div className="mt-6 flex items-start gap-4">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', stage.iconBg)}>
            <StageIcon className={cn('w-5 h-5', stage.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Title row with optional "View notes" */}
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-card-foreground">{stage.title}</p>
              {hasNotes && (
                <button
                  onClick={() => setShowNotes(v => !v)}
                  className="text-xs font-medium text-primary hover:text-primary/70 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  {showNotes ? 'Hide notes' : 'View notes'}
                </button>
              )}
            </div>

            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{stageDesc}</p>

            {stageTimer && (
              <p className="text-xs text-muted-foreground/70 mt-2">{stageTimer}</p>
            )}

            {/* Notes panel (toggled) */}
            {showNotes && hasNotes && (
              <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 space-y-1">
                {(reason === 'ooh_unresolved' || reason === 'ooh_resolved' || reason === 'ooh_dispatched') && basic.ooh_notes && (
                  <p className="text-sm text-card-foreground">{basic.ooh_notes}</p>
                )}
                {(reason === 'ooh_unresolved' || reason === 'ooh_resolved') && basic.ooh_cost != null && basic.ooh_cost > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">Cost: {formatCurrency(basic.ooh_cost)}</p>
                )}
                {(reason === 'landlord_resolved' || reason === 'landlord_needs_help') && basic.landlord_notes && (
                  <p className="text-sm text-card-foreground">{basic.landlord_notes}</p>
                )}
                {reason === 'landlord_resolved' && basic.landlord_cost != null && basic.landlord_cost > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">Cost: {formatCurrency(basic.landlord_cost)}</p>
                )}
              </div>
            )}

            {/* Inline actions */}
            {stage.cta?.action === 'inline_approve' && (
              <StageApproveAction
                ticketId={basic.id}
                messages={messages || null}
                onActionTaken={onActionTaken || (() => {})}
              />
            )}

            {stage.cta?.action === 'inline_dispatch' && (
              <div>
                <StageDispatchAction
                  ticketId={basic.id}
                  onActionTaken={onActionTaken || (() => {})}
                />
                {(context.landlord_name || context.landlord_phone) && !basic.landlord_allocated && (
                  <StageAllocateAction
                    ticketId={basic.id}
                    landlordName={context.landlord_name}
                    landlordPhone={context.landlord_phone}
                    onActionTaken={onActionTaken || (() => {})}
                  />
                )}
              </div>
            )}

            {/* Navigation / tab CTAs */}
            {stage.cta && stage.cta.action !== 'inline_approve' && stage.cta.action !== 'inline_dispatch' && (
              <button
                onClick={handleCta}
                className="mt-2 text-xs font-semibold text-primary hover:text-primary/70 transition-colors"
              >
                {stage.cta.label} →
              </button>
            )}
          </div>
        </div>

        {/* Reschedule callout */}
        {basic.reschedule_requested && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <RotateCcw className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-card-foreground">
                Reschedule {basic.reschedule_status === 'pending' ? 'requested'
                : basic.reschedule_status === 'approved' ? 'approved'
                : basic.reschedule_status === 'declined' ? 'declined'
                : 'requested'}
              </p>
              {basic.reschedule_date && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Proposed: {format(new Date(basic.reschedule_date), 'EEE dd MMM yyyy')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Card 3: Job Details ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Job Details</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Quote</span>
            {basic.contractor_quote ? (
              <span className="text-sm font-semibold text-card-foreground font-mono">{formatCurrency(basic.contractor_quote)}</span>
            ) : (
              <span className="text-sm text-muted-foreground/60">Not yet received</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Markup</span>
            {markup != null ? (
              <span className="text-sm font-semibold text-card-foreground font-mono">{formatCurrency(markup)}</span>
            ) : (
              <span className="text-sm text-muted-foreground/60">—</span>
            )}
          </div>

          {basic.final_amount != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Final Amount</span>
              <span className="text-base font-bold text-card-foreground font-mono">{formatCurrency(basic.final_amount)}</span>
            </div>
          )}

          {basic.contractor_quote && context.auto_approve_limit != null && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Approval</span>
              {basic.contractor_quote <= context.auto_approve_limit ? (
                <span className="text-sm text-success font-semibold">Within limit ({formatCurrency(context.auto_approve_limit)})</span>
              ) : (
                <span className="text-sm text-warning font-semibold">Requires landlord · limit {formatCurrency(context.auto_approve_limit)}</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Scheduled</span>
            {basic.scheduled_date ? (
              <span className="text-sm font-semibold text-card-foreground">
                {format(new Date(basic.scheduled_date), 'd MMM yyyy')}
                {(() => {
                  const h = new Date(basic.scheduled_date).getHours()
                  const slot = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'
                  return <span className="text-muted-foreground font-normal ml-1.5">· {slot}</span>
                })()}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/60">Not yet scheduled</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Card 4: People ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">People</p>
        <div className="grid grid-cols-3 gap-2">
          {context.tenant_name ? (
            basic.tenant_id ? (
              <Link href={`/tenants/${basic.tenant_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
                  <p className="text-[11px] text-muted-foreground">Reported by</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
                  <p className="text-[11px] text-muted-foreground">Reported by</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Users className="h-4 w-4 text-muted-foreground" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Unknown</p>
                <p className="text-[11px] text-muted-foreground">Reported by</p>
              </div>
            </div>
          )}

          {context.landlord_name ? (
            context.landlord_id ? (
              <Link href={`/landlords/${context.landlord_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center"><Crown className="h-4 w-4 text-warning" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.landlord_name}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center"><Crown className="h-4 w-4 text-warning" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.landlord_name}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Crown className="h-4 w-4 text-muted-foreground" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground">Landlord</p>
              </div>
            </div>
          )}

          {basic.contractor_name && basic.contractor_id ? (
            <Link href={`/contractors/${basic.contractor_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center"><Wrench className="h-4 w-4 text-success" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{basic.contractor_name}</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Wrench className="h-4 w-4 text-muted-foreground" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Not assigned</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Media ── */}
      {images.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Media ({images.length})</p>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {images.map((url, index) => {
              const isVideo = /\.(mp4|mov|webm|avi|mkv|3gp)/i.test(url) || url.includes('/video/')
              return isVideo ? (
                <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block group relative">
                  <video src={url} preload="metadata" muted playsInline className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-foreground/70 flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-background fill-background ml-0.5" />
                    </div>
                  </div>
                </a>
              ) : (
                <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="block group">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity" />
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
