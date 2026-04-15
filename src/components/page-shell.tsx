'use client'

import { cn } from '@/lib/utils'
import { typography } from '@/lib/typography'
import { spacing } from '@/styles/spacing'

interface PageShellProps {
  title?: string
  subtitle?: string
  count?: number
  actions?: React.ReactNode
  headerExtra?: React.ReactNode
  topBar?: React.ReactNode
  children: React.ReactNode
  noPadding?: boolean
  headerBorder?: boolean
  scrollable?: boolean
  className?: string
}

export function PageShell({
  title,
  subtitle,
  count,
  actions,
  headerExtra,
  topBar,
  children,
  noPadding = false,
  headerBorder = false,
  scrollable = false,
  className,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col min-h-full',
        className
      )}
    >
      {topBar ? (
        <div className={cn('flex-shrink-0 flex flex-col', spacing.pagePaddingX)}>
          {title && (
            <div className="flex items-center h-16">
              <div className="min-w-0">
                <h1 className={typography.pageTitle}>
                  {title}
                  {count != null && (
                    <span className="ml-3 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground align-middle">
                      {count}
                    </span>
                  )}
                </h1>
                {subtitle && <p className={typography.pageSubtitle}>{subtitle}</p>}
              </div>
            </div>
          )}
          <div className={cn(
            'flex items-center justify-between h-12 gap-3',
            headerBorder ? 'border-b border-foreground/10' : ''
          )}>
            {topBar}
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
            )}
          </div>
        </div>
      ) : title ? (
        <div className={cn(
          'flex-shrink-0 flex items-center justify-between gap-4 h-16 mt-2', spacing.pagePaddingX,
          headerBorder ? 'border-b border-foreground/10' : ''
        )}>
          <div className="min-w-0">
            <h1 className={typography.pageTitle}>
              {title}
              {count != null && (
                <span className="ml-3 inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground align-middle">
                  {count}
                </span>
              )}
            </h1>
            {subtitle && <p className={typography.pageSubtitle}>{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
          )}
        </div>
      ) : null}

      <div className={cn(
        'flex flex-col flex-1',
        !noPadding && 'pb-8'
      )}>
        {headerExtra && (
          <div className={cn('flex-shrink-0', spacing.pagePaddingX)}>{headerExtra}</div>
        )}
        <div className={cn('flex-1', !noPadding && spacing.pagePaddingX, scrollable ? 'overflow-y-auto' : 'flex flex-col')}>
          {children}
        </div>
      </div>
    </div>
  )
}
