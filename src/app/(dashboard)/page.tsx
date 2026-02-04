'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { StatusBadge } from '@/components/status-badge'
import {
  Clock,
  UserCheck,
  ArrowRight,
  Hourglass,
  CalendarClock,
  AlertTriangle,
  XCircle,
  BarChart3,
  MessageSquare,
  Plus,
  CheckCircle2,
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
  scheduledJobs: number
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
  message_stage?: string | null
  category: string | null
  date_logged: string
  scheduled_date?: string | null
  address?: string
  handoff?: boolean
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
}

export default function DashboardPage() {
  const { propertyManager } = usePM()
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange())
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentTickets, setRecentTickets] = useState<TicketSummary[]>([])
  const [allTickets, setAllTickets] = useState<TicketSummary[]>([])
  const [awaitingTickets, setAwaitingTickets] = useState<TicketSummary[]>([])
  const [awaitingType, setAwaitingType] = useState<string | null>(null)
  const [handoffConversations, setHandoffConversations] = useState<HandoffConversation[]>([])
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffConversation | null>(null)
  const [createTicketOpen, setCreateTicketOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    setLoading(true)

    // Fetch tickets with message stage (source of truth for workflow state)
    const [ticketsRes, convosRes] = await Promise.all([
      supabase
        .from('c1_tickets')
        .select(`
          id,
          issue_description,
          status,
          job_stage,
          category,
          date_logged,
          scheduled_date,
          handoff,
          conversation_id,
          c1_properties(address),
          c1_messages(stage, landlord)
        `)
        .eq('property_manager_id', propertyManager.id)
        .gte('date_logged', dateRange.from.toISOString())
        .lte('date_logged', dateRange.to.toISOString())
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
        .order('last_updated', { ascending: false })
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

      const scheduledJobs = tickets.filter((t) => isOpen(t) && isScheduled(t)).length

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
        scheduledJobs,
      })

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
          message_stage: messageStage || null,
          category: t.category,
          date_logged: t.date_logged,
          scheduled_date: t.scheduled_date,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
          handoff: t.handoff,
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
    } else if (type === 'scheduled') {
      filtered = allTickets.filter((t) => {
        if (!isOpen(t)) return false
        const jobStage = (t.job_stage || '').toLowerCase()
        return jobStage === 'booked' || jobStage === 'scheduled' || t.scheduled_date !== null
      })
    } else if (type === 'handoff') {
      filtered = allTickets.filter((t) => isOpen(t) && t.handoff === true)
    } else if (type === 'declined') {
      filtered = []
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
      name: name.length > 12 ? name.substring(0, 12) + '...' : name,
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
      default: return ''
    }
  }

  if (loading && !stats) {
    return (
      <div className="p-4 h-full bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 overflow-hidden">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-2 gap-4 flex-1">
            <div className="space-y-4">
              <div className="h-[140px] bg-muted rounded-xl" />
              <div className="h-[200px] bg-muted rounded-xl" />
              <div className="h-[100px] bg-muted rounded-xl" />
            </div>
            <div className="space-y-4">
              <div className="h-[160px] bg-muted rounded-xl" />
              <div className="h-[180px] bg-muted rounded-xl" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-[100px] bg-muted rounded-xl" />
                <div className="h-[100px] bg-muted rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full bg-gradient-to-br from-blue-50/50 via-background to-cyan-50/30 dark:from-background dark:via-background dark:to-background overflow-hidden">
        <div className="fixed inset-0 bg-gradient-to-b from-blue-500/[0.02] to-transparent pointer-events-none dark:from-blue-500/[0.05]" />

        <div className="relative p-4 h-full flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage and monitor all property maintenance activity
              </p>
            </div>
            <DateFilter value={dateRange} onChange={setDateRange} />
          </div>

          {/* Main Two-Column Layout - Midline at ~38% from top */}
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* TOP SECTION (38%): By Status + By Category */}
              <div className="flex flex-col gap-3" style={{ height: '38%' }}>
                {/* By Status - compact */}
                <div className="bg-card rounded-xl border border-border p-3 flex-shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-blue-500" />
                      <h3 className="text-sm font-semibold text-card-foreground">By Status</h3>
                    </div>
                    <Link href="/tickets" className="text-xs text-primary hover:text-primary/80 font-medium">
                      {stats?.totalTickets || 0} total
                    </Link>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden flex mb-2">
                    {stats && stats.totalTickets > 0 ? (
                      <>
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${getPercentage(stats.openTickets, stats.totalTickets)}%` }}
                        />
                        <div
                          className="h-full bg-emerald-400 transition-all duration-500"
                          style={{ width: `${getPercentage(stats.closedTickets, stats.totalTickets)}%` }}
                        />
                      </>
                    ) : (
                      <div className="h-full w-full bg-muted" />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 flex items-center gap-2 p-1.5 bg-blue-500/10 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-xs text-muted-foreground">Open</span>
                      <span className="text-sm font-bold text-card-foreground ml-auto">{stats?.openTickets || 0}</span>
                    </div>
                    <div className="flex-1 flex items-center gap-2 p-1.5 bg-emerald-500/10 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-muted-foreground">Closed</span>
                      <span className="text-sm font-bold text-card-foreground ml-auto">{stats?.closedTickets || 0}</span>
                    </div>
                  </div>
                </div>

                {/* By Category - fills remaining top section */}
                <div className="bg-card rounded-xl border border-border p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
                  <h3 className="text-sm font-semibold text-card-foreground mb-2 flex-shrink-0">By Category</h3>
                  {categoryChartData.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5 flex-1 overflow-y-auto">
                      {categoryChartData.slice(0, 6).map((item) => (
                        <div
                          key={item.fullName}
                          className="flex items-center gap-2 p-1.5 rounded-lg"
                          style={{ backgroundColor: `${item.color}15` }}
                        >
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="flex-1 min-w-0 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                            <p className="text-xs font-bold text-card-foreground ml-1">{item.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                      No category data
                    </div>
                  )}
                </div>
              </div>

              {/* BOTTOM SECTION (62%): Recent Tickets */}
              <div className="bg-card rounded-xl border border-border flex flex-col min-h-0" style={{ height: '62%' }}>
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
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
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
                          {ticket.job_stage && (
                            <StatusBadge status={ticket.job_stage} />
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

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* TOP SECTION (38%): Awaiting Action - compact, no scroll */}
              {(() => {
                const handoffTicketsList = allTickets.filter((t) => t.status?.toLowerCase() !== 'closed' && t.handoff === true)
                const totalHandoffs = handoffTicketsList.length + handoffConversations.length
                const hasHandoffs = totalHandoffs > 0
                return (
                  <div className="bg-card rounded-xl border border-border flex flex-col" style={{ height: '38%' }}>
                    <div className="px-4 py-2 border-b border-border flex-shrink-0">
                      <h3 className="text-sm font-semibold text-card-foreground">Awaiting Action</h3>
                    </div>
                    <div className="flex-1 p-2 space-y-1.5 overflow-hidden">
                      {/* Handoff Review row */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => hasHandoffs ? showAwaitingTickets('handoff') : undefined}
                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors text-left ${
                              hasHandoffs
                                ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                                : 'bg-muted/30 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle className={`h-3.5 w-3.5 ${hasHandoffs ? 'text-red-500' : 'text-muted-foreground'}`} />
                              <span className={`text-sm ${hasHandoffs ? 'text-red-700 dark:text-red-300 font-medium' : 'text-card-foreground'}`}>
                                Handoff Review
                              </span>
                            </div>
                            <span className={`text-sm font-bold ${hasHandoffs ? 'text-red-500' : 'text-card-foreground'}`}>
                              {totalHandoffs}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          <p className="text-xs">{ACTION_DESCRIPTIONS.handoff}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Awaiting Contractor */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => showAwaitingTickets('contractor')}
                            className="w-full flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-card-foreground">Awaiting Contractor</span>
                            </div>
                            <span className="text-sm font-bold text-card-foreground">{stats?.awaitingContractor || 0}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          <p className="text-xs">{ACTION_DESCRIPTIONS.contractor}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Awaiting Manager */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => showAwaitingTickets('manager')}
                            className="w-full flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-card-foreground">Awaiting Manager</span>
                            </div>
                            <span className="text-sm font-bold text-card-foreground">{stats?.awaitingManager || 0}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          <p className="text-xs">{ACTION_DESCRIPTIONS.manager}</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Awaiting Landlord */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => showAwaitingTickets('landlord')}
                            className="w-full flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm text-card-foreground">Awaiting Landlord</span>
                            </div>
                            <span className="text-sm font-bold text-card-foreground">{stats?.awaitingLandlord || 0}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[200px]">
                          <p className="text-xs">{ACTION_DESCRIPTIONS.landlord}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })()}

              {/* BOTTOM SECTION (62%): Quick Actions + Scheduled/Declined */}
              <div className="flex flex-col gap-3 min-h-0" style={{ height: '62%' }}>
                {/* Quick Actions row - at top, starting from midline */}
                <div className="grid grid-cols-3 gap-3 flex-shrink-0">
                  {/* Create Manual Ticket */}
                  <Link
                    href="/tickets?create=true"
                    className="bg-card rounded-xl border border-primary/30 p-3 flex items-center gap-3 hover:bg-primary/5 hover:border-primary/50 transition-colors group"
                  >
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Create Ticket</p>
                      <p className="text-xs text-muted-foreground">Manual entry</p>
                    </div>
                  </Link>

                  {/* Completion Rate */}
                  <div className="bg-card rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Completion Rate</span>
                      <span className="text-lg font-bold text-emerald-500">
                        {stats && stats.totalTickets > 0 ? `${getPercentage(stats.closedTickets, stats.totalTickets)}%` : '—'}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: stats ? `${getPercentage(stats.closedTickets, stats.totalTickets)}%` : '0%' }}
                      />
                    </div>
                  </div>

                  {/* Active Conversations */}
                  <Link
                    href="/conversations"
                    className="bg-card rounded-xl border border-border p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-card-foreground">Conversations</p>
                      <p className="text-xs text-muted-foreground">View active chats</p>
                    </div>
                  </Link>
                </div>

                {/* Scheduled + Declined row - below quick actions */}
                <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
                  {/* Scheduled */}
                  <div className="bg-card rounded-xl border border-blue-200 dark:border-blue-900 flex flex-col min-h-0">
                    <div className="px-3 py-2 border-b border-border flex-shrink-0 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-blue-500" />
                        <h3 className="text-sm font-semibold text-card-foreground">Scheduled</h3>
                      </div>
                      <span className="text-lg font-bold text-blue-500">{stats?.scheduledJobs || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {(() => {
                        const scheduledTickets = allTickets.filter((t) => {
                          if (t.status?.toLowerCase() === 'closed') return false
                          const jobStage = (t.job_stage || '').toLowerCase()
                          return jobStage === 'booked' || jobStage === 'scheduled' || t.scheduled_date !== null
                        })
                        return scheduledTickets.length > 0 ? (
                          scheduledTickets.slice(0, 6).map((ticket) => (
                            <Link
                              key={ticket.id}
                              href={`/tickets?id=${ticket.id}`}
                              className="block p-1.5 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <p className="text-xs font-medium text-card-foreground truncate">{ticket.issue_description || 'No description'}</p>
                              <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
                            </Link>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-4">No scheduled jobs</p>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Declined */}
                  <div className={`bg-card rounded-xl border flex flex-col min-h-0 ${stats?.landlordDeclined ? 'border-orange-300 dark:border-orange-800' : 'border-border'}`}>
                    <div className="px-3 py-2 border-b border-border flex-shrink-0 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <XCircle className={`h-4 w-4 ${stats?.landlordDeclined ? 'text-orange-500' : 'text-muted-foreground'}`} />
                        <h3 className="text-sm font-semibold text-card-foreground">Landlord Declined</h3>
                      </div>
                      <span className={`text-lg font-bold ${stats?.landlordDeclined ? 'text-orange-500' : 'text-card-foreground'}`}>{stats?.landlordDeclined || 0}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {(() => {
                        const declinedTickets = allTickets.filter(() => {
                          // Placeholder - declined needs message data
                          return false
                        })
                        return declinedTickets.length > 0 ? (
                          declinedTickets.slice(0, 6).map((ticket) => (
                            <Link
                              key={ticket.id}
                              href={`/tickets?id=${ticket.id}`}
                              className="block p-1.5 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg hover:bg-orange-100/50 dark:hover:bg-orange-900/30 transition-colors"
                            >
                              <p className="text-xs font-medium text-card-foreground truncate">{ticket.issue_description || 'No description'}</p>
                              <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
                            </Link>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground text-center py-4">No declined quotes</p>
                        )
                      })()}
                    </div>
                  </div>
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
                      {ticket.job_stage && <StatusBadge status={ticket.job_stage} />}
                      {awaitingType === 'handoff' && ticket.handoff && (
                        <Link
                          href={`/tickets?id=${ticket.id}&action=complete`}
                          onClick={() => setAwaitingType(null)}
                        >
                          <Button variant="outline" size="sm" className="h-7 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Review
                          </Button>
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
              <div className="flex-1 overflow-hidden grid grid-cols-2 gap-4 mt-4">
                {/* Left: Conversation Context */}
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
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
