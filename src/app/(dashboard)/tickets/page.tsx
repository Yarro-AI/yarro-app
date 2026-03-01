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
import { CommandSearchInput } from '@/components/command-search-input'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { format } from 'date-fns'
import { Ticket, RefreshCw, SlidersHorizontal, Pause, Play, ClipboardList } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'
import { HandoffAlertBanner } from '@/components/handoff-alert-banner'
import { ReviewDispatchModal } from '@/components/review-dispatch-modal'
import { SlaBadge } from '@/components/sla-badge'

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
  on_hold?: boolean | null
  pending_review?: boolean | null
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

type LifecycleFilter = 'open' | 'closed' | 'archived'
type WorkflowFilter = 'needsMgr' | 'waiting' | 'scheduled'
type TypeFilter = 'auto' | 'manual'

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
  const [handoffTicketId, setHandoffTicketId] = useState<string | null>(null)
  const { dateRange, setDateRange } = useDateRange()
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [reviewModalTicket, setReviewModalTicket] = useState<TicketRow | null>(null)
  const [search, setSearch] = useState('')
  const [selectedLifecycle, setSelectedLifecycle] = useState<LifecycleFilter[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFilter[]>([])
  const [selectedType, setSelectedType] = useState<TypeFilter[]>([])
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
    if (!selectedLifecycle.includes('open') && selectedWorkflow.length > 0) {
      setSelectedWorkflow([])
    }
  }, [selectedLifecycle, selectedWorkflow.length])

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
        on_hold,
        pending_review,
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
        pending_review: 'Needs Review',
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
        archived: 'Archived',
        dismissed: 'Dismissed',
        on_hold: 'On Hold',
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

  const handleToggleHold = async (ticket: TicketRow) => {
    const newHold = !ticket.on_hold
    await supabase.rpc('c1_toggle_hold', { p_ticket_id: ticket.id, p_on_hold: newHold })
    toast.success(newHold ? 'Ticket paused' : 'Ticket resumed')
    fetchTickets()
  }

  const handleArchive = async () => {
    if (!selectedTicketBasic) return

    const archivedAt = new Date().toISOString()

    const { error: ticketError } = await supabase
      .from('c1_tickets')
      .update({ archived: true, archived_at: archivedAt, status: 'closed' })
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
      .update({ archived: true, archived_at: archivedAt, status: 'closed' })
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
      render: (ticket) => (
        <div className="min-w-0 max-w-[400px]">
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
      width: '48px',
      render: (ticket) => {
        const isOpen = ticket.status === 'open' && !ticket.archived
        const isHandoff = ticket.handoff && isOpen
        if (isHandoff) {
          return (
            <InteractiveHoverButton
              text="Review"
              className="w-20 text-xs h-7"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedTicketBasic(ticket)
                setHandoffTicketId(ticket.id)
                setCreateDrawerOpen(true)
              }}
            />
          )
        }
        if (!isOpen) return null
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 ml-auto"
            title={ticket.on_hold ? 'Resume' : 'Hold'}
            onClick={(e) => { e.stopPropagation(); handleToggleHold(ticket) }}
          >
            {ticket.on_hold ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
        )
      },
    },
  ]

  // Open handoffs and pending_review only show in banners, not in the table
  const isOpenHandoff = (t: TicketRow) => t.handoff === true && t.status === 'open' && t.archived !== true
  const isPendingReview = (t: TicketRow) => t.pending_review === true && t.status === 'open' && t.archived !== true
  const nonHandoff = tickets.filter(t => !isOpenHandoff(t))

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
          if (wf === 'needsMgr')  return isNeedsMgrReason(t.next_action_reason)
          if (wf === 'waiting')   return isWaitingReason(t.next_action_reason)
          if (wf === 'scheduled') return isScheduledReason(t.next_action_reason)
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
        t.category?.toLowerCase().includes(q)
      )
    }

    return result
  }, [tickets, selectedLifecycle, selectedWorkflow, selectedType, search])

  return (
    <div className="px-8 pb-8 pt-6 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Tickets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage maintenance tickets across your properties
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Review Mode Banner — pending_review tickets */}
      {(() => {
        const reviewTickets = tickets.filter((t) => isPendingReview(t))
        if (reviewTickets.length === 0) return null
        return (
          <div className="mb-6 rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/5 p-4">
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
                    className="w-24 text-xs h-8"
                    onClick={() => setReviewModalTicket(ticket)}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Filters + Date + Search */}
      <div className="flex-shrink-0 flex items-center gap-3 mb-3">
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
          <PopoverContent align="start" className="w-72 p-4 space-y-4">

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
                { key: 'auto',   label: 'Auto'   },
                { key: 'manual', label: 'Manual' },
              ] as { key: TypeFilter; label: string }[]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedType.includes(key)}
                    onChange={() => setSelectedType(prev =>
                      prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]
                    )}
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
          className="flex-1 min-w-[160px]"
        />
      </div>

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
        onTicketUpdated={() => fetchTickets()}
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

      {/* Review Dispatch Modal */}
      <ReviewDispatchModal
        ticket={reviewModalTicket}
        open={!!reviewModalTicket}
        onClose={() => setReviewModalTicket(null)}
        onDispatched={() => {
          setReviewModalTicket(null)
          fetchTickets()
        }}
      />
    </div>
  )
}
