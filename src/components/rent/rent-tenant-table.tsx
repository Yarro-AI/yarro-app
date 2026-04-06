'use client'

import { useRouter } from 'next/navigation'

export interface TenantHealthRow {
  tenant_id: string
  tenant_name: string
  property_address: string
  room_number: string
  months_tracked: number
  on_time_count: number
  late_count: number
  unpaid_count: number
  on_time_rate: number
  current_month_status: string
  total_owed: number
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

function OnTimeRateBadge({ rate }: { rate: number }) {
  const color = rate >= 90
    ? 'bg-emerald-500/10 text-emerald-600'
    : rate >= 70
      ? 'bg-amber-500/10 text-amber-600'
      : 'bg-red-500/10 text-red-600'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {rate}%
    </span>
  )
}

function StatusBadge({ status, owed }: { status: string; owed?: number }) {
  switch (status) {
    case 'paid':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">Paid</span>
    case 'overdue':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">Overdue</span>
    case 'partial':
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
          {owed && owed > 0 ? `£${Math.round(owed).toLocaleString('en-GB')} outstanding` : 'Partial'}
        </span>
      )
    case 'pending':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Pending</span>
    case 'no_entry':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground/50">—</span>
    default:
      return null
  }
}

export function RentTenantTable({ data }: { data: TenantHealthRow[] }) {
  const router = useRouter()

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No tenant payment history found.
      </p>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Tenant</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Property</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Room</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">On-Time</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">This Month</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Owed</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={`${row.tenant_id}-${row.room_number}`}
              onClick={() => router.push(`/tenants/${row.tenant_id}`)}
              className="border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <td className="px-3 py-2.5">
                <span className="font-medium">{row.tenant_name}</span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">
                <span className="truncate block max-w-[180px]">{row.property_address}</span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground hidden sm:table-cell">{row.room_number}</td>
              <td className="px-3 py-2.5 text-center">
                {row.months_tracked > 0 ? <OnTimeRateBadge rate={row.on_time_rate} /> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-2.5 text-center">
                <StatusBadge status={row.current_month_status} owed={row.total_owed} />
              </td>
              <td className="px-3 py-2.5 text-right">
                {row.total_owed > 0 ? (
                  <span className="text-red-600 font-medium">{formatCurrency(row.total_owed)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
