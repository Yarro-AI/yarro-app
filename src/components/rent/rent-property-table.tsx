'use client'

import { useRouter } from 'next/navigation'

export interface PropertySummaryRow {
  property_id: string
  property_address: string
  total_rooms: number
  occupied_rooms: number
  total_due: number
  total_paid: number
  outstanding: number
  overdue_amount: number
  paid_count: number
  overdue_count: number
  pending_count: number
  partial_count: number
  collection_rate: number
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

function CollectionBadge({ rate }: { rate: number }) {
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

export function RentPropertyTable({ data }: { data: PropertySummaryRow[] }) {
  const router = useRouter()

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No properties with rent configured for this month.
      </p>
    )
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Property</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Rooms</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Expected</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Collected</th>
            <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Overdue</th>
            <th className="text-center px-3 py-2 font-medium text-muted-foreground text-xs">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.property_id}
              onClick={() => router.push(`/properties/${row.property_id}?tab=rent`)}
              className="border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <td className="px-3 py-2.5">
                <span className="font-medium truncate block max-w-[200px] lg:max-w-[300px]">{row.property_address}</span>
              </td>
              <td className="px-3 py-2.5 text-center text-muted-foreground hidden sm:table-cell">
                {row.occupied_rooms}/{row.total_rooms}
              </td>
              <td className="px-3 py-2.5 text-right">{formatCurrency(row.total_due)}</td>
              <td className="px-3 py-2.5 text-right hidden md:table-cell">{formatCurrency(row.total_paid)}</td>
              <td className="px-3 py-2.5 text-right">
                {row.overdue_amount > 0 ? (
                  <span className="text-red-600">{formatCurrency(row.overdue_amount)}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-center">
                {row.total_due > 0 ? <CollectionBadge rate={row.collection_rate} /> : <span className="text-muted-foreground">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
