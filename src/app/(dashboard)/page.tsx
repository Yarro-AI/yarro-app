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
  ArrowRight,
  AlertTriangle,
  LayoutGrid,
  Columns3,
  MessageSquare,
  Phone,
  User,
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
import { TooltipProvider } from '@/components/ui/tooltip'

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
type ScheduledFilter = 'today' | 'week' | 'month' | 'year'

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
  const [scheduledFilter, setScheduledFilter] = useState<ScheduledFilter>('week')
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

      const scheduledJobs = tickets.filter((t) => isOpen(t) && isScheduled(t) && !ncIds.has(t.id)).length

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
        const js = (t.job_stage || '').toLowerCase()
        if (js === 'landlord no response') return 'Landlord No Response'
        // Job progress checked FIRST (fixes auto-approve showing "Awaiting Landlord")
        if (ncIds.has(t.id)) return 'Not Completed'
        if (js === 'booked' || js === 'scheduled' || t.scheduled_date) return 'Scheduled'
        if (js === 'sent') return 'Awaiting Booking'
        // Message stage (only relevant when job hasn't progressed past this point)
        const ms = (msgStage || '').toLowerCase()
        if (ms === 'no_contractors_left') return 'No Contractors'
        if (ms === 'awaiting_manager') return 'Awaiting Manager'
        if (ms === 'awaiting_landlord') return 'Awaiting Landlord'
        if (ms === 'waiting_contractor' || ms === 'contractor_notified') return 'Awaiting Contractor'
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
        if (notCompletedIds.has(t.id)) return false
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

  // Computed action counts — hoisted so the page heading can use them
  const handoffTicketsList = allTickets.filter((t) => t.status?.toLowerCase() !== 'closed' && t.handoff === true)
  const totalHandoffs = handoffTicketsList.length + handoffConversations.length
  const declinedCount = stats?.landlordDeclined || 0
  const landlordNoResponseCount = stats?.landlordNoResponse || 0
  const managerCount = stats?.awaitingManager || 0
  const noContractorsCount = stats?.noContractorsLeft || 0
  const notCompletedCount = stats?.jobNotCompleted || 0
  const followUpCount = declinedCount + landlordNoResponseCount + notCompletedCount
  const totalAction = totalHandoffs + declinedCount + landlordNoResponseCount + noContractorsCount + managerCount + notCompletedCount

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

        <div className="relative p-4 h-full flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold text-foreground tracking-tight leading-none">To-do</h1>
              {totalAction > 0 && (
                <span className="text-sm font-bold text-white bg-red-500 rounded-full h-6 min-w-[24px] flex items-center justify-center px-2">
                  {totalAction}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="flex items-center bg-muted/50 rounded-lg p-0.5">
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
          /* Dashboard — Stats view */
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            {/* Top row: 2 cards side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-[70%_30%] gap-4 flex-1 min-h-0">

              {/* LEFT: To-do */}
              {(() => {
                const todoItems = [
                  { key: 'handoff' as const, label: 'Needs review', count: totalHandoffs, color: 'bg-red-500' },
                  { key: 'manager' as const, label: 'Manager approval', count: managerCount, color: 'bg-blue-500' },
                  { key: 'noContractorsLeft' as const, label: 'No contractors', count: noContractorsCount, color: 'bg-orange-500' },
                ]

                return (
                  <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col justify-center">
                    <div className="space-y-1">
                      {todoItems.map((item) => (
                        <button
                          key={item.key}
                          onClick={() => item.count > 0 ? showAwaitingTickets(item.key) : undefined}
                          className="w-full flex items-center gap-3 px-2.5 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        >
                          <div className={`h-3.5 w-3.5 rounded-sm flex-shrink-0 ${item.count > 0 ? item.color : 'bg-muted-foreground/15'}`} />
                          <span className={`flex-1 text-sm ${item.count > 0 ? 'text-card-foreground font-medium' : 'text-muted-foreground/50'}`}>
                            {item.label}
                          </span>
                          <span className={`text-xl font-bold tabular-nums ${item.count > 0 ? 'text-card-foreground' : 'text-muted-foreground/25'}`}>
                            {item.count}
                          </span>
                        </button>
                      ))}
                      {/* Follow-up combined row: declined + no response + not completed */}
                      <button
                        onClick={() => followUpCount > 0 ? router.push('/tickets') : undefined}
                        className="w-full flex items-center gap-3 px-2.5 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className={`h-3.5 w-3.5 rounded-sm flex-shrink-0 ${followUpCount > 0 ? 'bg-amber-500' : 'bg-muted-foreground/15'}`} />
                        <span className={`flex-1 text-sm ${followUpCount > 0 ? 'text-card-foreground font-medium' : 'text-muted-foreground/50'}`}>
                          Follow-up needed
                        </span>
                        <span className={`text-xl font-bold tabular-nums ${followUpCount > 0 ? 'text-card-foreground' : 'text-muted-foreground/25'}`}>
                          {followUpCount}
                        </span>
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* RIGHT: Scheduled jobs */}
              {(() => {
                const msPerDay = 86_400_000
                const now = new Date()
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

                const scheduledAll = allTickets.filter((t) => {
                  if (t.status?.toLowerCase() === 'closed') return false
                  if (notCompletedIds.has(t.id)) return false
                  const stage = (t.job_stage || '').toLowerCase()
                  return stage === 'booked' || stage === 'scheduled' || t.scheduled_date !== null
                })

                const scheduledFiltered = scheduledAll
                  .filter((t) => {
                    if (!t.scheduled_date) return scheduledFilter === 'year'
                    const d = new Date(t.scheduled_date)
                    if (scheduledFilter === 'today') return d >= startOfDay && d < new Date(startOfDay.getTime() + msPerDay)
                    if (scheduledFilter === 'week') return d >= startOfDay && d < new Date(startOfDay.getTime() + 7 * msPerDay)
                    if (scheduledFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                    return d.getFullYear() === now.getFullYear()
                  })
                  .sort((a, b) => {
                    if (!a.scheduled_date) return 1
                    if (!b.scheduled_date) return -1
                    return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
                  })
                  .slice(0, 6)

                const filterOptions: { key: ScheduledFilter; label: string }[] = [
                  { key: 'today', label: 'Today' },
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                  { key: 'year', label: 'Year' },
                ]

                return (
                  <div className="bg-card rounded-xl border border-border p-5 h-full flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground">Scheduled jobs</h3>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {filterOptions.map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => setScheduledFilter(opt.key)}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              scheduledFilter === opt.key
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground/60 hover:text-muted-foreground'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
                      {scheduledFiltered.length === 0 ? (
                        <p className="text-sm text-muted-foreground/60 pt-3 pb-2">No scheduled jobs for this period</p>
                      ) : (
                        scheduledFiltered.map((ticket) => (
                          <Link
                            key={ticket.id}
                            href={`/tickets?id=${ticket.id}`}
                            className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <span className="flex-shrink-0 text-xs font-medium text-muted-foreground w-10">
                              {ticket.scheduled_date ? formatDate(ticket.scheduled_date) : '—'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-card-foreground truncate">
                                {ticket.issue_description || 'No description'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Bottom: Recent tickets — fixed height, secondary context */}
            <div className="h-[300px] flex-shrink-0 bg-card/60 rounded-xl border border-border/50 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 flex-shrink-0">
                <h3 className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wide">Recent tickets</h3>
                <Link href="/tickets">
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                    View all
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <div className="divide-y divide-border/30 flex-1 overflow-y-auto">
                {recentTickets.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground/50">
                    No tickets found for this period
                  </div>
                ) : (
                  recentTickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/tickets?id=${ticket.id}`}
                      className="flex items-center justify-between px-4 py-2 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-card-foreground/80 truncate">
                          {ticket.issue_description || 'No description'}
                        </p>
                        <p className="text-xs text-muted-foreground/50 truncate">{ticket.address}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0 opacity-70">
                        {ticket.display_stage && <StatusBadge status={ticket.display_stage} />}
                        <span className="text-xs text-muted-foreground/50 whitespace-nowrap">
                          {formatDate(ticket.date_logged)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
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
