'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { DataTable, Column } from '@/components/data-table'
import {
  DetailDrawer,
  DetailSection,
  DetailField,
  DetailGrid,
  DetailDivider,
} from '@/components/detail-drawer'
import { Badge } from '@/components/ui/badge'
import { DateFilter, DateRange, getDefaultDateRange } from '@/components/date-filter'
import { format } from 'date-fns'
import Link from 'next/link'
import { CheckCircle, XCircle, Building2, Wrench, Ticket, Image, PoundSterling, Calendar, Users, Mail } from 'lucide-react'
import { CollapsibleSection } from '@/components/collapsible-section'
import type { Json } from '@/types/database'

interface JobCompletion {
  id: string
  ticket_id: string | null
  completed: boolean | null
  source: string | null
  notes: string | null
  reason: string | null
  completion_text: string | null
  quote_amount: number | null
  markup_amount: number | null
  total_amount: number | null
  media_urls: Json | null
  received_at: string
  created_at: string
  property_id: string | null
  tenant_id: string | null
  contractor_id: string | null
  address?: string
  contractor_name?: string
  issue_description?: string
  tenant_name?: string
}

export default function CompletionsPage() {
  const { propertyManager } = usePM()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [completions, setCompletions] = useState<JobCompletion[]>([])
  const [selectedCompletion, setSelectedCompletion] = useState<JobCompletion | null>(null)
  const [hasMessage, setHasMessage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange())
  const supabase = createClient()

  const selectedId = searchParams.get('id')

  useEffect(() => {
    if (!propertyManager) return
    fetchCompletions()
  }, [propertyManager, dateRange])

  useEffect(() => {
    if (selectedId && completions.length > 0) {
      const completion = completions.find((c) => c.id === selectedId)
      if (completion) {
        setSelectedCompletion(completion)
        setDrawerOpen(true)
        // Check if messages exist for this ticket
        if (completion.ticket_id) {
          supabase
            .from('c1_messages')
            .select('ticket_id')
            .eq('ticket_id', completion.ticket_id)
            .single()
            .then(({ data }) => setHasMessage(!!data))
        } else {
          setHasMessage(false)
        }
      }
    }
  }, [selectedId, completions])

  const fetchCompletions = async () => {
    const { data } = await supabase
      .from('c1_job_completions')
      .select(`
        *,
        c1_properties(address),
        c1_contractors(contractor_name),
        c1_tickets(issue_description, property_manager_id),
        c1_tenants(full_name)
      `)
      .gte('received_at', dateRange.from.toISOString())
      .lte('received_at', dateRange.to.toISOString())
      .order('received_at', { ascending: false })

    if (data) {
      const filtered = data.filter(
        (c) => (c.c1_tickets as unknown as { property_manager_id: string } | null)?.property_manager_id === propertyManager!.id
      )
      const mapped = filtered.map((c) => ({
        ...c,
        address: (c.c1_properties as unknown as { address: string } | null)?.address,
        contractor_name: (c.c1_contractors as unknown as { contractor_name: string } | null)?.contractor_name,
        issue_description: (c.c1_tickets as unknown as { issue_description: string } | null)?.issue_description,
        tenant_name: (c.c1_tenants as unknown as { full_name: string } | null)?.full_name,
      }))
      setCompletions(mapped)
    }
    setLoading(false)
  }

  const handleRowClick = (completion: JobCompletion) => {
    router.push(`/completions?id=${completion.id}`)
  }

  const handleCloseDrawer = () => {
    setDrawerOpen(false)
    router.push('/completions')
    setSelectedCompletion(null)
    setHasMessage(false)
  }

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-'
    return `£${amount.toFixed(2)}`
  }

  const getMediaUrls = (mediaUrls: Json | null): string[] => {
    if (!mediaUrls || !Array.isArray(mediaUrls)) return []
    return mediaUrls as unknown as string[]
  }

  const columns: Column<JobCompletion>[] = [
    {
      key: 'received_at',
      header: 'Date',
      sortable: true,
      width: '80px',
      render: (c) => (
        <span className="text-muted-foreground text-sm">
          {format(new Date(c.received_at), 'dd MMM')}
        </span>
      ),
      getValue: (c) => new Date(c.received_at).getTime(),
    },
    {
      key: 'issue_description',
      header: 'Issue',
      sortable: true,
      width: '200px',
      render: (c) => (
        <span className="truncate block max-w-[180px]">
          {c.issue_description || 'No description'}
        </span>
      ),
    },
    {
      key: 'contractor_name',
      header: 'Contractor',
      sortable: true,
      width: '120px',
      render: (c) => <span className="truncate block max-w-[100px]">{c.contractor_name || '-'}</span>,
    },
    {
      key: 'completed',
      header: 'Status',
      sortable: true,
      width: '100px',
      render: (c) => (
        <span className={`px-2 py-0.5 text-xs rounded-full ${
          c.completed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {c.completed ? 'Done' : 'Not Done'}
        </span>
      ),
    },
    {
      key: 'quote_amount',
      header: 'Quote',
      sortable: true,
      width: '90px',
      render: (c) => (
        <span className="font-mono text-sm">{formatCurrency(c.quote_amount)}</span>
      ),
      getValue: (c) => c.quote_amount,
    },
    {
      key: 'markup_amount',
      header: 'Markup',
      sortable: true,
      width: '90px',
      render: (c) => (
        <span className="font-mono text-sm text-muted-foreground">{formatCurrency(c.markup_amount)}</span>
      ),
      getValue: (c) => c.markup_amount,
    },
    {
      key: 'total_amount',
      header: 'Total',
      sortable: true,
      width: '90px',
      render: (c) => (
        <span className="font-mono text-sm font-medium text-primary">{formatCurrency(c.total_amount)}</span>
      ),
      getValue: (c) => c.total_amount,
    },
  ]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Job Completions</h1>
          <p className="text-muted-foreground mt-1">
            Review job completion reports from contractors
          </p>
        </div>
        <DateFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Data Table */}
      <DataTable
        data={completions}
        columns={columns}
        searchPlaceholder="Search completions..."
        searchKeys={['issue_description', 'address', 'contractor_name']}
        onRowClick={handleRowClick}
        onViewClick={handleRowClick}
        getRowId={(c) => c.id}
        emptyMessage="No completions found"
        loading={loading}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        title="Job Completion"
        width="wide"
      >
        {selectedCompletion && (
          <div className="space-y-3">
            {/* Status + Issue - combined header */}
            <div className="flex items-start gap-3">
              <Badge
                variant={selectedCompletion.completed ? 'default' : 'destructive'}
                className="gap-1 flex-shrink-0"
              >
                {selectedCompletion.completed ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <XCircle className="h-3 w-3" />
                )}
                {selectedCompletion.completed ? 'Completed' : 'Not Done'}
              </Badge>
              <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
                {selectedCompletion.issue_description || 'No description'}
              </p>
            </div>

            {/* Related Links - compact grid */}
            <DetailSection title="Related">
              <div className="grid grid-cols-3 gap-1.5">
                {/* Ticket */}
                {selectedCompletion.ticket_id && (
                  <Link
                    href={`/tickets?id=${selectedCompletion.ticket_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Ticket</span>
                  </Link>
                )}
                {/* Property */}
                {selectedCompletion.property_id && (
                  <Link
                    href={`/properties?id=${selectedCompletion.property_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Property</span>
                  </Link>
                )}
                {/* Contractor */}
                {selectedCompletion.contractor_id && (
                  <Link
                    href={`/contractors?id=${selectedCompletion.contractor_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Contractor</span>
                  </Link>
                )}
                {/* Tenant */}
                {selectedCompletion.tenant_id && (
                  <Link
                    href={`/tenants?id=${selectedCompletion.tenant_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Tenant</span>
                  </Link>
                )}
                {/* Messages */}
                {hasMessage && (
                  <Link
                    href={`/messages?id=${selectedCompletion.ticket_id}`}
                    className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    onClick={handleCloseDrawer}
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Messages</span>
                  </Link>
                )}
              </div>
            </DetailSection>

            <DetailDivider />

            {/* Amounts - compact inline grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="p-1.5 bg-muted/50 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">Quote</p>
                <p className="font-mono text-xs font-medium">{formatCurrency(selectedCompletion.quote_amount)}</p>
              </div>
              <div className="p-1.5 bg-muted/50 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">Markup</p>
                <p className="font-mono text-xs font-medium">{formatCurrency(selectedCompletion.markup_amount)}</p>
              </div>
              <div className="p-1.5 bg-primary/10 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="font-mono text-sm font-bold text-primary">{formatCurrency(selectedCompletion.total_amount)}</p>
              </div>
            </div>

            {/* Notes - only if exists */}
            {(selectedCompletion.notes || selectedCompletion.completion_text) && (
              <>
                <DetailDivider />
                <div className="p-1.5 bg-muted/50 rounded-lg">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Notes</p>
                  <p className="text-xs whitespace-pre-wrap line-clamp-3">
                    {selectedCompletion.notes || selectedCompletion.completion_text}
                  </p>
                </div>
              </>
            )}

            {/* Reason (if not completed) */}
            {!selectedCompletion.completed && selectedCompletion.reason && (
              <div className="p-1.5 bg-destructive/10 rounded-lg border border-destructive/20">
                <p className="text-[10px] text-destructive/70 mb-0.5">Reason</p>
                <p className="text-xs text-destructive">{selectedCompletion.reason}</p>
              </div>
            )}

            <DetailDivider />

            {/* Photos + Timeline side by side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Photos left */}
              <div>
                {getMediaUrls(selectedCompletion.media_urls).length === 0 ? (
                  <div className="flex items-center gap-1.5 p-1.5 bg-muted/30 rounded-lg text-muted-foreground">
                    <Image className="h-3.5 w-3.5" />
                    <p className="text-xs">No photos</p>
                  </div>
                ) : getMediaUrls(selectedCompletion.media_urls).length > 2 ? (
                  <CollapsibleSection
                    title="Photos"
                    count={getMediaUrls(selectedCompletion.media_urls).length}
                    defaultOpen={false}
                  >
                    <div className="grid grid-cols-2 gap-1">
                      {getMediaUrls(selectedCompletion.media_urls).map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          <img
                            src={url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-14 object-cover rounded border group-hover:opacity-80 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  </CollapsibleSection>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">Photos</p>
                    <div className="grid grid-cols-2 gap-1">
                      {getMediaUrls(selectedCompletion.media_urls).map((url, index) => (
                        <a
                          key={index}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block group"
                        >
                          <img
                            src={url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-14 object-cover rounded border group-hover:opacity-80 transition-opacity"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Timeline right */}
              <div className="space-y-1.5">
                <div className="p-1.5 bg-muted/50 rounded-lg">
                  <p className="text-[10px] text-muted-foreground">Received</p>
                  <p className="text-xs font-medium">{format(new Date(selectedCompletion.received_at), 'dd MMM, HH:mm')}</p>
                </div>
                <div className="p-1.5 bg-muted/50 rounded-lg">
                  <p className="text-[10px] text-muted-foreground">Created</p>
                  <p className="text-xs font-medium">{format(new Date(selectedCompletion.created_at), 'dd MMM, HH:mm')}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
