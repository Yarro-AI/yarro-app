'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { usePM } from '@/contexts/pm-context'
import { PageShell } from '@/components/page-shell'
import { DataTable, Column } from '@/components/data-table'
import { CommandSearchInput } from '@/components/command-search-input'
import { ScrollText } from 'lucide-react'

interface AuditEvent {
  id: string
  event_type: string
  actor_type: string
  actor_name: string | null
  property_label: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
  ticket_id: string | null
}

function formatEventType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// Causal ordering for same-ticket events with near-identical timestamps.
// DB triggers fire at different microseconds within the same transaction,
// so CONTRACTOR_ASSIGNED can appear before ISSUE_CREATED without this.
const CAUSAL_ORDER: Record<string, number> = {
  ISSUE_CREATED: 0,
  ISSUE_REPORTED: 0,
  PRIORITY_CLASSIFIED: 1,
  PRIORITY_CHANGED: 1,
  HANDOFF_CREATED: 2,
  HANDOFF_CHANGED: 2,
  CONTRACTOR_ASSIGNED: 3,
  OOH_DISPATCHED: 3,
  LANDLORD_ALLOCATED: 3,
  LANDLORD_APPROVED: 4,
  LANDLORD_DECLINED: 4,
  QUOTE_RECEIVED: 5,
  QUOTE_APPROVED: 5,
  QUOTE_DECLINED: 5,
  JOB_SCHEDULED: 6,
  JOB_COMPLETED: 7,
  TICKET_CLOSED: 8,
  TICKET_ARCHIVED: 9,
}

function sortWithCausalOrder(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => {
    // Primary: occurred_at descending (newest first)
    const timeDiff = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    // Only apply causal tie-breaker for same-ticket events within 2 seconds
    if (Math.abs(timeDiff) < 2000 && a.ticket_id && a.ticket_id === b.ticket_id) {
      const orderA = CAUSAL_ORDER[a.event_type] ?? 5
      const orderB = CAUSAL_ORDER[b.event_type] ?? 5
      if (orderA !== orderB) return orderB - orderA // descending: later events first
    }
    return timeDiff
  })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractDetail(event: AuditEvent): string {
  if (!event.metadata) return '—'

  const meta = event.metadata
  // Common metadata patterns from c1_events triggers
  if (meta.summary && typeof meta.summary === 'string') return meta.summary
  if (meta.old_status && meta.new_status) return `${meta.old_status} → ${meta.new_status}`
  if (meta.message && typeof meta.message === 'string') {
    const msg = meta.message as string
    return msg.length > 80 ? msg.slice(0, 80) + '…' : msg
  }

  // Fallback: show first string value
  const firstVal = Object.values(meta).find((v) => typeof v === 'string')
  if (firstVal && typeof firstVal === 'string') {
    return firstVal.length > 80 ? firstVal.slice(0, 80) + '…' : firstVal
  }

  return '—'
}

export default function AuditTrailPage() {
  const { propertyManager } = usePM()
  const supabase = createClient()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const filteredEvents = useMemo(() => {
    if (!search) return events
    const lower = search.toLowerCase()
    return events.filter(
      (e) =>
        formatEventType(e.event_type).toLowerCase().includes(lower) ||
        e.actor_name?.toLowerCase().includes(lower) ||
        e.property_label?.toLowerCase().includes(lower) ||
        extractDetail(e).toLowerCase().includes(lower)
    )
  }, [events, search])

  const fetchEvents = useCallback(async () => {
    if (!propertyManager) return

    const { data } = await supabase
      .from('c1_events')
      .select('id, event_type, actor_type, actor_name, property_label, occurred_at, metadata, ticket_id')
      .eq('portfolio_id', propertyManager.id)
      .order('occurred_at', { ascending: false })
      .limit(500)

    if (data) {
      setEvents(sortWithCausalOrder(data as AuditEvent[]))
    }

    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyManager])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const columns: Column<AuditEvent>[] = [
    {
      key: 'occurred_at',
      header: 'Date',
      sortable: true,
      width: '140px',
      render: (row) => (
        <div>
          <span className="font-medium">{formatDate(row.occurred_at)}</span>
          <span className="text-muted-foreground ml-2 text-xs">{formatTime(row.occurred_at)}</span>
        </div>
      ),
      getValue: (row) => row.occurred_at,
    },
    {
      key: 'event_type',
      header: 'Event',
      sortable: true,
      width: '180px',
      render: (row) => (
        <span className="font-medium">{formatEventType(row.event_type)}</span>
      ),
      getValue: (row) => row.event_type,
    },
    {
      key: 'actor_name',
      header: 'Actor',
      sortable: true,
      width: '160px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{row.actor_name || '—'}</span>
          <span className="text-[10px] text-muted-foreground/60 uppercase">{row.actor_type}</span>
        </div>
      ),
      getValue: (row) => row.actor_name,
    },
    {
      key: 'property_label',
      header: 'Property',
      sortable: true,
      render: (row) => (
        <span className="text-muted-foreground">{row.property_label || '—'}</span>
      ),
      getValue: (row) => row.property_label,
    },
    {
      key: 'detail',
      header: 'Details',
      render: (row) => (
        <span className="text-muted-foreground text-xs">{extractDetail(row)}</span>
      ),
    },
  ]

  return (
    <PageShell
      title="Audit Trail"
      count={filteredEvents.length}
      actions={
        <CommandSearchInput
          placeholder="Search events..."
          value={search}
          onChange={setSearch}
          className="w-64"
        />
      }
    >
      <DataTable
        data={filteredEvents}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <ScrollText className="h-8 w-8 opacity-40" />
            <p className="text-sm">No audit events found</p>
            <p className="text-xs">Events are logged automatically as actions occur</p>
          </div>
        }
        fillHeight
      />
    </PageShell>
  )
}
