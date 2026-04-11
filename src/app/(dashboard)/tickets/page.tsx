'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import { QueryError } from '@/components/query-error'
import { DateFilter } from '@/components/date-filter'
import { useDateRange } from '@/contexts/date-range-context'
import { StatusBadge } from '@/components/status-badge'
import { TicketForm } from '@/components/ticket-form'
import { Button } from '@/components/ui/button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { CommandSearchInput } from '@/components/command-search-input'
import { PageShell } from '@/components/page-shell'
import { format, formatDistanceToNow } from 'date-fns'
import { Ticket, SlidersHorizontal, ClipboardList, MoreHorizontal } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { HandoffAlertBanner } from '@/components/handoff-alert-banner'
import { useOnTicketUpdated } from '@/components/ticket-drawer-provider'
import { useOpenTicket } from '@/hooks/use-open-ticket'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SlaBadge } from '@/components/sla-badge'
import { getReasonDisplay } from '@/lib/reason-display'

interface TicketRow {
  id: string
  issue_description: string | null
  status: string
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
  on_hold?: boolean | null
  pending_review?: boolean | null
  next_action?: string | null
  next_action_reason?: string | null
  ooh_dispatched?: boolean | null
  reschedule_requested?: boolean | null
  reschedule_status?: string | null
  sla_due_at?: string | null
  resolved_at?: string | null
  display_stage?: string | null
  address?: string
  tenant_name?: string
  contractor_name?: string
}

type LifecycleFilter = 'open' | 'closed' | 'archived'
type WorkflowFilter = 'needsMgr' | 'waiting' | 'scheduled'
type TypeFilter = 'auto' | 'manual'

export default function TicketsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const openTicket = useOpenTicket()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [selectedTicketBasic, setSelectedTicketBasic] = useState<TicketRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false)
  const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
  const [reviewTicketId, setReviewTicketId] = useState<string | null>(null)
  const { dateRange, setDateRange } = useDateRange()
  const [search, setSearch] = useState('')
  const [selectedLifecycle, setSelectedLifecycle] = useState<LifecycleFilter[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFilter[]>([])
  const [selectedType, setSelectedType] = useState<TypeFilter[]>([])
  const supabase = createClient()

  const selectedId = searchParams.get('ticketId')
  const action = searchParams.get('action')
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
    if (!selectedLifecycle.includes('open') && selectedWorkflow.length > 0) {
      setSelectedWorkflow([])
    }
  }, [selectedLifecycle, selectedWorkflow.length])

  // Handle action flows (complete/review) — these open TicketForm, not the detail modal
  // The global TicketDrawerProvider skips rendering when ?action= is present
  useEffect(() => {
    if (!selectedId || !action || tickets.length === 0) return

    const basicTicket = tickets.find((t) => t.id === selectedId)
    if (!basicTicket) return

    setSelectedTicketBasic(basicTicket)
    if (action === 'complete' && basicTicket.handoff && basicTicket.status === 'open') {
      setHandoffTicketId(basicTicket.id)
      setCreateDrawerOpen(true)
    } else if (action === 'review' && basicTicket.pending_review && basicTicket.status === 'open') {
      setReviewTicketId(basicTicket.id)
      setCreateDrawerOpen(true)
    }
  }, [selectedId, tickets, action])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('c1_tickets')
      .select(`
        id,
        issue_description,
        status,
        category,
        maintenance_trade,
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
        on_hold,
        pending_review,
        images,
        next_action,
        next_action_reason,
        ooh_dispatched,
        reschedule_requested,
        reschedule_status,
        sla_due_at,
        resolved_at,
        c1_properties(address),
        c1_tenants(full_name),
        c1_contractors(contractor_name)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.label === 'Custom' ? dateRange.to.toISOString() : new Date().toISOString())
      .order('date_logged', { ascending: false })

    const { data, error } = await query

    if (error) { setFetchError('Failed to load tickets'); setLoading(false); return }
    setFetchError(null)
    if (data) {
      const mapped = data.map((t) => {
        let display_stage = getReasonDisplay(t.next_action_reason, false).label
        if (t.reschedule_requested && t.reschedule_status === 'pending') {
          display_stage = 'Reschedule Requested'
        }
        if (t.on_hold) display_stage = 'On Hold'
        return {
          ...t,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
          tenant_name: (t.c1_tenants as unknown as { full_name: string } | null)?.full_name,
          contractor_name: (t.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
          display_stage,
        }
      })
      setTickets(mapped)
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager, dateRange])

  // Register fetchTickets so global drawer can trigger refresh after ticket actions
  useOnTicketUpdated(fetchTickets)

  const handleRowClick = (ticket: TicketRow) => {
    openTicket(ticket.id)
  }

  const handleCloseCreateDrawer = () => {
    setCreateDrawerOpen(false)
    setHandoffTicketId(null)
    setReviewTicketId(null)
    if (selectedId) {
      router.push('/tickets')
      setSelectedTicketBasic(null)
    }
  }

  const handleCreateTicket = async (data: {
    property_id: string
    tenant_id: string
    issue_title?: string
    issue_description: string
    category: string
    priority: string
    contractor_ids: string[]
    availability: string
    access: string
    images?: string[]
  }) => {
    if (handoffTicketId || reviewTicketId) {
      const ticketId = handoffTicketId || reviewTicketId!
      const { error } = await supabase.rpc('c1_complete_handoff_ticket', {
        p_ticket_id: ticketId,
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

      // For review tickets, also clear the pending_review flag
      if (reviewTicketId) {
        await supabase.from('c1_tickets').update({ pending_review: false }).eq('id', ticketId)
      }

      try {
        await supabase.functions.invoke('yarro-ticket-notify', {
          body: { ticket_id: ticketId, source: 'manual-ll' },
        })
      } catch (webhookErr) {
        console.error('Landlord notification webhook failed:', webhookErr)
      }

      toast.success(reviewTicketId ? 'Ticket reviewed & dispatched' : 'Handoff completed - contractor notified')
    } else {
      const { data: ticketId, error } = await supabase.rpc('c1_create_manual_ticket', {
        p_property_manager_id: propertyManager!.id,
        p_property_id: data.property_id,
        p_tenant_id: data.tenant_id || null,
        p_issue_description: data.issue_description,
        p_issue_title: data.issue_title?.trim() || null,
        p_category: 'maintenance',
        p_maintenance_trade: data.category,
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
    setReviewTicketId(null)
    if (selectedId) {
      router.push('/tickets')
      setSelectedTicketBasic(null)
    }
    fetchTickets()
  }

  const handleToggleHold = async (ticket: TicketRow) => {
    const newHold = !ticket.on_hold
    await supabase.rpc('c1_toggle_hold', { p_ticket_id: ticket.id, p_on_hold: newHold })
    toast.success(newHold ? 'Ticket paused' : 'Ticket resumed')
    fetchTickets()
  }

  const handleArchiveRow = async (ticket: TicketRow) => {
    const archivedAt = new Date().toISOString()

    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt, status: 'closed' })
      .eq('id', ticket.id)

    if (ticketError) {
      toast.error('Failed to archive ticket')
      return
    }

    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: archivedAt })
      .eq('ticket_id', ticket.id)

    if (ticket.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: archivedAt })
        .eq('id', ticket.conversation_id)
    }

    toast.success('Ticket archived')
    await fetchTickets()
  }

  const handleDismissTicket = async () => {
    const dismissId = handoffTicketId || reviewTicketId
    if (!dismissId || !selectedTicketBasic) return

    const archivedAt = new Date().toISOString()

    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt, status: 'closed' })
      .eq('id', dismissId)

    if (ticketError) {
      toast.error('Failed to dismiss ticket')
      return
    }

    await supabase
      .from('c1_messages')
      .update({ archived: true, archived_at: archivedAt })
      .eq('ticket_id', dismissId)

    if (selectedTicketBasic.conversation_id) {
      await supabase
        .from('c1_conversations')
        .update({ archived: true, archived_at: archivedAt })
        .eq('id', selectedTicketBasic.conversation_id)
    }

    toast.success(reviewTicketId ? 'Ticket dismissed and archived' : 'Handoff dismissed and archived')
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
      render: (ticket) => (
        <div className="min-w-0 max-w-[400px]">
          <p className="text-sm font-medium truncate">{ticket.address || 'No address'}</p>
          <p className="text-xs text-muted-foreground truncate">{ticket.issue_description || 'No description'}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (ticket) => (ticket as unknown as { maintenance_trade?: string }).maintenance_trade || ticket.category || '-',
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
      render: (ticket) => {
        if (!ticket.display_stage) return '-'
        const isWaiting = ticket.next_action === 'waiting'
        if (!isWaiting) return <StatusBadge status={ticket.display_stage} className="opacity-90" />
        const daysSince = (Date.now() - new Date(ticket.date_logged).getTime()) / 86_400_000
        const waitColor = daysSince > 3 ? 'text-red-500' : daysSince > 1 ? 'text-amber-500' : 'text-muted-foreground/60'
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={ticket.display_stage} className="opacity-90" />
            <span className={`text-[10px] font-medium ${waitColor}`}>
              {formatDistanceToNow(new Date(ticket.date_logged), { addSuffix: false })}
            </span>
          </div>
        )
      },
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
      width: '48px',
      render: (ticket) => {
        const isOpen = ticket.status === 'open' && !ticket.archived
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  openTicket(ticket.id)
                }}
              >
                View
              </DropdownMenuItem>
              {isOpen && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleHold(ticket)
                    }}
                  >
                    {ticket.on_hold ? 'Resume' : 'Hold'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleArchiveRow(ticket)
                    }}
                  >
                    Archive
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  // Open handoffs and pending_review only show in banners, not in the table
  const isPendingReview = (t: TicketRow) => t.pending_review === true && t.status === 'open' && t.archived !== true
  // Active filter state
  const hasActiveFilters = selectedLifecycle.length > 0 || selectedWorkflow.length > 0 || selectedType.length > 0 || search.trim() !== ''
  const activeFilterCount = selectedLifecycle.length + selectedWorkflow.length + selectedType.length + (search.trim() ? 1 : 0)

  const clearFilters = () => {
    setSelectedLifecycle([])
    setSelectedWorkflow([])
    setSelectedType([])
    setSearch('')
  }

  // Visible rows — single memoized pipeline; handoffs + pending_review filtered out (they live in banners)
  const visibleRows = useMemo(() => {
    const isHandoff = (t: TicketRow) => t.handoff === true && t.status === 'open' && t.archived !== true
    const isReview = (t: TicketRow) => t.pending_review === true && t.status === 'open' && t.archived !== true
    let result = tickets.filter(t => !isHandoff(t) && !isReview(t))

    // 1. Lifecycle (OR across selections; empty = show all)
    if (selectedLifecycle.length > 0) {
      result = result.filter(t =>
        selectedLifecycle.some(lc => {
          if (lc === 'open')     return t.status !== 'closed' && t.archived !== true
          if (lc === 'closed')   return t.status === 'closed'
          if (lc === 'archived') return t.archived === true
          return false
        })
      )
    }

    // 2. Workflow — when active, restricts to open tickets matching workflow only
    if (selectedWorkflow.length > 0) {
      result = result.filter(t => {
        const isOpen = t.status !== 'closed' && t.archived !== true
        if (!isOpen) return false
        return selectedWorkflow.some(wf => {
          if (wf === 'needsMgr')  return t.next_action === 'needs_action'
          if (wf === 'waiting')   return t.next_action === 'waiting'
          if (wf === 'scheduled') return t.next_action === 'scheduled'
          return false
        })
      })
    }

    // 3. Type (OR across selections)
    if (selectedType.length > 0) {
      result = result.filter(t =>
        selectedType.some(tp => {
          if (tp === 'auto')   return !t.handoff && !t.is_manual
          if (tp === 'manual') return t.is_manual === true
          return false
        })
      )
    }

    // 4. Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.issue_description?.toLowerCase().includes(q) ||
        t.address?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q) ||
        (t as unknown as { maintenance_trade?: string }).maintenance_trade?.toLowerCase().includes(q)
      )
    }

    return result
  }, [tickets, selectedLifecycle, selectedWorkflow, selectedType, search])

  return (
    <PageShell
      title="Tickets"
      count={visibleRows.length}
      actions={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'h-9 px-3 rounded-md border text-sm flex items-center gap-2 transition-colors',
                  hasActiveFilters
                    ? 'border-[#1677FF] text-[#1677FF] bg-[#1677FF]/[0.06]'
                    : 'border-border/40 text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <span className="text-xs tabular-nums opacity-70">{activeFilterCount}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4 space-y-4">

              {/* Lifecycle */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Lifecycle</p>
                {(['open', 'closed', 'archived'] as const).map(lc => (
                  <label key={lc} className="flex items-center gap-2 py-1 cursor-pointer text-sm capitalize">
                    <input
                      type="checkbox"
                      checked={selectedLifecycle.includes(lc)}
                      onChange={() => {
                        const isAdding = !selectedLifecycle.includes(lc)
                        if (isAdding && (lc === 'closed' || lc === 'archived') && selectedWorkflow.length > 0) {
                          setSelectedWorkflow([])
                        }
                        setSelectedLifecycle(prev =>
                          prev.includes(lc) ? prev.filter(x => x !== lc) : [...prev, lc]
                        )
                      }}
                      className="rounded border-border"
                    />
                    {lc.charAt(0).toUpperCase() + lc.slice(1)}
                  </label>
                ))}
              </div>

              {/* Workflow — only when Open lifecycle is selected */}
              {selectedLifecycle.includes('open') && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Workflow</p>
                  {([
                    { key: 'needsMgr',  label: 'Needs action' },
                    { key: 'waiting',   label: 'Waiting'      },
                    { key: 'scheduled', label: 'Scheduled'    },
                  ] as { key: WorkflowFilter; label: string }[]).map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selectedWorkflow.includes(key)}
                        onChange={() => {
                          const isAdding = !selectedWorkflow.includes(key)
                          if (isAdding) {
                            setSelectedLifecycle(prev => {
                              const withOpen = prev.includes('open') ? prev : [...prev, 'open']
                              return withOpen.filter(lc => lc === 'open')
                            })
                          }
                          setSelectedWorkflow(prev =>
                            prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
                          )
                        }}
                        className="rounded border-border"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}

              {/* Type */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Type</p>
                {([
                  { key: 'auto',   label: 'WhatsApp (auto)' },
                  { key: 'manual', label: 'Manual'          },
                ] as { key: TypeFilter; label: string }[]).map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedType.includes(key)}
                      onChange={() =>
                        setSelectedType(prev =>
                          prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
                        )
                      }
                      className="rounded border-border"
                    />
                    {label}
                  </label>
                ))}
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}

            </PopoverContent>
          </Popover>
          <DateFilter value={dateRange} onChange={setDateRange} />
          <CommandSearchInput
            placeholder="Search tickets..."
            value={search}
            onChange={setSearch}
            className="w-64"
          />
        </>
      }
    >

      {/* Handoff Alert Banner */}
      <HandoffAlertBanner
        tickets={tickets.filter((t) => t.handoff === true && t.status === 'open' && t.archived !== true && !t.ooh_dispatched)}
        onReview={(ticketId) => {
          const ticket = tickets.find(t => t.id === ticketId)
          if (ticket) {
            setSelectedTicketBasic(ticket)
            setHandoffTicketId(ticketId)
            setCreateDrawerOpen(true)
          }
        }}
      />

      {/* Review Mode Banner — pending_review tickets */}
      {(() => {
        const reviewTickets = tickets.filter((t) => isPendingReview(t))
        if (reviewTickets.length === 0) return null
        return (
          <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="h-5 w-5 text-violet-500" />
              <p className="text-sm font-medium">
                {reviewTickets.length} ticket{reviewTickets.length > 1 ? 's' : ''} awaiting triage
              </p>
            </div>
            <div className="flex flex-wrap gap-3 max-h-[180px] overflow-y-auto">
              {reviewTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center gap-3 rounded-lg border px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate max-w-[200px]">
                      {ticket.issue_description || 'No description'}
                    </p>
                    {ticket.address && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {ticket.address}
                      </p>
                    )}
                  </div>
                  <InteractiveHoverButton
                    text="Triage"
                    size="sm"
                    onClick={() => {
                      setSelectedTicketBasic(ticket)
                      setReviewTicketId(ticket.id)
                      setCreateDrawerOpen(true)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Scrollable data region — single table */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {fetchError ? (
          <QueryError message={fetchError} onRetry={fetchTickets} />
        ) : (
          <DataTable
            data={visibleRows}
            columns={columns}
            fillHeight
            getRowId={t => t.id}
            getRowClassName={getRowClassName}
            onRowClick={handleRowClick}
            loading={loading}
            emptyMessage={
              <div className="text-center py-12">
                <Ticket className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-medium">No tickets</p>
                <p className="text-sm text-muted-foreground mt-1">No tickets match the current filters.</p>
              </div>
            }
          />
        )}
      </div>

      {/* Create / Complete / Review Ticket Drawer */}
      <TicketForm
        open={createDrawerOpen}
        onClose={handleCloseCreateDrawer}
        initialData={(handoffTicketId || reviewTicketId) && selectedTicketBasic ? {
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
        isReview={!!reviewTicketId}
        ticketId={reviewTicketId || handoffTicketId || null}
        onSubmit={handleCreateTicket}
        onDismiss={(handoffTicketId || reviewTicketId) ? handleDismissTicket : undefined}
        onAllocateLandlord={() => { handleCloseCreateDrawer(); fetchTickets() }}
        submitLabel={reviewTicketId ? 'Dispatch' : handoffTicketId ? 'Complete Ticket' : 'Create Ticket'}
      />

    </PageShell>
  )
}
