'use client'

interface ChatMessage {
  from: 'user' | 'yarro'
  text: string
  actions?: string[]
}

export function WhatsAppPreview({
  messages,
  label,
}: {
  messages: ChatMessage[]
  label?: string
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      {/* Header bar — Yarro blue */}
      <div className="bg-primary px-3 py-2 flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">Y</span>
        </div>
        <span className="text-white text-xs font-medium">Yarro</span>
      </div>

      {/* Chat area */}
      <div className="bg-[#e5ddd5] dark:bg-[#0b141a] p-3 space-y-1.5">
        {label && (
          <p className="text-[10px] text-center text-black/40 dark:text-white/30 mb-2">
            {label}
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.from === 'yarro' ? 'justify-start' : 'justify-end'}`}
          >
            <div className="max-w-[85%]">
              <div
                className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed whitespace-pre-line ${
                  msg.from === 'yarro'
                    ? 'bg-white dark:bg-[#1f2c34] text-gray-900 dark:text-gray-100'
                    : 'bg-[#dbeafe] dark:bg-[#1e3a5f] text-gray-900 dark:text-gray-100'
                } ${msg.actions ? 'rounded-b-none' : ''}`}
              >
                {msg.text}
              </div>
              {msg.actions && (
                <div className="bg-white dark:bg-[#1f2c34] rounded-b-lg border-t border-gray-200 dark:border-gray-700 flex divide-x divide-gray-200 dark:divide-gray-700">
                  {msg.actions.map((action, j) => (
                    <div
                      key={j}
                      className="flex-1 text-center py-1.5 text-[11px] font-medium text-primary"
                    >
                      {action}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
