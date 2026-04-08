'use client'

import { format } from 'date-fns'
import { Users, Crown } from 'lucide-react'
import Link from 'next/link'
import type { TicketContext, TicketBasic, RentLedgerRow } from '@/hooks/use-ticket-detail'
import { formatCurrency } from '@/hooks/use-ticket-detail'
import { StatusBadge } from '@/components/status-badge'

interface RentOverviewTabProps {
  context: TicketContext
  basic: TicketBasic
  rentLedger: RentLedgerRow[]
  loading: boolean
}

const LEDGER_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  paid: { bg: 'bg-success/10', text: 'text-success' },
  overdue: { bg: 'bg-danger/10', text: 'text-danger' },
  partial: { bg: 'bg-warning/10', text: 'text-warning' },
  pending: { bg: 'bg-muted', text: 'text-muted-foreground' },
}

function LedgerStatusBadge({ status }: { status: string }) {
  const style = LEDGER_STATUS_STYLES[status] || LEDGER_STATUS_STYLES.pending
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${style.bg} ${style.text} capitalize`}>
      {status}
    </span>
  )
}

export function RentOverviewTab({ context, basic, rentLedger, loading }: RentOverviewTabProps) {
  const overdueRows = rentLedger.filter(r => r.status === 'overdue' || r.status === 'partial')
  const totalArrears = overdueRows.reduce((sum, r) => sum + r.amount_due - (r.amount_paid || 0), 0)
  const monthsOverdue = rentLedger.filter(r => r.status === 'overdue').length
  const partialCount = rentLedger.filter(r => r.status === 'partial').length

  return (
    <div>
      {/* ── Section 1: Status ── */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {basic.next_action_reason && <StatusBadge status={basic.next_action_reason} size="md" />}
          {basic.priority && <StatusBadge status={basic.priority} size="md" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {basic.date_logged && `Logged ${format(new Date(basic.date_logged), 'd MMM yyyy')}`}
        </p>
      </div>

      {/* ── Section 2: Arrears Summary ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-5">
        <p className="text-sm font-semibold text-foreground mb-3">Arrears Summary</p>

        {loading && rentLedger.length === 0 ? (
          <div className="space-y-2">
            <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-48 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <div className="rounded-lg border border-border px-4 py-4 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Total Outstanding</p>
              <p className={`text-2xl font-bold font-mono ${totalArrears > 0 ? 'text-danger' : 'text-success'}`}>
                {formatCurrency(totalArrears) === '-' ? '£0.00' : formatCurrency(totalArrears)}
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              {monthsOverdue > 0 && (
                <span className="text-danger">
                  {monthsOverdue} month{monthsOverdue !== 1 ? 's' : ''} overdue
                </span>
              )}
              {partialCount > 0 && (
                <span className="text-warning">
                  {partialCount} partial payment{partialCount !== 1 ? 's' : ''}
                </span>
              )}
              {totalArrears === 0 && (
                <span className="text-success">Arrears cleared</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 3: People ── */}
      <div className="border-t border-border/40" />
      <div className="px-6 py-5">
        <div className="flex items-center gap-4 flex-wrap">
          {context.tenant_name && (
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                <Users className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-foreground">{context.tenant_name}</span>
            </div>
          )}
          {context.landlord_name && context.landlord_id && (
            <Link href={`/landlords/${context.landlord_id}`} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
              <div className="h-7 w-7 rounded-md bg-warning/10 flex items-center justify-center">
                <Crown className="h-3.5 w-3.5 text-warning" />
              </div>
              <span className="text-sm text-foreground">{context.landlord_name}</span>
            </Link>
          )}
        </div>
      </div>

      {/* ── Section 4: Payment Ledger ── */}
      {rentLedger.length > 0 && (
        <>
          <div className="border-t border-border/40" />
          <div className="px-6 py-5">
            <p className="text-sm font-semibold text-foreground mb-3">Payment Ledger</p>
            <div className="space-y-1">
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pb-1">
                <span>Month</span>
                <span className="text-right">Due</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Status</span>
              </div>
              {/* Rows */}
              {rentLedger.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_80px_80px_80px] gap-2 items-center py-1.5 border-t border-border/20"
                >
                  <span className="text-sm text-foreground">
                    {format(new Date(row.due_date), 'MMM yyyy')}
                  </span>
                  <span className="text-sm text-foreground text-right font-mono">
                    {formatCurrency(row.amount_due)}
                  </span>
                  <span className="text-sm text-foreground text-right font-mono">
                    {formatCurrency(row.amount_paid)}
                  </span>
                  <div className="flex justify-end">
                    <LedgerStatusBadge status={row.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
