'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Search, ScrollText } from 'lucide-react'
import { formatDate } from '@/lib/audit-utils'

interface AuditTicket {
  id: string
  issue_description: string | null
  status: string
  priority: string | null
  category: string | null
  date_logged: string
  resolved_at: string | null
  address: string | null
}

export default function AuditTrailPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tickets, setTickets] = useState<AuditTicket[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const searchTickets = useCallback(async (term: string) => {
    if (!propertyManager || term.length < 2) {
      setTickets([])
      setHasSearched(false)
      return
    }

    setLoading(true)
    setHasSearched(true)

    const pattern = `%${term}%`

    const { data, error } = await supabase
      .from('c1_tickets')
      .select(`
        id, issue_description, status, priority, category, date_logged, resolved_at,
        c1_properties!inner(address)
      `)
      .eq('property_manager_id', propertyManager.id)
      .or(`issue_description.ilike.${pattern},c1_properties.address.ilike.${pattern}`)
      .order('date_logged', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Audit search error:', error)
      setLoading(false)
      return
    }

    const mapped: AuditTicket[] = (data || []).map((t) => ({
      id: t.id,
      issue_description: t.issue_description,
      status: t.status,
      priority: t.priority,
      category: t.category,
      date_logged: t.date_logged,
      resolved_at: t.resolved_at,
      address: (t.c1_properties as unknown as { address: string } | null)?.address || null,
    }))

    setTickets(mapped)
    setLoading(false)
  }, [propertyManager, supabase])

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchTickets(value), 300)
  }, [searchTickets])

  const columns: Column<AuditTicket>[] = [
    {
      key: 'address',
      header: 'Property',
      sortable: true,
      render: (row) => (
        <span className="font-medium">{row.address || '—'}</span>
      ),
      getValue: (row) => row.address,
    },
    {
      key: 'issue_description',
      header: 'Issue',
      render: (row) => (
        <span className="text-muted-foreground text-sm line-clamp-1">
          {row.issue_description || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      width: '100px',
      render: (row) => <StatusBadge status={row.status} size="sm" />,
      getValue: (row) => row.status,
    },
    {
      key: 'priority',
      header: 'Priority',
      sortable: true,
      width: '100px',
      render: (row) => row.priority ? <StatusBadge status={row.priority} size="sm" /> : <span className="text-muted-foreground">—</span>,
      getValue: (row) => row.priority,
    },
    {
      key: 'date_logged',
      header: 'Date Logged',
      sortable: true,
      width: '130px',
      render: (row) => (
        <span className="text-muted-foreground text-sm">{formatDate(row.date_logged)}</span>
      ),
      getValue: (row) => row.date_logged,
    },
  ]

  return (
    <PageShell title="Audit Trail">
      {/* Search-first landing */}
      <div className="flex flex-col items-center gap-6 pt-8 pb-4">
        <div className="relative w-full max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by property address, issue, or tenant..."
            className="w-full rounded-xl border border-border bg-card pl-12 pr-4 py-3 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
            autoFocus
          />
        </div>
        {!hasSearched && (
          <p className="text-sm text-muted-foreground">
            Search to find tickets and view their complete audit trail
          </p>
        )}
      </div>

      {/* Results */}
      {hasSearched && (
        <DataTable
          data={tickets}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loading}
          onRowClick={(row) => router.push(`/audit-trail/${row.id}`)}
          emptyMessage={
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <ScrollText className="h-8 w-8 opacity-40" />
              <p className="text-sm">No tickets found</p>
              <p className="text-xs">Try a different search term</p>
            </div>
          }
          fillHeight
        />
      )}
    </PageShell>
  )
}
