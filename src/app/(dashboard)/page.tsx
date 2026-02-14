'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DateFilter } from '@/components/date-filter'
import { useDateRange } from '@/contexts/date-range-context'
import { StatusBadge } from '@/components/status-badge'
import { KanbanBoard } from '@/components/kanban-board'
import {
  Clock,
  UserCheck,
  ArrowRight,
  Hourglass,
  CalendarClock,
  AlertTriangle,
  XCircle,
  BarChart3,
  Plus,
  CheckCircle2,
  LayoutDashboard,
  LayoutGrid,
  Columns3,
  Send,
  CircleX,
  MessageSquare,
} from 'lucide-react'
import Link from 'next/link'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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
}

// Chart colors
const CATEGORY_COLORS = ['#0059ff', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981']

// Action card descriptions for tooltips
const ACTION_DESCRIPTIONS = {
  handoff: 'Tickets that need your manual review because the AI couldn\'t complete them automatically',
  contractor: 'Tickets waiting for a contractor to respond with a quote or availability',
  manager: 'Tickets that need your decision or approval before proceeding',
  landlord: 'Tickets waiting for landlord approval on the quoted price',
  scheduled: 'Jobs that have been scheduled with a contractor and have a confirmed date',
  declined: 'Tickets where the landlord declined the quoted price — these need follow-up',
  landlordNoResponse: 'Landlord hasn\'t responded to the approval request after the follow-up — contact them directly',
  noContractorsLeft: 'All contractors either declined or didn\'t respond — re-dispatch or find a new contractor',
  booking: 'Booking confirmation has been sent to the tenant — waiting for them to confirm a slot',
  notCompleted: 'Contractor marked the job as not completed — needs follow-up action',
}

type ViewMode = 'stats' | 'board'

export default function DashboardPage() {
  const router = useRouter()
  const { propertyManager } = usePM()
  const { dateRange, setDateRange } = useDateRange()
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dashboard-view') as ViewMode) || 'stats'
    }
    return 'stats'
  })
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTickets, setRecentTickets] = useState<TicketSummary[]>([])
  const [allTickets, setAllTickets] = useState<TicketSummary[]>([])
  const [awaitingTickets, setAwaitingTickets] = useState<TicketSummary[]>([])
  const [awaitingType, setAwaitingType] = useState<string | null>(null)
  const [handoffConversations, setHandoffConversations] = useState<HandoffConversation[]>([])
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffConversation | null>(null)
  const [createTicketOpen, setCreateTicketOpen] = useState(false)
  const [showHandoffConvo, setShowHandoffConvo] = useState(false)
  const [notCompletedIds, setNotCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Persist view mode
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('dashboard-view', mode)
  }

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    setLoading(true)

    // Fetch tickets with message stage (source of truth for workflow state)
    const [ticketsRes, convosRes, notCompletedRes] = await Promise.all([
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
          c1_properties(address),
          c1_messages(stage, landlord)
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
      // Fetch not-completed job IDs
      supabase
        .from('c1_job_completions')
        .select('id')
        .eq('completed', false),
    ])

    const tickets = ticketsRes.data
    const conversations = convosRes.data
    const ncIds = new Set((notCompletedRes.data || []).map(r => r.id))
    setNotCompletedIds(ncIds)

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

      type MessageData = { stage: string; landlord?: { approval?: boolean | null } | null }
      const getMessageData = (t: { c1_messages: MessageData | MessageData[] | null }): MessageData | null => {
        const messages = t.c1_messages
        if (!messages) return null
        if (Array.isArray(messages)) {
          return messages[0] || null
        }
        return messages
      }
      const getMessageStage = (t: { c1_messages: MessageData | MessageData[] | null }) => {
        const data = getMessageData(t)
        return (data?.stage || '').toLowerCase()
      }
      const isOpen = (t: { status: string }) => t.status?.toLowerCase() !== 'closed'
      const isScheduled = (t: { job_stage: string | null; scheduled_date: string | null }) => {
        const stage = (t.job_stage || '').toLowerCase()
        return stage === 'booked' || stage === 'scheduled' || t.scheduled_date !== null
      }

      const handoffTickets = tickets.filter((t) => isOpen(t) && t.handoff === true).length

      const awaitingContractor = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = getMessageStage(t)
        return msgStage === 'waiting_contractor' || msgStage === 'contractor_notified'
      }).length

      const awaitingManager = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = getMessageStage(t)
        return msgStage === 'awaiting_manager'
      }).length

      const awaitingLandlord = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = getMessageStage(t)
        return msgStage === 'awaiting_landlord'
      }).length

      const landlordDeclined = tickets.filter((t) => {
        const data = getMessageData(t)
        return data?.landlord?.approval === false
      }).length

      const landlordNoResponse = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const js = (t.job_stage || '').toLowerCase()
        return js === 'landlord no response'
      }).length

      const noContractorsLeft = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = getMessageStage(t)
        return msgStage === 'no_contractors_left'
      }).length

      const scheduledJobs = tickets.filter((t) => isOpen(t) && isScheduled(t)).length

      const awaitingBooking = tickets.filter((t) => {
        if (!isOpen(t)) return false
        const stage = (t.job_stage || '').toLowerCase()
        return stage === 'sent'
      }).length

      const jobNotCompleted = tickets.filter((t) => {
        if (!isOpen(t)) return false
        return ncIds.has(t.id)
      }).length

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

      const deriveDisplayStage = (t: { id: string; status: string; handoff: boolean | null; job_stage: string | null; scheduled_date: string | null }, msgStage: string | null): string | null => {
        const isClosed = t.status?.toLowerCase() === 'closed'
        if (isClosed) return 'Completed'
        if (t.handoff) return 'Handoff'
        const js2 = (t.job_stage || '').toLowerCase()
        if (js2 === 'landlord no response') return 'Landlord No Response'
        const ms = (msgStage || '').toLowerCase()
        if (ms === 'no_contractors_left') return 'No Contractors'
        if (ms === 'awaiting_manager') return 'Awaiting Manager'
        if (ms === 'awaiting_landlord') return 'Awaiting Landlord'
        if (ms === 'waiting_contractor' || ms === 'contractor_notified') return 'Awaiting Contractor'
        if (ncIds.has(t.id)) return 'Not Completed'
        const js = (t.job_stage || '').toLowerCase()
        if (js === 'booked' || js === 'scheduled' || t.scheduled_date) return 'Scheduled'
        if (js === 'sent') return 'Awaiting Booking'
        return 'Created'
      }

      const mappedTickets = tickets.map((t) => {
        const messages = t.c1_messages as MessageData | MessageData[] | null
        const messageStage = messages
          ? Array.isArray(messages) ? messages[0]?.stage : messages.stage
          : null
        return {
          id: t.id,
          issue_description: t.issue_description,
          status: t.status,
          job_stage: t.job_stage,
          display_stage: deriveDisplayStage(t, messageStage),
          message_stage: messageStage || null,
          category: t.category,
          priority: t.priority,
          date_logged: t.date_logged,
          scheduled_date: t.scheduled_date,
          final_amount: t.final_amount,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
          handoff: t.handoff,
          landlord_declined: (() => {
            const data = messages
              ? Array.isArray(messages) ? messages[0] : messages
              : null
            return data?.landlord?.approval === false
          })(),
        }
      })
      setAllTickets(mappedTickets)
      setRecentTickets(mappedTickets.slice(0, 5))
    }

    setLoading(false)
  }, [propertyManager, dateRange, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const showAwaitingTickets = (type: string) => {
    const isOpen = (t: TicketSummary) => t.status?.toLowerCase() !== 'closed'

    let filtered: TicketSummary[] = []

    if (type === 'contractor') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = (t.message_stage || '').toLowerCase()
        return msgStage === 'waiting_contractor' || msgStage === 'contractor_notified'
      })
    } else if (type === 'manager') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = (t.message_stage || '').toLowerCase()
        return msgStage === 'awaiting_manager'
      })
    } else if (type === 'landlord') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = (t.message_stage || '').toLowerCase()
        return msgStage === 'awaiting_landlord'
      })
    } else if (type === 'booking') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const jobStage = (t.job_stage || '').toLowerCase()
        return jobStage === 'sent'
      })
    } else if (type === 'scheduled') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const jobStage = (t.job_stage || '').toLowerCase()
        return jobStage === 'booked' || jobStage === 'scheduled' || t.scheduled_date !== null
      })
    } else if (type === 'handoff') {
      filtered = allTickets.filter((t) => isOpen(t) && t.handoff === true)
    } else if (type === 'declined') {
      filtered = allTickets.filter((t) => t.landlord_declined === true)
    } else if (type === 'landlordNoResponse') {
      filtered = allTickets.filter((t) => t.display_stage === 'Landlord No Response')
    } else if (type === 'noContractorsLeft') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const msgStage = (t.message_stage || '').toLowerCase()
        return msgStage === 'no_contractors_left'
      })
    } else if (type === 'notCompleted') {
      filtered = allTickets.filter((t) => isOpen(t) && notCompletedIds.has(t.id))
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

  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0
    return Math.round((value / total) * 100)
  }

  const categoryData = allTickets.reduce(
    (acc, ticket) => {
      const cat = ticket.category || 'Other'
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const categoryChartData = Object.entries(categoryData)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      fullName: name,
      value,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))

  const getSheetTitle = (type: string | null) => {
    switch (type) {
      case 'handoff': return 'Handoff Review'
      case 'contractor': return 'Awaiting Contractor'
      case 'manager': return 'Awaiting Manager'
      case 'landlord': return 'Awaiting Landlord'
      case 'scheduled': return 'Scheduled Jobs'
      case 'declined': return 'Landlord Declined'
      case 'landlordNoResponse': return 'Landlord No Response'
      case 'noContractorsLeft': return 'No Contractors Available'
      case 'booking': return 'Awaiting Booking'
      case 'notCompleted': return 'Job Not Completed'
      default: return ''
    }
  }

  if (loading && !stats) {
    return (
      <div className="p-4 h-full bg-gradient-to-br from-blue-50/50 via-background to-cyan-50/30 dark:from-background dark:via-background dark:to-background overflow-hidden">
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
      <div className="h-full bg-gradient-to-br from-blue-50/50 via-background to-cyan-50/30 dark:from-background dark:via-background dark:to-background overflow-hidden">
        <div className="fixed inset-0 bg-gradient-to-b from-blue-500/[0.02] to-transparent pointer-events-none dark:hidden" />

        <div className="relative p-4 h-full flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-2.5">
                <LayoutDashboard className="h-7 w-7" />
                Dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage and monitor all property maintenance activity
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => handleViewChange('stats')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'stats'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Stats
                </button>
                <button
                  onClick={() => handleViewChange('board')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'board'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Board
                </button>
              </div>
              <DateFilter value={dateRange} onChange={setDateRange} />
            </div>
          </div>

          {/* Main Content - Stats or Board view */}
          {viewMode === 'board' ? (
            <div className="flex-1 min-h-0">
              <KanbanBoard
                tickets={allTickets}
                onTicketClick={(id) => router.push(`/tickets?id=${id}`)}
                onHandoffReview={(id) => router.push(`/tickets?id=${id}&action=complete`)}
              />
            </div>
          ) : (
          /* Dashboard — Vertical Flow v3 */
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            {/* Ticket Overview — unified panel, always same height */}
            <div className="bg-card rounded-xl border border-border p-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-card-foreground">Ticket Overview</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{stats?.totalTickets || 0} total</span>
                  <Link href="/tickets?create=true">
                    <InteractiveHoverButton text="Create" className="w-24 text-xs h-7" />
                  </Link>
                  <Link href="/tickets" className="text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                    View all →
                  </Link>
                </div>
              </div>

              {/* Status bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</span>
                  {stats && stats.totalTickets > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {getPercentage(stats.closedTickets, stats.totalTickets)}% complete
                    </span>
                  )}
                </div>
                <div className="h-3 rounded-full overflow-hidden flex bg-muted">
                  {stats && stats.totalTickets > 0 ? (
                    <>
                      <div
                        className="h-full bg-blue-500 transition-all duration-500 ease-out"
                        style={{ flex: stats.openTickets }}
                      />
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                        style={{ flex: stats.closedTickets }}
                      />
                    </>
                  ) : null}
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs text-muted-foreground">Open</span>
                    <span className="text-xs font-semibold text-card-foreground">{stats?.openTickets || 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground">Closed</span>
                    <span className="text-xs font-semibold text-card-foreground">{stats?.closedTickets || 0}</span>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border mb-4" />

              {/* Category bar */}
              <div>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</span>
                <div className="h-3 rounded-full overflow-hidden flex bg-muted mt-1.5">
                  {categoryChartData.map((item) => (
                    <Tooltip key={item.fullName}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-full transition-all duration-500 ease-out"
                          style={{
                            flex: item.value,
                            backgroundColor: item.color,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs font-medium">{item.fullName}: {item.value}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                  {categoryChartData.length > 0 ? (
                    categoryChartData.map((item) => (
                      <div key={item.fullName} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-muted-foreground">{item.fullName}</span>
                        <span className="text-xs font-semibold text-card-foreground">{item.value}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No categories yet</span>
                  )}
                </div>
              </div>
            </div>

            {/* Requires Action + In Progress — two columns */}
            <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
              {/* Requires Action */}
              {(() => {
                const handoffTicketsList = allTickets.filter((t) => t.status?.toLowerCase() !== 'closed' && t.handoff === true)
                const totalHandoffs = handoffTicketsList.length + handoffConversations.length
                const declinedCount = stats?.landlordDeclined || 0
                const landlordNoResponseCount = stats?.landlordNoResponse || 0
                const managerCount = stats?.awaitingManager || 0
                const noContractorsCount = stats?.noContractorsLeft || 0
                const notCompletedCount = stats?.jobNotCompleted || 0

                const totalAction = totalHandoffs + declinedCount + landlordNoResponseCount + noContractorsCount + managerCount + notCompletedCount

                return (
                  <div className="bg-card rounded-xl border border-border p-4 flex flex-col min-h-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-3 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-card-foreground">Your To-Do</h3>
                        {totalAction > 0 && (
                          <span className="text-xs font-bold text-white bg-red-500 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">{totalAction}</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0">
                      {/* Primary actions */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => totalHandoffs > 0 ? showAwaitingTickets('handoff') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${totalHandoffs > 0 ? 'bg-red-500/15' : 'bg-muted'}`}>
                              <AlertTriangle className={`h-4 w-4 ${totalHandoffs > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${totalHandoffs > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>Handoff Review</p>
                              <p className="text-xs text-muted-foreground">AI needs your help</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${totalHandoffs > 0 ? 'text-red-500' : 'text-muted-foreground/40'}`}>
                              {totalHandoffs}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.handoff}</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => managerCount > 0 ? showAwaitingTickets('manager') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${managerCount > 0 ? 'bg-blue-500/15' : 'bg-muted'}`}>
                              <UserCheck className={`h-4 w-4 ${managerCount > 0 ? 'text-blue-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${managerCount > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>Manager Approval</p>
                              <p className="text-xs text-muted-foreground">Check WhatsApp & approve</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${managerCount > 0 ? 'text-blue-500' : 'text-muted-foreground/40'}`}>
                              {managerCount}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.manager}</p></TooltipContent>
                      </Tooltip>

                      {/* Separator */}
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">Needs Follow Up</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => declinedCount > 0 ? showAwaitingTickets('declined') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${declinedCount > 0 ? 'bg-orange-500/15' : 'bg-muted'}`}>
                              <XCircle className={`h-4 w-4 ${declinedCount > 0 ? 'text-orange-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${declinedCount > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>Landlord Declined</p>
                              <p className="text-xs text-muted-foreground">Needs follow-up</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${declinedCount > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}`}>
                              {declinedCount}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.declined}</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => landlordNoResponseCount > 0 ? showAwaitingTickets('landlordNoResponse') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${landlordNoResponseCount > 0 ? 'bg-orange-500/15' : 'bg-muted'}`}>
                              <Clock className={`h-4 w-4 ${landlordNoResponseCount > 0 ? 'text-orange-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${landlordNoResponseCount > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>Landlord No Response</p>
                              <p className="text-xs text-muted-foreground">Contact directly</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${landlordNoResponseCount > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}`}>
                              {landlordNoResponseCount}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.landlordNoResponse}</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => noContractorsCount > 0 ? showAwaitingTickets('noContractorsLeft') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${noContractorsCount > 0 ? 'bg-red-500/15' : 'bg-muted'}`}>
                              <AlertTriangle className={`h-4 w-4 ${noContractorsCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${noContractorsCount > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>No Contractors</p>
                              <p className="text-xs text-muted-foreground">Re-dispatch or find new</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${noContractorsCount > 0 ? 'text-red-500' : 'text-muted-foreground/40'}`}>
                              {noContractorsCount}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.noContractorsLeft}</p></TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => notCompletedCount > 0 ? showAwaitingTickets('notCompleted') : undefined}
                            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                          >
                            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${notCompletedCount > 0 ? 'bg-red-500/15' : 'bg-muted'}`}>
                              <CircleX className={`h-4 w-4 ${notCompletedCount > 0 ? 'text-red-500' : 'text-muted-foreground/50'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium ${notCompletedCount > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>Job Not Completed</p>
                              <p className="text-xs text-muted-foreground">Needs follow-up</p>
                            </div>
                            <span className={`text-lg font-bold tabular-nums ${notCompletedCount > 0 ? 'text-red-500' : 'text-muted-foreground/40'}`}>
                              {notCompletedCount}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{ACTION_DESCRIPTIONS.notCompleted}</p></TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })()}

              {/* In Progress */}
              <div className="bg-card rounded-xl border border-border p-4 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-card-foreground">In Progress</h3>
                  {(() => {
                    const totalProgress = (stats?.awaitingContractor || 0) + (stats?.awaitingBooking || 0) + (stats?.scheduledJobs || 0) + (stats?.awaitingLandlord || 0)
                    return totalProgress > 0 ? (
                      <span className="text-xs font-bold text-primary bg-primary/10 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1.5">{totalProgress}</span>
                    ) : null
                  })()}
                </div>
                <div className="space-y-1.5 overflow-y-auto flex-1 min-h-0">
                  {[
                    { key: 'contractor' as const, label: 'Awaiting Contractor', desc: 'Waiting for quote or availability', count: stats?.awaitingContractor || 0, icon: Clock, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500' },
                    { key: 'booking' as const, label: 'Awaiting Booking', desc: 'Booking sent, waiting for confirmation', count: stats?.awaitingBooking || 0, icon: Send, iconBg: 'bg-indigo-500/10', iconColor: 'text-indigo-500' },
                    { key: 'scheduled' as const, label: 'Scheduled Jobs', desc: 'Confirmed date with contractor', count: stats?.scheduledJobs || 0, icon: CalendarClock, iconBg: 'bg-cyan-500/10', iconColor: 'text-cyan-500' },
                    { key: 'landlord' as const, label: 'Awaiting Landlord', desc: 'Waiting for price approval', count: stats?.awaitingLandlord || 0, icon: Hourglass, iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500' },
                  ].map((item) => (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => item.count > 0 ? showAwaitingTickets(item.key) : undefined}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-all duration-200 text-left"
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                            <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${item.count > 0 ? 'text-card-foreground' : 'text-muted-foreground'}`}>{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                          <span className={`text-lg font-bold tabular-nums ${item.count > 0 ? 'text-card-foreground' : 'text-muted-foreground/40'}`}>
                            {item.count}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{ACTION_DESCRIPTIONS[item.key]}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Tickets — fills remaining space */}
            <div className="flex-1 min-h-0 bg-card rounded-xl border border-border flex flex-col">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
                <h3 className="text-sm font-semibold text-card-foreground">Recent Tickets</h3>
                <Link href="/tickets">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                    View all
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="divide-y divide-border flex-1 overflow-y-auto">
                {recentTickets.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No tickets found for this period
                  </div>
                ) : (
                  recentTickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/tickets?id=${ticket.id}`}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-all duration-200"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {ticket.issue_description || 'No description'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {ticket.address}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {ticket.display_stage && (
                          <StatusBadge status={ticket.display_stage} />
                        )}
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(ticket.date_logged)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
          )}
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
                    <div className="flex flex-col min-h-0 border rounded-lg">
                      <div className="px-4 py-3 border-b bg-muted/30 flex-shrink-0">
                        <h4 className="font-medium text-sm">Conversation History</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {selectedHandoff.caller_name || 'Unknown'} • {selectedHandoff.phone}
                        </p>
                      </div>
                      <div className="flex-1 overflow-y-auto p-3">
                        <ChatHistory
                          messages={(() => {
                            const log = selectedHandoff.log
                            if (!log || !Array.isArray(log)) return []
                            return (log as Array<{ direction?: string; text?: string; content?: string; message?: string; timestamp?: string; label?: string }>)
                              .filter(entry => !entry.label && (entry.text || entry.content || entry.message))
                              .map(entry => ({
                                role: entry.direction === 'in' ? 'tenant' : entry.direction === 'out' ? 'assistant' : 'system',
                                text: entry.text || entry.content || entry.message || '',
                                timestamp: entry.timestamp,
                              }))
                          })()}
                        />
                      </div>
                      {/* Handoff reason hint */}
                      <div className="px-4 py-2 border-t bg-amber-50 dark:bg-amber-950/20 flex-shrink-0">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          <strong>Handoff reason:</strong> {selectedHandoff.stage === 'handoff' ? 'AI determined this needs human review' : `Stage: ${selectedHandoff.stage || 'unknown'}`}
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
                            .filter(entry => entry.direction === 'in')
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
