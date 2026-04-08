'use client'

import { DetailCell } from '@/components/detail-cell'
import { formatCurrency, getContractors, getRecipient } from '@/hooks/use-ticket-detail'
import type { MessageData, CompletionData, TicketBasic } from '@/hooks/use-ticket-audit'
import { formatDate } from '@/lib/audit-utils'

interface AuditFinancialsProps {
  ticket: TicketBasic
  messages: MessageData | null
  completion: CompletionData | null
}

export function AuditFinancials({ ticket, messages, completion }: AuditFinancialsProps) {
  const contractors = messages ? getContractors(messages.contractors) : []
  const landlord = messages ? getRecipient(messages.landlord) : null
  const hasQuotes = contractors.some((c) => c.quote_amount)
  const hasCompletion = !!completion
  const hasLandlord = !!landlord?.approval_amount || !!landlord?.approval
  const hasAny = hasQuotes || hasCompletion || hasLandlord || ticket.contractor_quote || ticket.final_amount

  if (!hasAny) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No financial records</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Contractor quotes */}
      {hasQuotes && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Contractor Quotes</h3>
          <div className="space-y-3">
            {contractors.filter((c) => c.quote_amount || c.replied_at).map((contractor) => (
              <div key={contractor.id || contractor.name} className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{contractor.name}</span>
                  {contractor.manager_decision && (
                    <span className={`text-[11px] font-medium uppercase ${
                      contractor.manager_decision === 'approved' ? 'text-success' : 'text-danger'
                    }`}>
                      {contractor.manager_decision}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {contractor.quote_amount && (
                    <DetailCell label="Quote" value={`£${contractor.quote_amount}`} mono />
                  )}
                  {contractor.sent_at && (
                    <DetailCell label="Contacted" value={formatDate(contractor.sent_at)} />
                  )}
                  {contractor.replied_at && (
                    <DetailCell label="Replied" value={formatDate(contractor.replied_at)} />
                  )}
                  {contractor.category && (
                    <DetailCell label="Category" value={contractor.category} />
                  )}
                </div>
                {contractor.quote_notes && (
                  <p className="text-sm text-muted-foreground mt-2">{contractor.quote_notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Landlord approval */}
      {hasLandlord && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Landlord Approval</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {landlord?.name && <DetailCell label="Landlord" value={landlord.name} />}
            {landlord?.approval !== undefined && (
              <DetailCell label="Decision" value={landlord.approval ? 'Approved' : 'Declined'} />
            )}
            {landlord?.approval_amount && (
              <DetailCell label="Approved Amount" value={`£${landlord.approval_amount}`} mono highlight />
            )}
            {landlord?.replied_at && (
              <DetailCell label="Responded" value={formatDate(landlord.replied_at)} />
            )}
          </div>
        </div>
      )}

      {/* Completion financials */}
      {hasCompletion && completion && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Completion</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <DetailCell label="Quote Amount" value={formatCurrency(completion.quote_amount)} mono />
            <DetailCell label="Markup" value={formatCurrency(Math.abs(completion.markup_amount || 0))} mono />
            <DetailCell label="Total" value={formatCurrency(completion.total_amount)} mono highlight />
            <DetailCell label="Received" value={formatDate(completion.received_at)} />
          </div>
        </div>
      )}

      {/* Ticket-level financial summary */}
      {(ticket.contractor_quote || ticket.final_amount || ticket.landlord_cost || ticket.ooh_cost) && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Financial Summary</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <DetailCell label="Contractor Quote" value={formatCurrency(ticket.contractor_quote)} mono />
            <DetailCell label="Final Amount" value={formatCurrency(ticket.final_amount)} mono highlight />
            {ticket.landlord_cost && (
              <DetailCell label="Landlord Cost" value={formatCurrency(ticket.landlord_cost)} mono />
            )}
            {ticket.ooh_cost && (
              <DetailCell label="OOH Cost" value={formatCurrency(ticket.ooh_cost)} mono />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
