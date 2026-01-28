'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { StatusBadge } from '@/components/status-badge'
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
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

interface DashboardStats {
  totalTickets: number
  openTickets: number
  closedTickets: number
  awaitingContractor: number
  awaitingManager: number
  awaitingLandlord: number
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
  category: string | null
  date_logged: string
  address?: string
}

// Chart colors
const STATUS_COLORS = { open: '#0059ff', closed: '#34d399' }
const CATEGORY_COLORS = ['#0059ff', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981']

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

    const { data: tickets } = await supabase
      .from('c1_tickets')
      .select(`
        id,
        issue_description,
        status,
        job_stage,
        category,
        date_logged,
        c1_properties(address)
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
      const open = tickets.filter((t) => t.status?.toLowerCase() === 'open').length
      const closed = tickets.filter((t) => t.status?.toLowerCase() === 'closed').length

      const awaitingContractor = tickets.filter(
        (t) => t.status?.toLowerCase() === 'open' && ['created', 'contractor_notified'].includes(t.job_stage || '')
      ).length
      const awaitingManager = tickets.filter(
        (t) => t.status?.toLowerCase() === 'open' && ['quote_received'].includes(t.job_stage || '')
      ).length
      const awaitingLandlord = tickets.filter(
        (t) => t.status?.toLowerCase() === 'open' && ['pm_approved'].includes(t.job_stage || '')
      ).length
      const scheduledJobs = tickets.filter(
        (t) => t.status?.toLowerCase() === 'open' && ['scheduled', 'booked', 'reminder_sent', 'll_approved'].includes(t.job_stage || '')
      ).length

      setStats({
        totalTickets: total,
        openTickets: open,
        closedTickets: closed,
        awaitingContractor,
        awaitingManager,
        awaitingLandlord,
        scheduledJobs,
        totalProperties: propertiesRes.count || 0,
        totalTenants: tenantsRes.count || 0,
        totalContractors: contractorsRes.count || 0,
      })

      const mappedTickets = tickets.map((t) => ({
        id: t.id,
        issue_description: t.issue_description,
        status: t.status,
        job_stage: t.job_stage,
        category: t.category,
        date_logged: t.date_logged,
        address: (t.c1_properties as unknown as { address: string } | null)?.address,
      }))
      setAllTickets(mappedTickets)
      setRecentTickets(mappedTickets.slice(0, 5))
    }

    setLoading(false)
  }

  const showAwaitingTickets = async (type: string) => {
    let stages: string[] = []
    if (type === 'contractor') stages = ['created', 'contractor_notified']
    if (type === 'manager') stages = ['quote_received']
    if (type === 'landlord') stages = ['pm_approved']
    if (type === 'scheduled') stages = ['scheduled', 'booked', 'reminder_sent', 'll_approved']

    const { data } = await supabase
      .from('c1_tickets')
      .select(`
        id,
        issue_description,
        status,
        job_stage,
        category,
        date_logged,
        c1_properties(address)
      `)
      .eq('property_manager_id', propertyManager!.id)
      .eq('status', 'open')
      .in('job_stage', stages)
      .gte('date_logged', dateRange.from.toISOString())
      .lte('date_logged', dateRange.to.toISOString())
      .order('date_logged', { ascending: false })

    if (data) {
      setAwaitingTickets(
        data.map((t) => ({
          id: t.id,
          issue_description: t.issue_description,
          status: t.status,
          job_stage: t.job_stage,
          category: t.category,
          date_logged: t.date_logged,
          address: (t.c1_properties as unknown as { address: string } | null)?.address,
        }))
      )
      setAwaitingType(type)
    }
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

  // Chart data
  const statusChartData = stats
    ? [
        { name: 'Open', value: stats.openTickets, color: STATUS_COLORS.open },
        { name: 'Closed', value: stats.closedTickets, color: STATUS_COLORS.closed },
      ]
    : []

  // Calculate category data from all filtered tickets
  const categoryData = allTickets.reduce(
    (acc, ticket) => {
      const cat = ticket.category || 'Other'
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  const categoryChartData = Object.entries(categoryData)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([name, value], i) => ({
      name: name.length > 12 ? name.substring(0, 12) + '...' : name,
      fullName: name,
      value,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))

  if (loading && !stats) {
    return (
      <div className="p-6 h-full bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 overflow-hidden">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[140px] bg-muted rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-[88px] bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/30 overflow-hidden">
      {/* Blue haze overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-blue-500/[0.02] to-transparent pointer-events-none" />

      <div className="relative p-6 h-full flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage and monitor all property maintenance activity
            </p>
          </div>
          <DateFilter value={dateRange} onChange={setDateRange} />
        </div>

        {/* Main KPIs */}
        <div className="grid grid-cols-4 gap-4 flex-shrink-0">
          {/* Tickets */}
          <Link href="/tickets" className="bg-white rounded-xl border-2 border-blue-500/20 p-5 hover:border-blue-500/40 hover:shadow-lg transition-all h-[140px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Tickets</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalTickets || 0}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-medium text-blue-600">{stats?.openTickets || 0} open</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs font-medium text-emerald-600">{stats?.closedTickets || 0} closed</span>
                </div>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Ticket className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span>{stats && stats.totalTickets > 0 ? getPercentage(stats.closedTickets, stats.totalTickets) : 0}% resolved</span>
            </div>
          </Link>

          {/* Properties */}
          <Link href="/properties" className="bg-white rounded-xl border-2 border-emerald-500/20 p-5 hover:border-emerald-500/40 hover:shadow-lg transition-all h-[140px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Properties</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalProperties || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </Link>

          {/* Tenants */}
          <Link href="/tenants" className="bg-white rounded-xl border-2 border-violet-500/20 p-5 hover:border-violet-500/40 hover:shadow-lg transition-all h-[140px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tenants</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalTenants || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
            </div>
          </Link>

          {/* Contractors */}
          <Link href="/contractors" className="bg-white rounded-xl border-2 border-amber-500/20 p-5 hover:border-amber-500/40 hover:shadow-lg transition-all h-[140px]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contractors</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalContractors || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </Link>
        </div>

        {/* Awaiting Action */}
        <div className="grid grid-cols-4 gap-4 flex-shrink-0">
          <button
            onClick={() => showAwaitingTickets('contractor')}
            className="bg-white rounded-xl border-2 border-primary/20 p-4 text-left hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group h-[88px]"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Awaiting Contractor</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold text-gray-900">{stats?.awaitingContractor || 0}</p>
              <span className="text-xs text-gray-400">
                ({stats && stats.openTickets > 0 ? getPercentage(stats.awaitingContractor, stats.openTickets) : 0}% of open)
              </span>
            </div>
          </button>

          <button
            onClick={() => showAwaitingTickets('manager')}
            className="bg-white rounded-xl border-2 border-primary/20 p-4 text-left hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group h-[88px]"
          >
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Awaiting Manager</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold text-gray-900">{stats?.awaitingManager || 0}</p>
              <span className="text-xs text-gray-400">
                ({stats && stats.openTickets > 0 ? getPercentage(stats.awaitingManager, stats.openTickets) : 0}% of open)
              </span>
            </div>
          </button>

          <button
            onClick={() => showAwaitingTickets('landlord')}
            className="bg-white rounded-xl border-2 border-primary/20 p-4 text-left hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group h-[88px]"
          >
            <div className="flex items-center gap-2">
              <Hourglass className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Awaiting Landlord</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold text-gray-900">{stats?.awaitingLandlord || 0}</p>
              <span className="text-xs text-gray-400">
                ({stats && stats.openTickets > 0 ? getPercentage(stats.awaitingLandlord, stats.openTickets) : 0}% of open)
              </span>
            </div>
          </button>

          <button
            onClick={() => showAwaitingTickets('scheduled')}
            className="bg-white rounded-xl border-2 border-primary/20 p-4 text-left hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 transition-all group h-[88px]"
          >
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Scheduled</span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl font-bold text-gray-900">{stats?.scheduledJobs || 0}</p>
              <span className="text-xs text-gray-400">
                ({stats && stats.openTickets > 0 ? getPercentage(stats.scheduledJobs, stats.openTickets) : 0}% of open)
              </span>
            </div>
          </button>
        </div>

        {/* Charts + Recent Tickets - fills remaining space exactly */}
        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Left side: Status + Category stacked */}
          <div className="flex flex-col gap-4 min-h-0">
            {/* Status - Open vs Closed */}
            <div className="bg-white rounded-xl border-2 border-blue-500/20 p-5 flex-shrink-0">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">By Status</h3>
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
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
                    <div className="h-full w-full bg-gray-100" />
                  )}
                </div>
                {/* Key - horizontal */}
                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Open</p>
                      <p className="text-xl font-bold text-gray-900">{stats?.openTickets || 0}</p>
                    </div>
                    <span className="text-sm font-medium text-blue-600">
                      {stats && stats.totalTickets > 0 ? getPercentage(stats.openTickets, stats.totalTickets) : 0}%
                    </span>
                  </div>
                  <div className="flex-1 flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500">Closed</p>
                      <p className="text-xl font-bold text-gray-900">{stats?.closedTickets || 0}</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-600">
                      {stats && stats.totalTickets > 0 ? getPercentage(stats.closedTickets, stats.totalTickets) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Category - matching status style, scrollable for many categories */}
            <div className="bg-white rounded-xl border-2 border-cyan-500/20 p-5 flex-1 flex flex-col min-h-0">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4 flex-shrink-0">By Category</h3>
              {categoryChartData.length > 0 ? (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="grid grid-cols-2 gap-2">
                    {categoryChartData.map((item) => (
                      <div
                        key={item.fullName}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg"
                        style={{ backgroundColor: `${item.color}10` }}
                      >
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-500 truncate">{item.fullName}</p>
                          <p className="text-lg font-bold text-gray-900">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center flex-1 text-sm text-gray-400">
                  No category data
                </div>
              )}
            </div>
          </div>

          {/* Right side: Recent Tickets */}
          <div className="bg-white rounded-xl border-2 border-blue-500/20 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent Tickets</h3>
              <Link href="/tickets">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="divide-y divide-gray-50 flex-1 overflow-auto">
              {recentTickets.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">
                  No tickets found for this period
                </div>
              ) : (
                recentTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href={`/tickets?id=${ticket.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {ticket.issue_description || 'No description'}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {ticket.address}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      {ticket.job_stage && (
                        <StatusBadge status={ticket.job_stage} />
                      )}
                      <span className="text-xs text-gray-400 whitespace-nowrap">
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

      {/* Awaiting Tickets Sheet */}
      <Sheet open={!!awaitingType} onOpenChange={(open) => !open && setAwaitingType(null)}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto p-6" title={`Awaiting ${awaitingType}`}>
          <SheetHeader className="mb-6">
            <SheetTitle className="capitalize text-lg">Awaiting {awaitingType}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3">
            {awaitingTickets.length === 0 ? (
              <p className="text-gray-500 py-8 text-center">No tickets awaiting</p>
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
                      <p className="font-medium text-gray-900 leading-snug">{ticket.issue_description || 'No description'}</p>
                      <p className="text-sm text-gray-500 mt-1.5 truncate">{ticket.address}</p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
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
  )
}
