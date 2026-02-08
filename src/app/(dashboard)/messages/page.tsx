'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import {
  DetailDrawer,
  DetailSection,
  DetailDivider,
} from '@/components/detail-drawer'
import { ChatHistory } from '@/components/chat-message'
import { StatusBadge } from '@/components/status-badge'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import Link from 'next/link'
import { Ticket, User, Building2, Wrench, MessageSquare, CheckCircle, XCircle, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import type { Json } from '@/types/database'

interface ContractorEntry {
  id: string
  name: string
  phone?: string
  body?: string
  status?: string
  sent_at?: string
  replied_at?: string
  reply_text?: string
  quote_amount?: string
  manager_decision?: string
  category?: string
}

interface RecipientEntry {
  name?: string
  phone?: string
  approval?: boolean
  last_text?: string
  replied_at?: string
  last_outbound_body?: string
  review_request_sent_at?: string
  approval_amount?: string
}

interface Message {
  ticket_id: string
  stage: string | null
  contractors: Json | null
  landlord: Json | null
  manager: Json | null
  created_at: string | null
  updated_at: string | null
  // Joined data
  issue_description?: string
  address?: string
  job_stage?: string
}

export default function MessagesPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openContractors, setOpenContractors] = useState<number[]>([])
  const [openManager, setOpenManager] = useState(false)
  const [openLandlord, setOpenLandlord] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange())
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  useEffect(() => {
    if (!propertyManager) return
    fetchMessages()
  }, [propertyManager, dateRange])

  useEffect(() => {
    if (selectedId && messages.length > 0) {
      const message = messages.find((m) => m.ticket_id === selectedId)
      if (message) {
        setSelectedMessage(message)
        setDrawerOpen(true)
      }
    }
  }, [selectedId, messages])

  // Reset expand states when message changes
  useEffect(() => {
    setOpenContractors([])
    setOpenManager(false)
    setOpenLandlord(false)
  }, [selectedMessage])

  const toggleContractor = (index: number) => {
    setOpenContractors(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  const fetchMessages = async () => {
    const { data } = await supabase
      .from('c1_messages')
      .select(`
        *,
        c1_tickets(issue_description, job_stage, property_manager_id, c1_properties(address))
      `)
      .or('archived.is.null,archived.eq.false')
      .gte('updated_at', dateRange.from.toISOString())
      .lte('updated_at', dateRange.to.toISOString())
      .order('updated_at', { ascending: false })
      .limit(200)

    if (data) {
      const filtered = data.filter(
        (m) => (m.c1_tickets as unknown as { property_manager_id: string } | null)?.property_manager_id === propertyManager!.id
      )
      const mapped = filtered.map((m) => ({
        ...m,
        issue_description: (m.c1_tickets as unknown as { issue_description: string } | null)?.issue_description,
        job_stage: (m.c1_tickets as unknown as { job_stage: string } | null)?.job_stage,
        address: (m.c1_tickets as unknown as { c1_properties: { address: string } | null } | null)?.c1_properties?.address,
      }))
      setMessages(mapped)
    }
    setLoading(false)
  }

  const handleRowClick = (message: Message) => {
    router.push(`/messages?id=${message.ticket_id}`)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    router.push('/messages')
    setSelectedMessage(null)
  }

  // Get contractors array
  const getContractors = (json: Json | null): ContractorEntry[] => {
    if (!json) return []
    if (Array.isArray(json)) return json as unknown as ContractorEntry[]
    return []
  }

  // Get recipient (landlord/manager) entry
  const getRecipient = (json: Json | null): RecipientEntry | null => {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    return json as unknown as RecipientEntry
  }

  const hasContractorData = (json: Json | null): boolean => {
    const contractors = getContractors(json)
    return contractors.length > 0
  }

  const hasRecipientData = (json: Json | null): boolean => {
    const entry = getRecipient(json)
    return !!entry?.last_outbound_body || !!entry?.replied_at
  }

  const getContractorStatus = (contractor: ContractorEntry): 'sent' | 'replied' | 'approved' | 'pending' => {
    if (contractor.manager_decision === 'approved') return 'approved'
    if (contractor.replied_at) return 'replied'
    if (contractor.sent_at) return 'sent'
    return 'pending'
  }

  const getRecipientStatus = (json: Json | null): 'sent' | 'replied' | 'pending' | 'none' => {
    const entry = getRecipient(json)
    if (!entry) return 'none'
    if (entry.replied_at) return 'replied'
    if (entry.review_request_sent_at) return 'sent'
    return 'pending'
  }

  // Get the approved contractor name (or first quoted contractor if none approved)
  const getReferencedContractorName = (message: Message): string | null => {
    const contractors = getContractors(message.contractors)
    // First try to find an approved contractor
    const approved = contractors.find(c => c.manager_decision === 'approved')
    if (approved) return approved.name
    // Otherwise, find the first contractor with a quote
    const quoted = contractors.find(c => c.quote_amount)
    if (quoted) return quoted.name
    return null
  }

  // Get the highest quote amount from contractors
  const getApprovedQuoteAmount = (message: Message): string | null => {
    const contractors = getContractors(message.contractors)
    const approved = contractors.find(c => c.manager_decision === 'approved')
    if (approved?.quote_amount) return approved.quote_amount
    return null
  }

  // Ensure amount always has exactly one £ symbol
  const formatAmount = (amount: string | undefined): string => {
    if (!amount) return ''
    // If already has £, return as is; otherwise add it
    return amount.startsWith('£') ? amount : `£${amount}`
  }

  const columns: Column<Message>[] = [
    {
      key: 'created_at',
      header: 'Date',
      sortable: true,
      width: '80px',
      render: (m) => (
        <span className="text-muted-foreground text-sm">
          {m.created_at ? format(new Date(m.created_at), 'dd MMM') : '-'}
        </span>
      ),
      getValue: (m) => m.created_at ? new Date(m.created_at).getTime() : 0,
    },
    {
      key: 'issue_description',
      header: 'Ticket',
      sortable: true,
      width: '180px',
      render: (m) => (
        <p className="font-medium truncate max-w-[160px]">{m.issue_description || 'No description'}</p>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      sortable: true,
      width: '120px',
      render: (m) => {
        if (!m.job_stage) return '-'
        const stage = m.job_stage.toLowerCase()
        const isGreen = stage === 'closed' || stage === 'completed'
        const isTeal = stage === 'booked' || stage === 'scheduled'
        const isOrange = stage === 'created'
        // Title case: "created" → "Created", "closed" → "Closed"
        const label = m.job_stage.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        if (isGreen || isTeal || isOrange) {
          return (
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              isGreen ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
              isTeal ? 'bg-teal-500/10 dark:bg-teal-400/15 text-teal-700 dark:text-teal-400' :
              'bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400'
            }`}>
              {label}
            </span>
          )
        }
        return <StatusBadge status={m.job_stage} />
      },
    },
    {
      key: 'contractors',
      header: 'Contractors',
      width: '140px',
      render: (m) => {
        const contractors = getContractors(m.contractors)
        if (contractors.length === 0) return <span className="text-muted-foreground text-sm">-</span>
        const sent = contractors.filter(c => c.sent_at).length
        const replied = contractors.filter(c => c.replied_at).length
        const approved = contractors.filter(c => c.manager_decision === 'approved').length
        const notSent = contractors.length - sent
        return (
          <div className="flex items-center gap-1">
            {approved > 0 ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400">{approved} Approved</span>
            ) : replied > 0 ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-400">{replied}/{sent} Quoted</span>
            ) : sent > 0 ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400">{sent} Sent</span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-500/10 dark:bg-gray-400/15 text-gray-600 dark:text-gray-400">{notSent} Not Sent</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'manager',
      header: 'Manager',
      width: '100px',
      render: (m) => {
        const status = getRecipientStatus(m.manager)
        if (status === 'none') return <span className="text-muted-foreground text-sm">-</span>
        const recipient = getRecipient(m.manager)
        const approved = status === 'replied' && recipient?.approval
        const declined = status === 'replied' && !recipient?.approval
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            approved ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
            declined ? 'bg-red-500/10 dark:bg-red-400/15 text-red-700 dark:text-red-400' :
            'bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400'
          }`}>
            {approved ? 'Approved' : declined ? 'Declined' : 'Pending'}
          </span>
        )
      },
    },
    {
      key: 'landlord',
      header: 'Landlord',
      width: '100px',
      render: (m) => {
        const status = getRecipientStatus(m.landlord)
        if (status === 'none') return <span className="text-muted-foreground text-sm">-</span>
        const recipient = getRecipient(m.landlord)
        const approved = status === 'replied' && recipient?.approval
        const declined = status === 'replied' && !recipient?.approval
        return (
          <span className={`px-2 py-0.5 text-xs rounded-full ${
            approved ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
            declined ? 'bg-red-500/10 dark:bg-red-400/15 text-red-700 dark:text-red-400' :
            'bg-orange-500/10 dark:bg-orange-400/15 text-orange-700 dark:text-orange-400'
          }`}>
            {approved ? 'Approved' : declined ? 'Declined' : 'Pending'}
          </span>
        )
      },
    },
  ]

  // Convert contractor data to chat messages format
  const getContractorMessages = (contractors: ContractorEntry[]) => {
    const messages: { role: string; text: string; timestamp?: string; allowHtml?: boolean; meta?: { quote?: string; approved?: boolean } }[] = []

    contractors.forEach(contractor => {
      const status = getContractorStatus(contractor)

      // Outbound message (our quote request) - HTML formatted
      if (contractor.body) {
        messages.push({
          role: 'assistant',
          text: `<strong>${contractor.name}</strong>${contractor.category ? ` <span style="opacity:0.7">(${contractor.category})</span>` : ''}<br/><br/>${contractor.body}`,
          timestamp: contractor.sent_at,
          allowHtml: true,
        })
      }

      // Their reply - exact text only, metadata shown separately
      if (contractor.reply_text) {
        messages.push({
          role: 'tenant',
          text: contractor.reply_text,
          timestamp: contractor.replied_at,
          meta: contractor.quote_amount ? {
            quote: formatAmount(contractor.quote_amount),
            approved: status === 'approved',
          } : undefined,
        })
      }
    })

    return messages
  }

  // Convert recipient (manager/landlord) data to chat messages format
  const getRecipientMessages = (entry: RecipientEntry | null, title: string) => {
    if (!entry) return []

    const messages: { role: string; text: string; timestamp?: string; allowHtml?: boolean; meta?: { approved?: boolean; amount?: string } }[] = []

    // Outbound approval request - HTML formatted
    if (entry.last_outbound_body) {
      messages.push({
        role: 'assistant',
        text: `<strong>To ${title}</strong>${entry.name ? ` <span style="opacity:0.7">(${entry.name})</span>` : ''}<br/><br/>${entry.last_outbound_body}`,
        timestamp: entry.review_request_sent_at,
        allowHtml: true,
      })
    }

    // Their reply - exact text only, approval status shown separately
    if (entry.last_text) {
      messages.push({
        role: 'tenant',
        text: entry.last_text,
        timestamp: entry.replied_at,
        meta: {
          approved: entry.approval,
          amount: entry.approval_amount,
        },
      })
    }

    return messages
  }

  return (
    <div className="p-8 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Messages</h1>
          <p className="text-muted-foreground mt-1">
            Quotes, approvals and job coordination
          </p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Data Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={messages}
          columns={columns}
          searchPlaceholder="Search messages..."
          searchKeys={['issue_description', 'address']}
          onRowClick={handleRowClick}
          onViewClick={handleRowClick}
          getRowId={(m) => m.ticket_id}
          emptyMessage="No messages found"
          loading={loading}
          fillHeight
        />
      </div>

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title="Message Details"
        subtitle={selectedMessage?.address}
        width="wide"
      >
        {selectedMessage && (
          <div className="space-y-3">
            {/* Stage + Ticket link - compact header */}
            <div className="flex items-center gap-2">
              {selectedMessage.job_stage && <StatusBadge status={selectedMessage.job_stage} size="md" />}
              <Link
                href={`/tickets?id=${selectedMessage.ticket_id}`}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline ml-auto"
                onClick={handleCloseDrawer}
              >
                <Ticket className="h-3 w-3" />
                View ticket
              </Link>
            </div>

            <DetailDivider />

            {/* Multi-contractor warning banner */}
            {(() => {
              const contractors = getContractors(selectedMessage.contractors)
              const contactedCount = contractors.filter(c => c.sent_at || c.replied_at).length
              const approvedCount = contractors.filter(c => c.manager_decision === 'approved').length
              const quotedCount = contractors.filter(c => c.replied_at && c.quote_amount).length

              if (contactedCount > 1 && approvedCount === 0) {
                return (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-300">
                        {contactedCount} contractors contacted
                      </p>
                      <p className="text-amber-600/80 dark:text-amber-400/80 text-xs mt-0.5">
                        {quotedCount > 0
                          ? `${quotedCount} quote${quotedCount > 1 ? 's' : ''} received. Approve only one to proceed.`
                          : 'Awaiting quotes. Only one can be approved.'}
                      </p>
                    </div>
                  </div>
                )
              }
              return null
            })()}

            {/* Contractors - Each has own collapsible summary card */}
            {hasContractorData(selectedMessage.contractors) && (
              <DetailSection title="Contractors">
                <div className="space-y-2">
                  {getContractors(selectedMessage.contractors).map((contractor, index) => {
                    const status = getContractorStatus(contractor)
                    const isOpen = openContractors.includes(index)

                    return (
                      <div key={contractor.id || index} className="border rounded-lg overflow-hidden">
                        {/* Summary header - always visible */}
                        <button
                          onClick={() => toggleContractor(index)}
                          className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors"
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
                            {/* Status badge with quote amount */}
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              status === 'approved' ? 'bg-green-500/10 dark:bg-green-400/15 text-green-700 dark:text-green-400' :
                              status === 'replied' ? 'bg-blue-500/10 dark:bg-blue-400/15 text-blue-700 dark:text-blue-400' :
                              status === 'sent' ? 'bg-yellow-500/10 dark:bg-yellow-400/15 text-yellow-700 dark:text-yellow-400' :
                              'bg-gray-500/10 dark:bg-gray-400/15 text-gray-600 dark:text-gray-400'
                            }`}>
                              {status === 'approved' ? `✓ ${formatAmount(contractor.quote_amount) || 'Approved'}` :
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

                        {/* Expandable thread */}
                        {isOpen && (
                          <div className="px-3 pb-3 max-h-[180px] overflow-y-auto border-t bg-muted/20">
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
              </DetailSection>
            )}

            {/* Manager - Collapsible with contractor reference */}
            {hasRecipientData(selectedMessage.manager) && (() => {
              const recipient = getRecipient(selectedMessage.manager)
              const contractorRef = getReferencedContractorName(selectedMessage)
              const approved = recipient?.approval === true
              const declined = recipient?.approval === false
              const hasReplied = !!recipient?.replied_at

              return (
                <>
                  <DetailDivider />
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setOpenManager(!openManager)}
                      className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors"
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
                          {approved ? `✓ Approved${recipient?.approval_amount ? ` ${recipient.approval_amount}` : ''}` :
                           declined ? '✗ Declined' :
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
                      <div className="px-3 pb-3 max-h-[150px] overflow-y-auto border-t bg-muted/20">
                        <div className="pt-2">
                          <ChatHistory
                            messages={getRecipientMessages(recipient, 'Manager')}
                            allowHtmlForAssistant={true}
                            compact={true}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}

            {/* Landlord - Collapsible with contractor reference */}
            {hasRecipientData(selectedMessage.landlord) && (() => {
              const recipient = getRecipient(selectedMessage.landlord)
              const contractorRef = getReferencedContractorName(selectedMessage)
              const approved = recipient?.approval === true
              const declined = recipient?.approval === false
              const hasReplied = !!recipient?.replied_at

              return (
                <>
                  <DetailDivider />
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setOpenLandlord(!openLandlord)}
                      className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors"
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
                          {approved ? `✓ Approved${recipient?.approval_amount ? ` ${recipient.approval_amount}` : ''}` :
                           declined ? '✗ Declined' :
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
                      <div className="px-3 pb-3 max-h-[150px] overflow-y-auto border-t bg-muted/20">
                        <div className="pt-2">
                          <ChatHistory
                            messages={getRecipientMessages(recipient, 'Landlord')}
                            allowHtmlForAssistant={true}
                            compact={true}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}

            {/* No messages */}
            {!hasRecipientData(selectedMessage.landlord) && !hasRecipientData(selectedMessage.manager) && !hasContractorData(selectedMessage.contractors) && (
              <p className="text-sm text-muted-foreground text-center py-4">No messages sent yet</p>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
