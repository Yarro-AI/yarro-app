import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer'
import { formatEventType, formatDate, formatTime } from '@/lib/audit-utils'
import type { UnifiedTimelineEntry } from '@/hooks/use-ticket-audit'
import type { TicketBasic, CompletionData, OutboundLogEntry } from '@/hooks/use-ticket-audit'
import type { ComplianceCert } from '@/hooks/use-ticket-audit'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  header: {
    marginBottom: 24,
    borderBottom: '1px solid #e5e5e5',
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    fontSize: 9,
    color: '#555',
    backgroundColor: '#f0f0f0',
    padding: '2px 6px',
    borderRadius: 3,
  },
  dates: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    fontSize: 9,
    color: '#888',
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#333',
    borderBottom: '1px solid #e5e5e5',
    paddingBottom: 4,
  },
  timelineEntry: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottom: '0.5px solid #f0f0f0',
  },
  timelineTime: {
    width: 100,
    fontSize: 9,
    color: '#888',
  },
  timelineEvent: {
    flex: 1,
  },
  timelineEventType: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
  },
  timelineDetail: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
  },
  timelineActor: {
    fontSize: 8,
    color: '#999',
    marginTop: 1,
  },
  outboundEntry: {
    marginBottom: 8,
    padding: 6,
    backgroundColor: '#fafafa',
    borderRadius: 3,
  },
  outboundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  outboundType: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#555',
    textTransform: 'uppercase',
  },
  outboundBody: {
    fontSize: 9,
    color: '#444',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#aaa',
    borderTop: '0.5px solid #e5e5e5',
    paddingTop: 6,
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottom: '0.5px solid #f0f0f0',
  },
  financialLabel: {
    fontSize: 10,
    color: '#666',
  },
  financialValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
})

interface AuditPDFProps {
  ticket: TicketBasic
  timeline: UnifiedTimelineEntry[]
  outboundLog: OutboundLogEntry[]
  completion: CompletionData | null
  complianceCert: ComplianceCert | null
  ticketId: string
}

function AuditPDFDocument({ ticket, timeline, outboundLog, completion, complianceCert, ticketId }: AuditPDFProps) {
  const generatedDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{ticket.issue_description || 'Untitled Ticket'}</Text>
          {ticket.address && <Text style={styles.subtitle}>{ticket.address}</Text>}
          <View style={styles.badges}>
            <Text style={styles.badge}>{ticket.status}</Text>
            {ticket.priority && <Text style={styles.badge}>{ticket.priority}</Text>}
            {ticket.category && <Text style={styles.badge}>{ticket.category}</Text>}
          </View>
          <View style={styles.dates}>
            <Text>Logged: {formatDate(ticket.date_logged)}</Text>
            {ticket.sla_due_at && <Text>SLA: {formatDate(ticket.sla_due_at)}</Text>}
            {ticket.resolved_at && <Text>Resolved: {formatDate(ticket.resolved_at)}</Text>}
          </View>
        </View>

        {/* Financial summary */}
        {(ticket.contractor_quote || ticket.final_amount || completion?.total_amount) && (
          <View>
            <Text style={styles.sectionTitle}>Financial Summary</Text>
            {ticket.contractor_quote && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Contractor Quote</Text>
                <Text style={styles.financialValue}>£{ticket.contractor_quote.toFixed(2)}</Text>
              </View>
            )}
            {completion?.total_amount && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Completion Total</Text>
                <Text style={styles.financialValue}>£{completion.total_amount.toFixed(2)}</Text>
              </View>
            )}
            {ticket.final_amount && (
              <View style={styles.financialRow}>
                <Text style={styles.financialLabel}>Final Amount</Text>
                <Text style={styles.financialValue}>£{ticket.final_amount.toFixed(2)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Timeline ({timeline.length} events)</Text>
        {timeline.map((entry) => (
          <View key={entry.id} style={styles.timelineEntry} wrap={false}>
            <View style={styles.timelineTime}>
              <Text>{formatDate(entry.timestamp)}</Text>
              <Text>{formatTime(entry.timestamp)}</Text>
            </View>
            <View style={styles.timelineEvent}>
              <Text style={styles.timelineEventType}>{formatEventType(entry.event_type)}</Text>
              {entry.detail && <Text style={styles.timelineDetail}>{entry.detail}</Text>}
              {entry.actor && <Text style={styles.timelineActor}>{entry.actor} ({entry.actor_type})</Text>}
            </View>
          </View>
        ))}

        {/* Outbound messages */}
        {outboundLog.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Outbound Messages ({outboundLog.length})</Text>
            {outboundLog.map((msg) => (
              <View key={msg.id} style={styles.outboundEntry} wrap={false}>
                <View style={styles.outboundHeader}>
                  <Text style={styles.outboundType}>{msg.message_type} → {msg.recipient_role}</Text>
                  <Text style={{ fontSize: 8, color: '#999' }}>
                    {formatDate(msg.sent_at)} {formatTime(msg.sent_at)}
                  </Text>
                </View>
                {msg.body && <Text style={styles.outboundBody}>{msg.body}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Compliance cert */}
        {complianceCert && (
          <View>
            <Text style={styles.sectionTitle}>Compliance Certificate</Text>
            <Text>Type: {complianceCert.cert_type}</Text>
            <Text>Status: {complianceCert.status}</Text>
            {complianceCert.expiry_date && <Text>Expires: {complianceCert.expiry_date}</Text>}
            {complianceCert.notes && <Text style={{ marginTop: 4, color: '#666' }}>{complianceCert.notes}</Text>}
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Generated {generatedDate} | Yarro PM | Confidential</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}

export async function generateAuditPDF(props: AuditPDFProps) {
  const blob = await pdf(<AuditPDFDocument {...props} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-${props.ticket.address || 'ticket'}-${props.ticketId.slice(0, 8)}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
