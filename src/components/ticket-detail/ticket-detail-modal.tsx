'use client'

import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertTriangle, MessageSquare, ArrowLeft, MoreHorizontal } from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTicketDetail } from '@/hooks/use-ticket-detail'
import { TicketOverviewTab } from './ticket-overview-tab'
import { TicketConversationTab } from './ticket-conversation-tab'
import { TicketDispatchTab } from './ticket-dispatch-tab'
import { TicketCompletionTab } from './ticket-completion-tab'
import { ComplianceOverviewTab } from './compliance-overview-tab'
import { RentOverviewTab } from './rent-overview-tab'

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
  defaultTab,
}: TicketDetailModalProps) {
  const {
    context,
    basic,
    conversation,
    messages,
    completion,
    ledger,
    outboundLog,
    complianceCert,
    rentLedger,
    categoryDataLoading,
    loading,
    error,
    hasConversation,
    hasDispatch,
    hasCompletion,
    hasOutboundLog,
    previouslyApprovedContractor,
    displayStage,
    refetch,
  } = useTicketDetail(open ? ticketId : null)

  const isHandoff = context?.handoff && basic?.status === 'open' && !basic?.archived && !basic?.ooh_dispatched
  const isOnHold = basic?.on_hold === true
  const isOpen = basic?.status === 'open' && !basic?.archived
  const isOOH = basic?.ooh_dispatched === true && isOpen
  const oohOutcome = basic?.ooh_outcome || null
  const isLandlordAllocated = basic?.landlord_allocated === true && isOpen
  const landlordOutcome = basic?.landlord_outcome || null
  const isCompleted = isOpen && !isOOH && !isLandlordAllocated && (basic?.next_action_reason === 'completed' || basic?.next_action_reason === 'job_not_completed')
  // Show conversation tab if we have conversation data, outbound log, or a conversation_id
  const showConversationTab = hasConversation || hasOutboundLog || !!(context?.conversation_id || basic?.conversation_id)

  const [closingTicket, setClosingTicket] = useState(false)
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState(defaultTab || 'overview')

  useEffect(() => {
    setActiveTab(defaultTab || 'overview')
  }, [defaultTab, ticketId])

  const handleCloseTicket = async () => {
    if (!ticketId) return
    setClosingTicket(true)
    const supabase = createClient()
    await supabase
      .from('c1_tickets')
      .update({ status: 'closed', resolved_at: new Date().toISOString(), next_action_reason: 'archived' })
      .eq('id', ticketId)
    setClosingTicket(false)
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
    if (!basic?.id) return
    const now = new Date().toISOString()
    const supabase = createClient()

    await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: now, status: 'closed' })
      .eq('id', basic.id)

    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: now })
      .eq('ticket_id', basic.id)

    if (basic.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: now })
        .eq('id', basic.conversation_id)
    }

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
        title={context?.property_address || 'Ticket Details'}
        className="w-[50vw] min-w-[600px] max-w-none p-0 !gap-0 flex flex-col overflow-x-hidden"
      >
        {/* Header — slim nav bar */}
        <div className="px-4 py-2 flex items-center justify-between flex-shrink-0">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {context && basic && !loading && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOpen && (
                  <>
                    <DropdownMenuItem onClick={handleToggleHold}>
                      {isOnHold ? 'Resume ticket' : 'Hold ticket'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                {!basic?.archived && (
                  <DropdownMenuItem
                    onClick={() => setArchiveDialogOpen(true)}
                    className="text-danger focus:text-danger focus:bg-danger/10"
                  >
                    Archive ticket
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Body — fixed height, internal scroll per tab */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex-1 space-y-4 pt-4 px-6 animate-pulse">
              <div className="flex gap-4 border-b pb-2.5">
                <div className="h-4 w-16 bg-muted rounded" />
                <div className="h-4 w-20 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-3/4 bg-muted rounded" />
                <div className="h-20 w-full bg-muted rounded-lg" />
                <div className="h-4 w-1/2 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </div>
            </div>
          ) : error ? (
            <div className="text-center flex-1 flex items-center justify-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : context && basic ? (
            <div className="flex-1 min-h-0 flex flex-col animate-in fade-in-0 duration-200">
              {/* Template: determine which layout to render */}
              {(() => {
                const cat = basic.category || context.category
                const template = cat === 'compliance_renewal' ? 'compliance'
                  : cat === 'rent_arrears' ? 'rent'
                  : 'maintenance'

                if (template === 'compliance') {
                  return (
                    <>
                      {/* Tab bar */}
                      <div className="flex items-end gap-6 border-b border-border/40 px-6 flex-shrink-0 overflow-x-auto">
                        <button onClick={() => setActiveTab('overview')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                          <span className={cn('text-sm font-medium transition-colors', activeTab === 'overview' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Overview</span>
                        </button>
                        {hasCompletion && (
                          <button onClick={() => setActiveTab('completion')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                            <span className={cn('text-sm font-medium transition-colors', activeTab === 'completion' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Completion</span>
                          </button>
                        )}
                      </div>
                      {activeTab === 'overview' && (
                        <div className="flex-1 min-h-0 overflow-y-auto">
                          <ComplianceOverviewTab context={context} basic={basic} cert={complianceCert} loading={categoryDataLoading} />
                        </div>
                      )}
                      {activeTab === 'completion' && hasCompletion && completion && (
                        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                          <TicketCompletionTab completion={completion} />
                        </div>
                      )}
                    </>
                  )
                }

                if (template === 'rent') {
                  return (
                    <>
                      <div className="flex items-end gap-6 border-b border-border/40 px-6 flex-shrink-0 overflow-x-auto">
                        <button onClick={() => setActiveTab('overview')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                          <span className={cn('text-sm font-medium transition-colors', activeTab === 'overview' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Overview</span>
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        <RentOverviewTab context={context} basic={basic} rentLedger={rentLedger} loading={categoryDataLoading} />
                      </div>
                    </>
                  )
                }

                // Maintenance (default)
                return (
                  <>
                    {/* Handoff warning */}
                    {isHandoff && (
                      <div className="mx-6 p-3 mt-2 mb-1 bg-red-500/10 rounded-lg border border-red-300 flex-shrink-0">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-red-700">Handoff — Needs Manual Review</p>
                            <p className="text-xs text-red-600/80 mt-1">
                              The AI couldn&apos;t complete this ticket automatically. Review the conversation and dispatch manually.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Double-quote warning */}
                    {previouslyApprovedContractor && basic.contractor_id && (
                      <div className="mx-6 p-3 mt-2 mb-1 bg-red-500/10 rounded-lg border border-red-300 flex-shrink-0">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm">
                            <p className="font-medium text-red-700">Previous contractor already approved</p>
                            <p className="text-xs text-red-600/80 mt-1">
                              <span className="font-medium">{previouslyApprovedContractor}</span> was previously approved.
                              Cancel the previous arrangement before proceeding with a new contractor.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {isOOH && (
                      <p className="px-6 pt-2 text-[11px] text-muted-foreground/70 flex-shrink-0">
                        Handled out-of-hours — review the contact&apos;s response below, then mark as complete.
                      </p>
                    )}

                    {/* Tab bar */}
                    <div className="flex items-end gap-6 border-b border-border/40 px-6 flex-shrink-0 overflow-x-auto">
                      <button onClick={() => setActiveTab('overview')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                        <span className={cn('text-sm font-medium transition-colors', activeTab === 'overview' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Overview</span>
                      </button>
                      {showConversationTab && (
                        <button onClick={() => setActiveTab('conversation')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                          <span className={cn('text-sm font-medium transition-colors', activeTab === 'conversation' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Conversation</span>
                        </button>
                      )}
                      {(hasDispatch || hasOutboundLog || ledger.length > 0) && (
                        <button onClick={() => setActiveTab('dispatch')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                          <span className={cn('text-sm font-medium transition-colors', activeTab === 'dispatch' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Dispatch</span>
                        </button>
                      )}
                      {hasCompletion && (
                        <button onClick={() => setActiveTab('completion')} className="flex items-center py-2.5 -mb-px flex-shrink-0">
                          <span className={cn('text-sm font-medium transition-colors', activeTab === 'completion' ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}>Completion</span>
                        </button>
                      )}
                    </div>

                    {/* Tab content */}
                    {activeTab === 'overview' && (
                      <div className="flex-1 min-h-0 overflow-y-auto">
                        <TicketOverviewTab context={context} basic={basic} messages={messages} onTabChange={setActiveTab} />
                      </div>
                    )}
                    {activeTab === 'conversation' && showConversationTab && (
                      <div className="flex-1 min-h-0 overflow-hidden px-6 py-4">
                        <TicketConversationTab conversation={conversation || null} outboundLog={outboundLog} messages={messages} scheduledDate={basic?.scheduled_date} />
                      </div>
                    )}
                    {activeTab === 'dispatch' && (hasDispatch || hasOutboundLog || ledger.length > 0) && (
                      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                        <TicketDispatchTab messages={messages} outboundLog={outboundLog} ticketId={ticketId || undefined} onRedispatched={onClose} nextActionReason={basic?.next_action_reason} onActionTaken={() => { refetch(); onTicketUpdated?.() }} oohSubmissions={basic?.ooh_submissions} landlordSubmissions={basic?.landlord_submissions} landlordAllocated={basic?.landlord_allocated} landlordName={context?.landlord_name} landlordPhone={context?.landlord_phone} />
                      </div>
                    )}
                    {activeTab === 'completion' && hasCompletion && completion && (
                      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                        <TicketCompletionTab completion={completion} />
                      </div>
                    )}
                  </>
                )
              })()}
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
