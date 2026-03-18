'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { Users, Wrench, Crown, Phone, Building2, CalendarClock } from 'lucide-react'
import type { TicketContext, TicketBasic, MessageData } from '@/hooks/use-ticket-detail'
import Link from 'next/link'
import { formatCurrency } from '@/hooks/use-ticket-detail'
import { formatPhoneDisplay } from '@/lib/normalize'
import { StatusBadge } from '@/components/status-badge'

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
  awaiting_contractor: {
    message: 'Waiting for a contractor to accept the job. No action needed yet.',
  },
  awaiting_landlord: {
    message: 'Quote sent to landlord awaiting approval. No action needed yet.',
  },
  awaiting_booking: {
    message: 'Waiting for the contractor to book a slot.',
  },
  allocated_to_landlord: {
    message: 'This job has been allocated to the landlord to manage.',
  },
  scheduled: {
    message: 'Job is scheduled. No action needed.',
  },
  ooh_dispatched: {
    message: 'Out-of-hours contact has been notified. Awaiting response.',
  },
  pending_review: {
    message: 'Review the AI conversation and create a ticket.',
  },
  handoff_review: {
    message: 'Review this handoff and triage into a ticket.',
  },
}

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

  return (
    <div>
      {/* ── Section 1: Situation ── */}
      <div className="px-6 py-6">
        {/* Status + Priority + Category badges — inline */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {basic.next_action_reason ? (
            <StatusBadge status={basic.next_action_reason} size="md" />
          ) : basic.status ? (
            <StatusBadge status={basic.status} size="md" />
          ) : null}
          {basic.priority && (
            <StatusBadge status={basic.priority} size="md" />
          )}
          {context.category && (
            <StatusBadge status={context.category} size="md" />
          )}
        </div>

        {/* Next Action block */}
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
            <div className="mb-3 rounded-lg border border-border px-3 py-3">
              <p className="text-sm text-muted-foreground leading-snug">{entry.message}</p>
              {entry.button && (
                <button
                  onClick={handleButtonClick}
                  className="mt-2 text-xs font-medium text-primary hover:text-primary/70 transition-colors"
                >
                  {entry.button.label} →
                </button>
              )}
            </div>
          )
        })()}

        {/* Metadata — date only */}
        <p className="text-xs text-muted-foreground">
          {basic.date_logged
            ? `Logged ${format(new Date(basic.date_logged), 'd MMM yyyy')}`
            : context.date_logged
            ? `Logged ${format(new Date(context.date_logged), 'd MMM yyyy')}`
            : null}
        </p>
      </div>

      {/* ── OOH Outcome (conditional) ── */}
      {basic.ooh_dispatched && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-foreground mb-3">Out-of-Hours</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium">
                  {basic.ooh_outcome === 'resolved' ? 'Handled by OOH contact'
                  : basic.ooh_outcome === 'unresolved' ? 'Could not resolve'
                  : basic.ooh_outcome === 'in_progress' ? 'In progress'
                  : 'Dispatched — awaiting response'}
                </span>
              </div>
              {basic.ooh_dispatched_at && (
                <p className="text-xs text-muted-foreground">
                  Dispatched {formatDistanceToNow(new Date(basic.ooh_dispatched_at), { addSuffix: true })}
                </p>
              )}
              {basic.ooh_outcome_at && (
                <p className="text-xs text-muted-foreground">
                  Responded {formatDistanceToNow(new Date(basic.ooh_outcome_at), { addSuffix: true })}
                </p>
              )}
              {basic.ooh_notes && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs text-muted-foreground flex-shrink-0">Notes</span>
                  <span className="text-sm text-foreground text-right">{basic.ooh_notes}</span>
                </div>
              )}
              {basic.ooh_cost != null && basic.ooh_cost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cost</span>
                  <span className="text-sm font-medium text-foreground font-mono">{formatCurrency(basic.ooh_cost)}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Landlord Allocated Outcome (conditional) ── */}
      {basic.landlord_allocated && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-foreground mb-3">Landlord Allocated</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                <span className="text-sm font-medium">
                  {basic.landlord_outcome === 'resolved' ? 'Resolved by landlord'
                  : basic.landlord_outcome === 'need_help' ? 'Landlord needs help'
                  : basic.landlord_outcome === 'in_progress' ? 'In progress'
                  : 'Allocated — awaiting response'}
                </span>
              </div>
              {basic.landlord_allocated_at && (
                <p className="text-xs text-muted-foreground">
                  Allocated {formatDistanceToNow(new Date(basic.landlord_allocated_at), { addSuffix: true })}
                </p>
              )}
              {basic.landlord_outcome_at && (
                <p className="text-xs text-muted-foreground">
                  Responded {formatDistanceToNow(new Date(basic.landlord_outcome_at), { addSuffix: true })}
                </p>
              )}
              {basic.landlord_notes && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-xs text-muted-foreground flex-shrink-0">Response note</span>
                  <span className="text-sm text-foreground text-right">{basic.landlord_notes}</span>
                </div>
              )}
              {basic.landlord_cost != null && basic.landlord_cost > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Landlord cost</span>
                  <span className="text-sm font-medium text-foreground font-mono">{formatCurrency(basic.landlord_cost)}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Section 2: People ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-6">
        <div className="flex items-baseline gap-2 mb-4">
          <p className="text-sm font-semibold text-foreground">People</p>
          {context.reporter_role && context.reporter_role !== 'tenant' && (
            <p className="text-xs text-muted-foreground/60">
              · Reported by {context.reporter_role.charAt(0).toUpperCase() + context.reporter_role.slice(1)}
            </p>
          )}
        </div>
        <div className="space-y-1">
          {/* Tenant */}
          {context.tenant_name && (
            basic.tenant_id ? (
              <Link
                href={`/tenants/${basic.tenant_id}`}
                className="flex items-center justify-between hover:bg-muted/40 -mx-3 px-3 py-1.5 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{context.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                  </div>
                </div>
                {context.tenant_phone && (
                  <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(context.tenant_phone)}</span>
                )}
              </Link>
            ) : (
              <div className="flex items-center justify-between -mx-3 px-3 py-1.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{context.tenant_name}</p>
                    <p className="text-xs text-muted-foreground">Tenant</p>
                  </div>
                </div>
                {context.tenant_phone && (
                  <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(context.tenant_phone)}</span>
                )}
              </div>
            )
          )}

          {/* Landlord */}
          {context.landlord_name && (
            context.landlord_id ? (
              <Link
                href={`/landlords/${context.landlord_id}`}
                className="flex items-center justify-between hover:bg-muted/40 -mx-3 px-3 py-1.5 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                    <Crown className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{context.landlord_name}</p>
                    <p className="text-xs text-muted-foreground">Landlord</p>
                  </div>
                </div>
                {context.landlord_phone && (
                  <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(context.landlord_phone)}</span>
                )}
              </Link>
            ) : (
              <div className="flex items-center justify-between -mx-3 px-3 py-1.5">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
                    <Crown className="h-3.5 w-3.5 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{context.landlord_name}</p>
                    <p className="text-xs text-muted-foreground">Landlord</p>
                  </div>
                </div>
                {context.landlord_phone && (
                  <span className="text-xs text-muted-foreground font-mono">{formatPhoneDisplay(context.landlord_phone)}</span>
                )}
              </div>
            )
          )}

          {/* Contractor — explicit when unassigned */}
          {basic.contractor_name && basic.contractor_id ? (
            <Link
              href={`/contractors/${basic.contractor_id}`}
              className="flex items-center justify-between hover:bg-muted/40 -mx-3 px-3 py-1.5 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <Wrench className="h-3.5 w-3.5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{basic.contractor_name}</p>
                  <p className="text-xs text-muted-foreground">Contractor</p>
                </div>
              </div>
            </Link>
          ) : basic.contractor_name ? (
            <div className="flex items-center justify-between -mx-3 px-3 py-1.5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <Wrench className="h-3.5 w-3.5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{basic.contractor_name}</p>
                  <p className="text-xs text-muted-foreground">Contractor</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 -mx-3 px-3 py-1.5">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">No contractor assigned yet</p>
                <p className="text-xs text-muted-foreground/60">Contractor</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Section 3: Job Details ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-6">
        <p className="text-sm font-semibold text-foreground mb-4">Job Details</p>
        <div className="space-y-3">
          {/* Quote */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Quote</span>
            {basic.contractor_quote ? (
              <span className="text-sm font-medium text-foreground font-mono">
                {formatCurrency(basic.contractor_quote)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/60">Not yet received</span>
            )}
          </div>

          {/* Markup */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Markup</span>
            {markup != null ? (
              <span className="text-sm font-medium text-foreground font-mono">
                {formatCurrency(markup)}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/60">—</span>
            )}
          </div>

          {/* Final Amount — only when it exists */}
          {basic.final_amount != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Final Amount</span>
              <span className="text-sm font-semibold text-foreground font-mono">
                {formatCurrency(basic.final_amount)}
              </span>
            </div>
          )}

          {/* Approval context — only shown once quote exists */}
          {basic.contractor_quote && context.auto_approve_limit != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Approval</span>
              {basic.contractor_quote <= context.auto_approve_limit ? (
                <span className="text-sm text-success font-medium">
                  Within limit ({formatCurrency(context.auto_approve_limit)} auto-approve)
                </span>
              ) : (
                <span className="text-sm text-warning font-medium">
                  Requires landlord approval · limit {formatCurrency(context.auto_approve_limit)}
                </span>
              )}
            </div>
          )}

          {/* Scheduled date */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Scheduled</span>
            {basic.scheduled_date ? (
              <span className="text-sm font-medium text-foreground">
                {format(new Date(basic.scheduled_date), 'd MMM yyyy')}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground/60">Not yet scheduled</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Reschedule Request (conditional) ── */}
      {basic.reschedule_requested && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-foreground mb-3">Reschedule Request</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="text-sm font-medium">
                  {basic.reschedule_status === 'pending' ? 'Awaiting contractor response'
                  : basic.reschedule_status === 'approved' ? 'Approved by contractor'
                  : basic.reschedule_status === 'declined' ? 'Declined by contractor'
                  : 'Requested'}
                </span>
              </div>
              {basic.reschedule_date && (
                <p className="text-xs text-muted-foreground">
                  Proposed date: {format(new Date(basic.reschedule_date), 'EEE dd MMM yyyy')}
                </p>
              )}
              {basic.reschedule_reason && (
                <p className="text-sm">Reason: {basic.reschedule_reason}</p>
              )}
              {basic.reschedule_decided_at && (
                <p className="text-xs text-muted-foreground">
                  Decided {formatDistanceToNow(new Date(basic.reschedule_decided_at), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Photos (conditional) ── */}
      {images.length > 0 && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-foreground mb-3">
              Photos ({images.length})
            </p>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {images.map((url, index) => (
                <a
                  key={index}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="w-full h-20 object-cover rounded-lg border group-hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
