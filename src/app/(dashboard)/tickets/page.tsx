'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import { DateFilter } from '@/components/date-filter'
import { useDateRange } from '@/contexts/date-range-context'
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
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { format } from 'date-fns'
import { Ticket, Filter, Check, X } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import { HandoffAlertBanner } from '@/components/handoff-alert-banner'

interface TicketRow {
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
  was_handoff: boolean | null
  verified_by: string | null
  property_id: string | null
  tenant_id: string | null
  contractor_id: string | null
  conversation_id: string | null
  archived: boolean | null
  message_stage?: string | null
  display_stage?: string | null
  address?: string
  tenant_name?: string
  contractor_name?: string
}

type TicketFilter = 'all' | 'system' | 'manual'

const STAGE_OPTIONS = [
  'Created',
  'Awaiting Contractor',
  'Awaiting Manager',
  'Awaiting Landlord',
  'Awaiting Booking',
  'Scheduled',
  'Not Completed',
  'Completed',
] as const

export default function TicketsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [selectedTicketBasic, setSelectedTicketBasic] = useState<TicketRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState<TicketFilter>('all')
  const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
  const { dateRange, setDateRange } = useDateRange()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [stageFilter, setStageFilter] = useState<Set<string>>(new Set())
  const supabase = createClient()

  const selectedId = searchParams.get('id')
  const action = searchParams.get('action')
  const shouldCreate = searchParams.get('create')

  useEffect(() => {
    if (!propertyManager) return
    fetchTickets()
  }, [propertyManager, dateRange, showArchived, showClosed])

  useEffect(() => {
    if (shouldCreate === 'true') {
      setCreateDrawerOpen(true)
      router.replace('/tickets')
    }
  }, [shouldCreate])

  useEffect(() => {
    if (selectedId && tickets.length > 0) {
      const basicTicket = tickets.find((t) => t.id === selectedId)
      if (basicTicket) {
        setSelectedTicketBasic(basicTicket)
        // Auto-open complete drawer if action=complete and ticket is handoff
        if (action === 'complete' && basicTicket.handoff && basicTicket.status === 'open') {
          setHandoffTicketId(basicTicket.id)
          setCreateDrawerOpen(true)
          router.replace(`/tickets?id=${selectedId}`)
          return
        }
      }
      setModalOpen(true)
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
        was_handoff,
        verified_by,
        property_id,
        tenant_id,
        contractor_id,
        conversation_id,
        archived,
        images,
        c1_properties(address),
        c1_tenants(full_name),
        c1_contractors(contractor_name),
        c1_messages(stage)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.to.toISOString())
      .order('date_logged', { ascending: false })

    if (!showArchived) {
      query = query.or('archived.is.null,archived.eq.false')
    }

    if (!showClosed) {
      query = query.not('status', 'ilike', 'closed')
    }

    // Also fetch not-completed job IDs for display stage
    const [{ data }, { data: notCompletedData }] = await Promise.all([
      query,
      supabase.from('c1_job_completions').select('id').eq('completed', false),
    ])
    const notCompletedIds = new Set((notCompletedData || []).map(r => r.id))

    if (data) {
      type MsgData = { stage: string } | { stage: string }[] | null
      const getMsgStage = (msgs: MsgData): string | null => {
        if (!msgs) return null
        if (Array.isArray(msgs)) return msgs[0]?.stage || null
        return msgs.stage || null
      }

      const deriveDisplayStage = (t: { id: string; status: string; handoff: boolean | null; archived: boolean | null; job_stage: string | null; scheduled_date: string | null }, msgStage: string | null): string | null => {
        if (t.archived && t.handoff) return 'Dismissed'
        const isClosed = t.status?.toLowerCase() === 'closed'
        if (isClosed) return 'Completed'
        if (t.handoff) return 'handoff'
        // Job progress checked FIRST (fixes auto-approve showing "Awaiting Landlord")
        if (notCompletedIds.has(t.id)) return 'Not Completed'
        const js = (t.job_stage || '').toLowerCase()
        if (js === 'booked' || js === 'scheduled' || t.scheduled_date) return 'Scheduled'
        if (js === 'sent') return 'Awaiting Booking'
        // Message stage (only when job hasn't progressed past this point)
        const ms = (msgStage || '').toLowerCase()
        if (ms === 'awaiting_manager') return 'Awaiting Manager'
        if (ms === 'awaiting_landlord') return 'Awaiting Landlord'
        if (ms === 'waiting_contractor' || ms === 'contractor_notified') return 'Awaiting Contractor'
        return 'Created'
      }

      const mapped = data.map((t) => {
        const msgStage = getMsgStage(t.c1_messages as MsgData)
        return {
          ...t,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
          tenant_name: (t.c1_tenants as unknown as { full_name: string } | null)?.full_name,
          contractor_name: (t.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
          message_stage: msgStage,
          display_stage: deriveDisplayStage(t, msgStage),
        }
      })
      setTickets(mapped)
    }
    setLoading(false)
  }

  const handleRowClick = (ticket: TicketRow) => {
    router.push(`/tickets?id=${ticket.id}`)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    router.push('/tickets')
    setSelectedTicketBasic(null)
  }

  const handleCloseCreateDrawer = () => {
    setCreateDrawerOpen(false)
    setHandoffTicketId(null)
    if (selectedId) {
      router.push('/tickets')
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
      const { error } = await supabase.rpc('c1_complete_handoff_ticket', {
        p_ticket_id: handoffTicketId,
        p_property_id: data.property_id,
        p_tenant_id: data.tenant_id || null,
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

      try {
        await supabase.functions.invoke('yarro-ticket-notify', {
          body: { ticket_id: handoffTicketId, source: 'manual-ll' },
        })
      } catch (webhookErr) {
        console.error('Landlord notification webhook failed:', webhookErr)
      }

      toast.success('Handoff completed - contractor notified')
    } else {
      const { data: ticketId, error } = await supabase.rpc('c1_create_manual_ticket', {
        p_property_manager_id: propertyManager!.id,
        p_property_id: data.property_id,
        p_tenant_id: data.tenant_id || null,
        p_issue_description: data.issue_description,
        p_issue_title: null,
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

      try {
        await supabase.functions.invoke('yarro-ticket-notify', {
          body: { ticket_id: ticketId, source: 'manual-ll' },
        })
      } catch (webhookErr) {
        console.error('Landlord notification webhook failed:', webhookErr)
      }

      toast.success('Ticket created - contractor notified')
    }

    setCreateDrawerOpen(false)
    setHandoffTicketId(null)
    if (selectedId) {
      router.push('/tickets')
      setSelectedTicketBasic(null)
    }
    fetchTickets()
  }

  const handleArchive = async () => {
    if (!selectedTicketBasic) return

    const archivedAt = new Date().toISOString()

    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt })
      .eq('id', selectedTicketBasic.id)

    if (ticketError) throw ticketError

    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: archivedAt })
      .eq('ticket_id', selectedTicketBasic.id)

    if (selectedTicketBasic.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: archivedAt })
        .eq('id', selectedTicketBasic.conversation_id)
    }

    toast.success('Ticket archived')
    setArchiveDialogOpen(false)
    handleCloseModal()
    await fetchTickets()
  }

  const handleDismissHandoff = async () => {
    if (!handoffTicketId || !selectedTicketBasic) return

    const archivedAt = new Date().toISOString()

    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt })
      .eq('id', handoffTicketId)

    if (ticketError) {
      toast.error('Failed to dismiss ticket')
      return
    }

    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: archivedAt })
      .eq('ticket_id', handoffTicketId)

    if (selectedTicketBasic.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: archivedAt })
        .eq('id', selectedTicketBasic.conversation_id)
    }

    toast.success('Handoff dismissed and archived')
    handleCloseCreateDrawer()
    await fetchTickets()
  }

  const getRowClassName = (ticket: TicketRow) => {
    if (ticket.archived) return 'opacity-50'
    if (ticket.status?.toLowerCase() === 'closed') return 'opacity-60'
    return ''
  }

  const columns: Column<TicketRow>[] = [
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
      key: 'priority',
      header: 'Priority',
      sortable: true,
      render: (ticket) => ticket.priority ? <StatusBadge status={ticket.priority} /> : '-',
    },
    {
      key: 'type',
      header: 'Type',
      sortable: true,
      render: (ticket) => {
        const type = ticket.was_handoff ? 'Reviewed' : ticket.is_manual ? 'Manual' : 'Auto'
        return (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-muted/50 text-muted-foreground">
            {type}
          </span>
        )
      },
      getValue: (ticket) => ticket.was_handoff ? 'Reviewed' : ticket.is_manual ? 'Manual' : 'Auto',
    },
    {
      key: 'display_stage',
      header: 'Stage',
      sortable: true,
      render: (ticket) => ticket.display_stage ? <StatusBadge status={ticket.display_stage} /> : '-',
    },
    {
      key: 'actions',
      header: '',
      width: '110px',
      render: (ticket) => (
        ticket.handoff && ticket.status === 'open' && !ticket.archived ? (
          <InteractiveHoverButton
            text="Review"
            className="w-24 text-xs h-7"
            onClick={(e) => {
              e.stopPropagation()
              setSelectedTicketBasic(ticket)
              setHandoffTicketId(ticket.id)
              setCreateDrawerOpen(true)
            }}
          />
        ) : null
      ),
    },
  ]

  // Open handoffs only show in the banner, not in the table
  const isOpenHandoff = (t: TicketRow) => t.handoff === true && t.status === 'open' && !t.archived

  const toggleStageFilter = (stage: string) => {
    setStageFilter(prev => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  const filteredTickets = tickets.filter((t) => {
    if (isOpenHandoff(t)) return false // always excluded from table — banner handles these
    if (activeFilter === 'manual' && t.is_manual !== true) return false
    if (activeFilter === 'system' && (t.handoff || t.is_manual)) return false
    if (stageFilter.size > 0 && !stageFilter.has(t.display_stage || '')) return false
    return true
  })

  const nonHandoff = tickets.filter((t) => !isOpenHandoff(t))
  const filterCounts = {
    all: nonHandoff.length,
    system: nonHandoff.filter((t) => !t.handoff && !t.is_manual).length,
    manual: nonHandoff.filter((t) => t.is_manual === true).length,
  }

  return (
    <div className="p-8 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage maintenance tickets across your properties
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateFilter value={dateRange} onChange={setDateRange} />
          <InteractiveHoverButton
            text="Create"
            className="w-24 text-xs h-7"
            onClick={() => setCreateDrawerOpen(true)}
          />
        </div>
      </div>

      {/* Handoff Alert Banner */}
      <HandoffAlertBanner
        tickets={tickets.filter((t) => t.handoff === true && t.status === 'open' && !t.archived)}
        onReview={(ticketId) => {
          const ticket = tickets.find(t => t.id === ticketId)
          if (ticket) {
            setSelectedTicketBasic(ticket)
            setHandoffTicketId(ticketId)
            setCreateDrawerOpen(true)
          }
        }}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          data={filteredTickets}
          columns={columns}
          searchPlaceholder="Search tickets..."
          searchKeys={['issue_description', 'address', 'category']}
          onRowClick={handleRowClick}
          onViewClick={handleRowClick}
          getRowId={(ticket) => ticket.id}
          getRowClassName={getRowClassName}
          fillHeight
          headerExtra={
            <div className="flex items-center gap-3 flex-1 justify-end">
              {/* Type sub-tabs */}
              <div className="flex items-center bg-muted rounded-lg p-0.5">
                {(['all', 'system', 'manual'] as TicketFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors capitalize ${
                      activeFilter === filter
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {filter === 'system' ? 'Auto' : filter}
                    <span className="ml-1 text-[10px] opacity-60">{filterCounts[filter]}</span>
                  </button>
                ))}
              </div>

              {/* Stage filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
                    <Filter className="h-3 w-3" />
                    Stage
                    {stageFilter.size > 0 && (
                      <span className="ml-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                        {stageFilter.size}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2">
                  <div className="space-y-0.5">
                    {STAGE_OPTIONS.map((stage) => {
                      const active = stageFilter.has(stage)
                      return (
                        <button
                          key={stage}
                          onClick={() => toggleStageFilter(stage)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                            active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                          }`}
                        >
                          <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            active ? 'bg-primary border-primary' : 'border-muted-foreground/30'
                          }`}>
                            {active && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <StatusBadge status={stage} size="sm" />
                        </button>
                      )
                    })}
                  </div>
                  {stageFilter.size > 0 && (
                    <button
                      onClick={() => setStageFilter(new Set())}
                      className="w-full mt-2 pt-2 border-t text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1.5"
                    >
                      <X className="h-3 w-3" />
                      Clear filters
                    </button>
                  )}
                </PopoverContent>
              </Popover>

              {/* Toggles */}
              <div className="flex items-center gap-1.5">
                <Switch id="show-closed" checked={showClosed} onCheckedChange={setShowClosed} className="scale-90" />
                <label htmlFor="show-closed" className="text-xs text-muted-foreground cursor-pointer">Closed</label>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} className="scale-90" />
                <label htmlFor="show-archived" className="text-xs text-muted-foreground cursor-pointer">Archived</label>
              </div>
            </div>
          }
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
      </div>

      {/* Ticket Detail Modal (replaces old DetailDrawer) */}
      <TicketDetailModal
        ticketId={selectedId}
        open={modalOpen}
        onClose={handleCloseModal}
        onArchive={() => setArchiveDialogOpen(true)}
        onReview={() => {
          if (selectedTicketBasic) {
            setHandoffTicketId(selectedTicketBasic.id)
            setCreateDrawerOpen(true)
            setModalOpen(false)
          }
        }}
      />

      {/* Create / Complete Ticket Modal */}
      <Dialog open={createDrawerOpen} onOpenChange={(open) => { if (!open) handleCloseCreateDrawer() }}>
        <DialogContent size="lg">
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
                priority: selectedTicketBasic.priority || 'Medium',
                contractor_id: selectedTicketBasic.contractor_id || null,
                availability: selectedTicketBasic.availability || '',
                access: selectedTicketBasic.access || '',
                images: (selectedTicketBasic as { images?: string[] }).images || [],
                conversation_id: selectedTicketBasic.conversation_id || undefined,
              } : undefined}
              isHandoff={!!handoffTicketId}
              onSubmit={handleCreateTicket}
              onCancel={handleCloseCreateDrawer}
              onDismiss={handoffTicketId ? handleDismissHandoff : undefined}
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
