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
import { Archive, AlertTriangle, Loader2, MessageSquare, Wrench, CheckCircle2, LayoutDashboard } from 'lucide-react'
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
}

export function TicketDetailModal({
  ticketId,
  open,
  onClose,
  onArchive,
  onReview,
}: TicketDetailModalProps) {
  const {
    context,
    basic,
    conversation,
    messages,
    completion,
    loading,
    error,
    hasConversation,
    hasDispatch,
    hasCompletion,
    previouslyApprovedContractor,
    displayStage,
  } = useTicketDetail(open ? ticketId : null)

  const isHandoff = context?.handoff && basic?.status === 'open'
  // Show conversation tab if we have data OR if there's a conversation_id (data might be loading)
  const showConversationTab = hasConversation || !!(context?.conversation_id || basic?.conversation_id)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent size="xl" className="h-[80vh]" hideCloseButton={false}>
        {/* Header — tightened padding */}
        <DialogHeader>
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <DialogTitle>Loading ticket...</DialogTitle>
            </div>
          ) : error ? (
            <DialogTitle className="text-destructive">Error loading ticket</DialogTitle>
          ) : context ? (
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                {/* Status badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {displayStage && <StatusBadge status={displayStage} size="md" />}
                  {context.priority && <StatusBadge status={context.priority} size="md" />}
                </div>
                {/* Address as title */}
                <DialogTitle className="truncate">
                  {context.property_address || 'Unknown Property'}
                </DialogTitle>
                {/* Issue as subtitle */}
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {context.issue_description || 'No description'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {isHandoff && onReview && (
                  <InteractiveHoverButton
                    text="Review"
                    className="w-28 text-xs h-9"
                    onClick={onReview}
                  />
                )}
                {onArchive && !basic?.archived && (
                  <Button variant="ghost" size="sm" onClick={onArchive}>
                    <Archive className="h-3.5 w-3.5 mr-1" />
                    Archive
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <DialogTitle>Ticket</DialogTitle>
          )}
        </DialogHeader>

        {/* Body — fixed height, internal scroll per tab */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center flex-1 flex items-center justify-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : context && basic ? (
            <>
              {/* Double-quote warning */}
              {previouslyApprovedContractor && basic.contractor_id && (
                <div className="p-3 mt-2 mb-3 bg-muted/50 rounded-lg border flex-shrink-0">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-foreground/70 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Previous contractor already approved</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium">{previouslyApprovedContractor}</span> was previously approved.
                        Cancel the previous arrangement before proceeding with a new contractor.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
                <TabsList className="w-full justify-start flex-shrink-0">
                  <TabsTrigger value="overview" className="gap-1.5">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Overview
                  </TabsTrigger>
                  {showConversationTab && (
                    <TabsTrigger value="conversation" className="gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Conversation
                    </TabsTrigger>
                  )}
                  {hasDispatch && (
                    <TabsTrigger value="dispatch" className="gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      Dispatch
                    </TabsTrigger>
                  )}
                  {hasCompletion && (
                    <TabsTrigger value="completion" className="gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Completion
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* All tab content scrolls within fixed container */}
                <TabsContent value="overview" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                  <TicketOverviewTab context={context} basic={basic} />
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

                {hasDispatch && messages && (
                  <TabsContent value="dispatch" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                    <TicketDispatchTab messages={messages} />
                  </TabsContent>
                )}

                {hasCompletion && completion && (
                  <TabsContent value="completion" className="mt-4 flex-1 min-h-0 overflow-y-auto">
                    <TicketCompletionTab completion={completion} />
                  </TabsContent>
                )}
              </Tabs>
            </>
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
