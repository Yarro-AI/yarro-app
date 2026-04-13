'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface EndTenancyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: { id: string; room_number: string; tenant_name: string | null; current_tenant_id: string | null } | null
  pmId: string
  onComplete: () => void
}

export function EndTenancyDialog({
  open,
  onOpenChange,
  room,
  pmId,
  onComplete,
}: EndTenancyDialogProps) {
  const supabase = createClient()
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outstandingDebt, setOutstandingDebt] = useState<number>(0)

  // Check outstanding rent when dialog opens — uses RPC with rent_effective_status
  useEffect(() => {
    if (!open || !room?.current_tenant_id) { setOutstandingDebt(0); return }
    const checkDebt = async () => {
      const { data } = await supabase.rpc('get_tenant_outstanding_debt', {
        p_tenant_id: room.current_tenant_id!,
        p_pm_id: pmId,
      })
      if (data != null) setOutstandingDebt(data as number)
    }
    checkDebt()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, room?.current_tenant_id])

  const handleEndTenancy = async () => {
    if (!room) return
    setIsProcessing(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('room_end_tenancy', {
        p_room_id: room.id,
        p_pm_id: pmId,
      })
      if (rpcError) throw new Error(rpcError.message)
      toast.success('Tenancy ended')
      onOpenChange(false)
      onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end tenancy'
      setError(message)
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleJustUnassign = async () => {
    if (!room) return
    setIsProcessing(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('room_remove_tenant', {
        p_room_id: room.id,
        p_pm_id: pmId,
      })
      if (rpcError) throw new Error(rpcError.message)
      toast.success('Tenant removed from room')
      onOpenChange(false)
      onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove tenant'
      setError(message)
      toast.error(message)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) setError(null)
    onOpenChange(open)
  }

  const tenantName = room?.tenant_name || 'tenant'
  const roomNumber = room?.room_number || 'this room'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" hideCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>Remove {tenantName} from {roomNumber}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Do you want to end the tenancy?
          </DialogDescription>
        </DialogHeader>

        {outstandingDebt > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {tenantName} still owes £{Math.round(outstandingDebt).toLocaleString('en-GB')}
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Outstanding rent will remain on record and can be chased after the tenancy ends.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2 text-sm text-muted-foreground">
          <p><strong>End Tenancy</strong> — closes tenancy, cancels future rent reminders, logs to audit trail.</p>
          <p><strong>Just Unassign</strong> — removes from room only, tenancy dates are cleared.</p>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleJustUnassign}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Just Unassign
          </Button>
          <Button
            variant="destructive"
            onClick={handleEndTenancy}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            End Tenancy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
