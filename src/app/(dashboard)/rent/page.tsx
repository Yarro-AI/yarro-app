'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { RentPaymentDialog } from '@/components/rent-payment-dialog'
import { QueryError } from '@/components/query-error'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LedgerRow {
  rent_ledger_id: string
  tenant_id: string
  tenant_name: string
  property_id: string
  property_address: string
  room_number: string
  due_date: string
  amount_due: number
  amount_paid: number
  effective_status: string // 'arrears' | 'overdue' | 'partial' | 'pending' | 'paid'
}

type StatusFilter = 'all' | 'arrears' | 'overdue' | 'partial' | 'pending' | 'paid'

function formatCurrency(amount: number): string {
  if (amount === 0) return '£0'
  return `£${Math.round(amount).toLocaleString('en-GB')}`
}

function StatusBadge({ status, amountDue, amountPaid }: { status: string; amountDue: number; amountPaid: number }) {
  const owing = amountDue - amountPaid
  switch (status) {
    case 'paid':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">Paid</span>
    case 'arrears':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">{formatCurrency(owing)} arrears</span>
    case 'overdue':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">Overdue</span>
    case 'partial':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">{formatCurrency(owing)} owing</span>
    case 'pending':
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Due {format(new Date(amountDue ? (amountDue as unknown as string) : ''), 'd MMM')}</span>
    default:
      return null
  }
}

// Simpler pending badge — just shows "Awaiting" since due date is in its own column
function PendingBadge() {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Awaiting</span>
}

export default function RentPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const router = useRouter()
  const now = new Date()

  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [entries, setEntries] = useState<LedgerRow[]>([])
  const [paymentTarget, setPaymentTarget] = useState<LedgerRow | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const isFutureMonth = new Date(year, month - 1) > new Date(now.getFullYear(), now.getMonth())
  const pmSignupDate = propertyManager?.created_at ? new Date(propertyManager.created_at) : null
  const isBeforeSignup = pmSignupDate ? new Date(year, month - 1) < new Date(pmSignupDate.getFullYear(), pmSignupDate.getMonth()) : false

  // Counts per status for filter cards
  const counts = useMemo(() => {
    const c = { arrears: 0, overdue: 0, partial: 0, pending: 0, paid: 0 }
    for (const e of entries) {
      if (e.effective_status in c) c[e.effective_status as keyof typeof c]++
    }
    return c
  }, [entries])

  // Filtered entries
  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries
    return entries.filter((e) => e.effective_status === filter)
  }, [entries, filter])

  const fetchData = useCallback(async () => {
    if (!propertyManager) return
    setLoading(true)

    // Rent entries are auto-created by DB triggers:
    //   trg_room_tenant_assigned (on tenant assignment)
    //   trg_room_rent_configured (on rent config change)
    //   Monthly cron (1st of each month)

    const { data, error } = await supabase.rpc('get_rent_ledger_for_month' as never, {
      p_pm_id: propertyManager.id,
      p_month: month,
      p_year: year,
    } as never)

    if (error) {
      setFetchError('Failed to load rent data')
      setLoading(false)
      return
    }
    setFetchError(null)
    setEntries((data as unknown as LedgerRow[]) || [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager, month, year])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime: refetch when rent ledger changes
  useEffect(() => {
    if (!propertyManager) return
    const channel = supabase
      .channel(`rent-ledger-pm-${propertyManager.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'c1_rent_ledger',
        filter: `property_manager_id=eq.${propertyManager.id}`,
      }, () => {
        fetchData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager?.id])

  // Reset filter when month changes
  useEffect(() => {
    setFilter('all')
  }, [month, year])

  // Month navigation
  const goToPrevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else { setMonth(month - 1) }
  }
  const goToNextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else { setMonth(month + 1) }
  }

  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy')

  const monthPicker = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={goToPrevMonth} className="h-7 w-7 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
        <ChevronLeft className="h-4 w-4 text-muted-foreground" />
      </button>
      <span className="text-sm font-medium min-w-[130px] text-center">{monthLabel}</span>
      <button type="button" onClick={goToNextMonth} className="h-7 w-7 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )

  const filterCards: { key: StatusFilter; label: string; color: string; activeColor: string }[] = [
    { key: 'all', label: 'All', color: 'text-muted-foreground', activeColor: 'border-primary text-primary' },
    { key: 'arrears', label: 'Arrears', color: 'text-red-600', activeColor: 'border-red-600 text-red-600 bg-red-500/5' },
    { key: 'overdue', label: 'Overdue', color: 'text-red-600', activeColor: 'border-red-600 text-red-600 bg-red-500/5' },
    { key: 'partial', label: 'Partial', color: 'text-amber-600', activeColor: 'border-amber-600 text-amber-600 bg-amber-500/5' },
    { key: 'pending', label: 'Awaiting', color: 'text-muted-foreground', activeColor: 'border-muted-foreground text-muted-foreground bg-muted/50' },
    { key: 'paid', label: 'Paid', color: 'text-emerald-600', activeColor: 'border-emerald-600 text-emerald-600 bg-emerald-500/5' },
  ]

  return (
    <PageShell title="Rent" actions={monthPicker} scrollable>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : fetchError ? (
        <QueryError message={fetchError} onRetry={fetchData} />
      ) : isFutureMonth ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Rent for {monthLabel} hasn&apos;t started yet.</p>
        </div>
      ) : isBeforeSignup ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No data for this period — your account was created after this month.</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No rent entries for {monthLabel}.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filter cards */}
          <div className="flex gap-2 flex-wrap">
            {filterCards.map(({ key, label, color, activeColor }) => {
              const count = key === 'all' ? entries.length : counts[key as keyof typeof counts]
              if (key !== 'all' && count === 0) return null
              const isActive = filter === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                    isActive
                      ? activeColor
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  {label} <span className={cn('ml-1', isActive ? '' : color)}>{count}</span>
                </button>
              )
            })}
          </div>

          {/* Table */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Tenant</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden md:table-cell">Property</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden sm:table-cell">Room</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs hidden sm:table-cell">Due</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Amount</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="w-24 px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((row) => (
                  <tr
                    key={row.rent_ledger_id}
                    onClick={() => router.push(`/tenants/${row.tenant_id}`)}
                    className={cn(
                      'border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer',
                      row.effective_status === 'arrears' && 'bg-red-500/[0.03]'
                    )}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.tenant_name}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <span className="truncate block max-w-[220px]">{row.property_address}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{row.room_number}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {format(new Date(row.due_date + 'T00:00:00'), 'd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(row.amount_due)}</td>
                    <td className="px-4 py-3 text-center">
                      {row.effective_status === 'pending' ? (
                        <PendingBadge />
                      ) : (
                        <StatusBadge status={row.effective_status} amountDue={row.amount_due} amountPaid={row.amount_paid} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {row.effective_status !== 'paid' && (
                        <button
                          type="button"
                          onClick={() => setPaymentTarget(row)}
                          className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors"
                        >
                          Mark Paid
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <RentPaymentDialog
        open={!!paymentTarget}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
        entry={paymentTarget ? {
          rent_ledger_id: paymentTarget.rent_ledger_id,
          room_number: paymentTarget.room_number,
          tenant_name: paymentTarget.tenant_name,
          amount_due: paymentTarget.amount_due,
        } : null}
        pmId={propertyManager?.id ?? ''}
        onSuccess={() => {
          setPaymentTarget(null)
          fetchData()
        }}
      />
    </PageShell>
  )
}
