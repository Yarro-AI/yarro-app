'use client'

import { format } from 'date-fns'
import { Calendar, Crown, Users, Wrench, ShieldCheck, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from '@/components/status-badge'
import { StageCard } from './sections/stage-card'
import { CategoryData } from './sections/category-data'
import { AITranscript } from './sections/ai-transcript'
import type { TicketBasic, TicketContext, ConversationData, MessageData, CompletionData, ComplianceCertData, RentLedgerRow } from '@/hooks/use-ticket-detail'
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
  basic: TicketBasic
  context: TicketContext
  conversation: ConversationData | null
  messages: MessageData | null
  completion: CompletionData | null
  complianceCert: ComplianceCertData | null
  rentLedger: RentLedgerRow[]
  isStuck: boolean
}

export function TicketOverview({
  basic, context, conversation, messages, completion, complianceCert, rentLedger, isStuck,
}: TicketOverviewProps) {
  const category = basic.category || 'maintenance'
  const CatIcon = CATEGORY_ICON[category] || Wrench
  const title = basic.issue_title || context.label || 'Maintenance Request'
  const description = (basic.issue_title || context.label) ? basic.issue_description : null

  // Build ticket data for dynamic context in stage card
  const ticketData = {
    compliance: complianceCert ? {
      cert_type: complianceCert.certificate_type,
      expiry_date: complianceCert.expiry_date,
      document_url: complianceCert.document_url,
    } : null,
    waiting_since: basic.sla_due_at, // fallback
    contractor_sent_at: (basic as unknown as Record<string, unknown>).contractor_sent_at as string | null,
    landlord_allocated_at: basic.landlord_allocated_at,
    ooh_dispatched_at: basic.ooh_dispatched_at,
    tenant_contacted_at: (basic as unknown as Record<string, unknown>).tenant_contacted_at as string | null,
    scheduled_date: basic.scheduled_date,
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
            <p className="text-sm text-muted-foreground truncate">{context.property_address}</p>
          </div>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{description}</p>
        )}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-card-foreground">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Reported on {basic.date_logged
              ? format(new Date(basic.date_logged), "d MMM yyyy 'at' HH:mm")
              : '—'}
          </div>
          {basic.priority && <StatusBadge status={basic.priority} size="md" />}
        </div>
      </div>

      {/* ── Stage Card ── */}
      <StageCard
        reason={basic.next_action_reason}
        isStuck={isStuck}
        isOnHold={basic.on_hold === true}
        handoffReason={(basic as unknown as Record<string, unknown>).handoff_reason as string | null}
        ticketData={ticketData}
      />

      {/* ── Category Data ── */}
      <CategoryData
        category={category}
        basic={basic}
        cert={complianceCert}
        rentLedger={rentLedger}
        completion={completion}
        autoApproveLimit={context.auto_approve_limit}
      />

      {/* ── AI Transcript ── */}
      <AITranscript
        conversation={conversation}
        defaultOpen={basic.next_action_reason === 'handoff_review'}
      />

      {/* ── People ── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">People</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Tenant */}
          {context.tenant_name ? (
            basic.tenant_id ? (
              <Link href={`/tenants/${basic.tenant_id}`} className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4 hover:bg-muted/40 transition-colors">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
                  <p className="text-[11px] text-muted-foreground">Tenant</p>
                </div>
              </Link>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border/60 px-2 py-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"><Users className="h-4 w-4 text-primary" /></div>
                <div className="text-center min-w-0 w-full">
                  <p className="text-sm font-semibold text-card-foreground truncate">{context.tenant_name}</p>
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

          {/* Contractor */}
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
    </div>
  )
}
