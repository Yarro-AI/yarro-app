'use client'

import { useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { PageShell } from '@/components/page-shell'
import { useTicketAudit } from '@/hooks/use-ticket-audit'
import {
  AuditProfileHeader,
  AuditTimeline,
  AuditConversations,
  AuditFinancials,
  AuditEvidence,
} from '@/components/audit-profile'
import { exportToCSV } from '@/lib/export'
import { formatEventType, formatDate, formatTime } from '@/lib/audit-utils'
import type { ExportColumn } from '@/lib/export'

const TABS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'conversations', label: 'Conversations' },
  { key: 'financials', label: 'Financials' },
  { key: 'evidence', label: 'Evidence' },
] as const

type TabKey = (typeof TABS)[number]['key']

const AUDIT_TIMELINE_COLUMNS: ExportColumn[] = [
  { key: 'date', header: 'Date' },
  { key: 'time', header: 'Time' },
  { key: 'event_type', header: 'Event Type' },
  { key: 'actor', header: 'Actor' },
  { key: 'actor_type', header: 'Actor Type' },
  { key: 'detail', header: 'Details' },
  { key: 'source', header: 'Source' },
]

export default function AuditProfilePage() {
  const { ticketId } = useParams<{ ticketId: string }>()
  const {
    ticket,
    conversation,
    messages,
    completion,
    outboundLog,
    complianceCert,
    unifiedTimeline,
    loading,
    error,
  } = useTicketAudit(ticketId)

  const [activeTab, setActiveTab] = useState<TabKey>('timeline')
  const [exportingPDF, setExportingPDF] = useState(false)

  const handleExportCSV = useCallback(() => {
    if (!ticket || unifiedTimeline.length === 0) return

    const data = unifiedTimeline.map((entry) => ({
      date: formatDate(entry.timestamp),
      time: formatTime(entry.timestamp),
      event_type: formatEventType(entry.event_type),
      actor: entry.actor || '',
      actor_type: entry.actor_type || '',
      detail: entry.detail || '',
      source: entry.source,
    }))

    const filename = `audit-${ticket.address || 'ticket'}-${ticketId.slice(0, 8)}`
    exportToCSV(data, AUDIT_TIMELINE_COLUMNS, filename)
  }, [ticket, unifiedTimeline, ticketId])

  const handleExportPDF = useCallback(async () => {
    if (!ticket) return
    setExportingPDF(true)

    try {
      const { generateAuditPDF } = await import('@/components/audit-profile/audit-export-pdf')
      await generateAuditPDF({
        ticket,
        timeline: unifiedTimeline,
        outboundLog,
        completion,
        complianceCert,
        ticketId,
      })
    } catch (err) {
      console.error('PDF export error:', err)
    } finally {
      setExportingPDF(false)
    }
  }, [ticket, unifiedTimeline, outboundLog, completion, complianceCert, ticketId])

  if (loading) {
    return (
      <PageShell scrollable>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <p className="text-sm">Loading audit profile...</p>
        </div>
      </PageShell>
    )
  }

  if (error || !ticket) {
    return (
      <PageShell scrollable>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <p className="text-sm">{error || 'Ticket not found'}</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell scrollable>
      <div className="space-y-6 pb-8">
        <AuditProfileHeader
          ticket={ticket}
          onExportPDF={handleExportPDF}
          onExportCSV={handleExportCSV}
          exportingPDF={exportingPDF}
        />

        {/* Tab bar */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'timeline' && (
          <AuditTimeline timeline={unifiedTimeline} />
        )}
        {activeTab === 'conversations' && (
          <AuditConversations conversation={conversation} outboundLog={outboundLog} />
        )}
        {activeTab === 'financials' && (
          <AuditFinancials ticket={ticket} messages={messages} completion={completion} />
        )}
        {activeTab === 'evidence' && (
          <AuditEvidence ticket={ticket} completion={completion} complianceCert={complianceCert} />
        )}
      </div>
    </PageShell>
  )
}
