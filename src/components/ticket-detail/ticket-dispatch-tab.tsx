'use client'

import { useState } from 'react'
import { ChatHistory } from '@/components/chat-message'
import { Wrench, User, Building2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import type { MessageData } from '@/hooks/use-ticket-detail'
import {
  getContractors,
  getRecipient,
  getContractorStatus,
  getRecipientStatus,
  getContractorMessages,
  getRecipientMessages,
  formatAmount,
} from '@/hooks/use-ticket-detail'

interface TicketDispatchTabProps {
  messages: MessageData
}

export function TicketDispatchTab({ messages }: TicketDispatchTabProps) {
  const [openContractors, setOpenContractors] = useState<number[]>([])
  const [openManager, setOpenManager] = useState(false)
  const [openLandlord, setOpenLandlord] = useState(false)

  const contractors = getContractors(messages.contractors)
  const managerRecipient = getRecipient(messages.manager)
  const landlordRecipient = getRecipient(messages.landlord)
  const hasManager = !!managerRecipient?.last_outbound_body || !!managerRecipient?.replied_at
  const hasLandlord = !!landlordRecipient?.last_outbound_body || !!landlordRecipient?.replied_at

  const toggleContractor = (index: number) => {
    setOpenContractors(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  // Multi-contractor warning
  const contactedCount = contractors.filter(c => c.sent_at || c.replied_at).length
  const approvedCount = contractors.filter(c => c.manager_decision === 'approved').length
  const quotedCount = contractors.filter(c => c.replied_at && c.quote_amount).length

  // Get approved contractor name (for manager/landlord reference)
  const getReferencedContractorName = (): string | null => {
    const approved = contractors.find(c => c.manager_decision === 'approved')
    if (approved) return approved.name
    const quoted = contractors.find(c => c.quote_amount)
    if (quoted) return quoted.name
    return null
  }

  const contractorRef = getReferencedContractorName()

  return (
    <div className="space-y-4">
      {/* Multi-contractor warning banner */}
      {contactedCount > 1 && approvedCount === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border">
          <AlertTriangle className="h-4 w-4 text-foreground/70 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">
              {contactedCount} contractors contacted
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              {quotedCount > 0
                ? `${quotedCount} quote${quotedCount > 1 ? 's' : ''} received. Approve only one to proceed.`
                : 'Awaiting quotes. Only one can be approved.'}
            </p>
          </div>
        </div>
      )}

      {/* Contractors */}
      {contractors.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Contractors</p>
          <div className="space-y-2">
            {contractors.map((contractor, index) => {
              const status = getContractorStatus(contractor)
              const isOpen = openContractors.includes(index)

              return (
                <div key={contractor.id || index} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleContractor(index)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <div className="text-left">
                        <p className="text-sm font-medium">{contractor.name}</p>
                        {contractor.category && (
                          <p className="text-xs text-muted-foreground">{contractor.category}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        status === 'approved' ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
                        status === 'replied' ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-400' :
                        status === 'sent' ? 'bg-yellow-500/10 dark:bg-yellow-400/15 text-yellow-700 dark:text-yellow-400' :
                        'bg-gray-500/10 dark:bg-gray-400/15 text-gray-600 dark:text-gray-400'
                      }`}>
                        {status === 'approved' ? `Approved ${formatAmount(contractor.quote_amount) || ''}`.trim() :
                         status === 'replied' ? `${formatAmount(contractor.quote_amount) || 'Quoted'}` :
                         status === 'sent' ? 'Sent' : 'Pending'}
                      </span>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 max-h-[200px] overflow-y-auto border-t bg-muted/30">
                      <div className="pt-2">
                        <ChatHistory
                          messages={getContractorMessages([contractor])}
                          allowHtmlForAssistant={true}
                          compact={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Manager */}
      {hasManager && (() => {
        const approved = managerRecipient?.approval === true
        const declined = managerRecipient?.approval === false
        const hasReplied = !!managerRecipient?.replied_at

        return (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Manager</p>
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenManager(!openManager)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Manager</p>
                    {contractorRef && (
                      <p className="text-xs text-muted-foreground">Re: {contractorRef}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    approved ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
                    declined ? 'bg-red-500/10 dark:bg-red-400/15 text-red-700 dark:text-red-400' :
                    hasReplied ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-400' :
                    'bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400'
                  }`}>
                    {approved ? `Approved${managerRecipient?.approval_amount ? ` ${managerRecipient.approval_amount}` : ''}` :
                     declined ? 'Declined' :
                     hasReplied ? 'Replied' : 'Pending'}
                  </span>
                  {openManager ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {openManager && (
                <div className="px-3 pb-3 max-h-[180px] overflow-y-auto border-t bg-muted/30">
                  <div className="pt-2">
                    <ChatHistory
                      messages={getRecipientMessages(managerRecipient, 'Manager')}
                      allowHtmlForAssistant={true}
                      compact={true}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Landlord */}
      {hasLandlord && (() => {
        const approved = landlordRecipient?.approval === true
        const declined = landlordRecipient?.approval === false
        const hasReplied = !!landlordRecipient?.replied_at

        return (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Landlord</p>
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenLandlord(!openLandlord)}
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Landlord</p>
                    {contractorRef && (
                      <p className="text-xs text-muted-foreground">Re: {contractorRef}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    approved ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
                    declined ? 'bg-red-500/10 dark:bg-red-400/15 text-red-700 dark:text-red-400' :
                    hasReplied ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-400' :
                    'bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400'
                  }`}>
                    {approved ? `Approved${landlordRecipient?.approval_amount ? ` ${landlordRecipient.approval_amount}` : ''}` :
                     declined ? 'Declined' :
                     hasReplied ? 'Replied' : 'Pending'}
                  </span>
                  {openLandlord ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {openLandlord && (
                <div className="px-3 pb-3 max-h-[180px] overflow-y-auto border-t bg-muted/30">
                  <div className="pt-2">
                    <ChatHistory
                      messages={getRecipientMessages(landlordRecipient, 'Landlord')}
                      allowHtmlForAssistant={true}
                      compact={true}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Empty state */}
      {contractors.length === 0 && !hasManager && !hasLandlord && (
        <p className="text-sm text-muted-foreground text-center py-4">No messages sent yet</p>
      )}
    </div>
  )
}
