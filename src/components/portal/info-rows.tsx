import { cn } from '@/lib/utils'

type InfoRow = {
  label: string
  value: React.ReactNode
  vertical?: boolean
}

type InfoRowsProps = {
  rows: InfoRow[]
  className?: string
}

export function InfoRows({ rows, className }: InfoRowsProps) {
  return (
    <div className={cn('space-y-2 text-sm', className)}>
      {rows.map((row, i) => (
        <div
          key={i}
          className={cn(
            i > 0 && 'border-t border-border/40 pt-2',
            !row.vertical && 'flex justify-between',
          )}
        >
          <span className="text-muted-foreground">{row.label}</span>
          {row.vertical ? (
            <p className="mt-1 text-foreground">{row.value}</p>
          ) : (
            <span className="text-right font-medium text-foreground">{row.value}</span>
          )}
        </div>
      ))}
    </div>
  )
}
