import { cn } from '@/lib/utils'

const variants = {
  success: 'border-green-200 bg-green-50',
  warning: 'border-amber-200 bg-amber-50',
  error:   'border-red-200 bg-red-50',
  info:    'border-blue-100 bg-blue-50/60',
} as const

type PortalBannerProps = {
  variant: keyof typeof variants
  children: React.ReactNode
  className?: string
}

export function PortalBanner({ variant, children, className }: PortalBannerProps) {
  return (
    <div className={cn(
      'rounded-lg border px-4 py-3 flex items-start gap-2.5',
      variants[variant],
      className,
    )}>
      {children}
    </div>
  )
}
