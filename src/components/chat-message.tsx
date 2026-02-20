'use client'

import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { User, Bot, Phone } from 'lucide-react'

export type MessageRole = 'user' | 'tenant' | 'assistant' | 'system' | 'agent' | 'contractor' | 'manager' | 'landlord'

type MessageMeta = {
  quote?: string
  approved?: boolean
  amount?: string
}

type ChatMessageProps = {
  role: MessageRole | string
  text: string
  timestamp?: string
  className?: string
  allowHtml?: boolean
  compact?: boolean
  meta?: MessageMeta
}

const roleConfig: Record<string, {
  label: string
  bgColor: string
  textColor: string
  align: 'left' | 'right'
  icon: React.ComponentType<{ className?: string }>
}> = {
  user: {
    label: 'User',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: User,
  },
  tenant: {
    label: 'Tenant',
    bgColor: 'bg-muted',
    textColor: 'text-foreground',
    align: 'left',
    icon: Phone,
  },
  contractor: {
    label: 'Contractor',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: Phone,
  },
  manager: {
    label: 'Manager',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: User,
  },
  landlord: {
    label: 'Landlord',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: User,
  },
  assistant: {
    label: 'Yarro',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: Bot,
  },
  agent: {
    label: 'Yarro',
    bgColor: 'bg-primary',
    textColor: 'text-primary-foreground',
    align: 'right',
    icon: Bot,
  },
  system: {
    label: 'System',
    bgColor: 'bg-muted',
    textColor: 'text-muted-foreground',
    align: 'left',
    icon: Bot,
  },
}

// Convert markdown-style *bold* to HTML <strong> tags
const formatMarkdown = (text: string): string => {
  return text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
}

export function ChatMessage({ role, text, timestamp, className, allowHtml = false, compact = false, meta }: ChatMessageProps) {
  const config = roleConfig[role.toLowerCase()] || roleConfig.system
  const Icon = config.icon

  const formattedTime = timestamp
    ? format(new Date(timestamp), 'dd MMM, HH:mm')
    : null

  // Build meta display text
  const getMetaDisplay = () => {
    if (!meta) return null
    if (meta.quote) {
      return meta.approved
        ? `Quote: ${meta.quote} ✓ Approved`
        : `Quote: ${meta.quote}`
    }
    if (meta.approved !== undefined) {
      const status = meta.approved ? '✓ Approved' : '✗ Declined'
      return meta.amount ? `${status} - ${meta.amount}` : status
    }
    return null
  }

  const metaDisplay = getMetaDisplay()

  return (
    <div
      className={cn(
        'flex',
        compact ? 'gap-2' : 'gap-3',
        config.align === 'right' && 'flex-row-reverse',
        className
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 rounded-full flex items-center justify-center',
          compact ? 'w-6 h-6' : 'w-8 h-8',
          config.align === 'right' ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}
      >
        <Icon className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'max-w-[80%]',
          compact ? 'space-y-0.5' : 'space-y-1',
          config.align === 'right' && 'items-end'
        )}
      >
        <div className={cn('flex items-center gap-1.5', config.align === 'right' && 'flex-row-reverse')}>
          <span className={cn('font-medium text-muted-foreground', compact ? 'text-[10px]' : 'text-xs')}>
            {config.label}
          </span>
          {formattedTime && (
            <span className={cn('text-muted-foreground/70', compact ? 'text-[10px]' : 'text-xs')}>
              {formattedTime}
            </span>
          )}
        </div>
        <div
          className={cn(
            'rounded-2xl',
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
            config.bgColor,
            config.textColor,
            config.align === 'right' ? 'rounded-tr-sm' : 'rounded-tl-sm'
          )}
        >
          {allowHtml ? (
            <p
              className="whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{ __html: formatMarkdown(text || '') }}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{text || ''}</p>
          )}
        </div>
        {/* Meta info - shown separately below bubble */}
        {metaDisplay && (
          <div className={cn(
            'mt-1 px-2 py-1 rounded-lg text-xs font-medium',
            meta?.approved ? 'bg-green-100 text-green-700' : meta?.approved === false ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700',
            config.align === 'right' ? 'text-right' : 'text-left'
          )}>
            {metaDisplay}
          </div>
        )}
      </div>
    </div>
  )
}

type ChatHistoryProps = {
  messages: Array<{
    role: string
    text: string
    timestamp?: string
    allowHtml?: boolean
    meta?: MessageMeta
  }>
  className?: string
  allowHtmlForAssistant?: boolean
  compact?: boolean
}

export function ChatHistory({ messages, className, allowHtmlForAssistant = false, compact = false }: ChatHistoryProps) {
  if (!messages || messages.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        No messages
      </div>
    )
  }

  return (
    <div className={cn(compact ? 'space-y-2' : 'space-y-4', className)}>
      {messages.map((msg, i) => (
        <ChatMessage
          key={i}
          role={msg.role}
          text={msg.text}
          timestamp={msg.timestamp}
          allowHtml={msg.allowHtml || (allowHtmlForAssistant && msg.role.toLowerCase() === 'assistant')}
          compact={compact}
          meta={msg.meta}
        />
      ))}
    </div>
  )
}
