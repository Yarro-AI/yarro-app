'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import {
  DetailDrawer,
  DetailSection,
  DetailGrid,
  DetailDivider,
} from '@/components/detail-drawer'
import { ChatHistory } from '@/components/chat-message'
import { StatusBadge } from '@/components/status-badge'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { format } from 'date-fns'
import Link from 'next/link'
import { Building2, Phone, User, Ticket } from 'lucide-react'
import type { Json } from '@/types/database'

interface LogEntry {
  role?: string
  direction?: 'in' | 'out'
  text?: string
  content?: string
  message?: string
  timestamp?: string
  label?: string
}

interface Conversation {
  id: string
  phone: string
  status: string
  stage: string | null
  caller_name: string | null
  caller_role: string | null
  handoff: boolean | null
  created_at: string
  last_updated: string
  log: Json
  property_id: string | null
  tenant_id: string | null
  address?: string
}

interface RelatedTicket {
  id: string
  issue_description: string | null
}

export default function ConversationsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [relatedTicket, setRelatedTicket] = useState<RelatedTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange())
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  useEffect(() => {
    if (!propertyManager) return
    fetchConversations()
  }, [propertyManager, dateRange])

  useEffect(() => {
    if (selectedId && conversations.length > 0) {
      const conversation = conversations.find((c) => c.id === selectedId)
      if (conversation) {
        setSelectedConversation(conversation)
        setDrawerOpen(true)
        fetchRelatedTicket(selectedId)
      }
    }
  }, [selectedId, conversations])

  const fetchRelatedTicket = async (conversationId: string) => {
    const { data } = await supabase
      .from('c1_tickets')
      .select('id, issue_description')
      .eq('conversation_id', conversationId)
      .single()

    setRelatedTicket(data || null)
  }

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from('c1_conversations')
      .select(`
        *,
        c1_properties(address)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('last_updated', dateRange.from.toISOString())
      .lte('last_updated', dateRange.to.toISOString())
      .order('last_updated', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching conversations:', error)
    }

    if (data) {
      const mapped = data.map((c) => ({
        ...c,
        address: (c.c1_properties as unknown as { address: string } | null)?.address,
      }))
      setConversations(mapped)
    }
    setLoading(false)
  }

  const handleRowClick = (conversation: Conversation) => {
    router.push(`/conversations?id=${conversation.id}`)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    router.push('/conversations')
    setSelectedConversation(null)
    setRelatedTicket(null)
  }

  const formatDate = (date: string) => {
    return format(new Date(date), 'dd MMM, HH:mm')
  }

  const formatPhone = (phone: string) => {
    // Format UK numbers nicely
    if (phone.startsWith('+44')) {
      return phone.replace(/^\+44(\d{4})(\d{6})$/, '+44 $1 $2')
    }
    return phone
  }

  const getLogEntries = (log: Json): { role: string; text: string; timestamp?: string }[] => {
    if (!log) return []

    // Handle array of log entries
    if (Array.isArray(log)) {
      return (log as unknown as LogEntry[])
        .filter(entry => {
          // Skip status labels like "FINISHED"
          if (entry.label) return false
          // Must have some text content
          return entry && (entry.text || entry.content || entry.message)
        })
        .map(entry => {
          // Map direction to role: 'in' = tenant, 'out' = assistant
          let role = entry.role || 'system'
          if (entry.direction === 'in') role = 'tenant'
          if (entry.direction === 'out') role = 'assistant'

          return {
            role,
            text: entry.text || entry.content || entry.message || '',
            timestamp: entry.timestamp,
          }
        })
    }

    // Handle object with nested structure (e.g., { messages: [...] })
    if (typeof log === 'object') {
      const obj = log as Record<string, unknown>
      if (Array.isArray(obj.messages)) {
        return getLogEntries(obj.messages as Json)
      }
      if (Array.isArray(obj.log)) {
        return getLogEntries(obj.log as Json)
      }
    }

    return []
  }

  const columns: Column<Conversation>[] = [
    {
      key: 'last_updated',
      header: 'Date',
      sortable: true,
      width: '100px',
      render: (c) => (
        <span className="text-muted-foreground text-sm">
          {c.last_updated ? format(new Date(c.last_updated), 'dd MMM') : '-'}
        </span>
      ),
      getValue: (c) => c.last_updated ? new Date(c.last_updated).getTime() : 0,
    },
    {
      key: 'phone',
      header: 'Phone',
      sortable: true,
      render: (c) => (
        <span className="font-mono text-sm">{formatPhone(c.phone)}</span>
      ),
    },
    {
      key: 'caller_name',
      header: 'Caller',
      sortable: true,
      render: (c) => (
        <div>
          <p className="font-medium">{c.caller_name || 'Unknown'}</p>
          {c.caller_role && (
            <p className="text-xs text-muted-foreground capitalize">{c.caller_role}</p>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Property',
      sortable: true,
      width: '25%',
      render: (c) => (
        <span className="truncate block max-w-xs">{c.address || '-'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-1">
          <StatusBadge status={c.status} />
          {c.handoff && <StatusBadge status="handoff" />}
        </div>
      ),
    },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-muted-foreground mt-1">
            WhatsApp conversations with tenants and contractors
          </p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Data Table */}
      <DataTable
        data={conversations}
        columns={columns}
        searchPlaceholder="Search by phone or name..."
        searchKeys={['phone', 'caller_name', 'address']}
        onRowClick={handleRowClick}
        onViewClick={handleRowClick}
        getRowId={(c) => c.id || ''}
        emptyMessage="No conversations found"
        loading={loading}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title="Conversation"
        subtitle={selectedConversation ? formatPhone(selectedConversation.phone) : undefined}
        width="wide"
      >
        {selectedConversation && (
          <div className="flex flex-col h-[calc(100vh-140px)]">
            {/* Fixed top section - compact */}
            <div className="flex-shrink-0 space-y-4">
              {/* Status badge - ONLY show status, not stage */}
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={selectedConversation.status} size="md" />
                {selectedConversation.handoff && (
                  <StatusBadge status="handoff" size="md" />
                )}
              </div>

              {/* Related Ticket - at top */}
              {relatedTicket && (
                <DetailSection title="Related">
                  <Link
                    href={`/tickets?id=${relatedTicket.id}`}
                    className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Ticket className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{relatedTicket.issue_description || 'View ticket'}</p>
                    </div>
                  </Link>
                </DetailSection>
              )}

              {/* Info - compact */}
              <DetailGrid columns={2}>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-mono text-sm">{formatPhone(selectedConversation.phone)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Caller</p>
                    <p className="text-sm font-medium">
                      {selectedConversation.caller_name || 'Unknown'}
                      {selectedConversation.caller_role && (
                        <span className="text-muted-foreground font-normal text-xs">
                          {' '}({selectedConversation.caller_role})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </DetailGrid>

              {/* Property - compact */}
              {selectedConversation.property_id && (
                <Link
                  href={`/properties?id=${selectedConversation.property_id}`}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  onClick={handleCloseDrawer}
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedConversation.address}</p>
                    <p className="text-xs text-primary">View property</p>
                  </div>
                </Link>
              )}

              <DetailDivider />
            </div>

            {/* Message Log - takes remaining space (bottom half) */}
            <div className="flex-1 min-h-0 mt-2 flex flex-col">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Messages</p>
              <div className="bg-muted/30 rounded-xl p-3 flex-1 overflow-y-auto">
                <ChatHistory messages={getLogEntries(selectedConversation.log)} />
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
