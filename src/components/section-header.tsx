import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'

interface SectionHeaderProps {
  title: string
  actions?: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}

export function SectionHeader({
  title,
  actions,
  className,
  size = 'md',
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-border/40 flex-shrink-0',
        size === 'sm' ? 'px-5 py-3' : 'px-5 py-4',
        className
      )}
    >
      <span className={typography.sectionTitle}>{title}</span>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
      )}
    </div>
  )
}
