'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export function useOpenTicket() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  return useCallback((ticketId: string, tab?: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('ticketId', ticketId)
    if (tab) params.set('tab', tab)
    router.push(`${pathname}?${params}`, { scroll: false })
  }, [router, searchParams, pathname])
}
