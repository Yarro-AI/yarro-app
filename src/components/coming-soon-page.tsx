'use client'

import { PageShell } from '@/components/page-shell'
import type { LucideIcon } from 'lucide-react'

interface ComingSoonPageProps {
  title: string
  description: string
  icon: LucideIcon
}

export function ComingSoonPage({ title, description, icon: Icon }: ComingSoonPageProps) {
  return (
    <PageShell title={title}>
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              Coming Soon
            </span>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
