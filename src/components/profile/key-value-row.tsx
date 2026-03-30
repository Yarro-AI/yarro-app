import { cn } from '@/lib/utils'

interface KeyValueRowProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function KeyValueRow({ label, children, className }: KeyValueRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-3 border-b border-border/50 last:border-b-0',
        className,
      )}
    >
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <div className="text-sm font-medium text-foreground min-w-0">{children}</div>
    </div>
  )
}
