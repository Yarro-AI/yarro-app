'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Users, Wrench, Crown, Phone, Play, Calendar, AlertTriangle, RotateCcw, GitBranch, Check } from 'lucide-react'
import type { TicketContext, TicketBasic, MessageData } from '@/hooks/use-ticket-detail'
import Link from 'next/link'
import { formatCurrency } from '@/hooks/use-ticket-detail'
import { StatusBadge } from '@/components/status-badge'
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
  // Muted blue while in progress, green when fully complete
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

// --- Action Map ---

const NEXT_ACTION_MAP: Record<string, {
  message: string
  button?: { label: string; action: 'tab' | 'navigate'; destination: string }
}> = {
  no_contractors: {
    message: 'All listed contractors have been contacted. Add a new contractor or handle manually.',
    button: { label: 'Add Contractor', action: 'navigate', destination: '/contractors?create=true' },
  },
  landlord_declined: {
    message: 'The landlord has declined the quote. Contact them to discuss alternatives.',
    button: { label: 'View Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  landlord_no_response: {
    message: "The landlord hasn't responded. Follow up directly.",
    button: { label: 'View Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  landlord_needs_help: {
    message: 'The landlord needs assistance managing this job. Take over coordination.',
    button: { label: 'View Landlord', action: 'navigate', destination: '/landlords/{landlord_id}' },
  },
  job_not_completed: {
    message: 'The contractor marked the job as incomplete. Review and redispatch.',
    button: { label: 'View Dispatch', action: 'tab', destination: 'dispatch' },
  },
  manager_approval: {
    message: 'A quote is waiting for your approval. Review and approve or decline.',
    button: { label: 'View Dispatch', action: 'tab', destination: 'dispatch' },
  },
  ooh_unresolved: {
    message: 'The out-of-hours contact did not resolve the issue. Escalate or redispatch.',
    button: { label: 'View Dispatch', action: 'tab', destination: 'dispatch' },
  },
  awaiting_contractor: { message: 'Waiting for a contractor to respond.' },
  awaiting_landlord: { message: 'Quote sent to landlord — awaiting approval.' },
  awaiting_booking: { message: 'Waiting for the contractor to book a slot.' },
  allocated_to_landlord: { message: 'This job has been allocated to the landlord to manage.' },
  scheduled: { message: 'Job is scheduled — awaiting contractor completion.' },
  ooh_dispatched: { message: 'Out-of-hours contact has been notified. Awaiting response.' },
  pending_review: { message: 'Review the AI conversation and create a ticket.' },
  handoff_review: { message: 'Review this handoff and triage into a ticket.' },
}

// --- Component ---

interface TicketOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  messages?: MessageData | null
  onTabChange?: (tab: string) => void
}

export function TicketOverviewTab({ context, basic, onTabChange }: TicketOverviewTabProps) {
  const router = useRouter()
  const images = basic.images || []
  const markup = basic.final_amount && basic.contractor_quote
    ? Math.abs(basic.final_amount - basic.contractor_quote)
    : null
  const shortTitle = basic.issue_title || context.label || 'Maintenance Request'
  const longDescription = (basic.issue_title || context.label) ? context.issue_description : null
  const category = deriveCategoryFromTicket(basic.category)
  const CatIcon = CATEGORY_ICON[category]
  const timelineSteps = deriveTimeline(basic)

  return (
    <div className="px-4 pb-4 space-y-3">

      {/* ── Card 1: Title ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        {/* Icon + short title */}
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', CATEGORY_BG[category])}>
            <CatIcon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-card-foreground truncate">{shortTitle}</p>
            <p className="text-sm text-muted-foreground truncate">{context.property_address}</p>
          </div>
        </div>

        {/* Long description */}
        {longDescription && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {longDescription}
          </p>
        )}

        {/* Date + priority */}
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
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Current Stage</p>

        <HorizontalTimeline steps={timelineSteps} />

        {/* Deviation branches */}
        {(basic.landlord_allocated || basic.ooh_dispatched || basic.next_action_reason === 'job_not_completed' || basic.reschedule_requested) && (
          <div className="space-y-2">
            {basic.ooh_dispatched && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                <Phone className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    OOH: {basic.ooh_outcome === 'resolved' ? 'Resolved'
                    : basic.ooh_outcome === 'unresolved' ? 'Could not resolve'
                    : basic.ooh_outcome === 'in_progress' ? 'In progress'
                    : 'Awaiting response'}
                  </p>
                  {basic.ooh_notes && <p className="text-xs text-muted-foreground mt-0.5">{basic.ooh_notes}</p>}
                  {basic.ooh_cost != null && basic.ooh_cost > 0 && (
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">Cost: {formatCurrency(basic.ooh_cost)}</p>
                  )}
                </div>
              </div>
            )}

            {basic.landlord_allocated && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                <GitBranch className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    Landlord: {basic.landlord_outcome === 'resolved' ? 'Resolved'
                    : basic.landlord_outcome === 'need_help' ? 'Needs help'
                    : basic.landlord_outcome === 'in_progress' ? 'In progress'
                    : 'Awaiting response'}
                  </p>
                  {basic.landlord_notes && <p className="text-xs text-muted-foreground mt-0.5">{basic.landlord_notes}</p>}
                  {basic.landlord_cost != null && basic.landlord_cost > 0 && (
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">Cost: {formatCurrency(basic.landlord_cost)}</p>
                  )}
                </div>
              </div>
            )}

            {basic.next_action_reason === 'job_not_completed' && (
              <div className="flex items-start gap-2 rounded-lg bg-danger/5 border border-danger/20 px-3 py-2.5">
                <AlertTriangle className="h-4 w-4 text-danger mt-0.5 flex-shrink-0" />
                <p className="text-sm font-semibold text-danger">Job marked as not completed</p>
              </div>
            )}

            {basic.reschedule_requested && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
                <RotateCcw className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-card-foreground">
                    Reschedule: {basic.reschedule_status === 'pending' ? 'Awaiting response'
                    : basic.reschedule_status === 'approved' ? 'Approved'
                    : basic.reschedule_status === 'declined' ? 'Declined'
                    : 'Requested'}
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
        )}

        {/* Action message */}
        {basic.next_action_reason && NEXT_ACTION_MAP[basic.next_action_reason] && (() => {
          const entry = NEXT_ACTION_MAP[basic.next_action_reason!]
          const handleButtonClick = () => {
            if (!entry.button) return
            if (entry.button.action === 'tab') {
              onTabChange?.(entry.button.destination)
            } else {
              const url = entry.button.destination
                .replace('{landlord_id}', context.landlord_id || '')
                .replace('{tenant_id}', basic.tenant_id || '')
                .replace('{contractor_id}', basic.contractor_id || '')
              router.push(url)
            }
          }
          return (
            <div className="mt-4 rounded-lg bg-muted/50 px-3.5 py-3">
              <p className="text-sm text-card-foreground leading-snug">{entry.message}</p>
              {entry.button && (
                <button
                  onClick={handleButtonClick}
                  className="mt-2 text-xs font-semibold text-primary hover:text-primary/70 transition-colors"
                >
                  {entry.button.label} →
                </button>
              )}
            </div>
          )
        })()}
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

      {/* ── Card 4: People — 3 square cards ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">People</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Tenant */}
          {context.tenant_name ? (
            basic.tenant_id ? (
              <Link
                href={`/tenants/${basic.tenant_id}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
                  <p className="text-[11px] text-muted-foreground">Reported by</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
                  <p className="text-[11px] text-muted-foreground">Reported by</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Unknown</p>
                <p className="text-[11px] text-muted-foreground">Reported by</p>
              </div>
            </div>
          )}

          {/* Landlord */}
          {context.landlord_name ? (
            context.landlord_id ? (
              <Link
                href={`/landlords/${context.landlord_id}`}
                className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Crown className="h-4 w-4 text-warning" />
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.landlord_name}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Crown className="h-4 w-4 text-warning" />
                </div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.landlord_name}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Crown className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">—</p>
                <p className="text-[11px] text-muted-foreground">Landlord</p>
              </div>
            </div>
          )}

          {/* Contractor */}
          {basic.contractor_name && basic.contractor_id ? (
            <Link
              href={`/contractors/${basic.contractor_id}`}
              className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-success" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{basic.contractor_name}</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Wrench className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Not assigned</p>
                <p className="text-[11px] text-muted-foreground">Contractor</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Media (conditional) ── */}
      {images.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Media ({images.length})
          </p>
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
