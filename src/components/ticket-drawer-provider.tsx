'use client'

import { useState, useEffect, useRef, useContext, createContext, type ReactNode } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'

// --- Context for page-specific callbacks ---

interface TicketDrawerContextValue {
  registerOnTicketUpdated: (cb: (() => void) | null) => void
}

const TicketDrawerContext = createContext<TicketDrawerContextValue>({
  registerOnTicketUpdated: () => {},
})

/** Register a callback that fires when a ticket is updated inside the drawer. Cleans up on unmount. */
export function useOnTicketUpdated(cb: () => void) {
  const { registerOnTicketUpdated } = useContext(TicketDrawerContext)
  useEffect(() => {
    registerOnTicketUpdated(cb)
    return () => registerOnTicketUpdated(null)
  }, [cb, registerOnTicketUpdated])
}

// --- Provider ---

export function TicketDrawerProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const closingRef = useRef(false)
  const onTicketUpdatedRef = useRef<(() => void) | null>(null)

  const ticketId = searchParams.get('ticketId')
  const tab = searchParams.get('tab') ?? undefined
  const action = searchParams.get('action')

  // Open when ticketId appears (not when closing)
  useEffect(() => {
    if (ticketId && !closingRef.current) setOpen(true)
  }, [ticketId])

  const handleClose = () => {
    closingRef.current = true
    setOpen(false) // triggers Sheet close animation
    // 300ms matches data-[state=closed]:duration-300 in sheet.tsx
    setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('ticketId')
      params.delete('tab')
      const newUrl = params.toString() ? `${pathname}?${params}` : pathname
      router.replace(newUrl, { scroll: false })
      closingRef.current = false
    }, 300)
  }

  const registerOnTicketUpdated = (cb: (() => void) | null) => {
    onTicketUpdatedRef.current = cb
  }

  // All hooks called above — early returns below
  // Skip when action param is present (tickets page handles action flows with TicketForm)
  const showModal = !action && (ticketId || open)

  return (
    <TicketDrawerContext.Provider value={{ registerOnTicketUpdated }}>
      {showModal && (
        <TicketDetailModal
          ticketId={ticketId!}
          open={open}
          onClose={handleClose}
          defaultTab={tab}
          onTicketUpdated={() => onTicketUpdatedRef.current?.()}
        />
      )}
      {children}
    </TicketDrawerContext.Provider>
  )
}
