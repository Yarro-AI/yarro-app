'use client'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
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
import { Input } from '@/components/ui/input'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { format } from 'date-fns'
import { Ticket, Search, ChevronDown } from 'lucide-react'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import { HandoffAlertBanner } from '@/components/handoff-alert-banner'
import { SlaBadge } from '@/components/sla-badge'
import { RefreshCw } from 'lucide-react'

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
  next_action?: string | null
  next_action_reason?: string | null
  sla_due_at?: string | null
  resolved_at?: string | null
  message_stage?: string | null
  display_stage?: string | null
  address?: string
  tenant_name?: string
  contractor_name?: string
}

type TicketFilter = 'all' | 'system' | 'manual'
type ScopeTab = 'all' | 'open' | 'closed' | 'archived'
type WorkflowFilter = 'needsMgr' | 'waiting' | 'scheduled' | null

const WAITING_REASONS   = ['awaiting_contractor', 'awaiting_landlord', 'awaiting_booking'] as const
const NEEDS_MGR_REASONS = ['needs_attention', 'no_contractors', 'landlord_declined',
                           'landlord_no_response', 'job_not_completed', 'manager_approval'] as const

const isWaitingReason   = (r?: string | null): boolean => !!r && (WAITING_REASONS   as readonly string[]).includes(r)
const isNeedsMgrReason  = (r?: string | null): boolean => !!r && (NEEDS_MGR_REASONS as readonly string[]).includes(r)
const isScheduledReason = (r?: string | null): boolean => r === 'scheduled'

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
  const [scopeTab, setScopeTab] = useState<ScopeTab>('open')
  const [search, setSearch] = useState('')
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>(null)
  const supabase = createClient()

  const selectedId = searchParams.get('id')
  const action = searchParams.get('action')
  const defaultTab = searchParams.get('tab')
  const shouldCreate = searchParams.get('create')

  useEffect(() => {
    if (!propertyManager) return
    fetchTickets()
  }, [propertyManager, dateRange])

  useEffect(() => {
    if (shouldCreate === 'true') {
      setCreateDrawerOpen(true)
      router.replace('/tickets')
    }
  }, [shouldCreate])

  useEffect(() => {
    if (scopeTab !== 'open') setWorkflowFilter(null)
  }, [scopeTab])

  useEffect(() => {
    if (selectedId && tickets.length > 0) {
      const basicTicket = tickets.find((t) => t.id === selectedId)
      if (basicTicket) {
        setSelectedTicketBasic(basicTicket)
        // Auto-open complete drawer if action=complete and ticket is handoff
        if (action === 'complete' && basicTicket.handoff && basicTicket.status === 'open') {
          setHandoffTicketId(basicTicket.id)
          setCreateDrawerOpen(true)
          return
        }
      }
      // Only open the detail modal if the create drawer isn't already open
      if (!createDrawerOpen) {
        setModalOpen(true)
      }
    }
  }, [selectedId, tickets, action, createDrawerOpen])

  const fetchTickets = async () => {
    setLoading(true)
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
        next_action,
        next_action_reason,
        sla_due_at,
        resolved_at,
        c1_properties(address),
        c1_tenants(full_name),
        c1_contractors(contractor_name)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.to.toISOString())
      .order('date_logged', { ascending: false })

    const { data } = await query

    if (data) {
      // Map next_action_reason → display label
      const reasonToDisplayStage: Record<string, string> = {
        handoff_review: 'Handoff',
        manager_approval: 'Awaiting Manager',
        no_contractors: 'No Contractors',
        landlord_declined: 'Landlord Declined',
        landlord_no_response: 'Landlord No Response',
        job_not_completed: 'Not Completed',
        awaiting_contractor: 'Awaiting Contractor',
        awaiting_landlord: 'Awaiting Landlord',
        awaiting_booking: 'Awaiting Booking',
        scheduled: 'Scheduled',
        completed: 'Completed',
        dismissed: 'Dismissed',
        new: 'Created',
      }

      const mapped = data.map((t) => ({
        ...t,
        address: (t.c1_properties as unknown as { address: string } | null)?.address,
        tenant_name: (t.c1_tenants as unknown as { full_name: string } | null)?.full_name,
        contractor_name: (t.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
        message_stage: null,
        display_stage: reasonToDisplayStage[t.next_action_reason || ''] || reasonToDisplayStage[t.next_action || ''] || 'Created',
      }))
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
      render: (ticket) => ticket.priority ? <StatusBadge status={ticket.priority} className="opacity-90" /> : '-',
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
      render: (ticket) => ticket.display_stage ? <StatusBadge status={ticket.display_stage} className="opacity-90" /> : '-',
    },
    {
      key: 'sla',
      header: 'SLA',
      width: '110px',
      sortable: true,
      render: (ticket) => (
        <SlaBadge
          slaDueAt={ticket.sla_due_at ?? null}
          resolvedAt={ticket.resolved_at}
          priority={ticket.priority}
          dateLogged={ticket.date_logged}
          archived={ticket.archived}
          ticketStatus={ticket.status}
        />
      ),
      getValue: (ticket) => ticket.sla_due_at ? new Date(ticket.sla_due_at).getTime() : 0,
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
  const isOpenHandoff = (t: TicketRow) => t.handoff === true && t.status === 'open' && t.archived !== true

  const nonHandoff = tickets.filter(t => !isOpenHandoff(t))

  // Scope counts — 4 lifecycle tabs
  const scopeCounts: Record<ScopeTab, number> = {
    all:      nonHandoff.length,
    open:     nonHandoff.filter(t => t.status !== 'closed' && t.archived !== true).length,
    closed:   nonHandoff.filter(t => t.status === 'closed').length,
    archived: nonHandoff.filter(t => t.archived === true).length,
  }

  // Filter helpers
  const applySearch = (arr: TicketRow[]): TicketRow[] => {
    if (!search.trim()) return arr
    const q = search.toLowerCase()
    return arr.filter(t =>
      t.issue_description?.toLowerCase().includes(q) ||
      t.address?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    )
  }
  const applyOriginFilter = (arr: TicketRow[]): TicketRow[] => {
    if (activeFilter === 'manual') return arr.filter(t => t.is_manual === true)
    if (activeFilter === 'system') return arr.filter(t => !t.handoff && !t.is_manual)
    return arr
  }
  const applyWorkflowFilter = (arr: TicketRow[]): TicketRow[] => {
    if (workflowFilter === 'needsMgr')  return arr.filter(t => isNeedsMgrReason(t.next_action_reason))
    if (workflowFilter === 'waiting')   return arr.filter(t => isWaitingReason(t.next_action_reason))
    if (workflowFilter === 'scheduled') return arr.filter(t => isScheduledReason(t.next_action_reason))
    return arr
  }
  const applyFilters = (arr: TicketRow[]) => applySearch(applyOriginFilter(applyWorkflowFilter(arr)))

  // Lifecycle bases
  const openBase     = nonHandoff.filter(t => t.status !== 'closed' && t.archived !== true)
  const closedBase   = nonHandoff.filter(t => t.status === 'closed')
  const archivedBase = nonHandoff.filter(t => t.archived === true)

  // Scope base for current lifecycle tab
  const scopeBase = scopeTab === 'open'     ? openBase
                  : scopeTab === 'closed'   ? closedBase
                  : scopeTab === 'archived' ? archivedBase
                  : nonHandoff

  // Origin filter counts (from scopeBase, no search or workflow filter applied)
  const filterCounts = {
    all:    scopeBase.length,
    system: scopeBase.filter(t => !t.handoff && !t.is_manual).length,
    manual: scopeBase.filter(t => t.is_manual === true).length,
  }

  // Workflow chip counts — always from openBase (open tickets only)
  const workflowCounts = {
    needsMgr:  openBase.filter(t => isNeedsMgrReason(t.next_action_reason)).length,
    waiting:   openBase.filter(t => isWaitingReason(t.next_action_reason)).length,
    scheduled: openBase.filter(t => isScheduledReason(t.next_action_reason)).length,
  }

  // Visible rows — memoized for search performance at 500+ tickets
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const visibleRows = useMemo(() => applyFilters(scopeBase), [tickets, scopeTab, workflowFilter, activeFilter, search])

  // Active filter state
  const WORKFLOW_LABELS: Record<NonNullable<WorkflowFilter>, string> = {
    needsMgr:  'Needs action',
    waiting:   'Waiting',
    scheduled: 'Scheduled',
  }
  const hasActiveFilters = workflowFilter !== null || activeFilter !== 'all' || search.trim() !== ''
  const clearFilters = () => {
    setWorkflowFilter(null)
    setActiveFilter('all')
    setSearch('')
  }

  return (
    <div className="p-8 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-4 mb-3">
        <div className="shrink-0">
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage maintenance tickets across your properties
          </p>
        </div>

        {/* Search — in header */}
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fetchTickets()}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <InteractiveHoverButton
            text="Create"
            className="w-24 text-xs h-7"
            onClick={() => setCreateDrawerOpen(true)}
          />
        </div>
      </div>

      {/* Handoff Alert Banner */}
      <HandoffAlertBanner
        tickets={tickets.filter((t) => t.handoff === true && t.status === 'open' && t.archived !== true)}
        onReview={(ticketId) => {
          const ticket = tickets.find(t => t.id === ticketId)
          if (ticket) {
            setSelectedTicketBasic(ticket)
            setHandoffTicketId(ticketId)
            setCreateDrawerOpen(true)
          }
        }}
      />

      {/* Scope tabs */}
      <div className="flex-shrink-0 flex items-end gap-1 border-b border-border/40 mt-3 mb-0">
        {([
          { key: 'all',      label: 'All'      },
          { key: 'open',     label: 'Open'     },
          { key: 'closed',   label: 'Closed'   },
          { key: 'archived', label: 'Archived' },
        ] as { key: ScopeTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setScopeTab(key)}
            className={cn(
              'px-3 pb-2.5 pt-1 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              scopeTab === key
                ? 'border-[#1677FF] text-[#1677FF]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
            <span className={cn(
              'ml-1.5 text-xs tabular-nums',
              scopeTab === key ? 'text-muted-foreground' : 'text-muted-foreground/50'
            )}>
              {scopeCounts[key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-border/20">

        {/* Workflow chips — Open tab only */}
        {scopeTab === 'open' && (
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'needsMgr',  label: 'Needs action' },
              { key: 'waiting',   label: 'Waiting'      },
              { key: 'scheduled', label: 'Scheduled'    },
            ] as { key: NonNullable<WorkflowFilter>; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setWorkflowFilter(workflowFilter === key ? null : key)}
                className={cn(
                  'inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-medium transition-colors border',
                  workflowFilter === key
                    ? 'border-[#1677FF] text-[#1677FF] bg-[#1677FF]/[0.06]'
                    : 'bg-transparent text-muted-foreground border-border/40 hover:border-border hover:text-foreground'
                )}
              >
                {label}
                <span className="tabular-nums text-xs opacity-60">{workflowCounts[key]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Type + DateFilter — right */}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <div className="relative">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as TicketFilter)}
              className="h-9 appearance-none text-xs pl-2.5 pr-8 rounded-md border border-border/40 bg-background text-muted-foreground cursor-pointer hover:border-border hover:text-foreground transition-colors"
            >
              <option value="all">Type: All</option>
              <option value="system">Type: Auto</option>
              <option value="manual">Type: Manual</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>

      </div>

      {/* Active filters — visible when any filter is active */}
      {hasActiveFilters && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/20">
          <span className="text-xs text-muted-foreground">Active:</span>
          {scopeTab === 'open' && workflowFilter && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1677FF]/[0.08] text-[#1677FF] border border-[#1677FF]/20 text-xs font-medium">
              Workflow: {WORKFLOW_LABELS[workflowFilter]}
              <button onClick={() => setWorkflowFilter(null)} className="ml-0.5 hover:opacity-70">×</button>
            </span>
          )}
          {activeFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium">
              Type: {activeFilter === 'system' ? 'Auto' : 'Manual'}
              <button onClick={() => setActiveFilter('all')} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          )}
          {search.trim() && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium">
              &ldquo;{search.trim()}&rdquo;
              <button onClick={() => setSearch('')} className="ml-0.5 hover:text-foreground">×</button>
            </span>
          )}
          <button onClick={clearFilters} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Clear filters
          </button>
        </div>
      )}

      {/* Scrollable data region — single table */}
      <div className="flex-1 overflow-auto min-h-0">
        <DataTable
          data={visibleRows}
          columns={columns}
          searchKeys={[]}
          hideToolbar
          disableBodyScroll
          getRowId={t => t.id}
          getRowClassName={getRowClassName}
          onRowClick={handleRowClick}
          onViewClick={handleRowClick}
          loading={loading}
          emptyMessage={
            <div className="text-center py-12">
              <Ticket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="font-medium">No tickets</p>
              <p className="text-sm text-muted-foreground mt-1">No tickets match the current filters.</p>
            </div>
          }
        />
      </div>

      {/* Ticket Detail Modal (replaces old DetailDrawer) */}
      <TicketDetailModal
        ticketId={selectedId}
        open={modalOpen}
        onClose={handleCloseModal}
        onArchive={() => setArchiveDialogOpen(true)}
        defaultTab={defaultTab || undefined}
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
        description="This ticket will be moved to the archive. You can view archived tickets in the Archived tab. Archived tickets are excluded from automation."
        itemName={selectedTicketBasic?.issue_description?.slice(0, 50) || undefined}
        onConfirm={handleArchive}
        confirmLabel="Archive"
        confirmingLabel="Archiving..."
      />
    </div>
  )
}
