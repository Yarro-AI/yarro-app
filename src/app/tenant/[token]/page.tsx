'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import type { TenantTicket } from '@/lib/portal-types'
import { PortalLoading, PortalError } from '@/components/portal/portal-shell'
import { TenantPortalView } from '@/components/portal/tenant-portal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function TenantPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<TenantTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  const loadTicket = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('c1_get_tenant_ticket', {
      p_token: token,
    })
    if (err || !data) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setTicket(data as TenantTicket)
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  function flashSubmitted() {
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 4000)
  }

  async function handleReschedule(date: string, reason: string) {
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: {
          source: 'reschedule-request',
          token,
          proposed_date: new Date(date).toISOString(),
          reason: reason || null,
        },
      })
    } catch {
      // server action fires regardless
    }
    await loadTicket()
    flashSubmitted()
  }

  async function handleConfirm(resolved: boolean, notes: string) {
    try {
      await supabase.functions.invoke('yarro-scheduling', {
        body: {
          source: 'tenant-confirmation',
          token,
          resolved,
          notes: notes || null,
        },
      })
    } catch {
      // server action fires regardless
    }
    await loadTicket()
    flashSubmitted()
  }

  if (loading) return <PortalLoading />
  if (error || !ticket) return <PortalError message={error ?? undefined} />

  return (
    <TenantPortalView
      ticket={ticket}
      onReschedule={handleReschedule}
      onConfirm={handleConfirm}
      justSubmitted={justSubmitted}
    />
  )
}
