'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { TicketDetailModal } from '@/components/ticket-detail/ticket-detail-modal'

export function TicketDrawerProvider() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const ticketId = searchParams.get('ticketId')
  const tab = searchParams.get('tab') ?? undefined

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('ticketId')
    params.delete('tab')
    const newUrl = params.toString() ? `${pathname}?${params}` : pathname
    router.replace(newUrl, { scroll: false })
  }

  // All hooks called above — early returns below
  // Skip on /tickets — that page has its own modal with full callbacks
  if (pathname === '/tickets') return null
  if (!ticketId) return null

  return (
    <TicketDetailModal
      ticketId={ticketId}
      open={true}
      onClose={handleClose}
      defaultTab={tab}
    />
  )
}
