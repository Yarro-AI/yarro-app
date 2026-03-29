'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { useDateRange } from '@/contexts/date-range-context'
import { StatusBadge } from '@/components/status-badge'
import {
  ArrowRight,
  AlertTriangle,
  X,
  MessageSquare,
  Phone,
  User,
  Search,
  ShieldCheck,
  Banknote,
  Wrench,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { TicketForm } from '@/components/ticket-form'
import { ChatHistory } from '@/components/chat-message'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button'
import { formatDistanceToNow, format } from 'date-fns'
import { PageShell } from '@/components/page-shell'
import { useOpenTicket } from '@/hooks/use-open-ticket'
import { filterActionable, filterInProgress, REASON_BADGE } from '@/components/dashboard/todo-panel'
import { StatCard } from '@/components/dashboard/stat-card'
import type { TodoItem, TicketSummary } from '@/components/dashboard/todo-panel'

interface DashboardStats {
  totalTickets: number
  openTickets: number
  closedTickets: number
  handoffTickets: number
  handoffConversations: number
  awaitingContractor: number
  awaitingManager: number
  awaitingLandlord: number
  landlordDeclined: number
  landlordNoResponse: number
  noContractorsLeft: number
  scheduledJobs: number
  awaitingBooking: number
  jobNotCompleted: number
}

interface HandoffConversation {
  id: string
  phone: string
  caller_name: string | null
  caller_role: string | null
  property_id: string | null
  tenant_id: string | null
  address: string | null
  last_updated: string
  stage: string | null
  log: unknown
}


interface RecentEvent {
  event_type: string
  event_label: string
  ticket_id: string | null
  actor_type: string | null
  actor_name: string | null
  property_label: string | null
  metadata: unknown
  occurred_at: string
  event_count?: number
  issue_snippet?: string | null
}

const EVENT_DOT_COLOR: Record<string, string> = {
  ISSUE_CREATED:           'bg-primary',
  PENDING_REVIEW:          'bg-primary',
  HANDOFF_CREATED:         'bg-primary',
  CONTRACTOR_ASSIGNED:     'bg-primary',
  QUOTE_RECEIVED:          'bg-warning',
  QUOTE_APPROVED:          'bg-success',
  QUOTE_DECLINED:          'bg-danger',
  LANDLORD_APPROVED:       'bg-success',
  LANDLORD_DECLINED:       'bg-danger',
  BOOKING_CONFIRMED:       'bg-success',
  NO_CONTRACTORS:          'bg-danger',
  JOB_SCHEDULED:           'bg-success',
  JOB_COMPLETED:           'bg-success',
  TICKET_CLOSED:           'bg-muted-foreground',
  TICKET_ON_HOLD:          'bg-warning',
  TICKET_RESUMED:          'bg-primary',
  TICKET_ARCHIVED:         'bg-muted-foreground',
  FOLLOW_UP_REQUESTED:     'bg-warning',
  // OOH events
  OOH_DISPATCHED:          'bg-primary',
  OOH_RESOLVED:            'bg-success',
  OOH_UNRESOLVED:          'bg-danger',
  OOH_IN_PROGRESS:         'bg-warning',
  // Landlord allocation events
  LANDLORD_ALLOCATED:      'bg-primary',
  LANDLORD_IN_PROGRESS:    'bg-warning',
  LANDLORD_RESOLVED_ALLOC: 'bg-success',
  LANDLORD_NEEDS_HELP:     'bg-danger',
}



export default function DashboardPage() {
  const { propertyManager } = usePM()
  const { dateRange } = useDateRange()
  const openTicket = useOpenTicket()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [allTickets, setAllTickets] = useState<TicketSummary[]>([])
  const [awaitingTickets, setAwaitingTickets] = useState<TicketSummary[]>([])
  const [awaitingType, setAwaitingType] = useState<string | null>(null)
  const [handoffConversations, setHandoffConversations] = useState<HandoffConversation[]>([])
  const [todoItems, setTodoItems] = useState<TodoItem[]>([])
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffConversation | null>(null)
  const [createTicketOpen, setCreateTicketOpen] = useState(false)
  const [showHandoffConvo, setShowHandoffConvo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [complianceSummary, setComplianceSummary] = useState<{
    expired: number; expiring: number; valid: number; total: number
  }>({ expired: 0, expiring: 0, valid: 0, total: 0 })
  const [rentSummary, setRentSummary] = useState<{
    paid: number; outstanding: number; overdue: number; partial: number; total: number
  }>({ paid: 0, outstanding: 0, overdue: 0, partial: 0, total: 0 })
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    setLoading(true)

    // Fetch tickets — next_action/next_action_reason is the single source of truth for state
    const [ticketsRes, convosRes, todoRes, eventsRes, complianceRes, rentRes] = await Promise.all([
      supabase
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
          final_amount,
          handoff,
          conversation_id,
          next_action,
          next_action_reason,
          on_hold,
          c1_properties(address)
        `)
        .eq('property_manager_id', propertyManager.id)
        .gte('date_logged', dateRange.from.toISOString())
        .lte('date_logged', dateRange.to.toISOString())
        .neq('archived', true)
        .order('date_logged', { ascending: false }),
      // Fetch handoff conversations that need ticket creation
      supabase
        .from('c1_conversations')
        .select(`
          id,
          phone,
          caller_name,
          caller_role,
          property_id,
          tenant_id,
          last_updated,
          stage,
          log,
          c1_properties(address)
        `)
        .eq('property_manager_id', propertyManager.id)
        .eq('handoff', true)
        .eq('status', 'open')
        .order('last_updated', { ascending: false }),
      // Unified to-do queue — sorted by backend priority scoring
      supabase.rpc('c1_get_dashboard_todo' as never, { p_pm_id: propertyManager.id } as never),
      // Recent activity feed
      supabase.rpc('c1_get_recent_events' as never, {
        p_pm_id: propertyManager.id,
        p_limit: 15,
        p_cursor: null,
      } as never),
      // Compliance summary — RPC returns counts by status
      supabase.rpc('compliance_get_summary', { p_pm_id: propertyManager.id }),
      // Rent dashboard summary — portfolio-wide current month
      supabase.rpc('get_rent_dashboard_summary', { p_pm_id: propertyManager.id }),
    ])

    // Process compliance summary — RPC returns { expired, expiring, valid, missing, total }
    const summaryData = complianceRes?.data as Record<string, number> | null
    setComplianceSummary({
      expired: summaryData?.expired ?? 0,
      expiring: summaryData?.expiring ?? 0,
      valid: summaryData?.valid ?? 0,
      total: summaryData?.total ?? 0,
    })

    // Process rent summary — portfolio-wide current month
    const rentData = rentRes?.data as Record<string, number> | null
    setRentSummary({
      paid: rentData?.paid ?? 0,
      outstanding: rentData?.outstanding ?? 0,
      overdue: rentData?.overdue ?? 0,
      partial: rentData?.partial ?? 0,
      total: rentData?.total ?? 0,
    })

    const tickets = ticketsRes.data
    const conversations = convosRes.data

    // Filter conversations that don't have tickets yet
    const ticketConvoIds = new Set(tickets?.map(t => t.conversation_id).filter(Boolean) || [])
    const handoffConvosNeedingTickets = (conversations || [])
      .filter(c => !ticketConvoIds.has(c.id))
      .map(c => ({
        ...c,
        address: (c.c1_properties as unknown as { address: string } | null)?.address || null,
      }))
    setHandoffConversations(handoffConvosNeedingTickets)

    if (tickets) {
      const total = tickets.length
      const closed = tickets.filter((t) => t.status?.toLowerCase() === 'closed').length
      const open = total - closed

      // All counts derived from next_action / next_action_reason (DB trigger computed)
      const handoffTickets = tickets.filter((t) => t.next_action_reason === 'handoff_review').length
      const awaitingManager = tickets.filter((t) => t.next_action_reason === 'manager_approval').length
      const noContractorsLeft = tickets.filter((t) => t.next_action_reason === 'no_contractors').length
      const landlordDeclined = tickets.filter((t) => t.next_action_reason === 'landlord_declined').length
      const landlordNoResponse = tickets.filter((t) => t.next_action_reason === 'landlord_no_response').length
      const jobNotCompleted = tickets.filter((t) => t.next_action_reason === 'job_not_completed').length
      const awaitingContractor = tickets.filter((t) => t.next_action_reason === 'awaiting_contractor').length
      const awaitingLandlord = tickets.filter((t) => t.next_action_reason === 'awaiting_landlord').length
      const scheduledJobs = tickets.filter((t) => t.next_action_reason === 'scheduled').length
      const awaitingBooking = tickets.filter((t) => t.next_action_reason === 'awaiting_booking').length

      setStats({
        totalTickets: total,
        openTickets: open,
        closedTickets: closed,
        handoffTickets,
        handoffConversations: handoffConvosNeedingTickets.length,
        awaitingContractor,
        awaitingManager,
        awaitingLandlord,
        landlordDeclined,
        landlordNoResponse,
        noContractorsLeft,
        scheduledJobs,
        awaitingBooking,
        jobNotCompleted,
      })

      // Map next_action_reason → display label
      const reasonToDisplayStage: Record<string, string> = {
        pending_review: 'Needs Review',
        handoff_review: 'Handoff',
        ooh_dispatched: 'OOH Dispatched',
        ooh_resolved: 'OOH Resolved',
        ooh_unresolved: 'OOH Unresolved',
        ooh_in_progress: 'OOH In Progress',
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

      const mappedTickets = tickets.map((t) => {
        let display_stage = reasonToDisplayStage[t.next_action_reason || ''] || reasonToDisplayStage[t.next_action || ''] || 'Created'
        if (t.on_hold) display_stage = 'On Hold'
        return {
          id: t.id,
          issue_description: t.issue_description,
          status: t.status,
          job_stage: t.job_stage,
          display_stage,
          message_stage: null,
          category: t.category,
          priority: t.priority,
          date_logged: t.date_logged,
          scheduled_date: t.scheduled_date,
          final_amount: t.final_amount,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
          handoff: t.handoff,
          landlord_declined: t.next_action_reason === 'landlord_declined',
          next_action: t.next_action || null,
          next_action_reason: t.next_action_reason || null,
          on_hold: t.on_hold || null,
        }
      })
      setAllTickets(mappedTickets)
    }

    const todoData = (todoRes.data as unknown as TodoItem[] | null) ?? []
    setTodoItems(todoData)

    const eventsPayload = (eventsRes.data as unknown as { events: RecentEvent[] } | null)
    setRecentEvents(eventsPayload?.events ?? [])

    setLoading(false)
  }, [propertyManager, dateRange, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Lift filtered lists to parent scope for stat cards + TodoPanel props
  const actionable = filterActionable(todoItems)
  const inProgressTickets = filterInProgress(allTickets)

  const showAwaitingTickets = (type: string) => {
    let filtered: TicketSummary[]

    // To-do categories filter directly by next_action
    if (type === 'needs_attention' || type === 'assign_contractor' || type === 'follow_up') {
      filtered = allTickets.filter((t) => t.next_action === type)
    } else {
      // Scheduled section filters by next_action_reason
      const reasonMap: Record<string, string> = {
        contractor: 'awaiting_contractor',
        landlord: 'awaiting_landlord',
        booking: 'awaiting_booking',
        scheduled: 'scheduled',
      }
      const reason = reasonMap[type]
      filtered = reason ? allTickets.filter((t) => t.next_action_reason === reason) : []
    }

    setAwaitingTickets(filtered)
    setAwaitingType(type)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  }

  // Sort oldest-first so most urgent/overdue tickets surface at the top
  const byAge = (a: TicketSummary, b: TicketSummary) =>
    new Date(a.date_logged).getTime() - new Date(b.date_logged).getTime()

  const getSheetTitle = (type: string | null) => {
    switch (type) {
      case 'needs_attention': return 'Needs Attention'
      case 'assign_contractor': return 'Assign Contractors'
      case 'follow_up': return 'Follow-up'
      case 'contractor': return 'Awaiting Contractor'
      case 'landlord': return 'Awaiting Landlord'
      case 'scheduled': return 'Scheduled Jobs'
      case 'booking': return 'Awaiting Booking'
      default: return ''
    }
  }

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const firstName = propertyManager?.name?.split(' ')[0] || ''
  const taskCount = actionable.length
  const greetingLabel = taskCount > 0
    ? `Hi, ${firstName}. You've got ${taskCount} task${taskCount !== 1 ? 's' : ''} today.`
    : `Hi, ${firstName}. You're all clear.`

  // Autocomplete results for global search in top bar
  const searchResults = searchTerm.trim()
    ? allTickets
        .filter(
          (t) =>
            t.issue_description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.address?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 8)
    : []

  if (loading && !stats) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <h1 className="text-2xl font-semibold text-foreground">{greetingLabel}</h1>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="h-[88px] bg-muted rounded-xl" />
              <div className="h-[88px] bg-muted rounded-xl" />
              <div className="h-[88px] bg-muted rounded-xl" />
              <div className="h-[88px] bg-muted rounded-xl" />
            </div>
            <div className="flex flex-col lg:flex-row gap-4 flex-1">
              <div className="lg:flex-1 h-[300px] bg-muted rounded-xl" />
              <div className="lg:w-[320px] h-[300px] bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header — greeting */}
      <div className="px-6 py-4 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-foreground">{greetingLabel}</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-6">
        {/* Stat row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
          <StatCard
            label="Needs attention"
            value={actionable.length}
            subtitle={actionable.length > 0 ? `${actionable.length} item${actionable.length !== 1 ? 's' : ''} requiring action` : 'All clear'}
            accentColor={actionable.length > 0 ? 'danger' : 'success'}
            icon={AlertTriangle}
          />
          <StatCard
            label="Jobs in progress"
            value={inProgressTickets.length}
            subtitle={`${inProgressTickets.length} active`}
            accentColor={inProgressTickets.length > 0 ? 'warning' : 'muted'}
            icon={Wrench}
          />
          <StatCard
            label="Compliance"
            value={complianceSummary.total > 0 ? `${complianceSummary.valid}/${complianceSummary.total}` : '—'}
            subtitle={complianceSummary.expired > 0 ? `${complianceSummary.expired} expired` : complianceSummary.expiring > 0 ? `${complianceSummary.expiring} expiring` : 'All valid'}
            accentColor={complianceSummary.expired > 0 ? 'danger' : complianceSummary.expiring > 0 ? 'warning' : 'success'}
            icon={ShieldCheck}
          />
          <StatCard
            label="Rent"
            value={rentSummary.total > 0 ? `${rentSummary.paid}/${rentSummary.total}` : '—'}
            subtitle={rentSummary.overdue > 0 ? `${rentSummary.overdue} overdue` : rentSummary.outstanding > 0 ? `${rentSummary.outstanding} outstanding` : 'All paid'}
            accentColor={rentSummary.overdue > 0 ? 'danger' : rentSummary.outstanding > 0 ? 'warning' : 'success'}
            icon={Banknote}
          />
        </div>

        {/* Main Content — two-column layout: Needs Action + In Progress */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 lg:items-stretch">

          {/* Left column — Needs Action */}
          <div className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0 border-b border-foreground/10">
              <span className="text-base font-semibold text-foreground">Needs action</span>
              {actionable.length > 0 && (
                <span className="text-xs font-bold text-danger bg-danger/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                  {actionable.length}
                </span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-border/40 flex-1 min-h-0 overflow-y-auto">
              {actionable.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-sm text-success font-medium">All clear — nothing needs your attention</p>
                </div>
              ) : (
                actionable.map(item => {
                  const borderAccent = (item.sla_breached || item.priority_bucket === 'URGENT')
                    ? 'border-l-[3px] border-l-danger'
                    : item.priority_bucket === 'HIGH'
                    ? 'border-l-[3px] border-l-warning'
                    : ''
                  const isHandoff = item.next_action_reason === 'handoff_review'
                  const isPendingReview = item.next_action_reason === 'pending_review'
                  const needsDispatchTab = item.next_action_reason === 'no_contractors' || item.next_action_reason === 'manager_approval' || item.action_type === 'CONTRACTOR_UNRESPONSIVE'
                  const actionHref = isHandoff
                    ? `/tickets?id=${item.ticket_id}&action=complete`
                    : isPendingReview
                    ? `/tickets?id=${item.ticket_id}&action=review`
                    : null
                  const ctaText = ({'Review issue': 'Triage', 'Needs attention': 'Review', 'Landlord declined': 'Review', 'Job not completed': 'Review', 'Assign contractor': 'Assign', 'Review quote': 'Approve', 'Awaiting landlord': 'Follow up', 'Contractor unresponsive': 'Redispatch', 'OOH dispatched': 'Review', 'OOH resolved': 'Close', 'OOH unresolved': 'Review', 'OOH in progress': 'View'} as Record<string, string>)[item.action_label] || 'View'

                  const badge = REASON_BADGE[item.next_action_reason || ''] || { label: item.action_label, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
                  const waitHrs = (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
                  const waitStyle = waitHrs > 48 ? 'text-xs font-medium text-danger' : waitHrs > 24 ? 'text-xs font-medium text-warning' : 'text-[11px] text-muted-foreground/60'

                  const rowContent = (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
                          {item.priority && <StatusBadge status={item.priority} size="sm" className="border-border/50 text-muted-foreground/70" />}
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{item.issue_summary}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                            <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                          </span>
                          <span className={waitStyle}>{formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}</span>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-primary hover:text-primary/70 transition-colors flex-shrink-0 whitespace-nowrap pt-0.5">{ctaText}</span>
                    </>
                  )

                  const rowClass = cn("flex items-start gap-3 py-3 px-6 transition-colors min-w-0 hover:bg-muted/30 group cursor-pointer", borderAccent)

                  if (actionHref) {
                    return <Link key={item.id} href={actionHref} className={rowClass}>{rowContent}</Link>
                  }
                  return (
                    <button key={item.id} onClick={() => openTicket(item.ticket_id, needsDispatchTab ? 'dispatch' : undefined)} className={cn(rowClass, 'w-full text-left')}>
                      {rowContent}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right column — In Progress */}
          <div className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-4 pb-3 flex-shrink-0 border-b border-foreground/10">
              <span className="text-base font-semibold text-foreground">In progress</span>
              {inProgressTickets.length > 0 && (
                <span className="text-xs font-bold text-primary bg-primary/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                  {inProgressTickets.length}
                </span>
              )}
            </div>
            <div className="flex flex-col divide-y divide-border/30 flex-1 min-h-0 overflow-y-auto">
              {inProgressTickets.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-sm text-muted-foreground">No tickets in progress</p>
                </div>
              ) : (
                inProgressTickets.map(ticket => {
                  const badge = REASON_BADGE[ticket.next_action_reason || ''] || { label: ticket.display_stage || ticket.next_action_reason, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
                  return (
                    <button key={ticket.id} onClick={() => openTicket(ticket.id)} className="flex items-center gap-3 py-3 px-6 hover:bg-muted/30 transition-colors w-full text-left cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">{ticket.address || '—'}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{ticket.issue_description || 'No description'}</p>
                        <span className="flex items-center gap-1.5 mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <span className={`text-[11px] font-medium ${badge.text}`}>{badge.label}</span>
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Awaiting Tickets Sheet */}
        <Sheet open={!!awaitingType} onOpenChange={(open) => !open && setAwaitingType(null)}>
          <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto p-6" title={getSheetTitle(awaitingType)}>
            <SheetHeader className="mb-6">
              <SheetTitle className="text-lg">
                {getSheetTitle(awaitingType)}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-3">
              {awaitingTickets.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No tickets in this category</p>
              ) : (
                awaitingTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/20"
                  >
                    <button
                      className="block w-full text-left cursor-pointer"
                      onClick={() => { openTicket(ticket.id); setAwaitingType(null) }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-card-foreground leading-snug">{ticket.issue_description || 'No description'}</p>
                          <p className="text-sm text-muted-foreground mt-1.5 truncate">{ticket.address}</p>
                        </div>
                        <span className="text-xs text-muted-foreground/70 whitespace-nowrap flex-shrink-0">
                          {formatDate(ticket.date_logged)}
                        </span>
                      </div>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {ticket.display_stage && <StatusBadge status={ticket.display_stage} />}
                      {awaitingType === 'handoff' && ticket.handoff && (
                        <Link
                          href={`/tickets?id=${ticket.id}&action=complete`}
                          onClick={() => setAwaitingType(null)}
                        >
                          <InteractiveHoverButton text="Review" size="sm" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Create Ticket from Handoff Dialog */}
        <Dialog open={createTicketOpen} onOpenChange={(open) => {
          if (!open) {
            setCreateTicketOpen(false)
            setSelectedHandoff(null)
            setShowHandoffConvo(false)
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-danger/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-danger" />
                </div>
                <div>
                  <DialogTitle>Create Ticket from Handoff</DialogTitle>
                  <DialogDescription>
                    Review the conversation and create a ticket to dispatch to contractors
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {selectedHandoff && (
              <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-4">
                {/* View Conversation toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start gap-2 text-xs"
                  onClick={() => setShowHandoffConvo(!showHandoffConvo)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {showHandoffConvo ? 'Hide Conversation' : 'View Conversation'}
                </Button>

                <div className={`flex-1 overflow-hidden grid gap-4 ${showHandoffConvo ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {/* Left: Conversation Context (collapsible) — mirrors ticket-conversation-tab exactly */}
                  {showHandoffConvo && (
                    <div className="flex flex-col min-h-0">
                      {/* Caller info bar */}
                      <div className="flex items-center gap-4 pb-3 mb-3 border-b flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-sm">{selectedHandoff.phone || 'Unknown'}</span>
                        </div>
                        {selectedHandoff.caller_name && (
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm">
                              {selectedHandoff.caller_name}
                              {selectedHandoff.caller_role && (
                                <span className="text-muted-foreground text-xs ml-1">({selectedHandoff.caller_role})</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Chat bubbles — same bg-muted/30 rounded-xl as conversation tab */}
                      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 rounded-xl p-4">
                        <ChatHistory
                          compact
                          messages={(() => {
                            const log = selectedHandoff.log
                            if (!log || !Array.isArray(log)) return []
                            return (log as Array<{ direction?: string; text?: string; content?: string; message?: string; timestamp?: string; label?: string }>)
                              .filter(entry => !entry.label && (entry.text || entry.content || entry.message))
                              .map(entry => ({
                                role: (entry.direction === 'in' || entry.direction === 'inbound') ? 'tenant' : (entry.direction === 'out' || entry.direction === 'outbound') ? 'assistant' : 'system',
                                text: entry.text || entry.content || entry.message || '',
                                timestamp: entry.timestamp,
                              }))
                          })()}
                        />
                      </div>
                    </div>
                  )}

                  {/* Right: Ticket Form */}
                  <div className="flex flex-col min-h-0 border rounded-lg">
                  <div className="px-4 py-3 border-b bg-muted/30 flex-shrink-0">
                    <h4 className="font-medium text-sm">Ticket Details</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pre-filled from conversation — review and edit as needed
                    </p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <TicketForm
                      prefill={{
                        property_id: selectedHandoff.property_id || undefined,
                        tenant_id: selectedHandoff.tenant_id || undefined,
                        issue_description: (() => {
                          // Extract issue from conversation log
                          const log = selectedHandoff.log
                          if (!log || !Array.isArray(log)) return ''
                          const tenantMessages = (log as Array<{ direction?: string; text?: string; content?: string; message?: string }>)
                            .filter(entry => entry.direction === 'in' || entry.direction === 'inbound')
                            .map(entry => entry.text || entry.content || entry.message || '')
                            .filter(Boolean)
                          // Return last substantial tenant message as issue description
                          return tenantMessages.slice(-3).join(' ').substring(0, 500) || ''
                        })(),
                        images: (() => {
                          // Extract images from conversation log (AI responses contain imageURLs)
                          const log = selectedHandoff.log
                          if (!log || !Array.isArray(log)) return []
                          const allImages: string[] = []
                          ;(log as Array<{ imageURLs?: string; images?: string[] }>).forEach(entry => {
                            // AI stores comma-separated URLs in imageURLs field
                            if (entry.imageURLs && entry.imageURLs !== 'unprovided') {
                              const urls = entry.imageURLs.split(',').map(u => u.trim()).filter(Boolean)
                              allImages.push(...urls)
                            }
                            // Also check for images array
                            if (entry.images && Array.isArray(entry.images)) {
                              allImages.push(...entry.images)
                            }
                          })
                          // Deduplicate
                          return [...new Set(allImages)]
                        })(),
                        conversation_id: selectedHandoff.id,
                      }}
                      onSuccess={() => {
                        setCreateTicketOpen(false)
                        setSelectedHandoff(null)
                        toast.success('Ticket created from handoff')
                        fetchData()
                      }}
                      onCancel={() => {
                        setCreateTicketOpen(false)
                        setSelectedHandoff(null)
                      }}
                      isHandoff={true}
                    />
                  </div>
                </div>
              </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
