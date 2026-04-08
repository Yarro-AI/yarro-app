'use client'

import { useState } from 'react'
import { Loader2, Check, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { MessageData } from '@/hooks/use-ticket-detail'
import { formatAmount } from '@/hooks/use-ticket-detail'

interface StageApproveActionProps {
  ticketId: string
  messages: MessageData | null
  onActionTaken: () => void
}

export function StageApproveAction({ ticketId, messages, onActionTaken }: StageApproveActionProps) {
  const [markup, setMarkup] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)
  const supabase = createClient()

  if (!messages) return null

  const manager = messages.manager && typeof messages.manager === 'object' && !Array.isArray(messages.manager)
    ? messages.manager as Record<string, unknown>
    : null
  if (!manager || manager.approval != null) return null

  const contractors = Array.isArray(messages.contractors) ? messages.contractors as Record<string, unknown>[] : []
  const reviewingId = manager.reviewing_contractor_id as string | undefined
  const repliedContractor = reviewingId
    ? contractors.find(c => c.id === reviewingId)
    : contractors
        .filter(c => c.status === 'replied')
        .sort((a, b) => new Date(b.replied_at as string).getTime() - new Date(a.replied_at as string).getTime())[0]

  const contractorName = (repliedContractor?.name as string) || 'Contractor'
  const quoteAmount = repliedContractor?.quote_amount as string | undefined
  const category = repliedContractor?.category as string | undefined

  const handleDecision = async (approved: boolean) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('c1_manager_decision_from_app' as never, {
      p_ticket_id: ticketId,
      p_approved: approved,
      p_markup: approved && markup.trim() ? markup.trim() : null,
    } as never)
    setLoading(false)

    const result = data as unknown as { ok: boolean; error?: string } | null
    if (error || !result?.ok) {
      toast.error('Action failed', { description: (result as Record<string, unknown>)?.error as string || error?.message || 'Unknown error' })
      return
    }

    if (approved) {
      toast.success('Quote approved', { description: 'Landlord will be notified' })
    } else {
      toast.success('Quote declined', { description: 'Trying next contractor' })
    }
    setConfirmDecline(false)
    onActionTaken()
  }

  return (
    <div className="mt-3 rounded-lg border border-border/60 p-3.5 space-y-3">
      <p className="text-sm text-card-foreground">
        <span className="font-semibold">{contractorName}</span>
        {quoteAmount && <> quoted <span className="font-semibold">{formatAmount(quoteAmount)}</span></>}
        {category && <> for {category}</>}
      </p>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Markup for tenant (optional)</label>
        <div className="relative max-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={markup}
            onChange={(e) => setMarkup(e.target.value.replace(/[^0-9.]/g, ''))}
            className="pl-7 h-8 text-sm"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {confirmDecline ? (
          <>
            <span className="text-xs text-muted-foreground">Decline this quote?</span>
            <Button variant="destructive" size="sm" disabled={loading} onClick={() => handleDecision(false)}>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Yes, decline
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDecline(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDecline(true)}>
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Decline
            </Button>
            <Button size="sm" disabled={loading} onClick={() => handleDecision(true)}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Approve
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
