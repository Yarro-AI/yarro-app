'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'

export function TicketDrawerProvider() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const closingRef = useRef(false)

  const ticketId = searchParams.get('ticketId')
  const tab = searchParams.get('tab') ?? undefined

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

  // All hooks called above — early returns below
  // Skip on /tickets — that page has its own modal with full callbacks
  if (pathname === '/tickets') return null
  if (!ticketId && !open) return null

  return (
    <TicketDetailModal
      ticketId={ticketId!}
      open={open}
      onClose={handleClose}
      defaultTab={tab}
    />
  )
}
