'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Banknote, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { RentPaymentDialog } from '@/components/rent-payment-dialog'

interface RentSummaryRow {
  room_id: string
  room_number: string
  room_name: string | null
  is_vacant: boolean | null
  tenant_id: string | null
  tenant_name: string | null
  rent_ledger_id: string | null
  due_date: string | null
  amount_due: number | null
  amount_paid: number | null
  paid_at: string | null
  payment_method: string | null
  effective_status: string | null
  notes: string | null
}

interface PropertyRentSectionProps {
  propertyId: string
  pmId: string
}

export function PropertyRentSection({ propertyId, pmId }: PropertyRentSectionProps) {
  const supabase = createClient()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [entries, setEntries] = useState<RentSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<RentSummaryRow | null>(null)

  const fetchSummary = useCallback(async () => {
    setLoading(true)

    // Rent entries are auto-created by DB triggers:
    //   trg_room_tenant_assigned (on tenant assignment)
    //   trg_room_rent_configured (on rent config change)
    //   Monthly cron (1st of each month)
    // Manual "Generate" button available as fallback.

    const { data, error } = await supabase.rpc('get_rent_summary_for_property', {
      p_property_id: propertyId,
      p_pm_id: pmId,
      p_month: month,
      p_year: year,
    })

    if (error) {
      toast.error('Failed to load rent data')
      setLoading(false)
      return
    }
    setEntries((data as unknown as RentSummaryRow[]) || [])
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase client is stable
  }, [propertyId, month, year])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Realtime: refetch when rent ledger changes for this property's rooms
  useEffect(() => {
    const channel = supabase
      .channel(`rent-ledger-${propertyId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'c1_rent_ledger',
        filter: `property_manager_id=eq.${pmId}`,
      }, () => {
        fetchSummary()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, pmId])

  const handleGenerate = async () => {
    setGenerating(true)
    const { data, error } = await supabase.rpc('create_rent_ledger_entries', {
      p_property_id: propertyId,
      p_pm_id: pmId,
      p_month: month,
      p_year: year,
    })

    if (error) {
      toast.error(error.message)
      setGenerating(false)
      return
    }

    const count = data as number
    if (count > 0) {
      toast.success(`Generated ${count} rent ${count === 1 ? 'entry' : 'entries'}`)
    } else {
      toast.info('All entries already generated')
    }

    setGenerating(false)
    await fetchSummary()
  }

  const goToPrevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  const goToNextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  // Compute summary stats from entries
  const occupiedEntries = entries.filter(
    (e) => e.effective_status !== 'vacant' && e.effective_status !== 'no_entry'
  )
  const paidCount = occupiedEntries.filter((e) => e.effective_status === 'paid').length
  const outstandingCount = occupiedEntries.filter(
    (e) => e.effective_status === 'pending' || e.effective_status === 'overdue' || e.effective_status === 'partial'
  ).length
  const totalDue = occupiedEntries.reduce((sum, e) => sum + (e.amount_due ?? 0), 0)
  const hasLedgerEntries = entries.some((e) => e.rent_ledger_id !== null)

  const formatCurrency = (amount: number | null) => {
    if (amount == null) return '—'
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return format(new Date(dateStr), 'dd MMM')
  }

  const statusBadge = (status: string | null) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600">
            Paid
          </span>
        )
      case 'overdue':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600">
            Overdue
          </span>
        )
      case 'partial':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">
            Partial
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            Pending
          </span>
        )
      case 'vacant':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground/50 italic">
            Vacant
          </span>
        )
      case 'no_entry':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-muted-foreground/50">
            No rent configured
          </span>
        )
      default:
        return null
    }
  }

  const monthLabel = format(new Date(year, month - 1), 'MMMM yyyy')
  const shortMonthLabel = format(new Date(year, month - 1), 'MMMM')

  return (
    <div className="mt-6 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Banknote className="h-3.5 w-3.5" />
          Rent
        </h3>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <span className="text-xs font-medium min-w-[110px] text-center">{monthLabel}</span>
          <button
            type="button"
            onClick={goToNextMonth}
            className="h-6 w-6 rounded-md border border-input bg-background hover:bg-accent/50 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rooms configured</p>
      ) : (
        <>
          {/* Summary bar + Generate button */}
          <div className="flex items-center justify-between mb-3">
            {hasLedgerEntries ? (
              <p className="text-xs text-muted-foreground">
                Paid {paidCount}/{occupiedEntries.length}
                {outstandingCount > 0 && ` · Outstanding ${outstandingCount}/${occupiedEntries.length}`}
                {totalDue > 0 && ` · Total: ${formatCurrency(totalDue)}`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No rent entries for {shortMonthLabel}
              </p>
            )}
            {!hasLedgerEntries && <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs px-2.5 py-1 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {generating && <Loader2 className="h-3 w-3 animate-spin" />}
              Generate {shortMonthLabel} Rent
            </button>}
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Room</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Tenant</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Due Date</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">Amount</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="w-20 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.room_id}
                    className={`border-b border-border/50 last:border-b-0 ${
                      entry.effective_status === 'vacant' || entry.effective_status === 'no_entry'
                        ? 'text-muted-foreground'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-medium">{entry.room_number}</span>
                      {entry.room_name && (
                        <span className="text-muted-foreground ml-1.5 text-xs">({entry.room_name})</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {entry.tenant_name || '—'}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell">
                      {formatDueDate(entry.due_date)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {entry.amount_due != null ? formatCurrency(entry.amount_due) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {statusBadge(entry.effective_status)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {entry.rent_ledger_id &&
                        entry.effective_status !== 'paid' &&
                        entry.effective_status !== 'vacant' && (
                          <button
                            type="button"
                            onClick={() => setPaymentTarget(entry)}
                            className="text-xs px-2 py-1 rounded-md border border-input bg-background hover:bg-accent/50 transition-colors"
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
        </>
      )}

      <RentPaymentDialog
        open={!!paymentTarget}
        onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
        entry={paymentTarget}
        pmId={pmId}
        onSuccess={() => {
          setPaymentTarget(null)
          fetchSummary()
        }}
      />
    </div>
  )
}
