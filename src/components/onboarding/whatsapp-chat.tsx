'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface WhatsAppChatProps {
  onSmsStep1: () => void
  onSmsStep2: () => void
  onApprovalSms: () => void
  onComplete: () => void
  onSkipApproval: () => void
  quoteApproved: boolean
}

interface Message {
  id: number
  side: 'left' | 'right'
  text: string
  time: string
}

// Phase 1: Tenant reports issue, Yarro acknowledges, tenant thanks
const PHASE_1: { side: 'left' | 'right'; text: string; time: string; typingMs: number; delayAfter: number }[] = [
  { side: 'left', text: 'Hi, I need to report an issue with my flat', time: '09:14', typingMs: 1200, delayAfter: 1500 },
  { side: 'right', text: 'Hi Jane, thanks for reaching out. I\u2019m Yarro, your property manager\u2019s AI assistant. What\u2019s the problem?', time: '09:14', typingMs: 2000, delayAfter: 2000 },
  { side: 'left', text: 'The boiler isn\u2019t working. No hot water since this morning and the heating\u2019s off too', time: '09:15', typingMs: 1800, delayAfter: 2500 },
  { side: 'right', text: 'I\u2019m sorry to hear that. I\u2019ve logged this as an urgent plumbing issue and I\u2019m finding a contractor now.\nI\u2019ll notify the property manager.', time: '09:16', typingMs: 2800, delayAfter: 1500 },
  { side: 'left', text: 'Thanks \uD83D\uDE4F', time: '09:16', typingMs: 600, delayAfter: 2000 },
]

// Pause message: Yarro getting a quote (triggers approval SMS)
const PAUSE_MESSAGE = {
  side: 'right' as const,
  text: 'I\u2019ve found a local plumber. Getting you a quote now\u2026',
  time: '09:17',
  typingMs: 2200,
}

// Phase 2: After approval — manager approved, dispatch, tenant thanks
const PHASE_2: { side: 'left' | 'right'; text: string; time: string; typingMs: number; delayAfter: number; sms?: 1 | 2 }[] = [
  { side: 'right', text: 'Great news \u2014 your property manager just approved the \u00a385 callout. I\u2019m coordinating with the contractor now and will keep you updated.', time: '09:18', typingMs: 3000, delayAfter: 2500, sms: 1 },
  { side: 'right', text: 'All sorted, Jane. A plumber has been dispatched to 123 Demo Street and should be with you this afternoon. Your property manager has been notified. Is there anything else?', time: '09:19', typingMs: 2500, delayAfter: 2000, sms: 2 },
  { side: 'left', text: 'No that\u2019s amazing, thank you!', time: '09:19', typingMs: 800, delayAfter: 0 },
]

export function WhatsAppChat({ onSmsStep1, onSmsStep2, onApprovalSms, onComplete, onSkipApproval, quoteApproved }: WhatsAppChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [typingSide, setTypingSide] = useState<'left' | 'right' | null>(null)
  const [waitingForApproval, setWaitingForApproval] = useState(false)
  const [showSkip, setShowSkip] = useState(false)
  const chatRef = useRef<HTMLDivElement>(null)
  const mountedRef = useRef(true)
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const approvalResolverRef = useRef<(() => void) | null>(null)
  const approvedRef = useRef(quoteApproved)

  // Keep approvedRef in sync with prop
  useEffect(() => {
    approvedRef.current = quoteApproved
    if (quoteApproved && approvalResolverRef.current) {
      approvalResolverRef.current()
      approvalResolverRef.current = null
    }
  }, [quoteApproved])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      const id = setTimeout(() => { if (mountedRef.current) resolve() }, ms)
      timeoutsRef.current.push(id)
    })
  }, [])

  const scrollToBottom = useCallback(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  const handleSkip = useCallback(() => {
    // Resolve the approval promise locally
    if (approvalResolverRef.current) {
      approvalResolverRef.current()
      approvalResolverRef.current = null
    }
    // Write approval to DB so tab refresh doesn't re-pause
    onSkipApproval()
  }, [onSkipApproval])

  // Run the conversation
  useEffect(() => {
    let msgId = 0

    async function playMessages(script: typeof PHASE_1) {
      for (const line of script) {
        if (!mountedRef.current) return

        setTypingSide(line.side)
        scrollToBottom()
        await delay(line.typingMs)
        if (!mountedRef.current) return

        setTypingSide(null)
        const id = ++msgId
        setMessages(prev => [...prev, { id, side: line.side, text: line.text, time: line.time }])

        // Fire SMS callbacks
        if ('sms' in line) {
          if (line.sms === 1) onSmsStep1()
          if (line.sms === 2) onSmsStep2()
        }

        requestAnimationFrame(scrollToBottom)

        if (line.delayAfter > 0) {
          await delay(line.delayAfter)
        }
      }
    }

    async function run() {
      // ── Phase 1: Tenant reports issue ──
      await playMessages(PHASE_1)
      if (!mountedRef.current) return

      // ── Pause message: "Getting you a quote..." ──
      setTypingSide(PAUSE_MESSAGE.side)
      scrollToBottom()
      await delay(PAUSE_MESSAGE.typingMs)
      if (!mountedRef.current) return

      setTypingSide(null)
      const pauseId = ++msgId
      setMessages(prev => [...prev, { id: pauseId, side: PAUSE_MESSAGE.side, text: PAUSE_MESSAGE.text, time: PAUSE_MESSAGE.time }])
      requestAnimationFrame(scrollToBottom)

      // Fire the approval SMS
      onApprovalSms()

      // ── Wait for approval ──
      setWaitingForApproval(true)
      setTypingSide('right') // Persistent typing indicator while waiting

      // Show skip button after 5s
      const skipTimer = setTimeout(() => {
        if (mountedRef.current) setShowSkip(true)
      }, 5000)
      timeoutsRef.current.push(skipTimer)

      await new Promise<void>((resolve) => {
        if (approvedRef.current) { resolve(); return }
        approvalResolverRef.current = resolve
      })
      if (!mountedRef.current) return

      setWaitingForApproval(false)
      setShowSkip(false)
      setTypingSide(null)

      // Brief pause after approval before resuming
      await delay(800)
      if (!mountedRef.current) return

      // ── Phase 2: Approval confirmed, dispatch ──
      await playMessages(PHASE_2)
      if (!mountedRef.current) return

      // Hold so user can read the final messages
      await delay(4000)
      if (mountedRef.current) onComplete()
    }

    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col overflow-hidden rounded-xl" style={{ height: '420px' }}>
      <style jsx>{`
        @keyframes wa-dot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* WhatsApp header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 flex-shrink-0" style={{ background: '#075E54' }}>
        <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <svg width="14" height="14" fill="none" stroke="white" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0"/></svg>
        </div>
        <div className="flex-1">
          <p className="text-white text-sm font-semibold leading-tight">Yarro Property</p>
          <p className="text-[11px] leading-tight" style={{ color: 'rgba(255,255,255,0.6)' }}>online</p>
        </div>
      </div>

      {/* Chat body */}
      <div
        ref={chatRef}
        className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto relative"
        style={{
          backgroundColor: '#E4DCD4',
          backgroundImage: 'url(/whatsapp-chat-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          scrollbarWidth: 'none',
        }}
      >
        {/* Today label */}
        <div className="text-center mb-0.5">
          <span className="text-[11px] px-2.5 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.8)', color: '#64748B' }}>
            TODAY
          </span>
        </div>

        {/* Messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="animate-in fade-in duration-300"
            style={{
              alignSelf: msg.side === 'left' ? 'flex-start' : 'flex-end',
              maxWidth: '82%',
            }}
          >
            <div
              style={{
                background: msg.side === 'left' ? 'white' : '#DCF8C6',
                borderRadius: msg.side === 'left' ? '0 10px 10px 10px' : '10px 0 10px 10px',
                padding: '8px 14px 4px',
                boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
              }}
            >
              <p className="text-[15px] leading-[1.45]" style={{ color: '#1a1a1a', whiteSpace: 'pre-line' }}>{msg.text}</p>
              <p className="text-[11px] text-right mt-0.5 pb-0.5" style={{ color: '#999' }}>
                {msg.time}
                {msg.side === 'right' && <span style={{ color: '#4FC3F7' }}> ✓✓</span>}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typingSide && (
          <div
            style={{
              alignSelf: typingSide === 'left' ? 'flex-start' : 'flex-end',
              maxWidth: '82%',
            }}
          >
            <div
              style={{
                background: typingSide === 'left' ? 'white' : '#DCF8C6',
                borderRadius: typingSide === 'left' ? '0 10px 10px 10px' : '10px 0 10px 10px',
                boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
                padding: '10px 14px',
                display: 'flex',
                gap: '4px',
                alignItems: 'center',
              }}
            >
              {[0, 0.2, 0.4].map((d, i) => (
                <span
                  key={i}
                  className="block rounded-full"
                  style={{
                    width: 6, height: 6,
                    background: '#999',
                    animation: `wa-dot 1.4s infinite ${d}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input bar — shows skip button when waiting for approval */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 flex-shrink-0" style={{ background: '#F0F0F0' }}>
        {waitingForApproval && showSkip ? (
          <button
            onClick={handleSkip}
            className="flex-1 text-center py-1.5 text-sm transition-opacity"
            style={{ color: '#075E54', animation: 'fade-in 0.5s ease' }}
          >
            Didn&apos;t get the message? <span className="underline">Skip</span>
          </button>
        ) : (
          <>
            <svg width="18" height="18" fill="none" stroke="#64748B" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"/></svg>
            <div className="flex-1 rounded-full px-3.5 py-1.5 text-sm" style={{ background: 'white', color: '#999' }}>
              {waitingForApproval ? 'Waiting for your approval...' : 'Type a message'}
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#075E54' }}>
              <svg width="14" height="14" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
