import { cn } from '@/lib/utils'

type PortalCardProps = {
  children: React.ReactNode
  className?: string
}

export function PortalCard({ children, className }: PortalCardProps) {
  return (
    <div className={cn('bg-card rounded-xl border border-border p-5', className)}>
      {children}
    </div>
  )
}
