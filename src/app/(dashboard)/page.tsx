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

interface TicketSummary {
  id: string
  issue_description: string | null
  status: string
  job_stage: string | null
  display_stage: string | null
  message_stage?: string | null
  category: string | null
  priority: string | null
  date_logged: string
  scheduled_date?: string | null
  final_amount?: number | null
  address?: string
  handoff?: boolean
  landlord_declined?: boolean
  next_action?: string | null
  next_action_reason?: string | null
  on_hold?: boolean | null
}

interface TodoItem {
  id: string
  ticket_id: string
  issue_summary: string
  property_label: string
  action_type: string
  action_label: string
  action_context: string | null
  next_action_reason: string | null
  waiting_since: string
  priority_bucket: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
  priority: string | null
  sla_breached: boolean
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

// CTA button text per action type
const ACTION_CTA: Record<string, string> = {
  'Review issue': 'Triage',
  'Needs attention': 'Review',
  'Landlord declined': 'Review',
  'Job not completed': 'Review',
  'Assign contractor': 'Assign',
  'Review quote': 'Approve',
  'Awaiting landlord': 'Follow up',
  'Contractor unresponsive': 'Redispatch',
  'OOH dispatched': 'Review',
  'OOH resolved': 'Close',
  'OOH unresolved': 'Review',
  'OOH in progress': 'View',
}

// Dot + text badges per next_action_reason (distinct from StatusBadge pills)
const REASON_BADGE: Record<string, { label: string; dot: string; text: string }> = {
  on_hold:              { label: 'On Hold',              dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
  pending_review:       { label: 'Needs review',         dot: 'bg-primary',          text: 'text-primary' },
  handoff_review:       { label: 'Handoff',              dot: 'bg-danger',           text: 'text-danger' },
  ooh_dispatched:       { label: 'OOH Dispatched',       dot: 'bg-primary',          text: 'text-primary' },
  ooh_resolved:         { label: 'OOH Resolved',         dot: 'bg-success',          text: 'text-success' },
  ooh_unresolved:       { label: 'OOH Unresolved',       dot: 'bg-danger',           text: 'text-danger' },
  ooh_in_progress:      { label: 'OOH In Progress',      dot: 'bg-warning',          text: 'text-warning' },
  no_contractors:       { label: 'No contractors',       dot: 'bg-warning',          text: 'text-warning' },
  job_not_completed:    { label: 'Not completed',        dot: 'bg-primary',          text: 'text-primary' },
  landlord_declined:    { label: 'Landlord declined',    dot: 'bg-danger',           text: 'text-danger' },
  landlord_no_response: { label: 'Landlord silent',      dot: 'bg-warning',          text: 'text-warning' },
  manager_approval:     { label: 'Needs approval',       dot: 'bg-primary',          text: 'text-primary' },
  allocated_to_landlord:{ label: 'Landlord Managing',    dot: 'bg-primary',          text: 'text-primary' },
  landlord_in_progress: { label: 'Landlord In Progress', dot: 'bg-warning',          text: 'text-warning' },
  landlord_resolved:    { label: 'Landlord Resolved',    dot: 'bg-success',          text: 'text-success' },
  landlord_needs_help:  { label: 'Landlord Needs Help',  dot: 'bg-danger',           text: 'text-danger' },
  awaiting_contractor:  { label: 'Awaiting reply',       dot: 'bg-warning',          text: 'text-warning' },
  awaiting_booking:     { label: 'Awaiting booking',     dot: 'bg-warning',          text: 'text-warning' },
  scheduled:            { label: 'Scheduled',             dot: 'bg-success',          text: 'text-success' },
  awaiting_landlord:    { label: 'Awaiting landlord',    dot: 'bg-warning',          text: 'text-warning' },
}

// Recommended next-step descriptions per state (Task 4)
const NEXT_STEPS: Record<string, string> = {
  pending_review: 'Triage and assign a category',
  handoff_review: 'Review AI conversation and create ticket',
  no_contractors: 'Add or assign a new contractor',
  manager_approval: 'Review quote and approve or decline',
  landlord_declined: 'Contact landlord to discuss alternatives',
  landlord_no_response: 'Follow up with landlord directly',
  job_not_completed: 'Review contractor reason and redispatch',
  ooh_dispatched: 'Waiting for OOH contact response',
  ooh_unresolved: 'Escalate or redispatch to contractor',
  landlord_needs_help: 'Landlord needs help — take over',
}

const IN_PROGRESS_REASONS = new Set([
  'awaiting_contractor', 'awaiting_booking', 'awaiting_landlord',
  'allocated_to_landlord', 'landlord_in_progress', 'ooh_dispatched', 'ooh_in_progress',
  'scheduled',
])

function TodoPanel({ todoItems, allTickets }: { todoItems: TodoItem[]; allTickets: TicketSummary[] }) {
  const [leftTab, setLeftTab] = useState<'todo' | 'in_progress'>('todo')
  const openTicket = useOpenTicket()

  // Only actionable items — exclude FOLLOW_UP and delay awaiting_landlord by 24h
  const actionable = todoItems.filter(i => {
    if (i.action_type === 'FOLLOW_UP') return false
    if (i.next_action_reason === 'awaiting_landlord') {
      const hrs = (Date.now() - new Date(i.waiting_since).getTime()) / 3_600_000
      if (hrs < 24) return false
    }
    return true
  })

  const inProgressTickets = allTickets.filter(t => IN_PROGRESS_REASONS.has(t.next_action_reason || ''))

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">

      {/* Tab row */}
      <div className="flex items-end justify-between px-8 border-b border-foreground/10 flex-shrink-0 pt-4">
        <div className="flex items-end gap-6">
          <button
            onClick={() => setLeftTab('todo')}
            className="flex items-center py-2 transition-colors group focus:outline-none"
          >
            <span className={cn(
              'text-sm font-medium transition-colors',
              leftTab === 'todo'
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground'
            )}>
              To-do
            </span>
          </button>
          <button
            onClick={() => setLeftTab('in_progress')}
            className="flex items-center py-2 transition-colors group focus:outline-none"
          >
            <span className={cn(
              'text-sm font-medium transition-colors',
              leftTab === 'in_progress'
                ? 'text-primary'
                : 'text-muted-foreground group-hover:text-foreground'
            )}>
              In Progress
            </span>
          </button>
        </div>
        <Link href="/tickets" className="flex-shrink-0 pb-2">
          <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent px-0">
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {leftTab === 'todo' ? (
      actionable.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">All clear — nothing needs your attention</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border/40 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {actionable.map(item => {
            const ctaText = ACTION_CTA[item.action_label] || 'View'
            const isHandoff = item.next_action_reason === 'handoff_review'
            const isPendingReview = item.next_action_reason === 'pending_review'
            const needsDispatchTab = item.next_action_reason === 'no_contractors' || item.next_action_reason === 'manager_approval' || item.action_type === 'CONTRACTOR_UNRESPONSIVE'

            // Action flows navigate to /tickets (page-specific Create/Review drawer)
            // Normal viewing opens the global drawer on this page
            const actionHref = isHandoff
              ? `/tickets?id=${item.ticket_id}&action=complete`
              : isPendingReview
              ? `/tickets?id=${item.ticket_id}&action=review`
              : null

            const rowContent = (
              <>
                {/* Left: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
                    {item.priority && (
                      <StatusBadge
                        status={item.priority}
                        size="sm"
                        className="border-border/50 text-muted-foreground/70"
                      />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">{item.issue_summary}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const badge = REASON_BADGE[item.next_action_reason || ''] || { label: item.action_label, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
                      return (
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          <span className={`text-xs font-medium ${badge.text}`}>{badge.label}</span>
                        </span>
                      )
                    })()}
                    {(() => {
                      const waitHrs = (Date.now() - new Date(item.waiting_since).getTime()) / 3_600_000
                      const waitStyle = waitHrs > 48 ? 'text-xs font-medium text-danger'
                        : waitHrs > 24 ? 'text-xs font-medium text-warning'
                        : 'text-[11px] text-muted-foreground/60'
                      return <span className={waitStyle}>{formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}</span>
                    })()}
                  </div>
                </div>

                {/* Right: CTA text link */}
                <span className="text-sm font-medium text-primary hover:text-primary/70 transition-colors flex-shrink-0 whitespace-nowrap pt-0.5">
                  {ctaText}
                </span>
              </>
            )

            const rowClass = "flex items-start gap-3 py-3 px-8 transition-colors min-w-0 hover:bg-muted/30 group cursor-pointer"

            // Action flows navigate to /tickets (page-specific Create/Review drawer)
            if (actionHref) {
              return <Link key={item.id} href={actionHref} className={rowClass}>{rowContent}</Link>
            }

            // Normal viewing opens the global drawer on this page
            return (
              <button
                key={item.id}
                onClick={() => openTicket(item.ticket_id, needsDispatchTab ? 'dispatch' : undefined)}
                className={cn(rowClass, 'w-full text-left')}
              >
                {rowContent}
              </button>
            )
          })}
        </div>
      )
      ) : (
        /* In Progress tab */
        inProgressTickets.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-sm text-muted-foreground">No tickets in progress</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/30 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            {inProgressTickets.map((ticket) => {
              const badge = REASON_BADGE[ticket.next_action_reason || ''] || { label: ticket.display_stage || ticket.next_action_reason, dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' }
              return (
                <button
                  key={ticket.id}
                  onClick={() => openTicket(ticket.id)}
                  className="flex items-center gap-3 py-3 px-8 hover:bg-muted/30 transition-colors w-full text-left cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-card-foreground truncate">{ticket.address || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{ticket.issue_description || 'No description'}</p>
                    <span className="flex items-center gap-1.5 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                      <span className="text-[11px] font-medium text-muted-foreground/70">{badge.label}</span>
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )
      )}

    </div>
  )
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
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    setLoading(true)

    // Fetch tickets — next_action/next_action_reason is the single source of truth for state
    const [ticketsRes, convosRes, todoRes, eventsRes] = await Promise.all([
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
    ])

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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = propertyManager?.business_name?.split(' ')[0] ?? ''
  const greetingLabel = firstName ? `${greeting}, ${firstName}` : greeting

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
      <PageShell title={greetingLabel} noPadding>
        <div className="p-4 h-full overflow-hidden">
          <div className="animate-pulse space-y-3">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-[168px] bg-muted rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-[200px] bg-muted rounded-xl" />
              <div className="h-[200px] bg-muted rounded-xl" />
            </div>
            <div className="flex-1 bg-muted rounded-xl min-h-[160px]" />
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title={greetingLabel}
      topBar={
        <div className="relative min-w-0">
          <div className={cn(
            'flex items-center gap-2 h-9 px-3 rounded-lg border bg-background transition-all w-64',
            searchFocused ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
          )}>
            <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search tickets…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50 min-w-0"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchFocused && searchResults.length > 0 && (
            <div className="absolute top-full mt-1.5 left-0 w-80 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
              {searchResults.map((ticket) => (
                <button
                  key={ticket.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { openTicket(ticket.id); setSearchTerm(''); setSearchFocused(false) }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0 w-full text-left cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-card-foreground truncate">{ticket.issue_description || 'No description'}</p>
                    <p className="text-xs text-muted-foreground truncate">{ticket.address || '—'}</p>
                  </div>
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
              <Link
                href="/tickets"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setSearchTerm(''); setSearchFocused(false) }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors"
              >
                View all results
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      }
      actions={
        <Button variant="cta" size="default" asChild>
          <Link href="/tickets?create=true">Create ticket</Link>
        </Button>
      }
      noPadding
    >
        {/* Main Content — panels below header line */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">

          {/* Left column — To-do */}
          <div className="flex flex-col min-w-0 lg:flex-1 lg:min-h-0 lg:border-r lg:border-border/40">
            {/* TodoPanel — borderless list */}
            <div className="flex flex-col">
              <TodoPanel todoItems={todoItems} allTickets={allTickets} />
            </div>
          </div> {/* closes left column */}

          {/* Right column — Scheduled + Recent Activity */}
          <div className="flex flex-col lg:w-[clamp(320px,30vw,420px)] lg:min-w-[320px] lg:max-w-[420px] lg:flex-shrink-0 lg:min-h-0 divide-y divide-border/40 border-t border-foreground/10 lg:border-t-0">
              {/* RIGHT: Scheduled jobs */}
              {(() => {
                const startOfToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
                const allScheduled = allTickets
                  .filter((t) => t.next_action_reason === 'scheduled' && t.scheduled_date)
                  .sort((a, b) => {
                    const ta = new Date(a.scheduled_date!).getTime()
                    const tb = new Date(b.scheduled_date!).getTime()
                    if (isNaN(ta) && isNaN(tb)) return 0
                    if (isNaN(ta)) return 1
                    if (isNaN(tb)) return -1
                    return ta - tb
                  })
                const upcomingScheduled = allScheduled.filter(t => new Date(t.scheduled_date!) >= startOfToday).slice(0, 5)
                const overdueScheduled = allScheduled.filter(t => new Date(t.scheduled_date!) < startOfToday)

                return (
                  <div className="flex flex-col min-w-0 min-h-0 overflow-hidden flex-1">
                    <div className="flex items-center px-6 pt-6 pb-3 flex-shrink-0">
                      <span className="text-sm font-semibold text-muted-foreground flex-1 min-w-0">Scheduled</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(upcomingScheduled.length + overdueScheduled.length) > 0 && (
                          <span className="text-xs font-bold text-primary bg-primary/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                            {upcomingScheduled.length + overdueScheduled.length}
                          </span>
                        )}
                        <Link href="/tickets">
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                            View all
                            <ArrowRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-6 pb-6">
                      {upcomingScheduled.length === 0 && overdueScheduled.length === 0 ? (
                        <div className="flex gap-3 items-center">
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground/40">—</span>
                          </div>
                          <p className="text-sm text-muted-foreground/40">No scheduled jobs</p>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          {/* Overdue jobs */}
                          {overdueScheduled.length > 0 && (
                            <div className="flex flex-col gap-1.5 mb-3">
                              <span className="text-[10px] font-semibold text-danger">Overdue</span>
                              {overdueScheduled.map((ticket) => (
                                <button
                                  key={ticket.id}
                                  onClick={() => openTicket(ticket.id)}
                                  className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-danger/5 transition-colors border border-danger/20 w-full text-left cursor-pointer"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-400 truncate">{ticket.address || '—'}</p>
                                    <p className="text-xs text-red-500/60 truncate mt-0.5">{ticket.issue_description || 'No description'}</p>
                                  </div>
                                  <span className="text-[10px] font-medium text-danger whitespace-nowrap">Confirm completion</span>
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Upcoming jobs — flat list with inline date squares */}
                          {upcomingScheduled.map((ticket, idx) => {
                            const d = new Date(ticket.scheduled_date!)
                            return (
                              <button
                                key={ticket.id}
                                onClick={() => openTicket(ticket.id)}
                                className={cn(
                                  'flex items-center gap-3 py-2.5 w-full text-left cursor-pointer hover:bg-muted/30 transition-colors',
                                  idx < upcomingScheduled.length - 1 && 'border-b border-border/40'
                                )}
                              >
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center">
                                  <span className="text-base font-semibold text-primary leading-none">{d.getDate()}</span>
                                  <span className="text-[10px] text-primary/70 uppercase mt-0.5">{format(d, 'MMM')}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{ticket.address || '—'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{ticket.issue_description || 'No description'}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

            {/* Recent activity */}
            <div className="flex flex-col min-h-0 overflow-hidden flex-1">
              <div className="flex items-center px-6 pt-6 pb-3 min-w-0 flex-shrink-0">
                <span className="text-sm font-semibold text-muted-foreground flex-1 min-w-0">Recent activity</span>
                <Link href="/tickets" className="flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                    View all
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="divide-y divide-border/30 overflow-y-auto flex-1 min-h-0 px-2">
                {recentEvents.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No recent activity
                  </div>
                ) : (
                  recentEvents.map((event, idx) => {
                    const dotColor = EVENT_DOT_COLOR[event.event_type] || 'bg-muted-foreground'
                    const isGrouped = (event.event_count ?? 1) > 1
                    const detail = event.issue_snippet || event.property_label
                    const inner = (
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-card-foreground truncate leading-snug">{event.event_label}</p>
                          {detail && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {detail}{event.actor_name ? ` · ${event.actor_name}` : ''}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap flex-shrink-0 mt-0.5">
                          {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
                        </span>
                      </div>
                    )
                    return event.ticket_id && !isGrouped ? (
                      <button
                        key={`${event.event_type}-${event.occurred_at}-${idx}`}
                        onClick={() => openTicket(event.ticket_id!)}
                        className="flex px-4 py-2 min-w-0 hover:bg-muted/30 transition-colors cursor-pointer w-full text-left"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div
                        key={`${event.event_type}-${event.occurred_at}-${idx}`}
                        className="flex px-4 py-2 min-w-0"
                      >
                        {inner}
                      </div>
                    )
                  })
                )}
              </div>
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
    </PageShell>
  )
}
