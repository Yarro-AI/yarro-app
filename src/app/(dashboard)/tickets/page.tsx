'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import {
  DetailDrawer,
  DetailSection,
  DetailDivider,
} from '@/components/detail-drawer'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { StatusBadge } from '@/components/status-badge'
import { TicketForm } from '@/components/ticket-form'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import Link from 'next/link'
import { Building2, Wrench, MessageSquare, Mail, Users, Plus, Ticket, CheckCircle2, AlertTriangle, Archive } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

interface Ticket {
  id: string
  issue_description: string | null
  status: string
  job_stage: string | null
  category: string | null
  priority: string | null
  date_logged: string
  scheduled_date: string | null
  contractor_quote: number | null
  final_amount: number | null
  availability: string | null
  access: string | null
  handoff: boolean | null
  is_manual: boolean | null
  verified_by: string | null
  property_id: string | null
  tenant_id: string | null
  contractor_id: string | null
  conversation_id: string | null
  archived: boolean | null
  address?: string
  tenant_name?: string
  contractor_name?: string
}

type TicketFilter = 'all' | 'system' | 'handoff' | 'manual'

interface TicketDetail {
  ticket_id: string
  issue_description: string
  ticket_status: string
  job_stage: string
  category: string
  priority: string
  date_logged: string
  property_address: string
  property_id: string
  tenant_name: string
  tenant_phone: string
  tenant_email: string
  landlord_name: string
  landlord_phone: string
  manager_name: string
  availability: string
  access: string
  handoff: boolean
  auto_approve_limit: number
}

export default function TicketsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null)
  const [selectedTicketBasic, setSelectedTicketBasic] = useState<Ticket | null>(null)
  const [hasMessage, setHasMessage] = useState(false)
  const [hasCompletion, setHasCompletion] = useState(false)
  const [previouslyApprovedContractor, setPreviouslyApprovedContractor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<TicketFilter>('all')
  const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange())
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const supabase = createClient()

  const selectedId = searchParams.get('id')
  const action = searchParams.get('action')

  useEffect(() => {
    if (!propertyManager) return
    fetchTickets()
  }, [propertyManager, dateRange, showArchived])

  useEffect(() => {
    if (selectedId && tickets.length > 0) {
      const basicTicket = tickets.find((t) => t.id === selectedId)
      if (basicTicket) {
        setSelectedTicketBasic(basicTicket)
        // Auto-open complete drawer if action=complete and ticket is handoff
        if (action === 'complete' && basicTicket.handoff && basicTicket.status === 'open') {
          setHandoffTicketId(basicTicket.id)
          setCreateDrawerOpen(true)
          // Clear the action param from URL
          router.replace(`/tickets?id=${selectedId}`)
          return
        }
      }
      fetchTicketDetail(selectedId)
      setDrawerOpen(true)
    }
  }, [selectedId, tickets, action])

  const fetchTickets = async () => {
    let query = supabase
      .from('c1_tickets')
      .select(`
        id,
        issue_description,
        status,
        job_stage,
        category,
        priority,
        date_logged,
        scheduled_date,
        contractor_quote,
        final_amount,
        availability,
        access,
        handoff,
        is_manual,
        verified_by,
        property_id,
        tenant_id,
        contractor_id,
        conversation_id,
        archived,
        images,
        c1_properties(address),
        c1_tenants(full_name),
        c1_contractors(contractor_name)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.to.toISOString())
      .order('date_logged', { ascending: false })

    // Filter out archived unless showing archived
    if (!showArchived) {
      query = query.or('archived.is.null,archived.eq.false')
    }

    const { data } = await query

    if (data) {
      const mapped = data.map((t) => ({
        ...t,
        address: (t.c1_properties as unknown as { address: string } | null)?.address,
        tenant_name: (t.c1_tenants as unknown as { full_name: string } | null)?.full_name,
        contractor_name: (t.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
      }))
      setTickets(mapped)
    }
    setLoading(false)
  }

  const fetchTicketDetail = async (ticketId: string) => {
    const [ticketRes, messageRes, completionRes] = await Promise.all([
      supabase.rpc('c1_ticket_context', { ticket_uuid: ticketId }),
      supabase.from('c1_messages').select('ticket_id, contractors').eq('ticket_id', ticketId).single(),
      supabase.from('c1_completions').select('id').eq('ticket_id', ticketId).single(),
    ])

    if (ticketRes.data && ticketRes.data.length > 0) {
      setSelectedTicket(ticketRes.data[0])
    }
    setHasMessage(!!messageRes.data)
    setHasCompletion(!!completionRes.data)

    // Check for previously approved contractor (double-quote warning)
    if (messageRes.data?.contractors) {
      const contractors = messageRes.data.contractors as Array<{ name?: string; manager_decision?: string }>
      const approved = contractors.find((c) => c.manager_decision === 'approved')
      setPreviouslyApprovedContractor(approved?.name || null)
    } else {
      setPreviouslyApprovedContractor(null)
    }
  }

  const handleRowClick = (ticket: Ticket) => {
    router.push(`/tickets?id=${ticket.id}`)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    router.push('/tickets')
    setSelectedTicket(null)
    setSelectedTicketBasic(null)
  }

  const handleCloseCreateDrawer = () => {
    setCreateDrawerOpen(false)
    setHandoffTicketId(null)
    // Clean up URL so clicking the same ticket row works again
    if (selectedId) {
      router.push('/tickets')
      setSelectedTicket(null)
      setSelectedTicketBasic(null)
    }
  }

  const handleCreateTicket = async (data: {
    property_id: string
    tenant_id: string
    issue_description: string
    category: string
    priority: string
    contractor_ids: string[]
    availability: string
    access: string
    images?: string[]
  }) => {
    if (handoffTicketId) {
      // Complete handoff ticket via RPC - creates messages and triggers dispatcher
      const { error } = await supabase.rpc('c1_complete_handoff_ticket', {
        p_ticket_id: handoffTicketId,
        p_property_id: data.property_id,
        p_tenant_id: data.tenant_id,
        p_issue_description: data.issue_description,
        p_category: data.category,
        p_priority: data.priority,
        p_contractor_ids: data.contractor_ids,
        p_availability: data.availability || null,
        p_access: data.access || null,
      })

      if (error) {
        throw new Error(error.message)
      }

      toast.success('Handoff completed - contractor notified')
    } else {
      // Create new manual ticket via RPC
      // This creates the ticket, c1_messages row, and triggers the dispatcher
      const { data: ticketId, error } = await supabase.rpc('c1_create_manual_ticket', {
        p_property_manager_id: propertyManager!.id,
        p_property_id: data.property_id,
        p_tenant_id: data.tenant_id,
        p_issue_description: data.issue_description,
        p_category: data.category,
        p_priority: data.priority,
        p_contractor_ids: data.contractor_ids,
        p_availability: data.availability || null,
        p_access: data.access || null,
        p_images: data.images || [],
      })

      if (error) {
        throw new Error(error.message)
      }

      // Notify landlord about the new manual ticket
      try {
        await fetch('https://yarro.app.n8n.cloud/webhook/manual-ll-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id: ticketId }),
        })
      } catch (webhookErr) {
        console.error('Landlord notification webhook failed:', webhookErr)
        // Don't fail the whole operation if webhook fails
      }

      toast.success('Ticket created - contractor notified')
    }

    setCreateDrawerOpen(false)
    setHandoffTicketId(null)
    // Clean up URL after ticket creation/completion
    if (selectedId) {
      router.push('/tickets')
      setSelectedTicket(null)
      setSelectedTicketBasic(null)
    }
    fetchTickets()
  }

  const handleArchive = async () => {
    if (!selectedTicketBasic) return

    const archivedAt = new Date().toISOString()

    // Archive the ticket
    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt })
      .eq('id', selectedTicketBasic.id)

    if (ticketError) throw ticketError

    // Archive related messages
    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: archivedAt })
      .eq('ticket_id', selectedTicketBasic.id)

    // Archive related conversation (if exists)
    if (selectedTicketBasic.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: archivedAt })
        .eq('id', selectedTicketBasic.conversation_id)
    }

    toast.success('Ticket archived')
    setArchiveDialogOpen(false)
    handleCloseDrawer()
    await fetchTickets()
  }

  const formatDate = (date: string | null) => {
    if (!date) return '-'
    return format(new Date(date), 'dd MMM yyyy')
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return `£${amount.toFixed(2)}`
  }

  // Get row class based on status for subtle left border
  const getRowClassName = (ticket: Ticket) => {
    if (ticket.archived) {
      return 'border-l-2 border-l-gray-400 opacity-50'
    }
    const isClosed = ticket.status?.toLowerCase() === 'closed'
    if (isClosed) {
      return 'border-l-2 border-l-gray-300 opacity-60'
    }
    if (ticket.handoff) {
      return 'border-l-2 border-l-amber-500'
    }
    return 'border-l-2 border-l-blue-500'
  }

  const columns: Column<Ticket>[] = [
    {
      key: 'date_logged',
      header: 'Date',
      sortable: true,
      width: '90px',
      render: (ticket) => (
        <span className="text-muted-foreground text-sm">{format(new Date(ticket.date_logged), 'dd MMM')}</span>
      ),
      getValue: (ticket) => new Date(ticket.date_logged).getTime(),
    },
    {
      key: 'issue_description',
      header: 'Issue',
      sortable: true,
      width: '30%',
      render: (ticket) => (
        <div className="min-w-0">
          <p className="font-medium truncate">{ticket.issue_description || 'No description'}</p>
          <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (ticket) => ticket.category || '-',
    },
    {
      key: 'job_stage',
      header: 'Stage',
      sortable: true,
      render: (ticket) => ticket.job_stage ? <StatusBadge status={ticket.job_stage} /> : '-',
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (ticket) => ticket.priority ? <StatusBadge status={ticket.priority} /> : '-',
    },
    {
      key: 'actions',
      header: '',
      width: '80px',
      render: (ticket) => (
        ticket.handoff && ticket.status === 'open' ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedTicketBasic(ticket)
              setHandoffTicketId(ticket.id)
              setCreateDrawerOpen(true)
            }}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Review
          </Button>
        ) : null
      ),
    },
  ]

  const filteredTickets = tickets.filter((t) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'handoff') return t.handoff === true
    if (activeFilter === 'manual') return t.is_manual === true
    // System = automated WhatsApp tickets (not handoff, not manual)
    if (activeFilter === 'system') return !t.handoff && !t.is_manual
    return true
  })

  const filterCounts = {
    all: tickets.length,
    system: tickets.filter((t) => !t.handoff && !t.is_manual).length,
    handoff: tickets.filter((t) => t.handoff === true).length,
    manual: tickets.filter((t) => t.is_manual === true).length,
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tickets</h1>
          <p className="text-muted-foreground mt-1">
            Manage maintenance tickets across your properties
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilter value={dateRange} onChange={setDateRange} />
          <Button onClick={() => setCreateDrawerOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b">
        <div className="flex items-center gap-1">
          {(['all', 'system', 'handoff', 'manual'] as TicketFilter[]).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeFilter === filter
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter === 'system' ? 'Automated' : filter}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {filterCounts[filter]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <label htmlFor="show-archived" className="text-sm text-muted-foreground cursor-pointer">
            Show archived
          </label>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={filteredTickets}
        columns={columns}
        searchPlaceholder="Search tickets..."
        searchKeys={['issue_description', 'address', 'category']}
        onRowClick={handleRowClick}
        onViewClick={handleRowClick}
        getRowId={(ticket) => ticket.id}
        getRowClassName={getRowClassName}
        emptyMessage={
          <div className="text-center py-8">
            <Ticket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="font-medium">No tickets yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tickets are created automatically from WhatsApp conversations,
              or you can create one manually.
            </p>
          </div>
        }
        loading={loading}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title="Ticket Details"
        subtitle={selectedTicket?.property_address}
        deletable={!selectedTicketBasic?.archived}
        deleteLabel="Archive"
        deleteIcon={<Archive className="h-4 w-4" />}
        onDelete={() => setArchiveDialogOpen(true)}
      >
        {selectedTicket && (
          <div className="space-y-4">
            {/* Status badges - compact */}
            <div className="flex flex-wrap gap-2">
              {selectedTicket.job_stage && (
                <StatusBadge status={selectedTicket.job_stage} size="md" />
              )}
              {selectedTicket.priority && (
                <StatusBadge status={selectedTicket.priority} size="md" />
              )}
              {selectedTicket.handoff && (
                <StatusBadge status="handoff" size="md" />
              )}
            </div>

            {/* Double-quote warning */}
            {previouslyApprovedContractor && selectedTicketBasic?.contractor_id && (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800">Previous contractor already approved</p>
                    <p className="text-xs text-amber-700 mt-1">
                      <span className="font-medium">{previouslyApprovedContractor}</span> was previously approved for this ticket.
                      Make sure to cancel the previous arrangement before proceeding with a new contractor.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Handoff completion button */}
            {selectedTicket.handoff && selectedTicketBasic?.status === 'open' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHandoffTicketId(selectedTicketBasic.id)
                  setCreateDrawerOpen(true)
                  setDrawerOpen(false)
                }}
              >
                Review Ticket Details
              </Button>
            )}

            {/* Related Links - compact 3-column grid */}
            <DetailSection title="Related">
              <div className="grid grid-cols-3 gap-1.5">
                {/* Property */}
                <Link
                  href={`/properties?id=${selectedTicket.property_id}`}
                  className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  onClick={handleCloseDrawer}
                >
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Property</span>
                </Link>
                {/* Tenant */}
                {selectedTicketBasic?.tenant_id && (
                  <Link
                    href={`/tenants?id=${selectedTicketBasic.tenant_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Tenant</span>
                  </Link>
                )}
                {/* Conversation */}
                {selectedTicketBasic?.conversation_id && (
                  <Link
                    href={`/conversations?id=${selectedTicketBasic.conversation_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Conversation</span>
                  </Link>
                )}
                {/* Messages */}
                {hasMessage && (
                  <Link
                    href={`/messages?id=${selectedTicketBasic?.id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Messages</span>
                  </Link>
                )}
                {/* Contractor */}
                {selectedTicketBasic?.contractor_id && (
                  <Link
                    href={`/contractors?id=${selectedTicketBasic.contractor_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Contractor</span>
                  </Link>
                )}
                {/* Completion */}
                {hasCompletion && (
                  <Link
                    href={`/completions?id=${selectedTicketBasic?.id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Completion</span>
                  </Link>
                )}
              </div>
            </DetailSection>

            <DetailDivider />

            {/* Issue - compact */}
            <DetailSection title="Issue">
              <p className="text-xs leading-relaxed">
                {selectedTicket.issue_description || 'No description provided'}
              </p>
            </DetailSection>

            <DetailDivider />

            {/* Details - compact grid */}
            <DetailSection title="Details">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="text-xs font-medium">{selectedTicket.category || '-'}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Date Logged</p>
                  <p className="text-xs font-medium">{formatDate(selectedTicket.date_logged)}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Availability</p>
                  <p className="text-xs font-medium">{selectedTicket.availability || '-'}</p>
                </div>
                <div className="p-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Access</p>
                  <p className="text-xs font-medium">{selectedTicket.access || '-'}</p>
                </div>

                {/* Dynamic fields that appear as ticket progresses */}
                {selectedTicketBasic?.contractor_name && (
                  <div className="p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Contractor</p>
                    <p className="text-xs font-medium">{selectedTicketBasic.contractor_name}</p>
                  </div>
                )}
                {selectedTicketBasic?.contractor_quote && (
                  <div className="p-2 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Quote</p>
                    <p className="text-xs font-medium font-mono">{formatCurrency(selectedTicketBasic.contractor_quote)}</p>
                  </div>
                )}
                {selectedTicketBasic?.scheduled_date && (
                  <div className="p-2 bg-teal-50 rounded-lg col-span-2">
                    <p className="text-xs text-teal-600">Scheduled Date</p>
                    <p className="text-sm font-medium text-teal-700">{formatDate(selectedTicketBasic.scheduled_date)}</p>
                  </div>
                )}
                {selectedTicket.ticket_status.toLowerCase() === 'closed' && selectedTicketBasic?.final_amount && (
                  <div className="p-2 bg-green-50 rounded-lg col-span-2">
                    <p className="text-xs text-green-600">Final Amount</p>
                    <p className="font-mono text-sm font-bold text-green-700">{formatCurrency(selectedTicketBasic.final_amount)}</p>
                  </div>
                )}
              </div>
            </DetailSection>
          </div>
        )}
      </DetailDrawer>

      {/* Create / Complete Ticket Modal */}
      <Dialog open={createDrawerOpen} onOpenChange={(open) => { if (!open) handleCloseCreateDrawer() }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{handoffTicketId ? 'Complete Ticket' : 'New Ticket'}</DialogTitle>
            <DialogDescription>
              {handoffTicketId ? 'Fill in the missing details to dispatch this ticket' : 'Create a new maintenance ticket and assign contractors'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <TicketForm
              initialData={handoffTicketId && selectedTicketBasic ? {
                property_id: selectedTicketBasic.property_id || '',
                tenant_id: selectedTicketBasic.tenant_id || '',
                issue_description: selectedTicketBasic.issue_description || '',
                category: selectedTicketBasic.category || '',
                priority: selectedTicketBasic.priority || 'Damaging',
                contractor_id: selectedTicketBasic.contractor_id || null,
                availability: selectedTicketBasic.availability || '',
                access: selectedTicketBasic.access || '',
                images: (selectedTicketBasic as { images?: string[] }).images || [],
                conversation_id: selectedTicketBasic.conversation_id || undefined,
              } : undefined}
              isHandoff={!!handoffTicketId}
              onSubmit={handleCreateTicket}
              onCancel={handleCloseCreateDrawer}
              submitLabel={handoffTicketId ? 'Complete Ticket' : 'Create Ticket'}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <ConfirmDeleteDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        title="Archive Ticket"
        description="This ticket will be moved to the archive. You can view archived tickets using the 'Show archived' toggle. Archived tickets are excluded from automation."
        itemName={selectedTicketBasic?.issue_description?.slice(0, 50) || undefined}
        onConfirm={handleArchive}
        confirmLabel="Archive"
        confirmingLabel="Archiving..."
      />
    </div>
  )
}
