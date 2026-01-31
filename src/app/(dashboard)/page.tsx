'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { StatusBadge } from '@/components/status-badge'
import { SectionHeader } from '@/components/section-header'
import {
  Ticket,
  Building2,
  Users,
  Wrench,
  Clock,
  UserCheck,
  ArrowRight,
  Hourglass,
  CalendarClock,
  AlertTriangle,
  XCircle,
  LayoutGrid,
  Bell,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  awaitingContractor: number
  awaitingManager: number
  awaitingLandlord: number
  landlordDeclined: number
  scheduledJobs: number
  totalProperties: number
  totalTenants: number
  totalContractors: number
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
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!propertyManager) return
    fetchData()
  }, [propertyManager, dateRange])

  const fetchData = async () => {
    setLoading(true)

    // Fetch tickets with message stage (source of truth for workflow state)
    const { data: tickets } = await supabase
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
        c1_properties(address),
        c1_messages(stage, landlord)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.to.toISOString())
      .order('date_logged', { ascending: false })

    const [propertiesRes, tenantsRes, contractorsRes] = await Promise.all([
      supabase
        .from('c1_properties')
        .select('id', { count: 'exact', head: true })
        .eq('property_manager_id', propertyManager!.id),
      supabase
        .from('c1_tenants')
        .select('id', { count: 'exact', head: true })
        .eq('property_manager_id', propertyManager!.id),
      supabase
        .from('c1_contractors')
        .select('id', { count: 'exact', head: true })
        .eq('property_manager_id', propertyManager!.id)
        .eq('active', true),
    ])

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
        awaitingContractor,
        awaitingManager,
        awaitingLandlord,
        landlordDeclined,
        scheduledJobs,
        totalProperties: propertiesRes.count || 0,
        totalTenants: tenantsRes.count || 0,
        totalContractors: contractorsRes.count || 0,
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
          <div className="grid grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-[120px] bg-muted rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-[88px] bg-muted rounded-xl" />
            ))}
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

          {/* YOUR ORGANIZATION Section */}
          <div className="flex-shrink-0 space-y-2">
            <SectionHeader
              icon={LayoutGrid}
              iconColor="bg-emerald-500/10"
              iconTextColor="text-emerald-600"
              title="Your Organisation"
              description="Properties, tenants, and contractors you manage"
            />
            <div className="grid grid-cols-3 gap-4">
              <Link href="/properties" className="bg-card rounded-xl border-2 border-emerald-500/20 p-5 hover:border-emerald-500/40 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Properties</p>
                    <p className="text-3xl font-bold text-card-foreground mt-2">{stats?.totalProperties || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Active properties</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-emerald-500" />
                  </div>
                </div>
              </Link>

              <Link href="/tenants" className="bg-card rounded-xl border-2 border-violet-500/20 p-5 hover:border-violet-500/40 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tenants</p>
                    <p className="text-3xl font-bold text-card-foreground mt-2">{stats?.totalTenants || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Registered tenants</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-violet-500" />
                  </div>
                </div>
              </Link>

              <Link href="/contractors" className="bg-card rounded-xl border-2 border-amber-500/20 p-5 hover:border-amber-500/40 hover:shadow-lg transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractors</p>
                    <p className="text-3xl font-bold text-card-foreground mt-2">{stats?.totalContractors || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">Active contractors</p>
                  </div>
                  <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Wrench className="h-5 w-5 text-amber-500" />
                  </div>
                </div>
              </Link>
            </div>
          </div>

          {/* NEEDS ATTENTION Section */}
          <div className="flex-shrink-0 space-y-2">
            <SectionHeader
              icon={Bell}
              iconColor="bg-red-500/10"
              iconTextColor="text-red-600"
              title="Needs Attention"
              description="Tickets requiring action — click any card to view details"
            />
            <div className="flex gap-3">
              {/* Left group - Awaiting states (muted style) */}
              <div className="flex-1 grid grid-cols-3 gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('contractor')}
                      className="bg-card rounded-xl border border-border p-3 text-left hover:border-muted-foreground/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contractor</span>
                      </div>
                      <p className="text-2xl font-bold text-card-foreground mt-1">{stats?.awaitingContractor || 0}</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.contractor}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('manager')}
                      className="bg-card rounded-xl border border-border p-3 text-left hover:border-muted-foreground/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Manager</span>
                      </div>
                      <p className="text-2xl font-bold text-card-foreground mt-1">{stats?.awaitingManager || 0}</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.manager}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('landlord')}
                      className="bg-card rounded-xl border border-border p-3 text-left hover:border-muted-foreground/30 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Landlord</span>
                      </div>
                      <p className="text-2xl font-bold text-card-foreground mt-1">{stats?.awaitingLandlord || 0}</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.landlord}</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Subtle divider */}
              <div className="w-px bg-border/50 self-stretch" />

              {/* Right group - Action states (accent style) */}
              <div className="flex-1 grid grid-cols-3 gap-3">
                {/* Handoff - RED accent when count > 0 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('handoff')}
                      className={`bg-card rounded-xl border-2 p-3 text-left hover:shadow-lg transition-all ${
                        stats?.handoffTickets
                          ? 'border-red-400 hover:border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                          : 'border-blue-500/30 hover:border-blue-500/50 dark:border-blue-400/30 dark:hover:border-blue-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className={`h-3.5 w-3.5 ${stats?.handoffTickets ? 'text-red-500' : 'text-blue-500'}`} />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Handoff</span>
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${stats?.handoffTickets ? 'text-red-500' : 'text-card-foreground'}`}>
                        {stats?.handoffTickets || 0}
                      </p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.handoff}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Landlord Declined - orange accent when count > 0 */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('declined')}
                      className={`bg-card rounded-xl border-2 p-3 text-left hover:shadow-lg transition-all ${
                        stats?.landlordDeclined
                          ? 'border-orange-400 hover:border-orange-500'
                          : 'border-blue-500/30 hover:border-blue-500/50 dark:border-blue-400/30 dark:hover:border-blue-400/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <XCircle className={`h-3.5 w-3.5 ${stats?.landlordDeclined ? 'text-orange-500' : 'text-blue-500'}`} />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Declined</span>
                      </div>
                      <p className={`text-2xl font-bold mt-1 ${stats?.landlordDeclined ? 'text-orange-500' : 'text-card-foreground'}`}>
                        {stats?.landlordDeclined || 0}
                      </p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.declined}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => showAwaitingTickets('scheduled')}
                      className="bg-card rounded-xl border-2 border-blue-500/30 dark:border-blue-400/30 p-3 text-left hover:border-blue-500/50 dark:hover:border-blue-400/50 hover:shadow-lg transition-all"
                    >
                      <div className="flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scheduled</span>
                      </div>
                      <p className="text-2xl font-bold text-card-foreground mt-1">{stats?.scheduledJobs || 0}</p>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <p className="text-xs">{ACTION_DESCRIPTIONS.scheduled}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* TICKET OVERVIEW Section */}
          <div className="flex-1 min-h-0 pb-2 space-y-2">
            <SectionHeader
              icon={BarChart3}
              iconColor="bg-blue-500/10"
              iconTextColor="text-blue-600"
              title="Ticket Overview"
              description="Status and category breakdown for your tickets"
            />
            <div className="grid grid-cols-2 gap-4 h-[calc(100%-32px)]">
              <div className="flex flex-col gap-4 min-h-0">
                {/* Status */}
                <div className="bg-card rounded-xl border-2 border-blue-500/20 p-5 flex-shrink-0">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Status</h3>
                    <Link href="/tickets" className="text-xs text-primary hover:text-primary/80 font-medium">
                      {stats?.totalTickets || 0} total
                    </Link>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-muted rounded-full overflow-hidden flex">
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
                    <div className="flex gap-3">
                      <div className="flex-1 flex items-center gap-3 p-3 bg-blue-500/10 rounded-lg">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">Open</p>
                          <p className="text-xl font-bold text-card-foreground">{stats?.openTickets || 0}</p>
                        </div>
                        <span className="text-sm font-medium text-blue-500">
                          {stats && stats.totalTickets > 0 ? getPercentage(stats.openTickets, stats.totalTickets) : 0}%
                        </span>
                      </div>
                      <div className="flex-1 flex items-center gap-3 p-3 bg-emerald-500/10 rounded-lg">
                        <div className="w-3 h-3 rounded-full bg-emerald-400" />
                        <div className="flex-1">
                          <p className="text-xs text-muted-foreground">Closed</p>
                          <p className="text-xl font-bold text-card-foreground">{stats?.closedTickets || 0}</p>
                        </div>
                        <span className="text-sm font-medium text-emerald-500">
                          {stats && stats.totalTickets > 0 ? getPercentage(stats.closedTickets, stats.totalTickets) : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Category */}
                <div className="bg-card rounded-xl border-2 border-cyan-500/20 p-5 flex-1 flex flex-col min-h-0">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4 flex-shrink-0">By Category</h3>
                  {categoryChartData.length > 0 ? (
                    <div className="flex-1 overflow-y-auto min-h-0">
                      <div className="grid grid-cols-2 gap-2">
                        {categoryChartData.map((item) => (
                          <div
                            key={item.fullName}
                            className="flex items-center gap-2.5 p-2.5 rounded-lg"
                            style={{ backgroundColor: `${item.color}15` }}
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground truncate">{item.fullName}</p>
                              <p className="text-lg font-bold text-card-foreground">{item.value}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
                      No category data
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Tickets */}
              <div className="bg-card rounded-xl border-2 border-blue-500/20 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent Tickets</h3>
                  <Link href="/tickets">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary/80 hover:bg-primary/10">
                      View all
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </Link>
                </div>
                <div className="divide-y divide-border flex-1 overflow-auto">
                  {recentTickets.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No tickets found for this period
                    </div>
                  ) : (
                    recentTickets.map((ticket) => (
                      <Link
                        key={ticket.id}
                        href={`/tickets?id=${ticket.id}`}
                        className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-card-foreground truncate">
                            {ticket.issue_description || 'No description'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {ticket.address}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-4">
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
      </div>
    </TooltipProvider>
  )
}
