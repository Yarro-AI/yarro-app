import { cn } from '@/lib/utils'

export function DetailCell({ label, value, mono, highlight }: {
  label: string
  value: string | null | undefined
  mono?: boolean
  highlight?: boolean
}) {
  if (!value) return null
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider">{label}</p>
      <p className={cn(
        'text-[15px]',
        mono && 'font-mono',
        highlight ? 'font-semibold text-emerald-600' : 'font-medium text-foreground',
      )}>
        {value}
      </p>
    </div>
  )
}
