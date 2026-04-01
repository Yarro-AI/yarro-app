import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/portal-utils'

// Portal pages are standalone (no sidebar, no auth).
// They use the same semantic tokens as the dashboard (bg-card, text-foreground, etc.)
// since the app has no dark mode — tokens always resolve to light values.

type PortalShellProps = {
  property: string
  issue: string
  ticketRef: string
  dateLogged: string
  contextLabel?: string
  contextColor?: string
  children: React.ReactNode
}

export function PortalShell({
  property,
  issue,
  ticketRef,
  dateLogged,
  contextLabel,
  contextColor,
  children,
}: PortalShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-lg px-4 py-8">
        {/* Property-centric header */}
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold text-foreground leading-tight">
              {property}
            </h1>
            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              T-{ticketRef}
            </span>
          </div>
          <p className="mt-1.5 text-base font-medium text-muted-foreground">
            {issue}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Reported {formatDate(dateLogged)}
            </span>
            {contextLabel && (
              <>
                <span className="text-xs text-muted-foreground/40">&middot;</span>
                <span className={cn('text-xs font-medium', contextColor)}>
                  {contextLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {children}

        <p className="mt-10 text-center text-xs text-muted-foreground/60">Powered by Yarro</p>
      </div>
    </div>
  )
}

export function PortalLoading() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center" style={{ colorScheme: 'light' }}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function PortalError({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-background" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold text-foreground">Yarro</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {message || 'This link is invalid or has expired.'}
        </p>
      </div>
    </div>
  )
}
