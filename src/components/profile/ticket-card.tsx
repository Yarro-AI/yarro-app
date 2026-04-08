'use client'

import { useOpenTicket } from '@/hooks/use-open-ticket'
import { ProfileCard } from './profile-card'
import { Wrench, Clock, CheckCircle2, XCircle } from 'lucide-react'

// --- Ticket display helpers ---

const displayStageMap: Record<string, string> = {
  pending_review: 'Needs Review',
  handoff_review: 'Handoff',
  manager_approval: 'Awaiting Manager',
  no_contractors: 'No Contractors',
  landlord_declined: 'Landlord Declined',
  landlord_no_response: 'Landlord No Response',
  job_not_completed: 'Not Completed',
  awaiting_contractor: 'Awaiting Contractor',
  awaiting_landlord: 'Awaiting Landlord',
  awaiting_booking: 'Awaiting Booking',
  scheduled: 'Scheduled',
  completed: 'Completed',
  dismissed: 'Dismissed',
}

export function getDisplayStage(
  reason: string | null,
  status: string,
  archived?: boolean | null,
) {
  if (archived) return 'Archived'
  if (status === 'closed') return 'Completed'
  if (reason && displayStageMap[reason]) return displayStageMap[reason]
  return 'Open'
}

// Status → visual mapping per PRD
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

function getTicketStatus(reason: string | null, status: string, archived?: boolean | null): TicketStatus {
  if (archived || status === 'closed') return 'closed'
  if (reason === 'completed' || reason === 'dismissed') return 'resolved'
  if (reason && !['pending_review', 'handoff_review'].includes(reason)) return 'in_progress'
  return 'open'
}

const statusConfig: Record<TicketStatus, { iconBg: string; badgeBg: string; badgeText: string; label: string; Icon: React.ElementType }> = {
  open: { iconBg: 'bg-primary/10', badgeBg: 'bg-primary/10', badgeText: 'text-primary', label: 'Open', Icon: Wrench },
  in_progress: { iconBg: 'bg-warning/10', badgeBg: 'bg-warning/10', badgeText: 'text-warning', label: 'In progress', Icon: Clock },
  resolved: { iconBg: 'bg-success/10', badgeBg: 'bg-success/10', badgeText: 'text-success', label: 'Resolved', Icon: CheckCircle2 },
  closed: { iconBg: 'bg-muted', badgeBg: 'bg-muted', badgeText: 'text-muted-foreground', label: 'Closed', Icon: XCircle },
}

// --- Types ---

export interface TicketRow {
  id: string
  issue_title: string | null
  issue_description: string | null
  category: string | null
  priority: string | null
  status: string
  next_action_reason: string | null
  date_logged: string
  archived: boolean | null
  property_id?: string
}

interface TicketCardProps {
  tickets: TicketRow[]
  propertyAddressMap?: Record<string, string>
}

// --- Component ---

export function TicketCard({ tickets, propertyAddressMap }: TicketCardProps) {
  const openTicket = useOpenTicket()

  return (
    <ProfileCard title="Reported tickets">
      {tickets.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No tickets reported yet.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {tickets.map((t) => {
            const ts = getTicketStatus(t.next_action_reason, t.status, t.archived)
            const cfg = statusConfig[ts]
            const Icon = cfg.Icon

            return (
              <button
                key={t.id}
                onClick={() => openTicket(t.id)}
                className={`w-full text-left py-2.5 hover:bg-muted/30 -mx-3 px-3 transition-colors rounded-lg flex items-center gap-3 ${t.archived ? 'opacity-40' : ''}`}
              >
                {/* Status icon */}
                <div className={`h-7 w-7 rounded-md ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.badgeText}`} />
                </div>

                {/* Body */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium truncate">
                    {t.issue_title || t.issue_description || 'Maintenance request'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.category || 'General'}
                    {' \u00b7 '}
                    {new Date(t.date_logged).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {t.property_id && propertyAddressMap?.[t.property_id] && (
                      <> &middot; {propertyAddressMap[t.property_id]}</>
                    )}
                  </p>
                </div>

                {/* Status badge */}
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>
                  {cfg.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </ProfileCard>
  )
}
