'use client'

import { useState } from 'react'
import { Loader2, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface StageAllocateActionProps {
  ticketId: string
  landlordName: string | null | undefined
  landlordPhone: string | null | undefined
  onActionTaken: () => void
}

export function StageAllocateAction({ ticketId, landlordName, landlordPhone, onActionTaken }: StageAllocateActionProps) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  if (!landlordName && !landlordPhone) return null

  const handleAllocate = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('c1_allocate_to_landlord' as never, {
      p_ticket_id: ticketId,
    } as never)
    setLoading(false)

    const result = data as unknown as { ok: boolean; landlord_name?: string; error?: string } | null
    if (error || !result?.ok) {
      toast.error('Allocation failed', { description: (result as Record<string, unknown>)?.error as string || error?.message || 'Unknown error' })
      return
    }

    toast.success(`Allocated to ${result.landlord_name || 'landlord'}`, { description: 'Landlord will be notified via WhatsApp' })
    onActionTaken()
  }

  return (
    <Button variant="outline" size="sm" className="mt-2 gap-1.5" disabled={loading} onClick={handleAllocate}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
      Allocate to {landlordName || 'Landlord'}
    </Button>
  )
}
