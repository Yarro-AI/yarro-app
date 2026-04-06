'use client'

export interface CashflowRow {
  due_day: number
  expected_amount: number
  collected_amount: number
  entry_count: number
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

export function RentCashflowChart({ data }: { data: CashflowRow[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No rent entries for this month.
      </p>
    )
  }

  const maxAmount = Math.max(...data.map((d) => d.expected_amount), 1)

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Rent due by day of month
      </p>
      <div className="space-y-2">
        {data.map((row) => {
          const barWidth = (row.expected_amount / maxAmount) * 100
          const collectedWidth = row.expected_amount > 0
            ? (row.collected_amount / row.expected_amount) * barWidth
            : 0

          return (
            <div key={row.due_day} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-8 text-right font-mono">
                {row.due_day.toString().padStart(2, '0')}
              </span>
              <div className="flex-1 h-6 bg-muted/30 rounded-md overflow-hidden relative">
                {/* Expected (background) */}
                <div
                  className="absolute inset-y-0 left-0 bg-muted/60 rounded-md"
                  style={{ width: `${barWidth}%` }}
                />
                {/* Collected (foreground) */}
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500/30 rounded-md"
                  style={{ width: `${collectedWidth}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-16 text-right">
                {formatCurrency(row.expected_amount)}
              </span>
              <span className="text-xs w-10 text-right">
                {row.entry_count} {row.entry_count === 1 ? 'unit' : 'units'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted/60" />
          <span>Expected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
          <span>Collected</span>
        </div>
      </div>
    </div>
  )
}
