'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { StatusBadge } from '@/components/status-badge'
import { Search, ScrollText, MapPin, User, Wrench } from 'lucide-react'
import { formatDate } from '@/lib/audit-utils'
import { cn } from '@/lib/utils'

interface AuditTicket {
  id: string
  issue_description: string | null
  status: string
  priority: string | null
  category: string | null
  date_logged: string
  resolved_at: string | null
  address: string | null
  tenant_name: string | null
}

interface Suggestion {
  type: 'property' | 'tenant' | 'issue'
  label: string
  value: string
}

export default function AuditTrailPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tickets, setTickets] = useState<AuditTicket[]>([])
  const [allTickets, setAllTickets] = useState<AuditTicket[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Load all tickets once for suggestions
  useEffect(() => {
    if (!propertyManager || cacheLoaded) return

    const loadTickets = async () => {
      const { data } = await supabase
        .from('c1_tickets')
        .select(`
          id, issue_description, status, priority, category, date_logged, resolved_at,
          c1_properties(address),
          c1_tenants(full_name)
        `)
        .eq('property_manager_id', propertyManager.id)
        .order('date_logged', { ascending: false })
        .limit(200)

      if (data) {
        const mapped: AuditTicket[] = data.map((t) => ({
          id: t.id,
          issue_description: t.issue_description,
          status: t.status,
          priority: t.priority,
          category: t.category,
          date_logged: t.date_logged,
          resolved_at: t.resolved_at,
          address: (t.c1_properties as unknown as { address: string } | null)?.address || null,
          tenant_name: (t.c1_tenants as unknown as { full_name: string } | null)?.full_name || null,
        }))
        setAllTickets(mapped)
        setCacheLoaded(true)
      }
    }

    loadTickets()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  // Build suggestions from typed input
  const updateSuggestions = useCallback((term: string) => {
    if (term.length < 2 || allTickets.length === 0) {
      setSuggestions([])
      return
    }

    const lower = term.toLowerCase()
    const seen = new Set<string>()
    const results: Suggestion[] = []

    for (const t of allTickets) {
      if (t.address && t.address.toLowerCase().includes(lower) && !seen.has(t.address)) {
        seen.add(t.address)
        results.push({ type: 'property', label: t.address, value: t.address })
      }
      if (results.length >= 3) break
    }

    const seenTenants = new Set<string>()
    for (const t of allTickets) {
      if (t.tenant_name && t.tenant_name.toLowerCase().includes(lower) && !seenTenants.has(t.tenant_name)) {
        seenTenants.add(t.tenant_name)
        results.push({ type: 'tenant', label: t.tenant_name, value: t.tenant_name })
      }
      if (results.length >= 6) break
    }

    for (const t of allTickets) {
      if (t.issue_description && t.issue_description.toLowerCase().includes(lower) && !seen.has(t.issue_description)) {
        seen.add(t.issue_description)
        results.push({ type: 'issue', label: t.issue_description, value: t.issue_description })
      }
      if (results.length >= 8) break
    }

    setSuggestions(results)
  }, [allTickets])

  const executeSearch = useCallback((term: string) => {
    if (term.length < 2) {
      setTickets([])
      setHasSearched(false)
      return
    }

    setHasSearched(true)
    setShowSuggestions(false)

    const lower = term.toLowerCase()
    const filtered = allTickets
      .filter((t) =>
        t.issue_description?.toLowerCase().includes(lower) ||
        t.address?.toLowerCase().includes(lower) ||
        t.tenant_name?.toLowerCase().includes(lower)
      )
      .slice(0, 50)

    setTickets(filtered)
  }, [allTickets])

  const handleInputChange = useCallback((value: string) => {
    setSearch(value)
    setShowSuggestions(true)
    setHasSearched(false)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => updateSuggestions(value), 150)
  }, [updateSuggestions])

  const handleSuggestionClick = useCallback((suggestion: Suggestion) => {
    setSearch(suggestion.value)
    setShowSuggestions(false)
    executeSearch(suggestion.value)
  }, [executeSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeSearch(search)
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }, [executeSearch, search])

  // Close suggestions on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const suggestionIcon = {
    property: MapPin,
    tenant: User,
    issue: Wrench,
  }

  const columns: Column<AuditTicket>[] = [
    {
      key: 'address',
      header: 'Property',
      sortable: true,
      width: '200px',
      render: (row) => (
        <span className="font-medium whitespace-nowrap">{row.address || '—'}</span>
      ),
      getValue: (row) => row.address,
    },
    {
      key: 'tenant_name',
      header: 'Tenant',
      sortable: true,
      width: '140px',
      render: (row) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">{row.tenant_name || '—'}</span>
      ),
      getValue: (row) => row.tenant_name,
    },
    {
      key: 'issue_description',
      header: 'Issue',
      width: '220px',
      render: (row) => (
        <span className="text-muted-foreground text-sm line-clamp-1">
          {row.issue_description || '—'}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      width: '120px',
      render: (row) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">{row.category || '—'}</span>
      ),
      getValue: (row) => row.category,
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
      header: 'Logged',
      sortable: true,
      width: '120px',
      render: (row) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">{formatDate(row.date_logged)}</span>
      ),
      getValue: (row) => row.date_logged,
    },
    {
      key: 'resolved_at',
      header: 'Resolved',
      sortable: true,
      width: '120px',
      render: (row) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {row.resolved_at ? formatDate(row.resolved_at) : '—'}
        </span>
      ),
      getValue: (row) => row.resolved_at,
    },
  ]

  return (
    <PageShell scrollable>
      {/* Search hero */}
      {!hasSearched && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-2xl px-4">
            <div className="bg-card rounded-2xl border border-border p-8 md:p-12 shadow-sm">
              <div className="text-center mb-8">
                <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
                  Search the audit trail
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  Find any ticket by property, tenant, or issue
                </p>
              </div>

              {/* Search input with suggestions */}
              <div className="relative">
                <div className={cn(
                  'flex items-center gap-3 rounded-xl border bg-background px-4 py-3 transition-all',
                  showSuggestions && suggestions.length > 0
                    ? 'border-primary/40 ring-2 ring-primary/10 rounded-b-none'
                    : 'border-border focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10'
                )}>
                  <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a property address, tenant name, or issue..."
                    className="flex-1 text-base bg-transparent outline-none placeholder:text-muted-foreground/50"
                    autoFocus
                  />
                  {search && (
                    <button
                      onClick={() => { setSearch(''); setSuggestions([]); setShowSuggestions(false) }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="text-xs">Clear</span>
                    </button>
                  )}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsRef}
                    className="absolute z-50 left-0 right-0 bg-background border border-t-0 border-primary/40 rounded-b-xl shadow-lg overflow-hidden"
                  >
                    {suggestions.map((s, i) => {
                      const Icon = suggestionIcon[s.type]
                      return (
                        <button
                          key={`${s.type}-${i}`}
                          onClick={() => handleSuggestionClick(s)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground truncate">{s.label}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground/50 uppercase shrink-0">
                            {s.type}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Inline search bar when viewing results */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setHasSearched(false); setTickets([]); setSearch(''); setSuggestions([]) }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              &larr; New search
            </button>
            <div className="flex items-center gap-2 flex-1 max-w-md rounded-lg border border-border bg-card px-3 py-1.5 overflow-hidden">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground truncate">{search}</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {tickets.length} {tickets.length === 1 ? 'result' : 'results'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
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
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
