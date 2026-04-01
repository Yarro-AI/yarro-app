'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useParams } from 'next/navigation'
import type { LandlordTicket } from '@/lib/portal-types'
import { PortalLoading, PortalError } from '@/components/portal/portal-shell'
import { LandlordPortalView } from '@/components/portal/landlord-portal'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function LandlordPortalPage() {
  const { token } = useParams<{ token: string }>()

  const [ticket, setTicket] = useState<LandlordTicket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [justSubmitted, setJustSubmitted] = useState(false)

  const loadTicket = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('c1_get_landlord_ticket', {
      p_token: token,
    })
    if (err || !data) {
      setError('This link is invalid or has expired.')
      setLoading(false)
      return
    }
    setTicket(data as LandlordTicket)
    setLoading(false)
  }, [token])

  useEffect(() => {
    loadTicket()
  }, [loadTicket])

  function flashSubmitted() {
    setJustSubmitted(true)
    setTimeout(() => setJustSubmitted(false), 4000)
  }

  async function handleSubmit(outcome: string, notes: string | null, cost: number | null) {
    const { error: err } = await supabase.rpc('c1_submit_landlord_outcome', {
      p_token: token,
      p_outcome: outcome,
      p_notes: notes,
      p_cost: cost,
    })
    if (err) {
      setError('Something went wrong. Please try again.')
      return
    }
    await loadTicket()
    flashSubmitted()
  }

  if (loading) return <PortalLoading />
  if (error || !ticket) return <PortalError message={error ?? undefined} />

  return (
    <LandlordPortalView
      ticket={ticket}
      onSubmit={handleSubmit}
      justSubmitted={justSubmitted}
    />
  )
}
