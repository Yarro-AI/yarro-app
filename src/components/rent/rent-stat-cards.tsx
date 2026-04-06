'use client'

import { StatCard } from '@/components/dashboard/stat-card'
import { Banknote, TrendingDown, AlertTriangle, CircleDollarSign } from 'lucide-react'

export interface RentSummaryTotals {
  totalDue: number
  totalPaid: number
  outstanding: number
  overdue: number
  paidCount: number
  overdueCount: number
  pendingCount: number
  partialCount: number
  totalEntries: number
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

export function RentStatCards({ summary, isFutureMonth = false }: { summary: RentSummaryTotals; isFutureMonth?: boolean }) {
  const hasData = summary.totalDue > 0

  if (isFutureMonth) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Expected" value="—" subtitle="Not yet due" accentColor="muted" icon={Banknote} />
        <StatCard label="Collected" value="—" subtitle="Not yet due" accentColor="muted" icon={CircleDollarSign} />
        <StatCard label="Outstanding" value="—" subtitle="Not yet due" accentColor="muted" icon={TrendingDown} />
        <StatCard label="Overdue" value="—" subtitle="Not yet due" accentColor="muted" icon={AlertTriangle} />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Expected"
        value={hasData ? formatCurrency(summary.totalDue) : '—'}
        subtitle={hasData ? `${summary.totalEntries} entries` : 'No rent entries'}
        accentColor={hasData ? 'muted' : 'muted'}
        icon={Banknote}
      />
      <StatCard
        label="Collected"
        value={hasData ? formatCurrency(summary.totalPaid) : '—'}
        subtitle={hasData ? `${summary.paidCount} paid` : 'No payments'}
        accentColor={hasData ? 'success' : 'muted'}
        icon={CircleDollarSign}
      />
      <StatCard
        label="Outstanding"
        value={hasData ? formatCurrency(summary.outstanding) : '—'}
        subtitle={hasData && summary.pendingCount > 0 ? `${summary.pendingCount + summary.partialCount} pending` : hasData ? 'All collected' : 'No data'}
        accentColor={!hasData ? 'muted' : summary.outstanding > 0 ? 'warning' : 'success'}
        icon={TrendingDown}
      />
      <StatCard
        label="Overdue"
        value={hasData ? formatCurrency(summary.overdue) : '—'}
        subtitle={hasData && summary.overdueCount > 0 ? `${summary.overdueCount} overdue` : hasData ? 'None overdue' : 'No data'}
        accentColor={!hasData ? 'muted' : summary.overdueCount > 0 ? 'danger' : 'success'}
        icon={AlertTriangle}
      />
    </div>
  )
}
