'use client'

import { useState } from 'react'
import { ChevronDown, MessageSquare } from 'lucide-react'
import { ChatHistory } from '@/components/chat-message'
import { getLogEntries } from '@/hooks/use-ticket-detail'
import type { ConversationData } from '@/hooks/use-ticket-detail'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database'

interface AITranscriptProps {
  conversation: ConversationData | null
  defaultOpen: boolean
}

export function AITranscript({ conversation, defaultOpen }: AITranscriptProps) {
  const [open, setOpen] = useState(defaultOpen)

  if (!conversation) return null

  const messages = getLogEntries(conversation.log as Json)
  if (messages.length === 0) return null

  return (
    <div className="bg-card rounded-xl border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            AI Transcript
          </span>
          <span className="text-xs text-muted-foreground/60">({messages.length})</span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <ChatHistory messages={messages} compact />
        </div>
      )}
    </div>
  )
}
