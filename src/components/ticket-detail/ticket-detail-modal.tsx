'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { useTicketDetail } from '@/hooks/use-ticket-detail'
import { TicketOverview } from './ticket-overview'
import { ActionBar } from './sections/action-bar'

interface TicketDetailModalProps {
  ticketId: string | null
  open: boolean
  onClose: () => void
  onTicketUpdated?: () => void
  defaultTab?: string
}

export function TicketDetailModal({
  ticketId,
  open,
  onClose,
  onTicketUpdated,
}: TicketDetailModalProps) {
  const { propertyManager } = usePM()
  const {
    ticket,
    conversation,
    messages,
    completion,
    isStuck,
    loading,
    error,
    refetch,
  } = useTicketDetail(open ? ticketId : null)

  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)

  const isOnHold = ticket?.on_hold === true
  const pmId = propertyManager?.id

  const handleCloseTicket = async () => {
    if (!ticketId || !pmId) return
    const supabase = createClient()
    const { error } = await supabase.rpc('c1_close_ticket', { p_ticket_id: ticketId, p_pm_id: pmId })
    if (error) { toast.error('Failed to close ticket'); return }
    toast.success('Ticket closed')
    refetch()
    onTicketUpdated?.()
  }

  const handleReopenTicket = async () => {
    if (!ticketId || !pmId) return
    const supabase = createClient()
    const { error } = await supabase.rpc('c1_reopen_ticket', { p_ticket_id: ticketId, p_pm_id: pmId })
    if (error) { toast.error('Failed to reopen ticket'); return }
    toast.success('Ticket reopened')
    refetch()
    onTicketUpdated?.()
  }

  const handleToggleHold = async () => {
    if (!ticketId) return
    const supabase = createClient()
    await supabase.rpc('c1_toggle_hold', { p_ticket_id: ticketId, p_on_hold: !isOnHold })
    refetch()
    onTicketUpdated?.()
  }

  const handleArchive = async () => {
    if (!ticket?.id || !pmId) return
    const supabase = createClient()
    const { error } = await supabase.rpc('c1_archive_ticket', { p_ticket_id: ticket.id, p_pm_id: pmId })
    if (error) { toast.error('Failed to archive ticket'); return }
    toast.success('Ticket archived')
    setArchiveDialogOpen(false)
    onTicketUpdated?.()
    onClose()
  }

  return (
    <>
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        hideCloseButton={true}
        title={ticket?.property_address || 'Ticket Details'}
        className="w-[50vw] min-w-[600px] max-w-none p-0 !gap-0 flex flex-col overflow-x-hidden"
      >
        {/* Header — back arrow */}
        <div className="px-4 py-2 flex items-center flex-shrink-0">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Body — single scrollable overview + sticky action bar */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 space-y-4 pt-4 px-6 animate-pulse">
              <div className="h-20 w-full bg-muted rounded-xl" />
              <div className="h-16 w-full bg-muted rounded-xl" />
              <div className="h-32 w-full bg-muted rounded-xl" />
              <div className="h-16 w-full bg-muted rounded-xl" />
            </div>
          ) : error ? (
            <div className="text-center flex-1 flex items-center justify-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : ticket ? (
            <div className="flex-1 min-h-0 flex flex-col animate-in fade-in-0 duration-200">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TicketOverview
                  ticket={ticket}
                  conversation={conversation}
                  messages={messages}
                  completion={completion}
                  isStuck={isStuck}
                />
                <ActionBar
                  ticket={ticket}
                  messages={messages}
                  isStuck={isStuck}
                  onToggleHold={handleToggleHold}
                  onArchive={() => setArchiveDialogOpen(true)}
                  onClose={handleCloseTicket}
                  onReopen={handleReopenTicket}
                  onActionTaken={() => { refetch(); onTicketUpdated?.() }}
                />
              </div>
            </div>
          ) : (
            <div className="text-center flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">No ticket selected</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    <ConfirmDeleteDialog
      open={archiveDialogOpen}
      onOpenChange={setArchiveDialogOpen}
      title="Archive ticket"
      description="This will archive the ticket, close it, and remove it from active views."
      onConfirm={handleArchive}
      confirmLabel="Archive"
      confirmingLabel="Archiving..."
    />
    </>
  )
}
