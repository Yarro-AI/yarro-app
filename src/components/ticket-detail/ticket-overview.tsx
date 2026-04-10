'use client'

import { format } from 'date-fns'
import { Calendar, Crown, Users, Wrench, ShieldCheck, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { StageCard } from './sections/stage-card'
import { CategoryData } from './sections/category-data'
import { AITranscript } from './sections/ai-transcript'
import type { TicketDetail, ConversationData, MessageData, CompletionData } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'

const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  maintenance: Wrench,
  compliance_renewal: ShieldCheck,
  rent_arrears: DollarSign,
}

const CATEGORY_BG: Record<string, string> = {
  maintenance: 'bg-primary',
  compliance_renewal: 'bg-warning',
  rent_arrears: 'bg-danger',
}

interface TicketOverviewProps {
  ticket: TicketDetail
  conversation: ConversationData | null
  messages: MessageData | null
  completion: CompletionData | null
  isStuck: boolean
}

export function TicketOverview({
  ticket, conversation, messages, completion, isStuck,
}: TicketOverviewProps) {
  const category = ticket.category || 'maintenance'
  const CatIcon = CATEGORY_ICON[category] || Wrench
  const title = ticket.issue_title || ticket.label || 'Maintenance Request'
  const description = (ticket.issue_title || ticket.label) ? ticket.issue_description : null

  // Build ticket data for dynamic context in stage card
  const ticketData = {
    compliance: ticket.compliance ? {
      cert_type: ticket.compliance.cert_type,
      expiry_date: ticket.compliance.expiry_date,
      document_url: ticket.compliance.document_url,
    } : null,
    waiting_since: ticket.sla_due_at, // fallback
    contractor_sent_at: ticket.contractor_sent_at,
    landlord_allocated_at: ticket.landlord_allocated_at,
    ooh_dispatched_at: ticket.ooh_dispatched_at,
    tenant_contacted_at: ticket.tenant_contacted_at,
    scheduled_date: ticket.scheduled_date,
  }

  return (
    <div className="px-4 pb-28 space-y-3">
      {/* ── Header ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', CATEGORY_BG[category] || 'bg-primary')}>
            <CatIcon className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-card-foreground truncate">{title}</p>
            <p className="text-sm text-muted-foreground truncate">{ticket.property_address}</p>
          </div>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{description}</p>
        )}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Reported on {ticket.date_logged
              ? format(new Date(ticket.date_logged), "d MMM yyyy 'at' HH:mm")
              : '—'}
          </div>
          {ticket.priority && <StatusBadge status={ticket.priority} size="md" />}
        </div>
      </div>

      {/* ── Stage Card ── */}
      <StageCard
        reason={ticket.next_action_reason}
        isStuck={isStuck}
        isOnHold={ticket.on_hold === true}
        handoffReason={ticket.handoff_reason}
        ticketData={ticketData}
      />

      {/* ── Category Data ── */}
      <CategoryData
        category={category}
        ticket={ticket}
        completion={completion}
      />

      {/* ── AI Transcript ── */}
      <AITranscript
        conversation={conversation}
        defaultOpen={ticket.next_action_reason === 'handoff_review'}
      />

      {/* ── People ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">People</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Tenant */}
          {ticket.tenant?.name ? (
            ticket.tenant_id ? (
              <Link href={`/tenants/${ticket.tenant_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{ticket.tenant.name}</p>
                  <p className="text-[11px] text-muted-foreground">Tenant</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{ticket.tenant.name}</p>
                  <p className="text-[11px] text-muted-foreground">Tenant</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 opacity-50">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Users className="h-4 w-4 text-muted-foreground" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm text-muted-foreground">Unknown</p>
                <p className="text-[11px] text-muted-foreground">Tenant</p>
              </div>
            </div>
          )}

          {/* Landlord */}
          {ticket.landlord?.name ? (
            ticket.landlord.id ? (
              <Link href={`/landlords/${ticket.landlord.id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center"><Crown className="h-4 w-4 text-warning" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{ticket.landlord.name}</p>
                  <p className="text-[11px] text-muted-foreground">Landlord</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center"><Crown className="h-4 w-4 text-warning" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{ticket.landlord.name}</p>
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

          {/* Contractor */}
          {ticket.contractor?.name && ticket.contractor_id ? (
            <Link href={`/contractors/${ticket.contractor_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center"><Wrench className="h-4 w-4 text-success" /></div>
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-semibold text-card-foreground truncate">{ticket.contractor.name}</p>
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
    </div>
  )
}
