'use client'

import { ChatHistory } from '@/components/chat-message'
import { formatDate, formatTime } from '@/lib/audit-utils'
import type { ConversationData, OutboundLogEntry } from '@/hooks/use-ticket-audit'
import { getLogEntries } from '@/hooks/use-ticket-audit'

interface AuditConversationsProps {
  conversation: ConversationData | null
  outboundLog: OutboundLogEntry[]
}

export function AuditConversations({ conversation, outboundLog }: AuditConversationsProps) {
  const logEntries = conversation?.log ? getLogEntries(conversation.log) : []
  const hasConversation = logEntries.length > 0
  const hasOutbound = outboundLog.length > 0

  if (!hasConversation && !hasOutbound) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No conversation records</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* WhatsApp conversation thread */}
      {hasConversation && (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">WhatsApp Conversation</h3>
            {conversation && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{conversation.caller_name || conversation.phone}</span>
                {conversation.caller_role && (
                  <span className="uppercase text-muted-foreground/60">{conversation.caller_role}</span>
                )}
              </div>
            )}
          </div>
          <ChatHistory
            messages={logEntries.map((e) => ({
              role: e.role,
              text: e.text,
              timestamp: e.timestamp,
            }))}
            compact
          />
        </div>
      )}

      {/* Outbound message log */}
      {hasOutbound && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Outbound Messages ({outboundLog.length})
          </h3>
          <div className="space-y-3">
            {outboundLog.map((msg) => (
              <div
                key={msg.id}
                className="bg-muted/30 rounded-lg p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase">
                      {msg.message_type}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      → {msg.recipient_role}
                    </span>
                    {msg.recipient_phone && (
                      <span className="text-[11px] text-muted-foreground/40">
                        {msg.recipient_phone}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 shrink-0">
                    {msg.status && (
                      <span className="uppercase">{msg.status}</span>
                    )}
                    <span>{formatDate(msg.sent_at)} {formatTime(msg.sent_at)}</span>
                  </div>
                </div>
                {msg.body && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg.body}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
