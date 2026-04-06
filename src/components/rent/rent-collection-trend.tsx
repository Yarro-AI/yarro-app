'use client'

export interface TrendRow {
  month: number
  year: number
  month_label: string
  total_due: number
  total_collected: number
  total_overdue: number
  collection_rate: number
  entry_count: number
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

export function RentCollectionTrend({ data }: { data: TrendRow[] }) {
  if (data.length === 0 || data.every((d) => d.entry_count === 0)) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No collection history yet.
      </p>
    )
  }

  const maxAmount = Math.max(...data.map((d) => Math.max(d.total_due, d.total_collected)), 1)
  const chartHeight = 160
  const barGroupWidth = 100 / data.length

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
        Collection trend
      </p>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${data.length * 80} ${chartHeight + 30}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {data.map((row, i) => {
          const x = i * 80
          const barW = 28
          const gap = 4

          const expectedH = row.total_due > 0 ? (row.total_due / maxAmount) * chartHeight : 0
          const collectedH = row.total_collected > 0 ? (row.total_collected / maxAmount) * chartHeight : 0

          const expectedY = chartHeight - expectedH
          const collectedY = chartHeight - collectedH

          // Short month label (e.g. "Apr")
          const shortLabel = row.month_label.split(' ')[0]

          return (
            <g key={`${row.month}-${row.year}`}>
              {/* Expected bar (muted) */}
              <rect
                x={x + 10}
                y={expectedY}
                width={barW}
                height={expectedH}
                rx={3}
                className="fill-muted"
              />
              {/* Collected bar (green) */}
              <rect
                x={x + 10 + barW + gap}
                y={collectedY}
                width={barW}
                height={collectedH}
                rx={3}
                className="fill-emerald-500/60"
              />
              {/* Rate label above bars */}
              {row.entry_count > 0 && (
                <text
                  x={x + 10 + barW + gap / 2}
                  y={Math.min(expectedY, collectedY) - 4}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                >
                  {row.collection_rate}%
                </text>
              )}
              {/* Month label */}
              <text
                x={x + 10 + barW + gap / 2}
                y={chartHeight + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {shortLabel}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-muted" />
          <span>Expected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/60" />
          <span>Collected</span>
        </div>
      </div>
    </div>
  )
}
