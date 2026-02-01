'use client'

import React, { useEffect, useState } from 'react'
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

// Action section component with inline ticket details
function ActionSection({
  title,
  icon: Icon,
  count,
  color,
  description,
  tickets,
  onViewAll,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  color: 'red' | 'orange' | 'blue'
  description: string
  tickets: TicketSummary[]
  onViewAll: () => void
}) {
  const colorClasses = {
    red: count > 0 ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'border-border',
    orange: count > 0 ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20' : 'border-border',
    blue: 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20',
  }
  const iconColors = {
    red: count > 0 ? 'text-red-500' : 'text-muted-foreground',
    orange: count > 0 ? 'text-orange-500' : 'text-muted-foreground',
    blue: 'text-blue-500',
  }
  const countColors = {
    red: count > 0 ? 'text-red-500' : 'text-card-foreground',
    orange: count > 0 ? 'text-orange-500' : 'text-card-foreground',
    blue: 'text-blue-500',
  }

  const displayTickets = tickets.slice(0, 3)

  return (
    <div className={`bg-card rounded-xl border ${colorClasses[color]} p-4 flex-shrink-0`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColors[color]}`} />
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={`text-2xl font-bold ${countColors[color]}`}>{count}</span>
      </div>
      {displayTickets.length > 0 ? (
        <div className="space-y-1.5 mt-3">
          {displayTickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/tickets?id=${ticket.id}`}
              className="flex items-center justify-between p-2 bg-background/50 rounded-lg hover:bg-background transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-card-foreground truncate">
                  {ticket.issue_description || 'No description'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
              </div>
              {ticket.category && (
                <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{ticket.category}</span>
              )}
            </Link>
          ))}
          {tickets.length > 3 && (
            <button
              onClick={onViewAll}
              className="w-full text-xs text-primary hover:text-primary/80 font-medium py-1"
            >
              +{tickets.length - 3} more
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mt-2">No tickets</p>
      )}
    </div>
  )
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

  useEffect(() => {
    if (!propertyManager) return
    fetchData()
  }, [propertyManager, dateRange])

  const fetchData = async () => {
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
        .eq('property_manager_id', propertyManager!.id)
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
        .eq('property_manager_id', propertyManager!.id)
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
  }

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

          {/* Main Two-Column Layout */}
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
            {/* LEFT COLUMN: Status + Recent Tickets + Category */}
            <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
              {/* By Status */}
              <div className="bg-card rounded-xl border border-border p-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-card-foreground">By Status</h3>
                  </div>
                  <Link href="/tickets" className="text-xs text-primary hover:text-primary/80 font-medium">
                    {stats?.totalTickets || 0} total
                  </Link>
                </div>
                <div className="space-y-3">
                  <div className="h-3 bg-muted rounded-full overflow-hidden flex">
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
                    <div className="flex-1 flex items-center gap-2 p-2 bg-blue-500/10 rounded-lg">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Open</p>
                        <p className="text-lg font-bold text-card-foreground">{stats?.openTickets || 0}</p>
                      </div>
                      <span className="text-xs font-medium text-blue-500">
                        {stats && stats.totalTickets > 0 ? getPercentage(stats.openTickets, stats.totalTickets) : 0}%
                      </span>
                    </div>
                    <div className="flex-1 flex items-center gap-2 p-2 bg-emerald-500/10 rounded-lg">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Closed</p>
                        <p className="text-lg font-bold text-card-foreground">{stats?.closedTickets || 0}</p>
                      </div>
                      <span className="text-xs font-medium text-emerald-500">
                        {stats && stats.totalTickets > 0 ? getPercentage(stats.closedTickets, stats.totalTickets) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Tickets */}
              <div className="bg-card rounded-xl border border-border flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
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

              {/* By Category */}
              <div className="bg-card rounded-xl border border-border p-4 flex-shrink-0">
                <h3 className="text-sm font-semibold text-card-foreground mb-3">By Category</h3>
                {categoryChartData.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {categoryChartData.slice(0, 6).map((item) => (
                      <div
                        key={item.fullName}
                        className="flex items-center gap-2 p-2 rounded-lg"
                        style={{ backgroundColor: `${item.color}15` }}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground truncate">{item.name}</p>
                          <p className="text-sm font-bold text-card-foreground">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    No category data
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: Handoff + Awaiting + Scheduled/Declined */}
            <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
              {/* Handoff Section - shows both tickets and conversations needing tickets */}
              {(() => {
                const handoffTicketsList = allTickets.filter((t) => t.status?.toLowerCase() !== 'closed' && t.handoff === true)
                const totalHandoffs = handoffTicketsList.length + handoffConversations.length
                const hasHandoffs = totalHandoffs > 0
                return (
                  <div className={`bg-card rounded-xl border p-4 flex-shrink-0 ${hasHandoffs ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'border-border'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${hasHandoffs ? 'text-red-500' : 'text-muted-foreground'}`} />
                        <div>
                          <h3 className="text-sm font-semibold text-card-foreground">Handoff Review</h3>
                          <p className="text-xs text-muted-foreground">AI couldn&apos;t complete — needs your review</p>
                        </div>
                      </div>
                      <span className={`text-2xl font-bold ${hasHandoffs ? 'text-red-500' : 'text-card-foreground'}`}>{totalHandoffs}</span>
                    </div>
                    {totalHandoffs > 0 ? (
                      <div className="space-y-1.5 mt-3 max-h-[160px] overflow-y-auto">
                        {/* Conversations needing tickets - show first with Create Ticket button */}
                        {handoffConversations.slice(0, 3).map((convo) => (
                          <button
                            key={convo.id}
                            onClick={() => {
                              setSelectedHandoff(convo)
                              setCreateTicketOpen(true)
                            }}
                            className="w-full flex items-center justify-between p-2 bg-background/50 rounded-lg hover:bg-background transition-colors text-left border border-dashed border-red-300"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <MessageSquare className="h-3 w-3 text-red-500 flex-shrink-0" />
                                <p className="text-xs font-medium text-card-foreground truncate">
                                  {convo.caller_name || 'Unknown caller'}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{convo.address || 'No property matched'}</p>
                            </div>
                            <span className="flex items-center gap-1 text-xs text-red-600 font-medium ml-2 flex-shrink-0">
                              <Plus className="h-3 w-3" />
                              Create
                            </span>
                          </button>
                        ))}
                        {/* Existing handoff tickets */}
                        {handoffTicketsList.slice(0, 3 - Math.min(handoffConversations.length, 3)).map((ticket) => (
                          <Link
                            key={ticket.id}
                            href={`/tickets?id=${ticket.id}`}
                            className="flex items-center justify-between p-2 bg-background/50 rounded-lg hover:bg-background transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-card-foreground truncate">
                                {ticket.issue_description || 'No description'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{ticket.address}</p>
                            </div>
                            {ticket.category && (
                              <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{ticket.category}</span>
                            )}
                          </Link>
                        ))}
                        {totalHandoffs > 3 && (
                          <button
                            onClick={() => showAwaitingTickets('handoff')}
                            className="w-full text-xs text-primary hover:text-primary/80 font-medium py-1"
                          >
                            +{totalHandoffs - 3} more
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2">No handoffs</p>
                    )}
                  </div>
                )
              })()}

              {/* Awaiting Action Section */}
              <div className="bg-card rounded-xl border border-border flex flex-col flex-1 min-h-0">
                <div className="px-4 py-3 border-b border-border flex-shrink-0">
                  <h3 className="text-sm font-semibold text-card-foreground">Awaiting Action</h3>
                  <p className="text-xs text-muted-foreground">Tickets waiting for response</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {/* Awaiting Contractor */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => showAwaitingTickets('contractor')}
                        className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-card-foreground">Awaiting Contractor</span>
                        </div>
                        <span className="text-lg font-bold text-card-foreground">{stats?.awaitingContractor || 0}</span>
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
                        className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-card-foreground">Awaiting Manager</span>
                        </div>
                        <span className="text-lg font-bold text-card-foreground">{stats?.awaitingManager || 0}</span>
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
                        className="w-full flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2">
                          <Hourglass className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium text-card-foreground">Awaiting Landlord</span>
                        </div>
                        <span className="text-lg font-bold text-card-foreground">{stats?.awaitingLandlord || 0}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[200px]">
                      <p className="text-xs">{ACTION_DESCRIPTIONS.landlord}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Bottom Row: Scheduled + Declined */}
              <div className="grid grid-cols-2 gap-3 flex-shrink-0">
                {/* Scheduled */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('scheduled')}
                      className="bg-card rounded-xl border border-border p-3 text-left hover:border-blue-500/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <CalendarClock className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-semibold text-card-foreground">Scheduled</span>
                      </div>
                      <p className="text-2xl font-bold text-card-foreground">{stats?.scheduledJobs || 0}</p>
                      <p className="text-xs text-muted-foreground">Jobs with confirmed dates</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.scheduled}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Declined */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('declined')}
                      className={`bg-card rounded-xl border p-3 text-left hover:shadow-md transition-all ${
                        stats?.landlordDeclined
                          ? 'border-orange-400 hover:border-orange-500'
                          : 'border-border hover:border-orange-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className={`h-4 w-4 ${stats?.landlordDeclined ? 'text-orange-500' : 'text-muted-foreground'}`} />
                        <span className="text-sm font-semibold text-card-foreground">Declined</span>
                      </div>
                      <p className={`text-2xl font-bold ${stats?.landlordDeclined ? 'text-orange-500' : 'text-card-foreground'}`}>
                        {stats?.landlordDeclined || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Landlord declined quote</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.declined}</p>
                  </TooltipContent>
                </Tooltip>
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
                  <Link
                    key={ticket.id}
                    href={`/tickets?id=${ticket.id}`}
                    className="block p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/20"
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
                    {ticket.job_stage && (
                      <div className="mt-3">
                        <StatusBadge status={ticket.job_stage} />
                      </div>
                    )}
                  </Link>
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
