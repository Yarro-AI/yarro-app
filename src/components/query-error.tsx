'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QueryErrorProps {
  message: string
  onRetry: () => void
  className?: string
}

export function QueryError({ message, onRetry, className }: QueryErrorProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-16 px-4',
      className
    )}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="text-sm font-medium mb-1">{message}</p>
      <p className="text-xs text-muted-foreground mb-4">
        Check your connection and try again
      </p>
      <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  )
}
