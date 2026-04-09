import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import { type LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
  accentColor?: 'danger' | 'warning' | 'success' | 'primary' | 'muted'
  icon?: LucideIcon
  onClick?: () => void
}

const accentClasses: Record<string, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  success: 'text-success',
  primary: 'text-primary',
  muted: 'text-muted-foreground',
}

const iconBgClasses: Record<string, string> = {
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success',
  primary: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
}

export function StatCard({ label, value, subtitle, accentColor, icon: Icon, onClick }: StatCardProps) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'bg-card rounded-xl border border-border p-5 flex items-start justify-between gap-3',
        onClick && 'w-full text-left cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20',
      )}
    >
      <div className="flex flex-col gap-1">
        <span className={cn(typography.sectionTitle)}>{label}</span>
        <span className={cn(typography.statValue)}>{value}</span>
        {subtitle && (
          <span className={cn(
            typography.metaText,
            accentColor ? accentClasses[accentColor] : undefined
          )}>
            {subtitle}
          </span>
        )}
      </div>
      {Icon && (
        <div className={cn('rounded-lg p-2 flex-shrink-0', iconBgClasses[accentColor || 'muted'])}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </Wrapper>
  )
}
