'use client'

import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'

interface PageShellProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  headerExtra?: React.ReactNode
  children: React.ReactNode
  noPadding?: boolean
  scrollable?: boolean
  className?: string
}

export function PageShell({
  title,
  subtitle,
  actions,
  headerExtra,
  children,
  noPadding = false,
  scrollable = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col h-full overflow-hidden',
        !noPadding && 'px-8 pt-8 pb-8',
        className
      )}
    >
      {/* Page header */}
      <div className="flex-shrink-0 flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className={typography.pageTitle}>{title}</h1>
          {subtitle && <p className={typography.pageSubtitle}>{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>

      {headerExtra && (
        <div className="flex-shrink-0">{headerExtra}</div>
      )}

      {/* Content area — children manage their own internal layout/scroll */}
      <div className={cn('flex-1 min-h-0', scrollable ? 'overflow-y-auto' : 'flex flex-col overflow-hidden')}>
        {children}
      </div>
    </div>
  )
}
