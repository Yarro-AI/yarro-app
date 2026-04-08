'use client'

import { useState } from 'react'
import { Wrench, Building2 } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { TodoItem } from '@/components/dashboard/todo-panel'

interface WaitingSectionProps {
  contractorItems: TodoItem[]
  landlordItems: TodoItem[]
  onTicketClick: (item: TodoItem) => void
}

function waitDaysColor(waitingSince: string) {
  const days = differenceInDays(new Date(), new Date(waitingSince))
  if (days >= 5) return 'text-danger'
  if (days >= 3) return 'text-warning'
  return 'text-muted-foreground'
}

function waitDaysLabel(waitingSince: string) {
  const days = differenceInDays(new Date(), new Date(waitingSince))
  if (days === 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

export function WaitingSection({ contractorItems, landlordItems, onTicketClick }: WaitingSectionProps) {
  const [modalType, setModalType] = useState<'contractor' | 'landlord' | null>(null)
  const activeItems = modalType === 'contractor' ? contractorItems : landlordItems
  const sorted = [...activeItems].sort(
    (a, b) => new Date(a.waiting_since).getTime() - new Date(b.waiting_since).getTime()
  )

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {/* Awaiting contractors card */}
        <button
          onClick={() => setModalType('contractor')}
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6',
            'bg-card border border-border rounded-xl',
            'cursor-pointer transition-all duration-150',
            'hover:-translate-y-1 hover:shadow-md hover:border-primary/20',
            'aspect-square'
          )}
        >
          <Wrench className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium text-card-foreground">Awaiting contractors</span>
          <span className="text-4xl font-bold text-card-foreground">{contractorItems.length}</span>
        </button>

        {/* Awaiting landlords card */}
        <button
          onClick={() => setModalType('landlord')}
          className={cn(
            'flex flex-col items-center justify-center gap-3 p-6',
            'bg-card border border-border rounded-xl',
            'cursor-pointer transition-all duration-150',
            'hover:-translate-y-1 hover:shadow-md hover:border-primary/20',
            'aspect-square'
          )}
        >
          <Building2 className="w-6 h-6 text-primary" />
          <span className="text-sm font-medium text-card-foreground">Awaiting landlords</span>
          <span className="text-4xl font-bold text-card-foreground">{landlordItems.length}</span>
        </button>
      </div>

      {/* Breakdown modal */}
      <Dialog open={!!modalType} onOpenChange={(open) => !open && setModalType(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {modalType === 'contractor' ? 'Awaiting contractors' : 'Awaiting landlords'}
            </DialogTitle>
            <DialogDescription>
              {sorted.length} job{sorted.length !== 1 ? 's' : ''} waiting for a response
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nothing waiting</p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {sorted.map(item => (
                  <button
                    key={item.id}
                    onClick={() => { onTicketClick(item); setModalType(null) }}
                    className="flex items-start justify-between gap-4 py-3 px-1 text-left hover:bg-muted/30 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.issue_summary}</p>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{item.property_label}</p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{item.action_context}</p>
                    </div>
                    <span className={cn('text-sm font-medium whitespace-nowrap flex-shrink-0 pt-0.5', waitDaysColor(item.waiting_since))}>
                      {waitDaysLabel(item.waiting_since)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
