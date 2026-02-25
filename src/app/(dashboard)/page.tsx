'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { useDateRange } from '@/contexts/date-range-context'
import { StatusBadge } from '@/components/status-badge'
import {
  Clock,
  ArrowRight,
  AlertTriangle,
  Wrench,
  X,
  MessageSquare,
  Phone,
  User,
  Search,
  Menu,
  Flame,
  ClipboardCheck,
  Hourglass,
  CalendarCheck,
  UserX,
} from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Sidebar } from '@/components/sidebar'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatDistanceToNow } from 'date-fns'

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
}

interface TodoItem {
  id: string
  ticket_id: string
  issue_summary: string
  property_label: string
  action_type: string
  action_label: string
  action_context: string | null
  waiting_since: string
  priority_bucket: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
  priority: string | null
  sla_breached: boolean
}

interface RecentEvent {
  event_type: string
  event_label: string
  actor_type: string | null
  actor_name: string | null
  property_label: string | null
  metadata: unknown
  occurred_at: string
}

// Action card descriptions for tooltips
const ACTION_DESCRIPTIONS: Record<string, string> = {
  // To-do categories (wired to next_action field)
  needs_attention: 'Tickets that need your direct attention — AI couldn\'t complete them and they require your decision',
  assign_contractor: 'Tickets where all contractors declined or didn\'t respond — find and assign a new contractor',
  follow_up: 'Tickets needing follow-up — landlord no response, declined quotes, or jobs not completed',
  // Scheduled section (wired to next_action_reason field)
  contractor: 'Tickets waiting for a contractor to respond with a quote or availability',
  booking: 'Booking confirmation has been sent to the tenant — waiting for them to confirm a slot',
  scheduled: 'Jobs that have been scheduled with a contractor and have a confirmed date',
  landlord: 'Tickets waiting for landlord approval on the quoted price',
}

// Visual config per action type
const ACTION_ICON_MAP: Record<string, { icon: React.ElementType; color: string; bg: string; label_color: string }> = {
  NEEDS_ATTENTION: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10', label_color: 'text-amber-600 dark:text-amber-400' },
  ASSIGN_CONTRACTOR: { icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-500/10', label_color: 'text-blue-600 dark:text-blue-400' },
  AWAITING_APPROVAL: { icon: ClipboardCheck, color: 'text-violet-500', bg: 'bg-violet-500/10', label_color: 'text-violet-600 dark:text-violet-400' },
  CONTRACTOR_UNRESPONSIVE: { icon: UserX, color: 'text-orange-500', bg: 'bg-orange-500/10', label_color: 'text-orange-600 dark:text-orange-400' },
  FOLLOW_UP: { icon: Hourglass, color: 'text-muted-foreground', bg: 'bg-muted/40', label_color: 'text-muted-foreground' },
}

function TodoPanel({ todoItems }: { todoItems: TodoItem[] }) {
  type Bucket = TodoItem['priority_bucket']

  const BUCKETS: Bucket[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW']

  const BUCKET_STYLE: Record<Bucket, { dot: string; tab_active: string }> = {
    URGENT: { dot: 'bg-red-500', tab_active: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30' },
    HIGH:   { dot: 'bg-orange-400', tab_active: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30' },
    NORMAL: { dot: 'bg-yellow-400', tab_active: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30' },
    LOW:    { dot: 'bg-green-400', tab_active: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30' },
  }

  // Full counts from entire RPC result
  const counts: Record<Bucket, number> = {
    URGENT: todoItems.filter(i => i.priority_bucket === 'URGENT').length,
    HIGH:   todoItems.filter(i => i.priority_bucket === 'HIGH').length,
    NORMAL: todoItems.filter(i => i.priority_bucket === 'NORMAL').length,
    LOW:    todoItems.filter(i => i.priority_bucket === 'LOW').length,
  }

  // Default: URGENT if any exist, else first non-empty bucket, else 'URGENT'
  const defaultBucket: Bucket = BUCKETS.find(b => counts[b] > 0) ?? 'URGENT'
  const [activeBucket, setActiveBucket] = useState<Bucket>(defaultBucket)

  // Auto-select first non-empty bucket when current bucket empties (e.g. after data loads)
  const firstNonEmpty = BUCKETS.find(b => counts[b] > 0) ?? 'URGENT'
  useEffect(() => {
    if (todoItems.length === 0) return
    if (counts[activeBucket] > 0) return
    if (firstNonEmpty !== activeBucket) setActiveBucket(firstNonEmpty)
  }, [todoItems.length, activeBucket, counts.URGENT, counts.HIGH, counts.NORMAL, counts.LOW])

  // Filter by active bucket — no re-sort, backend order preserved
  const visible = todoItems.filter(i => i.priority_bucket === activeBucket)

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-border/60 p-8 flex flex-col gap-6 lg:flex-1 lg:min-h-0 min-w-0">

      {/* Card header */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h2 className="text-[28px] font-semibold text-card-foreground whitespace-nowrap">To-do</h2>
          {todoItems.length > 0 && (
            <span className="text-sm font-bold text-primary-foreground bg-primary rounded-full h-7 min-w-[28px] flex items-center justify-center px-2">
              {todoItems.length}
            </span>
          )}
        </div>
        <Link href="/tickets" className="flex-shrink-0">
          <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
            View all
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {todoItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">All clear</p>
        </div>
      ) : (
        <>
          {/* Tab row */}
          <div className="flex items-center gap-1 -mt-2">
            {BUCKETS.map(bucket => {
              const isActive = activeBucket === bucket
              const hasItems = counts[bucket] > 0
              return (
                <button
                  key={bucket}
                  onClick={() => setActiveBucket(bucket)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? `${BUCKET_STYLE[bucket].tab_active} border`
                      : 'text-muted-foreground hover:bg-muted/20 border border-transparent'
                  } ${!hasItems ? 'opacity-40' : ''}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${BUCKET_STYLE[bucket].dot}`} />
                  {bucket} <span className="tabular-nums">({counts[bucket]})</span>
                </button>
              )
            })}
          </div>

          {/* List */}
          {visible.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No items in this priority</p>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/30 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              {visible.map(item => {
                const isEmergency = item.priority === 'Emergency'
                const isHandoff = item.action_type === 'NEEDS_ATTENTION'
                const actionConfig = ACTION_ICON_MAP[item.action_type] || ACTION_ICON_MAP.FOLLOW_UP
                const ActionIcon = isEmergency ? Flame : actionConfig.icon

                return (
                  <Link
                    key={item.id}
                    href={`/tickets?id=${item.ticket_id}`}
                    className={`flex items-start gap-2 py-2.5 px-2 -mx-2 rounded-lg transition-colors min-w-0 ${
                      isEmergency
                        ? 'bg-red-500/8 dark:bg-red-500/10 hover:bg-red-500/15'
                        : 'hover:bg-muted/30'
                    }`}
                  >
                    {/* Left accent bar */}
                    <div className={`w-1 rounded-full flex-shrink-0 self-stretch ${
                      isEmergency ? 'bg-red-500' : isHandoff ? 'bg-amber-400' : BUCKET_STYLE[item.priority_bucket].dot
                    }`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">{item.property_label}</p>
                        {isEmergency && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-500/15 rounded px-1 py-px leading-none flex-shrink-0">
                            Emergency
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{item.issue_summary}</p>
                      <div className="flex items-center gap-1 mt-0.5 min-w-0">
                        <ActionIcon className={`h-3 w-3 flex-shrink-0 ${isEmergency ? 'text-red-500' : actionConfig.color}`} />
                        <span className={`text-xs font-medium truncate ${
                          isEmergency ? 'text-red-600 dark:text-red-400' : actionConfig.label_color
                        }`}>
                          {item.action_label}
                        </span>
                        {item.action_context && (
                          <span className="text-[11px] text-muted-foreground truncate">· {item.action_context}</span>
                        )}
                      </div>
                    </div>

                    {/* Right: time + SLA */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-0.5">
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.waiting_since), { addSuffix: true })}
                      </span>
                      {item.sla_breached && (
                        <span className="text-[10px] font-semibold text-red-600 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5 leading-none whitespace-nowrap">
                          Breach
                        </span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}

    </div>
  )
}

export default function DashboardPage() {
  const { propertyManager } = usePM()
  const { dateRange } = useDateRange()
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
        p_limit: 5,
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

      const mappedTickets = tickets.map((t) => ({
        id: t.id,
        issue_description: t.issue_description,
        status: t.status,
        job_stage: t.job_stage,
        display_stage: reasonToDisplayStage[t.next_action_reason || ''] || reasonToDisplayStage[t.next_action || ''] || 'Created',
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
      }))
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
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto lg:overflow-hidden">
        <div className="relative p-4 h-full flex flex-col gap-3">
          {/* Header — command bar: search left, controls right */}
          <div className="flex items-center justify-between flex-shrink-0 gap-4">
            {/* LEFT: hamburger (mobile only) + search */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9 flex-shrink-0">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-64 overflow-y-auto bg-card">
                  <Sidebar />
                </SheetContent>
              </Sheet>
              <div className="relative w-full max-w-72 min-w-0">
                <div className={`flex items-center gap-2 h-9 px-3 rounded-lg border bg-background/80 backdrop-blur-sm transition-all ${searchFocused ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'}`}>
                  <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Search tickets…"
                    className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {searchFocused && searchResults.length > 0 && (
                  <div className="absolute top-full mt-1.5 left-0 w-80 z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
                    {searchResults.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/tickets?id=${ticket.id}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setSearchTerm(''); setSearchFocused(false) }}
                        className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-card-foreground truncate">{ticket.issue_description || 'No description'}</p>
                          <p className="text-xs text-muted-foreground truncate">{ticket.address || '—'}</p>
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </Link>
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
            </div>{/* end left group */}
            {/* RIGHT: Create ticket button */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/tickets?create=true">
                <InteractiveHoverButton text="Create ticket" className="w-32 text-xs h-9" />
              </Link>
            </div>
          </div>

          {/* Main Content */}
          {/* Dashboard — To-do command centre + right column */}
          <div className="lg:flex-1 lg:min-h-0 flex flex-col lg:flex-row gap-3">
            {/* To-do — primary left column */}
            <TodoPanel todoItems={todoItems} />

          <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-1 lg:grid-rows-2 lg:h-full lg:w-[clamp(320px,30vw,420px)] lg:min-w-[320px] lg:max-w-[420px] min-w-0">
              {/* RIGHT: Scheduled — chronological job list */}
              {(() => {
                const scheduledTickets = allTickets
                  .filter((t) => t.next_action_reason === 'scheduled' && t.scheduled_date)
                  .sort((a, b) => {
                    const ta = new Date(a.scheduled_date!).getTime()
                    const tb = new Date(b.scheduled_date!).getTime()
                    if (isNaN(ta) && isNaN(tb)) return 0
                    if (isNaN(ta)) return 1
                    if (isNaN(tb)) return -1
                    return ta - tb
                  })
                  .slice(0, 5)

                const byDate: Record<string, TicketSummary[]> = {}
                for (const t of scheduledTickets) {
                  const key = formatDate(t.scheduled_date!)
                  if (!byDate[key]) byDate[key] = []
                  byDate[key].push(t)
                }
                const groups = Object.entries(byDate)

                return (
                  <div className="rounded-xl p-4 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-xl font-semibold text-card-foreground flex-1 min-w-0">Scheduled</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {scheduledTickets.length > 0 && (
                          <span className="text-xs font-bold text-primary bg-primary/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">
                            {scheduledTickets.length}
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

                    <div className="flex-1 flex flex-col min-h-0">
                      {groups.length === 0 ? (
                        <div className="flex gap-3 items-center">
                          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground/40">—</span>
                          </div>
                          <p className="text-sm text-muted-foreground/40">No scheduled jobs</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {groups.map(([date, tickets]) => (
                            <div key={date} className="flex gap-3">
                              {(() => {
                                const [day, month] = date.split(' ')
                                return (
                                  <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-muted/60 flex flex-col items-center justify-center">
                                    <span className="text-[20px] font-semibold text-card-foreground leading-none">{day}</span>
                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground leading-none mt-0.5">{month}</span>
                                  </div>
                                )
                              })()}
                              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                {tickets.map((ticket) => (
                                  <Link
                                    key={ticket.id}
                                    href={`/tickets?id=${ticket.id}`}
                                    className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-card-foreground truncate">
                                        {ticket.issue_description || 'No description'}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{ticket.address || '—'}</p>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

            {/* Recent activity */}
            <div className="rounded-xl flex flex-col min-h-0 overflow-hidden lg:border-t lg:border-border/40">
              <div className="flex items-center px-4 py-3 border-b border-border/40 min-w-0">
                <h3 className="text-xl font-semibold text-card-foreground flex-1 min-w-0">Recent activity</h3>
                <Link href="/tickets" className="flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                    View all
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="divide-y divide-border/30 overflow-hidden flex-1 min-h-0">
                {recentEvents.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No recent activity
                  </div>
                ) : (
                  recentEvents.map((event, idx) => (
                    <div
                      key={`${event.event_type}-${event.occurred_at}-${idx}`}
                      className="flex items-start justify-between px-4 py-3 gap-3 min-w-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-card-foreground truncate">{event.event_label}</p>
                        {event.property_label && (
                          <p className="text-xs text-muted-foreground truncate">{event.property_label}</p>
                        )}
                        {(event.actor_type || event.actor_name) && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {event.actor_type && (
                              <span className="text-[11px] font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 leading-none">
                                {event.actor_type}
                              </span>
                            )}
                            {event.actor_name && (
                              <span className="text-xs text-muted-foreground truncate">{event.actor_name}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 mt-0.5">
                        {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))
                )}
              </div>
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
                    <Link
                      href={`/tickets?id=${ticket.id}`}
                      className="block"
                      onClick={() => setAwaitingType(null)}
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
                    </Link>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      {ticket.display_stage && <StatusBadge status={ticket.display_stage} />}
                      {awaitingType === 'handoff' && ticket.handoff && (
                        <Link
                          href={`/tickets?id=${ticket.id}&action=complete`}
                          onClick={() => setAwaitingType(null)}
                        >
                          <InteractiveHoverButton text="Review" className="w-24 text-xs h-7 p-1" />
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
                <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
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
                  {/* Left: Conversation Context (collapsible) */}
                  {showHandoffConvo && (
                    <div className="flex flex-col min-h-0 border rounded-lg p-3">
                      {/* Caller info bar — matches ticket-conversation-tab design */}
                      <div className="flex items-center gap-4 pb-2 mb-2 border-b flex-shrink-0">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono text-xs">{selectedHandoff.phone || 'Unknown'}</span>
                        </div>
                        {selectedHandoff.caller_name && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">
                              {selectedHandoff.caller_name}
                              {selectedHandoff.caller_role && (
                                <span className="text-muted-foreground text-[10px] ml-1">({selectedHandoff.caller_role})</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Chat bubbles */}
                      <div className="flex-1 min-h-0 overflow-y-auto bg-muted/30 rounded-xl p-3">
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
                      {/* Handoff reason hint */}
                      <div className="mt-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex-shrink-0">
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          <strong>Handoff:</strong> {selectedHandoff.stage === 'handoff' ? 'AI determined this needs human review' : `Stage: ${selectedHandoff.stage || 'unknown'}`}
                        </p>
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
    </TooltipProvider>
  )
}
