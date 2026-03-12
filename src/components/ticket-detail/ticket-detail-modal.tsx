'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { Button } from '@/components/ui/button'
import { Archive, Pause, Play, AlertTriangle, MessageSquare, Wrench, CheckCircle2, LayoutDashboard, Phone, Clock, XCircle, Loader2, CalendarClock } from 'lucide-react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTicketDetail } from '@/hooks/use-ticket-detail'
import { TicketOverviewTab } from './ticket-overview-tab'
import { TicketConversationTab } from './ticket-conversation-tab'
import { TicketDispatchTab } from './ticket-dispatch-tab'
import { TicketCompletionTab } from './ticket-completion-tab'

interface TicketDetailModalProps {
  ticketId: string | null
  open: boolean
  onClose: () => void
  onArchive?: () => void
  onReview?: () => void
  onTicketUpdated?: () => void
  defaultTab?: string
}

export function TicketDetailModal({
  ticketId,
  open,
  onClose,
  onArchive,
  onReview,
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
  // Show conversation tab if we have data OR if there's a conversation_id (data might be loading)
  const showConversationTab = hasConversation || !!(context?.conversation_id || basic?.conversation_id)

  const [closingTicket, setClosingTicket] = useState(false)

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

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="xl" className="h-[80vh]" hideCloseButton={false}>
        {/* Header — tightened padding */}
        <DialogHeader>
          {loading ? (
            <div className="space-y-2 animate-pulse">
              <div className="flex items-center justify-between gap-3">
                <div className="h-5 w-52 bg-muted rounded" />
                <div className="flex items-center gap-2">
                  <div className="h-6 w-20 bg-muted rounded-full" />
                  <div className="h-6 w-16 bg-muted rounded-full" />
                </div>
              </div>
              <div className="h-4 w-80 bg-muted rounded" />
              <DialogTitle className="sr-only">Loading ticket...</DialogTitle>
            </div>
          ) : error ? (
            <DialogTitle className="text-destructive">Error loading ticket</DialogTitle>
          ) : context ? (
            <div className="space-y-1">
              {/* Row 1: Address + badges + actions */}
              <div className="flex items-center justify-between gap-3">
                <DialogTitle className="truncate">
                  {context.property_address || 'Unknown Property'}
                </DialogTitle>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Closeable tickets: OOH, Landlord-allocated, or Completed — PM closes from here */}
                  {isOOH ? (
                    <button
                      onClick={handleCloseTicket}
                      disabled={closingTicket}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                        oohOutcome === 'resolved' ? 'border-green-400 dark:border-green-500 text-green-600 dark:text-green-400'
                        : oohOutcome === 'unresolved' ? 'border-red-400 dark:border-red-500 text-red-600 dark:text-red-400'
                        : oohOutcome === 'in_progress' ? 'border-amber-400 dark:border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'border-purple-400 dark:border-purple-500 text-purple-600 dark:text-purple-400'
                      }`}
                    >
                      {closingTicket ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          {displayStage || 'OOH Dispatched'}
                          <span className="opacity-40">·</span>
                          <span className="text-xs">Close</span>
                          <XCircle className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  ) : isLandlordAllocated ? (
                    <button
                      onClick={handleCloseTicket}
                      disabled={closingTicket}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                        landlordOutcome === 'resolved' ? 'border-green-400 dark:border-green-500 text-green-600 dark:text-green-400'
                        : landlordOutcome === 'need_help' ? 'border-red-400 dark:border-red-500 text-red-600 dark:text-red-400'
                        : landlordOutcome === 'in_progress' ? 'border-amber-400 dark:border-amber-500 text-amber-600 dark:text-amber-400'
                        : 'border-purple-400 dark:border-purple-500 text-purple-600 dark:text-purple-400'
                      }`}
                    >
                      {closingTicket ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          {displayStage || 'Landlord Managing'}
                          <span className="opacity-40">·</span>
                          <span className="text-xs">Close</span>
                          <XCircle className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  ) : isCompleted ? (
                    <button
                      onClick={handleCloseTicket}
                      disabled={closingTicket}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                        basic?.next_action_reason === 'completed' ? 'border-green-400 dark:border-green-500 text-green-600 dark:text-green-400'
                        : 'border-red-400 dark:border-red-500 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {closingTicket ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          {displayStage || 'Completed'}
                          <span className="opacity-40">·</span>
                          <span className="text-xs">Close</span>
                          <XCircle className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  ) : (
                    displayStage && <StatusBadge status={displayStage} size="md" />
                  )}
                  {basic?.reschedule_requested && basic?.reschedule_status === 'pending' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400 dark:border-amber-500 px-2.5 py-1 text-sm font-medium text-amber-600 dark:text-amber-400">
                      <CalendarClock className="h-3.5 w-3.5" />
                      Reschedule Requested
                    </span>
                  )}
                  {context.priority && <StatusBadge status={context.priority} size="md" />}
                  {isHandoff && onReview && (
                    <InteractiveHoverButton
                      text="Review"
                      className="w-28 text-xs h-9"
                      onClick={onReview}
                    />
                  )}
                  {isOpen && (
                    <Button variant="ghost" size="sm" onClick={handleToggleHold}>
                      {isOnHold ? (
                        <><Play className="h-3.5 w-3.5 mr-1" />Resume</>
                      ) : (
                        <><Pause className="h-3.5 w-3.5 mr-1" />Hold</>
                      )}
                    </Button>
                  )}
                  {onArchive && !basic?.archived && (
                    <Button variant="ghost" size="sm" onClick={onArchive}>
                      <Archive className="h-3.5 w-3.5 mr-1" />
                      Archive
                    </Button>
                  )}
                </div>
              </div>
              {/* Row 2: Issue subtitle */}
              <p className="text-sm text-muted-foreground line-clamp-1">
                {context.issue_description || 'No description'}
              </p>
              {isOOH && (
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Handled out-of-hours — review the contact&apos;s response below, then mark as complete.
                </p>
              )}
            </div>
          ) : (
            <DialogTitle>Ticket</DialogTitle>
          )}
        </DialogHeader>

        {/* Body — fixed height, internal scroll per tab */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 pb-6">
          {loading ? (
            <div className="flex-1 space-y-4 pt-4 animate-pulse">
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
              {/* Handoff warning */}
              {isHandoff && (
                <div className="p-3 mt-2 mb-1 bg-red-500/10 dark:bg-red-500/15 rounded-lg border border-red-300 dark:border-red-500/30 flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-red-700 dark:text-red-300">Handoff — Needs Manual Review</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                        The AI couldn&apos;t complete this ticket automatically. Review the conversation and dispatch manually.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Double-quote warning */}
              {previouslyApprovedContractor && basic.contractor_id && (
                <div className="p-3 mt-2 mb-1 bg-red-500/10 dark:bg-red-500/15 rounded-lg border border-red-300 dark:border-red-500/30 flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-red-700 dark:text-red-300">Previous contractor already approved</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                        <span className="font-medium">{previouslyApprovedContractor}</span> was previously approved.
                        Cancel the previous arrangement before proceeding with a new contractor.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Tabs defaultValue={defaultTab || "overview"} className="flex-1 min-h-0 flex flex-col mt-3">
                <TabsList className="w-full justify-start flex-shrink-0 bg-transparent rounded-none border-b h-auto p-0 gap-0">
                  <TabsTrigger value="overview" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-xs">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Overview
                  </TabsTrigger>
                  {showConversationTab && (
                    <TabsTrigger value="conversation" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-xs">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Conversation
                    </TabsTrigger>
                  )}
                  {(hasDispatch || hasOutboundLog || ledger.length > 0) && (
                    <TabsTrigger value="dispatch" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-xs">
                      <Wrench className="h-3.5 w-3.5" />
                      Dispatch
                    </TabsTrigger>
                  )}
                  {hasCompletion && (
                    <TabsTrigger value="completion" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completion
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* All tab content scrolls within fixed container */}
                <TabsContent value="overview" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                  <TicketOverviewTab context={context} basic={basic} messages={messages} />
                </TabsContent>

                {showConversationTab && (
                  <TabsContent value="conversation" className="mt-4 flex-1 min-h-0 overflow-hidden">
                    {conversation ? (
                      <TicketConversationTab conversation={conversation} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground">
                        <div className="text-center">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No conversation linked to this ticket</p>
                          <p className="text-xs mt-1 opacity-60">Manual tickets don&apos;t have WhatsApp conversations</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                )}

                {(hasDispatch || hasOutboundLog || ledger.length > 0) && (
                  <TabsContent value="dispatch" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                    <TicketDispatchTab messages={messages} outboundLog={outboundLog} ticketId={ticketId || undefined} onRedispatched={onClose} nextActionReason={basic?.next_action_reason} onActionTaken={() => { refetch(); onTicketUpdated?.() }} oohSubmissions={basic?.ooh_submissions} landlordSubmissions={basic?.landlord_submissions} landlordAllocated={basic?.landlord_allocated} landlordName={context?.landlord_name} landlordPhone={context?.landlord_phone} />
                  </TabsContent>
                )}

                {hasCompletion && completion && (
                  <TabsContent value="completion" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                    <TicketCompletionTab completion={completion} />
                  </TabsContent>
                )}
              </Tabs>
            </div>
          ) : (
            <div className="text-center flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm">No ticket selected</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
